// NOTE:
//   The graph editor: cards on a canvas, edges between their puzzle ports,
//   and an inspector with the puzzle inside the selected card.
//   Owns the workspace model and draws it after every change.
//
//   const editor = new GraphEditor({ root, definitions, palette, planType, bubble, flowMark })
//   bubble: id => text, plain words shown in a speech bubble next to the selected card or line
//   flowMark: '🗂️', a sign in the middle of every flow edge, it travels along when editor.travel() is called
//   editor.on('change', workspace => ...)      // any change, also every key in a field
//   editor.on('select', id => ...)             // node, edge or piece id, null for nothing
//   editor.on('travel', ({ fromId, toId, phase }) => ...)   // phase 'start' or 'end' of a flow mark journey
//   editor.load(workspace)
//   editor.setNodeStatus(nodeId, 'running' | 'done' | null)
//   editor.setTravelDuration(ms)              // how long the flow mark takes per edge, default 550

//
//   Chapters:
//     HELPERS          Small math, DOM checks and SVG elements.
//     GRAPH EDITOR     The editor class: API, layout, render, fields, pointer, keyboard.
//

import { bendPath, edgePath, nearestSegment, renderCard, usePath } from './engine.cards.js'
import { cloneJson, connect, createBlock, findBlock, findOwnerNode, History, insertBlock, normalizeWorkspace, removeBlock } from './engine.model.js'
import { element, fillSelect, fitTextArea, fitTextInput, renderBlock, resolveOptions } from './engine.render.js'
import { t } from '../i18n.js'

const DRAG_THRESHOLD_PX = 4
const ZOOM_MIN = 0.4
const FIT_ZOOM_MIN = 0.6
const ZOOM_MAX = 2
const ZOOM_STEP = 1.15
const HOME_VIEW = { x: 40, y: 40, zoom: 1 }
const REVEAL_MARGIN_PX = 60
const FIT_MARGIN_PX = 48
const BUBBLE_HALF_WIDTH_PX = 150
const BUBBLE_MARGIN_PX = 12
const BUBBLE_ROOM_PX = 170
const DEFAULT_TRAVEL_DURATION_MS = 550
const NEW_NODE_OFFSET_PX = 80
const SVG_NS = 'http://www.w3.org/2000/svg'

// ===========================================================================
// ===============================   HELPERS   ===============================
// ===========================================================================
//
//   clamp           A number within limits.
//   isTypingTarget  True when the keyboard belongs to an input, not to the editor.
//   svgElement      A new SVG element with attributes.
//

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value))
}

function isTypingTarget(target) {
    return target instanceof HTMLElement && null != target.closest('input, select, textarea')
}

function svgElement(tag, attributes = {}) {
    const node = document.createElementNS(SVG_NS, tag)
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value)
    return node
}

// ===========================================================================
// ============================   GRAPH EDITOR   =============================
// ===========================================================================
//
//   1. Public API    load, clear, select, reveal, undo, redo, status, events.
//   2. Layout        Palette, stage with canvas, controls, trash and inspector.
//   3. Render        Cards, edges, inspector and selection.
//   4. Fields        Typing in the inspector updates the model live, history on commit.
//   5. Pointer       Move cards, draw edges, drag pieces and new cards, pan.
//   6. Keyboard      Delete, undo and redo.
//
//   Every structural change goes through the model, then the editor draws again.
//   Typing is the exception: it would lose the focus, so it only redraws the cards.
//

export class GraphEditor {
    #root
    #definitions
    #palette
    #planType
    #bubble
    #closedBubbleId = null    // the selection whose bubble the user closed
    #flowMark
    #travelQueue = Promise.resolve()
    #travelDurationMs = DEFAULT_TRAVEL_DURATION_MS
    #workspace
    #history = new History()
    #listeners = { change: [], select: [], fieldinput: [], travel: [] }
    #selectedId = null
    #status = new Map()
    #edgeLines = new Map()  // edge id -> [from, ...bend points, to] in canvas units, set in drawEdges
    #view = { ...HOME_VIEW }
    #elements = {}
    #press = null           // pointer down, not yet sure if click or drag
    #drag = null            // a piece, a new card or an edge on its way
    #fieldSnapshot = null   // workspace before the focused field changed

    constructor({ root, definitions, palette, planType, bubble = () => null, flowMark = null }) {
        this.#root = root
        this.#definitions = new Map(definitions.map(definition => [definition.type, definition]))
        this.#palette = palette
        this.#planType = planType
        this.#bubble = bubble
        this.#flowMark = flowMark
        this.#workspace = normalizeWorkspace(null, definitions, planType)

        this.#buildLayout()
        this.#setInspectorOpen(false)   // the graph first, a click on a card opens its puzzle
        this.#bindFields()
        this.#bindPointer()
        this.#bindKeyboard()
        this.render()
    }

    // ---------------------------------------------------------------------------
    // Public API
    //   load, clear, select, reveal, undo, redo, status, events.
    // ---------------------------------------------------------------------------

    get workspace() {
        return this.#workspace
    }

    on(event, listener) {
        this.#listeners[event].push(listener)
    }

    load(workspace) {
        this.#workspace = normalizeWorkspace(cloneJson(workspace), [...this.#definitions.values()], this.#planType)
        this.#history.clear()
        this.#status.clear()
        this.#selectedId = null
        this.render()
        this.fitView()
        this.#emit('select', null)
        this.#emit('change', this.#workspace)
    }

    clear() {
        this.#history.record(this.#workspace)
        this.#workspace.nodes = []
        this.#workspace.edges = []
        this.#commit(null)
    }

    // What an id stands for: a node card, an edge or a puzzle piece.
    getItem(id) {
        if (null == id) return null
        const edge = this.#workspace.edges.find(candidate => candidate.id === id)
        if (null != edge) return { kind: 'edge', item: edge }
        const block = findBlock(this.#workspace, id)?.block
        if (null == block) return null
        const isNode = this.#workspace.nodes.includes(block)
        return { kind: isNode ? 'node' : 'block', item: block }
    }

    select(id) {
        const previousInspected = this.#inspectedBlock()
        this.#selectedId = null == this.getItem(id) ? null : id
        if (this.#inspectedBlock() !== previousInspected) this.#renderInspector()

        // A selected card opens its puzzle.
        if (null != findOwnerNode(this.#workspace, this.#selectedId)) this.#setInspectorOpen(true)
        this.#applySelection()
        this.#emit('select', this.#selectedId)
    }

    reveal(id) {
        const node = findOwnerNode(this.#workspace, id)
            ?? this.#workspace.nodes.find(candidate => candidate.id === this.getItem(id)?.item.from)
        const card = null == node ? null : this.#findCard(node.id)
        if (null == card) return

        const stage = this.#elements.stage.getBoundingClientRect()
        const rect = card.getBoundingClientRect()
        const isVisible = rect.top >= stage.top && rect.bottom <= stage.bottom
            && rect.left >= stage.left && rect.right <= stage.right - this.#elements.inspector.offsetWidth
        if (isVisible) return

        this.#view.x += stage.left + REVEAL_MARGIN_PX - rect.left
        this.#view.y += stage.top + REVEAL_MARGIN_PX - rect.top
        this.#applyView()
    }

    // Zooms and pans so every card fits into the free area left of the inspector.
    fitView() {
        const cards = [...this.#elements.cardLayer.querySelectorAll('.gl-card')]
        if (cards.length === 0) {
            this.#view = { ...HOME_VIEW }
            return this.#applyView()
        }

        const bounds = cards.reduce((box, card) => {
            const node = this.getItem(card.dataset.nodeId).item
            return {
                left: Math.min(box.left, node.x),
                top: Math.min(box.top, node.y),
                right: Math.max(box.right, node.x + card.offsetWidth),
                bottom: Math.max(box.bottom, node.y + card.offsetHeight),
            }
        }, { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity })


        const freeWidth = this.#elements.stage.clientWidth - this.#elements.inspector.offsetWidth - 2 * FIT_MARGIN_PX
        const freeHeight = this.#elements.stage.clientHeight - 2 * FIT_MARGIN_PX
        const zoom = clamp(Math.min(freeWidth / (bounds.right - bounds.left), freeHeight / (bounds.bottom - bounds.top)), FIT_ZOOM_MIN, 1)

        this.#view = {
            x: FIT_MARGIN_PX - bounds.left * zoom,
            y: FIT_MARGIN_PX - bounds.top * zoom,
            zoom,
        }
        this.#applyView()
    }

    undo() {
        const previous = this.#history.undo(this.#workspace)
        if (null == previous) return
        this.#workspace = previous
        this.#commit(this.#selectedId)
    }

    redo() {
        const next = this.#history.redo(this.#workspace)
        if (null == next) return
        this.#workspace = next
        this.#commit(this.#selectedId)
    }

    deleteSelected() {
        const selected = this.getItem(this.#selectedId)
        if (null == selected || selected.item === this.#workspace.plan) return

        this.#history.record(this.#workspace)
        if (selected.kind === 'edge') {
            this.#workspace.edges = this.#workspace.edges.filter(edge => edge !== selected.item)
        } else {
            removeBlock(this.#workspace, selected.item.id)
        }
        this.#commit(null)
    }

    // Live status while the graph runs: 'running' glows, 'done' shows a check.
    setNodeStatus(nodeId, status) {
        if (null == status) this.#status.delete(nodeId)
        else this.#status.set(nodeId, status)
        this.#applyStatus()
    }

    clearNodeStatus() {
        this.#status.clear()
        this.#applyStatus()
    }

    setTravelDuration(ms) {
        this.#travelDurationMs = Math.max(100, Number(ms) || DEFAULT_TRAVEL_DURATION_MS)
    }

    // Lets the flow mark travel from one card to another along the flow edges between them,
    // also through one card in between (a switch). Calls queue up, so the marks follow each other.
    travel(fromId, toId) {
        const direct = this.#workspace.edges.find(edge => edge.kind !== 'use' && edge.from === fromId && edge.to === toId)
        const first = direct ?? this.#workspace.edges.find(edge => edge.kind !== 'use' && edge.from === fromId
            && this.#workspace.edges.some(next => next.kind !== 'use' && next.from === edge.to && next.to === toId))
        if (null == first) return

        const second = null != direct ? null : this.#workspace.edges.find(edge => edge.kind !== 'use' && edge.from === first.to && edge.to === toId)
        const route = [first, second].filter(Boolean)
        this.#travelQueue = this.#travelQueue
            .then(() => this.#emit('travel', { fromId, toId, phase: 'start' }))
            .then(() => route.reduce(
                (previous, edge) => previous.then(() => this.#travelAlong(edge.id)),
                Promise.resolve(),
            ))
            .then(() => this.#emit('travel', { fromId, toId, phase: 'end' }))
    }

    #travelAlong(edgeId) {
        const path = this.#elements.edgeLayer.querySelector(`[data-edge-id="${CSS.escape(edgeId)}"] .gl-edge-hit`)
        if (null == path || null == this.#flowMark) return Promise.resolve()

        const traveller = svgElement('text', { class: 'gl-traveller' })
        traveller.textContent = this.#flowMark
        this.#elements.travelLayer.append(traveller)

        const length = path.getTotalLength()
        const startTime = performance.now()
        return new Promise(resolve => {
            const step = now => {
                const share = Math.min(1, (now - startTime) / this.#travelDurationMs)
                const point = path.getPointAtLength(length * share)
                traveller.setAttribute('x', point.x)
                traveller.setAttribute('y', point.y)
                if (share < 1) return requestAnimationFrame(step)
                traveller.remove()
                resolve()
            }
            requestAnimationFrame(step)
        })
    }

    #emit(event, payload) {
        this.#listeners[event].forEach(listener => listener(payload))
    }

    // After a structural change: draw, fix the selection, tell the app.
    #commit(selectedId) {
        this.render()
        this.select(selectedId)
        this.#emit('change', this.#workspace)
    }

    // ---------------------------------------------------------------------------
    // Layout
    //   Palette, stage with canvas, controls, trash and inspector.
    // ---------------------------------------------------------------------------

    #buildLayout() {
        const control = (label, title, action) => {
            const button = element('button', { className: 'gl-control', attributes: { type: 'button', title }, text: label })
            button.addEventListener('click', action)
            return button
        }

        // Palette: one section per category, cards and pieces as previews.
        const list = element('div', { className: 'gl-palette-list' })
        for (const category of this.#palette) {
            const heading = element('div', { className: 'gl-palette-heading', text: category.name })
            heading.style.setProperty('--block-colour', category.colour)
            list.append(heading, ...category.types.map(type => this.#renderPaletteItem(type)))
        }
        const palette = element('aside', { className: 'gl-palette' }, [list])

        // Stage: canvas with edges below the cards, controls, trash and inspector on top.
        const edgeLayer = svgElement('svg', { class: 'gl-edges' })
        const travelLayer = svgElement('svg', { class: 'gl-edges gl-travel' })     // above the cards
        const cardLayer = element('div', { className: 'gl-cards' })
        const canvas = element('div', { className: 'gl-canvas' }, [edgeLayer, cardLayer, travelLayer])
        const trash = element('div', { className: 'gl-trash', attributes: { title: t('editor.trash') }, text: '🗑️' })
        const controls = element('div', { className: 'gl-controls' }, [
            control('↶', t('editor.undo'), () => this.undo()),
            control('↷', t('editor.redo'), () => this.redo()),
            control('＋', t('editor.zoomIn'), () => this.#zoomAt(ZOOM_STEP)),
            control('－', t('editor.zoomOut'), () => this.#zoomAt(1 / ZOOM_STEP)),
            control('⌂', t('editor.fit'), () => this.fitView()),
        ])

        // Inspector: can fold to a narrow strip, so the graph gets the whole stage.
        const inspectorTitle = element('span')
        const inspectorToggle = element('button', { className: 'gl-control gl-inspector-toggle', attributes: { type: 'button', title: t('editor.inspector.fold') }, text: '⟩' })
        const inspectorBody = element('div', { className: 'gl-inspector-body' })
        const inspector = element('aside', { className: 'gl-inspector' }, [
            element('div', { className: 'gl-inspector-title' }, [inspectorToggle, inspectorTitle]),
            inspectorBody,
        ])
        inspectorToggle.addEventListener('click', () => this.#setInspectorOpen(inspector.classList.contains('is-folded')))
        // Speech bubble: lives on the stage, not the canvas, so it stays readable at any zoom.
        const bubbleText = element('p', { className: 'gl-bubble-text' })
        const bubbleClose = element('button', { className: 'gl-bubble-close', attributes: { type: 'button', title: t('editor.close') }, text: '×' })
        const bubble = element('div', { className: 'gl-bubble', attributes: { hidden: '' } }, [bubbleClose, bubbleText])
        const stage = element('div', { className: 'gl-stage' }, [canvas, controls, trash, bubble, inspector])

        this.#root.classList.add('gl-editor')
        this.#root.replaceChildren(palette, stage)

        // The stage changes size when the code panel opens or closes, the bubble follows.
        new ResizeObserver(() => this.#drawBubble()).observe(stage)
        Object.assign(this.#elements, { palette, stage, canvas, edgeLayer, cardLayer, travelLayer, trash, bubble, bubbleText, bubbleClose, inspector, inspectorTitle, inspectorToggle, inspectorBody })
    }

    #setInspectorOpen(isOpen) {
        this.#elements.inspector.classList.toggle('is-folded', !isOpen)
        this.#elements.inspectorToggle.textContent = isOpen ? '⟩' : '⟨'
        this.#elements.inspectorToggle.title = isOpen ? t('editor.inspector.fold') : t('editor.inspector.unfold')
    }

    #renderPaletteItem(type) {
        const definition = this.#definitions.get(type)
        const block = createBlock(definition, { x: 0, y: 0 })
        const preview = null != definition.node
            ? renderCard(block, { ...this.#renderContext(), isPalette: true })
            : renderBlock(block, { ...this.#renderContext(), isPreview: true })
        return element('div', { className: 'gl-palette-item', attributes: { 'data-type': type, title: 'Ziehen oder klicken' } }, [preview])
    }

    // ---------------------------------------------------------------------------
    // Render
    //   Cards, edges, inspector and selection.
    // ---------------------------------------------------------------------------

    #renderContext() {
        return { definitions: this.#definitions, workspace: this.#workspace }
    }

    render() {
        this.#renderCanvas()
        this.#renderInspector()
        this.#applySelection()
    }

    #renderCanvas() {
        const context = this.#renderContext()
        this.#elements.cardLayer.replaceChildren(...this.#workspace.nodes.map(node => renderCard(node, context)))
        this.#applyView()
        this.#drawEdges()
        this.#applyStatus()
        this.#applySelection()
    }

    #drawEdges() {
        const layer = this.#elements.edgeLayer
        layer.replaceChildren()
        this.#edgeLines.clear()

        for (const edge of this.#workspace.edges) {
            const isUse = edge.kind === 'use'
            const from = this.#portCenter(this.#wireStartSelector({ linkKind: edge.kind, from: edge.from, port: edge.port }))
            const to = this.#portCenter(isUse
                ? `.gl-port-provide[data-node-id="${CSS.escape(edge.to)}"]`
                : `.gl-port-in[data-node-id="${CSS.escape(edge.to)}"]`)
            if (null == from || null == to) continue

            // Without bend points a smooth curve, with them straight lines that bend at each point.
            const line = [from, ...(edge.points ?? []), to]
            this.#edgeLines.set(edge.id, line)
            const path = line.length > 2 ? bendPath(line) : isUse ? usePath(from, to) : edgePath(from, to)

            // A wide invisible path makes the thin edge easy to click.
            const group = svgElement('g', { class: isUse ? 'gl-edge-group gl-use-link' : 'gl-edge-group', 'data-edge-id': edge.id })
            const hitPath = svgElement('path', { class: 'gl-edge-hit', d: path })
            group.append(hitPath, svgElement('path', { class: 'gl-edge', d: path }))
            layer.append(group)

            // Flow edges carry a little mark in the middle: what travels along them.
            if (!isUse && null != this.#flowMark) {
                const middle = hitPath.getPointAtLength(hitPath.getTotalLength() / 2)
                const mark = svgElement('text', { class: 'gl-flow-mark', x: middle.x, y: middle.y })
                mark.textContent = this.#flowMark
                group.append(mark)
            }
        }
        this.#drawHandles()
        this.#drawBubble()
    }

    // The center of a port in canvas units, independent of pan and zoom.
    #portCenter(selector) {
        const port = this.#elements.cardLayer.querySelector(selector)
        if (null == port) return null
        return this.#toCanvas(port.getBoundingClientRect(), true)
    }

    #toCanvas(rectOrPoint, isRect = false) {
        const origin = this.#elements.canvas.getBoundingClientRect()
        const x = isRect ? rectOrPoint.left + rectOrPoint.width / 2 : rectOrPoint.x
        const y = isRect ? rectOrPoint.top + rectOrPoint.height / 2 : rectOrPoint.y
        return { x: (x - origin.left) / this.#view.zoom, y: (y - origin.top) / this.#view.zoom }
    }

    // The inspector shows the selected card, or the graph plan when no card is selected.
    #inspectedBlock() {
        return findOwnerNode(this.#workspace, this.#selectedId) ?? this.#workspace.plan
    }

    #renderInspector() {
        const block = this.#inspectedBlock()
        const definition = this.#definitions.get(block.type)
        const isPlan = block === this.#workspace.plan

        const title = isPlan
            ? t('editor.inspector.plan')
            : t('editor.inspector.card', { title: definition.node.title({ block, workspace: this.#workspace }) || '…' })
        this.#elements.inspectorTitle.textContent = title

        const hasSlots = definition.parts.some(part => null != part?.slot)
        const hasFields = definition.parts.some(part => null != part?.field)
        let hint = t('editor.inspector.hint.none')
        if (hasFields) hint = t('editor.inspector.hint.fields')
        if (hasSlots) hint = t('editor.inspector.hint.slots')
        if (isPlan) hint = t('editor.inspector.hint.plan')
        this.#elements.inspectorBody.replaceChildren(
            renderBlock(block, this.#renderContext()),
            element('p', { className: 'gl-inspector-hint', text: hint }),
        )
        this.#applySelection()
    }

    #refreshInspectorDropdowns() {
        for (const select of this.#elements.inspectorBody.querySelectorAll('.gl-input-select')) {
            const block = findBlock(this.#workspace, select.dataset.blockId)?.block
            const part = this.#findPart(block, select.dataset.field)
            if (null == part) continue
            fillSelect(select, resolveOptions(part, { workspace: this.#workspace, block }), block.fields[part.field])
        }
    }

    #applyView() {
        const { x, y, zoom } = this.#view
        this.#elements.canvas.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`
        this.#elements.stage.style.backgroundPosition = `${x}px ${y}px`
        this.#elements.stage.style.backgroundSize = `${24 * zoom}px ${24 * zoom}px`
        this.#drawBubble()
    }

    #applySelection() {
        const id = this.#selectedId
        for (const node of this.#root.querySelectorAll('.gl-selected')) node.classList.remove('gl-selected')
        this.#drawHandles()
        this.#drawBubble()
        if (null == id) return

        const selector = `[data-node-id="${CSS.escape(id)}"].gl-card, [data-edge-id="${CSS.escape(id)}"], .gl-block[data-block-id="${CSS.escape(id)}"]`
        for (const node of this.#root.querySelectorAll(selector)) node.classList.add('gl-selected')
    }

    // The speech bubble of the selection: above the card, or at the middle of a line.
    // Pieces in the inspector get none, the inspector is right next to them.
    #drawBubble() {
        const { bubble, bubbleText, stage, inspector } = this.#elements
        const id = this.#selectedId
        const selected = this.getItem(id)
        const text = id === this.#closedBubbleId ? null : this.#bubble(id)

        // Where it points to, in screen pixels.
        let anchor = null
        if (selected?.kind === 'node') {
            const rect = this.#findCard(id)?.getBoundingClientRect()
            if (null != rect) anchor = { x: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom }
        }
        const line = this.#edgeLines.get(id)
        if (selected?.kind === 'edge' && null != line) {
            const [a, b] = [line[Math.floor((line.length - 1) / 2)], line[Math.ceil((line.length - 1) / 2)]]
            const origin = this.#elements.canvas.getBoundingClientRect()
            const x = origin.left + (a.x + b.x) / 2 * this.#view.zoom
            const y = origin.top + (a.y + b.y) / 2 * this.#view.zoom
            anchor = { x, top: y - 8, bottom: y + 8 }
        }
        if (null == anchor || !text) {
            bubble.hidden = true
            return
        }

        // Above the anchor, below when there is no room on top; never under the inspector.
        const area = stage.getBoundingClientRect()
        const halfWidth = bubble.offsetWidth / 2 || BUBBLE_HALF_WIDTH_PX
        const right = area.width - inspector.offsetWidth - halfWidth - BUBBLE_MARGIN_PX
        const isBelow = anchor.top - area.top < BUBBLE_ROOM_PX
        bubbleText.textContent = text
        bubble.hidden = false
        bubble.classList.toggle('is-below', isBelow)
        // When the bubble is pushed away from the edge, its tail still points to the anchor.
        const left = clamp(anchor.x - area.left, halfWidth + BUBBLE_MARGIN_PX, Math.max(right, halfWidth))
        bubble.style.left = `${left}px`
        bubble.style.setProperty('--tail-offset', `${clamp(anchor.x - area.left - left, -halfWidth + 20, halfWidth - 20)}px`)
        bubble.style.top = `${(isBelow ? anchor.bottom : anchor.top) - area.top}px`
    }

    // Handles of the selected edge: a dot per bend point (drag to move, double-click to remove)
    // and a small plus in the middle of every segment (drag or click to add a bend point there).
    #drawHandles() {
        this.#elements.edgeLayer.querySelector('.gl-handles')?.remove()
        const line = this.#edgeLines.get(this.#selectedId)
        if (null == line) return

        const handles = svgElement('g', { class: 'gl-handles' })
        for (let index = 0; index < line.length - 1; index++) {
            const [a, b] = [line[index], line[index + 1]]
            handles.append(svgElement('circle', {
                class: 'gl-handle-add', cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, r: 6,
                'data-handle-edge': this.#selectedId, 'data-index': index,
            }))
        }
        line.slice(1, -1).forEach((point, index) => handles.append(svgElement('circle', {
            class: 'gl-handle-point', cx: point.x, cy: point.y, r: 7,
            'data-handle-edge': this.#selectedId, 'data-index': index,
        })))
        this.#elements.edgeLayer.append(handles)
    }

    #applyStatus() {
        for (const card of this.#elements.cardLayer.querySelectorAll('.gl-card')) {
            const status = this.#status.get(card.dataset.nodeId)
            card.classList.toggle('gl-card-running', status === 'running')
            card.classList.toggle('gl-card-done', status === 'done')
        }
    }

    #findCard(nodeId) {
        return this.#elements.cardLayer.querySelector(`.gl-card[data-node-id="${CSS.escape(nodeId)}"]`)
    }

    #findPart(block, field) {
        return this.#definitions.get(block?.type)?.parts.find(part => part?.field === field) ?? null
    }

    // The first slot of a block that accepts a kind of piece.
    #findSlotFor(block, fits) {
        return this.#definitions.get(block?.type)?.parts.find(part => part?.slot && part.accepts === fits)?.slot ?? null
    }

    // ---------------------------------------------------------------------------
    // Fields
    //   Typing in the inspector updates the model live, history on commit.
    // ---------------------------------------------------------------------------

    #bindFields() {
        const body = this.#elements.inspectorBody

        // Remember the workspace when a field gets the focus, it is the undo point.
        body.addEventListener('focusin', event => {
            if (event.target.matches?.('.gl-input')) this.#fieldSnapshot = JSON.stringify(this.#workspace)
        })
        body.addEventListener('input', event => {
            if (event.target.matches?.('.gl-input')) this.#onFieldInput(event.target)
        })
        body.addEventListener('change', event => {
            if (!event.target.matches?.('.gl-input')) return
            if (null != this.#fieldSnapshot && this.#fieldSnapshot !== JSON.stringify(this.#workspace)) {
                this.#history.record(this.#fieldSnapshot)
            }
            this.#fieldSnapshot = JSON.stringify(this.#workspace)
        })
    }

    #onFieldInput(input) {
        const block = findBlock(this.#workspace, input.dataset.blockId)?.block
        const part = this.#findPart(block, input.dataset.field)
        if (null == part) return

        const oldValue = block.fields[part.field]
        let value = input.value
        if (part.kind === 'checkbox') value = input.checked
        if (part.kind === 'number') {
            const number = Number(input.value)
            // An empty or half typed number keeps the old value until it is valid again.
            value = input.value === '' || !Number.isFinite(number) ? oldValue : clamp(number, part.min, part.max)
        }
        if (part.kind === 'text') {
            if (part.wide) fitTextArea(input)
            else fitTextInput(input)
        }
        if (value === oldValue) return

        block.fields[part.field] = value
        this.#emit('fieldinput', { workspace: this.#workspace, block, field: part.field, oldValue, value })
        this.#refreshInspectorDropdowns()
        this.#renderCanvas()
        this.#emit('change', this.#workspace)
    }

    // ---------------------------------------------------------------------------
    // Pointer
    //   Move cards, draw edges, drag pieces and new cards, pan.
    // ---------------------------------------------------------------------------

    #bindPointer() {
        const { palette, stage } = this.#elements

        palette.addEventListener('pointerdown', event => {
            const item = event.target.closest('.gl-palette-item')
            if (event.button !== 0 || null == item) return
            event.preventDefault()
            this.#press = { kind: 'new', type: item.dataset.type, source: item.firstElementChild, startX: event.clientX, startY: event.clientY }
        })

        stage.addEventListener('pointerdown', event => {
            if (event.button !== 0 || isTypingTarget(event.target) || null != event.target.closest('.gl-controls')) return
            const start = { startX: event.clientX, startY: event.clientY }
            const target = event.target

            // The speech bubble is for reading, its × closes it until the next selection.
            if (null != target.closest('.gl-bubble')) {
                if (null != target.closest('.gl-bubble-close')) {
                    this.#closedBubbleId = this.#selectedId
                    this.#drawBubble()
                }
                return
            }

            // Inside the inspector only pieces can be picked up, the rest is for reading.
            if (null != target.closest('.gl-inspector')) {
                const piece = target.closest('.gl-block[data-fits]')
                if (null == piece) return
                event.preventDefault()
                this.#press = { kind: 'piece', id: piece.dataset.blockId, source: piece, ...start }
                return
            }

            event.preventDefault()
            document.activeElement?.blur?.()

            const handle = target.closest('[data-handle-edge]')
            const port = target.closest('.gl-port-out, .gl-port-use')
            const card = target.closest('.gl-card')
            const edge = target.closest('[data-edge-id]')
            if (null != handle) {
                this.#press = this.#pressHandle(handle, start)
            } else if (null != port) {
                const linkKind = port.classList.contains('gl-port-use') ? 'use' : 'flow'
                this.#press = { kind: 'wire', linkKind, from: port.dataset.nodeId, port: port.dataset.port, accepts: port.dataset.accepts, multiple: port.dataset.multiple === 'true', ...start }
            } else if (null != card) {
                const node = this.getItem(card.dataset.nodeId).item
                this.#press = { kind: 'card', id: node.id, node, origin: { x: node.x, y: node.y }, ...start }
            } else if (null != edge) {
                this.#press = { kind: 'edge', id: edge.dataset.edgeId, ...start }
            } else {
                this.#press = { kind: 'pan', startView: { ...this.#view }, ...start }
            }
        })

        window.addEventListener('pointermove', event => this.#onPointerMove(event))
        window.addEventListener('pointerup', event => this.#onPointerUp(event))
        window.addEventListener('pointercancel', () => this.#cancelPointer())

        // Double-click on a line adds a bend point there, on a bend point removes it.
        stage.addEventListener('dblclick', event => {
            const point = event.target.closest('.gl-handle-point')
            const edgeGroup = event.target.closest('[data-edge-id]')
            if (null != point) return this.#removeBendPoint(point.dataset.handleEdge, Number(point.dataset.index))
            if (null != edgeGroup) return this.#addBendPointAt(edgeGroup.dataset.edgeId, event)
        })

        // Wheel pans, Ctrl+wheel (and pinch on a touchpad) zooms at the pointer.
        stage.addEventListener('wheel', event => {
            if (null != event.target.closest('.gl-inspector')) return
            event.preventDefault()
            if (event.ctrlKey) return this.#zoomAt(event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, event)
            this.#view.x -= event.deltaX
            this.#view.y -= event.deltaY
            this.#applyView()
        }, { passive: false })
    }

    #onPointerMove(event) {
        const press = this.#press
        if (null == press) return

        const dx = event.clientX - press.startX
        const dy = event.clientY - press.startY
        if (!press.isMoving && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
        const isFirstMove = !press.isMoving
        press.isMoving = true

        if (press.kind === 'pan') {
            this.#view.x = press.startView.x + dx
            this.#view.y = press.startView.y + dy
            return this.#applyView()
        }
        if (press.kind === 'card') {
            if (isFirstMove) press.before = JSON.stringify(this.#workspace)
            press.node.x = Math.round(press.origin.x + dx / this.#view.zoom)
            press.node.y = Math.round(press.origin.y + dy / this.#view.zoom)
            const card = this.#findCard(press.id)
            card.style.left = `${press.node.x}px`
            card.style.top = `${press.node.y}px`
            // Over the trash or the palette the card is doomed: dropping it there deletes it.
            const hits = document.elementsFromPoint(event.clientX, event.clientY)
            press.isOverTrash = hits.some(hit => this.#elements.trash.contains(hit) || this.#elements.palette.contains(hit))
            this.#elements.trash.classList.toggle('is-hot', press.isOverTrash)
            card.classList.toggle('gl-card-doomed', press.isOverTrash)
            return this.#drawEdges()
        }
        if (press.kind === 'bend') {
            const point = this.#toCanvas({ x: event.clientX, y: event.clientY })
            press.edge.points[press.index] = { x: Math.round(point.x), y: Math.round(point.y) }
            return this.#drawEdges()
        }
        if (press.kind === 'wire') return this.#moveWire(event)
        if (press.kind === 'new' || press.kind === 'piece') {
            if (null == this.#drag) this.#beginDrag(press)
            return this.#moveDrag(event)
        }
    }

    #onPointerUp(event) {
        const press = this.#press
        this.#press = null
        if (null == press) return

        // A fast flick can end without any move event in between.
        if (!press.isMoving && Math.hypot(event.clientX - press.startX, event.clientY - press.startY) >= DRAG_THRESHOLD_PX) {
            this.#press = press
            this.#onPointerMove(event)
            this.#press = null
        }

        if (press.kind === 'card' && press.isMoving) {
            this.#elements.trash.classList.remove('is-hot')
            this.#history.record(press.before)
            if (press.isOverTrash) {
                removeBlock(this.#workspace, press.id)
                return this.#commit(null)
            }
            return this.#commit(press.id)
        }
        if (press.kind === 'bend') {
            // A plus that was only clicked still adds its point, a dot that was only clicked changes nothing.
            if (!press.isMoving && !press.isNew) return
            this.#history.record(press.before)
            return this.#commit(press.edge.id)
        }
        if (press.kind === 'wire') return this.#finishWire(event, press)
        if ((press.kind === 'new' || press.kind === 'piece') && null != this.#drag) return this.#finishDrag()

        // No movement: a click.
        if (press.kind === 'card' || press.kind === 'edge' || press.kind === 'piece') return this.select(press.id)
        if (press.kind === 'pan' && !press.isMoving) return this.select(null)
        if (press.kind === 'new') return this.#addByClick(press.type)
    }

    #cancelPointer() {
        this.#press = null
        this.#elements.edgeLayer.querySelector('.gl-wire')?.remove()
        if (null != this.#drag) {
            this.#drag.target = null
            this.#finishDrag()
        }
    }

    // A new block from the palette. A card gets a NAME no other card has: chat, chat_2, chat_3 ...
    #createFresh(definition, position) {
        const block = createBlock(definition, position)
        const baseName = block.fields.NAME
        if (null == definition.node || typeof baseName !== 'string') return block

        const taken = new Set(this.#workspace.nodes.map(node => node.fields.NAME))
        let counter = 2
        while (taken.has(block.fields.NAME)) block.fields.NAME = `${baseName}_${counter++}`
        return block
    }

    // A click on the palette: a card appears near the top left, a piece goes into the inspector.
    #addByClick(type) {
        const definition = this.#definitions.get(type)
        const before = JSON.stringify(this.#workspace)

        if (null != definition.node) {
            const block = this.#createFresh(definition, {
                x: (NEW_NODE_OFFSET_PX - this.#view.x) / this.#view.zoom,
                y: (NEW_NODE_OFFSET_PX - this.#view.y) / this.#view.zoom,
            })
            this.#workspace.nodes.push(block)
            this.#history.record(before)
            return this.#commit(block.id)
        }

        // The inspected card first, else the plan.
        const owner = [this.#inspectedBlock(), this.#workspace.plan].find(block => null != this.#findSlotFor(block, definition.fits))
        if (null == owner) return
        const piece = createBlock(definition)
        insertBlock(this.#workspace, piece, { parentId: owner.id, slot: this.#findSlotFor(owner, definition.fits) })
        this.#history.record(before)
        this.#commit(piece.id)
    }

    // Bend points: a dot moves its point, a plus inserts a new point in its segment and moves that.
    #pressHandle(handle, start) {
        const edge = this.getItem(handle.dataset.handleEdge)?.item
        const before = JSON.stringify(this.#workspace)
        const index = Number(handle.dataset.index)
        edge.points ??= []

        if (handle.classList.contains('gl-handle-add')) {
            const point = { x: Number(handle.getAttribute('cx')), y: Number(handle.getAttribute('cy')) }
            edge.points.splice(index, 0, point)
            return { kind: 'bend', edge, index, before, isNew: true, ...start }
        }
        return { kind: 'bend', edge, index, before, isNew: false, ...start }
    }

    #addBendPointAt(edgeId, event) {
        const edge = this.getItem(edgeId)?.item
        const line = this.#edgeLines.get(edgeId)
        if (null == edge?.from || null == line) return

        const point = this.#toCanvas({ x: event.clientX, y: event.clientY })
        this.#history.record(this.#workspace)
        edge.points ??= []
        edge.points.splice(nearestSegment(line, point), 0, { x: Math.round(point.x), y: Math.round(point.y) })
        this.#commit(edgeId)
    }

    #removeBendPoint(edgeId, index) {
        const edge = this.getItem(edgeId)?.item
        if (null == edge?.points?.[index]) return

        this.#history.record(this.#workspace)
        edge.points.splice(index, 1)
        if (edge.points.length === 0) delete edge.points
        this.#commit(edgeId)
    }

    // Wires: drawn from a port, they snap onto a fitting card under the pointer.
    //   flow   from an output nose to any card with an input notch
    //   use    from a socket at the bottom to a resource whose knob provides what it accepts
    #moveWire(event) {
        const press = this.#press
        const layer = this.#elements.edgeLayer
        const from = this.#portCenter(this.#wireStartSelector(press))
        const to = this.#toCanvas({ x: event.clientX, y: event.clientY })

        let wire = layer.querySelector('.gl-wire')
        if (null == wire) wire = layer.appendChild(svgElement('path', { class: 'gl-wire' }))
        wire.setAttribute('d', press.linkKind === 'use' ? usePath(from, to) : edgePath(from, to))

        const target = this.#cardUnder(event)
        for (const card of this.#elements.cardLayer.querySelectorAll('.gl-card-drop')) card.classList.remove('gl-card-drop')
        if (this.#fitsWire(target, press)) target.classList.add('gl-card-drop')
    }

    #finishWire(event, press) {
        this.#elements.edgeLayer.querySelector('.gl-wire')?.remove()
        for (const card of this.#elements.cardLayer.querySelectorAll('.gl-card-drop')) card.classList.remove('gl-card-drop')

        const target = this.#cardUnder(event)
        if (!this.#fitsWire(target, press)) return this.#renderCanvas()

        const before = JSON.stringify(this.#workspace)
        const edge = connect(this.#workspace, { from: press.from, port: press.port, to: target.dataset.nodeId, kind: press.linkKind, multiple: press.multiple })
        if (null == edge) return this.#renderCanvas()
        this.#history.record(before)
        this.#commit(edge.id)
    }

    #wireStartSelector({ linkKind, from, port }) {
        const portClass = linkKind === 'use' ? 'gl-port-use' : 'gl-port-out'
        return `.${portClass}[data-node-id="${CSS.escape(from)}"][data-port="${CSS.escape(port)}"]`
    }

    #fitsWire(card, press) {
        if (null == card || card.dataset.nodeId === press.from) return false
        if (press.linkKind === 'use') return null != card.querySelector(`.gl-port-provide[data-provides="${CSS.escape(press.accepts)}"]`)
        return null != card.querySelector('.gl-port-in')
    }

    #cardUnder(event) {
        return document.elementsFromPoint(event.clientX, event.clientY)
            .map(hit => hit.closest?.('.gl-card'))
            .find(card => null != card && this.#elements.cardLayer.contains(card)) ?? null
    }

    // Pieces and new cards: a ghost follows the pointer, the drop decides.
    #beginDrag(press) {
        const zoomOfGhost = press.kind === 'piece' ? 1 : this.#view.zoom
        const rect = press.source.getBoundingClientRect()
        const before = JSON.stringify(this.#workspace)

        // A moved piece leaves its slot at once, the drop puts it somewhere else.
        let block
        if (press.kind === 'piece') {
            block = removeBlock(this.#workspace, press.id)
            this.#renderInspector()
            this.#renderCanvas()
        } else {
            block = this.#createFresh(this.#definitions.get(press.type), { x: 0, y: 0 })
        }

        const definition = this.#definitions.get(block.type)
        const preview = null != definition.node ? renderCard(block, this.#renderContext()) : renderBlock(block, this.#renderContext())
        const ghost = element('div', { className: 'gl-ghost' }, [preview])
        ghost.style.transform = `scale(${zoomOfGhost})`
        document.body.append(ghost)
        document.body.classList.add('gl-dragging')

        // The grab point stays under the pointer, converted from the scale of the source.
        const sourceScale = rect.width / preview.offsetWidth
        const offset = {
            x: (press.startX - rect.left) / sourceScale * zoomOfGhost,
            y: (press.startY - rect.top) / sourceScale * zoomOfGhost,
        }

        this.#drag = { block, definition, isNew: press.kind === 'new', before, offset, ghost, target: null, marker: null }
    }

    #moveDrag(event) {
        const drag = this.#drag
        drag.ghost.style.left = `${event.clientX - drag.offset.x}px`
        drag.ghost.style.top = `${event.clientY - drag.offset.y}px`

        drag.marker?.remove()
        drag.marker = null
        this.#elements.trash.classList.remove('is-hot')
        for (const card of this.#elements.cardLayer.querySelectorAll('.gl-card-drop')) card.classList.remove('gl-card-drop')

        const hits = document.elementsFromPoint(event.clientX, event.clientY)
        const isOver = container => hits.some(hit => container.contains(hit))
        const fits = drag.definition.fits

        // Over trash or palette: delete.
        if (isOver(this.#elements.trash) || isOver(this.#elements.palette)) {
            this.#elements.trash.classList.add('is-hot')
            drag.target = { isDelete: true }
            return
        }

        // A new card: wherever it is dropped on the stage, but not on the inspector.
        if (null != drag.definition.node) {
            if (isOver(this.#elements.inspector)) {
                drag.target = null
                return
            }
            const point = this.#toCanvas({ x: event.clientX - drag.offset.x, y: event.clientY - drag.offset.y })
            drag.target = { isNode: true, x: point.x, y: point.y }
            return
        }

        // A piece over a slot in the inspector: the innermost accepting slot wins.
        const body = hits
            .map(hit => hit.closest?.('.gl-inspector .gl-slot-body'))
            .find(candidate => null != candidate && candidate.dataset.accepts === fits)
        if (null != body) {
            const children = [...body.children].filter(child => child.classList.contains('gl-block'))
            const index = children.filter(child => {
                const rect = child.getBoundingClientRect()
                return rect.top + rect.height / 2 < event.clientY
            }).length
            drag.marker = element('div', { className: 'gl-drop-marker' })
            body.insertBefore(drag.marker, children[index] ?? null)
            drag.target = { parentId: body.dataset.parentId, slot: body.dataset.slot, index }
            return
        }

        // A piece over a card whose puzzle has a fitting slot.
        const card = this.#cardUnder(event)
        const node = null == card ? null : this.getItem(card.dataset.nodeId)?.item
        const nodeSlot = this.#findSlotFor(node, fits)
        if (null != nodeSlot) {
            card.classList.add('gl-card-drop')
            drag.target = { parentId: node.id, slot: nodeSlot }
            return
        }

        // A piece on the empty canvas: into the plan, when it fits there.
        const planSlot = this.#findSlotFor(this.#workspace.plan, fits)
        drag.target = null == card && null != planSlot && !isOver(this.#elements.inspector)
            ? { parentId: this.#workspace.plan.id, slot: planSlot }
            : null
    }

    #finishDrag() {
        const drag = this.#drag
        this.#drag = null
        drag.ghost.remove()
        drag.marker?.remove()
        this.#elements.trash.classList.remove('is-hot')
        document.body.classList.remove('gl-dragging')
        for (const card of this.#elements.cardLayer.querySelectorAll('.gl-card-drop')) card.classList.remove('gl-card-drop')

        // No target: a moved piece goes back where it was, a new one is dropped.
        if (null == drag.target) {
            if (!drag.isNew) this.#workspace = JSON.parse(drag.before)
            return this.render()
        }
        if (drag.target.isDelete) {
            if (drag.isNew) return
            this.#history.record(drag.before)
            return this.#commit(null)
        }

        if (drag.target.isNode) {
            Object.assign(drag.block, { x: Math.round(drag.target.x), y: Math.round(drag.target.y) })
            this.#workspace.nodes.push(drag.block)
        } else {
            insertBlock(this.#workspace, drag.block, drag.target)
        }
        this.#history.record(drag.before)
        this.#commit(drag.block.id)
    }

    // Zooms around a point, so the spot under the pointer stays where it is.
    #zoomAt(factor, event = null) {
        const stage = this.#elements.stage.getBoundingClientRect()
        const pointX = null == event ? stage.width / 2 : event.clientX - stage.left
        const pointY = null == event ? stage.height / 2 : event.clientY - stage.top

        const oldZoom = this.#view.zoom
        const newZoom = clamp(oldZoom * factor, ZOOM_MIN, ZOOM_MAX)
        this.#view.x = pointX - (pointX - this.#view.x) * newZoom / oldZoom
        this.#view.y = pointY - (pointY - this.#view.y) * newZoom / oldZoom
        this.#view.zoom = newZoom
        this.#applyView()
    }

    // ---------------------------------------------------------------------------
    // Keyboard
    //   Delete, undo and redo.
    // ---------------------------------------------------------------------------

    #bindKeyboard() {
        document.addEventListener('keydown', event => {
            // Inside a field the keys belong to the field, also its own undo.
            if (isTypingTarget(event.target)) return

            const isCommand = event.ctrlKey || event.metaKey
            const key = event.key.toLowerCase()

            if ((event.key === 'Delete' || event.key === 'Backspace') && null != this.#selectedId) {
                event.preventDefault()
                return this.deleteSelected()
            }
            if (isCommand && key === 'z' && !event.shiftKey) {
                event.preventDefault()
                return this.undo()
            }
            if (isCommand && (key === 'y' || (key === 'z' && event.shiftKey))) {
                event.preventDefault()
                return this.redo()
            }
        })
    }
}
