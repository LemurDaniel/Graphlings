// NOTE:
//   The data model of the graph editor: plain JSON, no DOM, so it also runs in Node.
//   The editor draws from it, the generator reads it, the browser storage saves it.
//
//   import { createBlock, findBlock, insertBlock, removeBlock } from './engine.model.js'
//
//   A workspace:
//       {
//           version: 2,
//           plan:  <block>                        the graph plan: global pieces and state fields
//           nodes: [ <block with x, y>, ... ]     cards on the canvas
//           edges: [ { id, kind, from, port, to, points } ]   kind "flow" (then runs) or "use" (calls),
//                                                 points: optional bend points [{ x, y }] in canvas units
//       }
//   A block:
//       { id, type, fields: { NAME: 'chat' }, slots: { EXTRAS: [ <block>, ... ] } }
//   Nodes are blocks too: their fields and slots are the puzzle inside the card.

//
//   Chapters:
//     HELPERS          Ids and deep copies.
//     CREATE BLOCKS    New blocks with default values, cleaning of loaded workspaces.
//     WALK AND EDIT    Find, remove and insert blocks, nodes and edges.
//     HISTORY          Snapshots for undo and redo.
//

export const MODEL_VERSION = 2
const HISTORY_LIMIT = 100

// ===========================================================================
// ===============================   HELPERS   ===============================
// ===========================================================================
//
//   newId      A short random id, unique enough for one workspace.
//   cloneJson  A deep copy of plain JSON data.
//

export function newId() {
    return `b${Math.random().toString(36).slice(2, 10)}`
}

export function cloneJson(value) {
    return JSON.parse(JSON.stringify(value))
}

// ===========================================================================
// ============================   CREATE BLOCKS   ============================
// ===========================================================================
//
//   createBlock         A new block of a definition, every field on its default.
//   normalizeWorkspace  Fills missing fields and slots, drops unknown types and broken edges.
//

export function createBlock(definition, { x, y } = {}) {
    const block = { id: newId(), type: definition.type, fields: {}, slots: {} }
    for (const part of definition.parts ?? []) {
        if (part?.field) block.fields[part.field] = part.default
        if (part?.slot) block.slots[part.slot] = []
    }
    if (null != x) Object.assign(block, { x: Math.round(x), y: Math.round(y) })
    return block
}

export function normalizeWorkspace(workspace, definitions, planType) {
    const byType = new Map(definitions.map(definition => [definition.type, definition]))

    const normalizeBlock = block => {
        const definition = byType.get(block?.type)
        if (null == definition) return null

        const clean = createBlock(definition)
        clean.id = block.id ?? clean.id
        if (null != block.x) Object.assign(clean, { x: Number(block.x), y: Number(block.y) })

        // Known fields keep their value, unknown fields are dropped.
        for (const name of Object.keys(clean.fields)) {
            if (undefined !== block.fields?.[name]) clean.fields[name] = block.fields[name]
        }
        for (const name of Object.keys(clean.slots)) {
            clean.slots[name] = (block.slots?.[name] ?? []).map(normalizeBlock).filter(Boolean)
        }
        return clean
    }

    const isCurrent = workspace?.version === MODEL_VERSION
    const plan = (isCurrent ? normalizeBlock(workspace.plan) : null) ?? createBlock(byType.get(planType))
    const nodes = isCurrent ? (workspace.nodes ?? []).map(normalizeBlock).filter(Boolean) : []

    // Edges only between nodes that still exist.
    const nodeIds = new Set(nodes.map(node => node.id))
    const edges = isCurrent
        ? (workspace.edges ?? []).filter(edge => nodeIds.has(edge.from) && nodeIds.has(edge.to))
        : []

    return { version: MODEL_VERSION, plan, nodes, edges }
}

// ===========================================================================
// ============================   WALK AND EDIT   ============================
// ===========================================================================
//
//   walkBlocks     Calls a function for every block: plan, nodes and all slot contents.
//   allBlocks      Every block as a flat list.
//   findBlock      A block and the list it lives in.
//   findOwnerNode  The node a block belongs to: the node itself or the node holding the piece.
//   removeBlock    Takes a piece out of its slot, or a node with its edges off the canvas.
//   insertBlock    Puts a piece into a slot.
//   connect        Adds a flow edge or a use link, replacing the old one of the same port.
//
//   A place in the tree is { block, list, index, parent, slot }:
//   list is workspace.nodes for a node, parent.slots[slot] for a piece, null for the plan.
//

export function walkBlocks(workspace, visit) {
    const walk = (list, parent, slot) => {
        list.forEach((block, index) => {
            visit({ block, list, index, parent, slot })
            for (const [name, children] of Object.entries(block.slots ?? {})) walk(children, block, name)
        })
    }
    walk([workspace.plan], null, null)
    walk(workspace.nodes, null, null)
}

export function allBlocks(workspace) {
    const blocks = []
    walkBlocks(workspace, ({ block }) => blocks.push(block))
    return blocks
}

export function findBlock(workspace, id) {
    let found = null
    walkBlocks(workspace, place => {
        if (null == found && place.block.id === id) found = place
    })
    if (found?.block === workspace.plan) found.list = null
    return found
}

export function findOwnerNode(workspace, id) {
    const contains = block => block.id === id || Object.values(block.slots ?? {}).some(list => list.some(contains))
    return workspace.nodes.find(contains) ?? null
}

export function removeBlock(workspace, id) {
    const place = findBlock(workspace, id)
    if (null == place?.list) return null

    place.list.splice(place.index, 1)
    if (place.list === workspace.nodes) {
        workspace.edges = workspace.edges.filter(edge => edge.from !== id && edge.to !== id)
    }
    return place.block
}

export function insertBlock(workspace, block, { parentId, slot, index }) {
    const list = findBlock(workspace, parentId)?.block.slots?.[slot]
    if (null == list) throw new Error(`Slot '${slot}' of block '${parentId}' does not exist.`)
    list.splice(Math.min(index ?? list.length, list.length), 0, block)
}

export function connect(workspace, { from, port, to, kind = 'flow', multiple = false }) {
    if (from === to) return null

    // One way out per port, a new edge replaces the old one. A socket that takes several
    // links (e.g. tools) only drops the same link twice.
    workspace.edges = workspace.edges.filter(edge => !(edge.from === from && edge.port === port && (!multiple || edge.to === to)))
    const edge = { id: newId(), kind, from, port, to }
    workspace.edges.push(edge)
    return edge
}

// ===========================================================================
// ===============================   HISTORY   ===============================
// ===========================================================================
//
//   History   Undo and redo as a stack of workspace snapshots.
//
//   The editor records the state BEFORE every change. Undo swaps the current
//   state with the last record, redo swaps it back.
//

export class History {
    #undoStack = []
    #redoStack = []

    record(workspace) {
        this.#undoStack.push(typeof workspace === 'string' ? workspace : JSON.stringify(workspace))
        if (this.#undoStack.length > HISTORY_LIMIT) this.#undoStack.shift()
        this.#redoStack = []
    }

    undo(current) {
        if (this.#undoStack.length === 0) return null
        this.#redoStack.push(JSON.stringify(current))
        return JSON.parse(this.#undoStack.pop())
    }

    redo(current) {
        if (this.#redoStack.length === 0) return null
        this.#undoStack.push(JSON.stringify(current))
        return JSON.parse(this.#redoStack.pop())
    }

    clear() {
        this.#undoStack = []
        this.#redoStack = []
    }
}
