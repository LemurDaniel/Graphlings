// NOTE:
//   Draws the graph on the canvas: node cards with their puzzle ports, and edges as curves.
//   Only drawing, no events. The editor listens on the canvas for everything.
//
//   import { renderCard, edgePath } from './engine.cards.js'
//
//   A node definition carries a 'node' object that tells the card what to show:
//       node: {
//           kind: 'Agent',                                   small text under the title
//           title: ({ block }) => block.fields.NAME,         big text on the card
//           hasInput: true,                                  puzzle socket on the left
//           outputs: ({ block }) => [{ port: 'out' }],       puzzle noses on the right
//           uses: [{ port: 'model', accepts: 'model' }],     sockets at the bottom, for resources,
//                                                            'multiple: true' takes several links (tools)
//           provides: 'model',                               knob on top: this card is a resource
//           emoji: '🧠',                                    avatar instead of the graphling
//           chips: ({ block, workspace }) => ['🧠 Qwen'],    short facts below the title
//       }

//
//   Chapters:
//     RENDER CARDS   A card with avatar, title, chips and ports.
//     DRAW EDGES     The curves of flow edges and use links.
//

import { element } from './engine.render.js'

const MIN_CURVE_PX = 50
const CORNER_RADIUS_PX = 12

// ===========================================================================
// ============================   RENDER CARDS   =============================
// ===========================================================================
//
//   createAvatar   The graphling of a card, its eyes blink via CSS.
//   renderCard     One node as a card at its position on the canvas.
//
//   Data attributes connect the DOM back to the model:
//       .gl-card            data-node-id
//       .gl-port-in         data-node-id
//       .gl-port-out        data-node-id, data-port
//       .gl-port-use        data-node-id, data-port, data-accepts
//       .gl-port-provide    data-node-id, data-provides
//

// A card with 'emoji' shows it, every other card is a graphling with blinking eyes.
function createAvatar(card) {
    const wrapper = element('span', { className: 'gl-avatar', attributes: { 'aria-hidden': 'true' } })
    wrapper.innerHTML = null != card.emoji
        ? `<span class="gl-avatar-emoji">${card.emoji}</span>`
        : `<svg viewBox="0 0 32 32" width="34" height="34">
                   <path class="gl-avatar-body" d="M16 3c7 0 12 5.5 12 13s-4 13-12 13S4 23.5 4 16 9 3 16 3z"/>
                   <ellipse class="gl-avatar-eye" cx="11.5" cy="14" rx="2.6" ry="3.2"/>
                   <ellipse class="gl-avatar-eye" cx="20.5" cy="14" rx="2.6" ry="3.2"/>
                   <path class="gl-avatar-mouth" d="M12.5 21c2 1.8 5 1.8 7 0"/>
               </svg>`
    return wrapper
}

export function renderCard(block, { definitions, workspace }) {
    const card = definitions.get(block.type).node
    const context = { block, workspace }

    const node = element('div', {
        className: `gl-card gl-card-${card.shape ?? 'creature'}`,
        attributes: { 'data-node-id': block.id },
    })
    node.style.setProperty('--block-colour', definitions.get(block.type).colour)
    node.style.left = `${block.x}px`
    node.style.top = `${block.y}px`

    // Input: a puzzle socket on the left edge. A resource has a knob on top instead.
    if (card.hasInput) node.append(element('span', { className: 'gl-port gl-port-in', attributes: { 'data-node-id': block.id } }))
    if (null != card.provides) {
        node.append(element('span', { className: 'gl-port gl-port-provide', attributes: { 'data-node-id': block.id, 'data-provides': card.provides } }))
    }

    // Head: avatar, title and kind.
    node.append(element('div', { className: 'gl-card-head' }, [
        createAvatar(card),
        element('div', { className: 'gl-card-text' }, [
            element('div', { className: 'gl-card-title', text: card.title(context) || '…' }),
            element('div', { className: 'gl-card-kind', text: card.kind }),
        ]),
    ]))

    // Chips: short facts from the puzzle inside.
    const chips = card.chips?.(context) ?? []
    if (chips.length > 0) {
        node.append(element('div', { className: 'gl-card-chips' }, chips.map(chip => element('span', { className: 'gl-chip', text: chip }))))
    }

    // Outputs: puzzle noses on the right edge, one row per port.
    const outputs = card.outputs?.(context) ?? []
    if (outputs.length > 0) {
        node.append(element('div', { className: 'gl-card-outputs' }, outputs.map(output => element('div', { className: 'gl-port-row' }, [
            element('span', { className: 'gl-port-label', text: output.label ?? '' }),
            element('span', { className: 'gl-port gl-port-out', attributes: { 'data-node-id': block.id, 'data-port': output.port } }),
        ]))))
    }

    // Uses: sockets on the bottom edge, each with its label above.
    const uses = card.uses ?? []
    if (uses.length > 0) {
        node.append(element('div', { className: 'gl-card-uses' }, uses.map(use => element('div', { className: 'gl-use' }, [
            element('span', { className: 'gl-use-label', text: use.label }),
            element('span', {
                className: 'gl-port gl-port-use',
                attributes: { 'data-node-id': block.id, 'data-port': use.port, 'data-accepts': use.accepts, 'data-multiple': String(Boolean(use.multiple)) },
            }),
        ]))))
    }

    return node
}

// ===========================================================================
// =============================   DRAW EDGES   ==============================
// ===========================================================================
//
//   edgePath       An S-curve from an output port to an input port, left to right.
//   usePath        A curve from a socket at the bottom down to the knob of a resource.
//   bendPath       Straight lines through bend points, corners slightly rounded.
//   nearestSegment The segment of a polyline closest to a point, for inserting a bend point.
//

export function edgePath(from, to) {
    const bend = Math.max(MIN_CURVE_PX, Math.abs(to.x - from.x) / 2)
    return `M ${from.x} ${from.y} C ${from.x + bend} ${from.y}, ${to.x - bend} ${to.y}, ${to.x} ${to.y}`
}

export function usePath(from, to) {
    const bend = Math.max(MIN_CURVE_PX, Math.abs(to.y - from.y) / 2)
    return `M ${from.x} ${from.y} C ${from.x} ${from.y + bend}, ${to.x} ${to.y - bend}, ${to.x} ${to.y}`
}

export function bendPath(points) {
    let path = `M ${points[0].x} ${points[0].y}`

    // Every corner: a straight line up to shortly before it, then a small curve around it.
    for (let index = 1; index < points.length - 1; index++) {
        const [previous, corner, next] = [points[index - 1], points[index], points[index + 1]]
        const lengthIn = Math.hypot(corner.x - previous.x, corner.y - previous.y)
        const lengthOut = Math.hypot(next.x - corner.x, next.y - corner.y)
        const radius = Math.min(CORNER_RADIUS_PX, lengthIn / 2, lengthOut / 2)
        if (radius === 0) continue

        const start = { x: corner.x - (corner.x - previous.x) / lengthIn * radius, y: corner.y - (corner.y - previous.y) / lengthIn * radius }
        const end = { x: corner.x + (next.x - corner.x) / lengthOut * radius, y: corner.y + (next.y - corner.y) / lengthOut * radius }
        path += ` L ${start.x} ${start.y} Q ${corner.x} ${corner.y}, ${end.x} ${end.y}`
    }

    const last = points.at(-1)
    return `${path} L ${last.x} ${last.y}`
}

export function nearestSegment(points, point) {
    let best = { index: 0, distance: Infinity }
    for (let index = 0; index < points.length - 1; index++) {
        const [a, b] = [points[index], points[index + 1]]
        const lengthSquared = (b.x - a.x) ** 2 + (b.y - a.y) ** 2
        const share = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / lengthSquared))
        const distance = Math.hypot(point.x - (a.x + share * (b.x - a.x)), point.y - (a.y + share * (b.y - a.y)))
        if (distance < best.distance) best = { index, distance }
    }
    return best.index
}
