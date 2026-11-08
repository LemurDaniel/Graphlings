// NOTE:
//   The parts a block definition is made of: labels, fields, line breaks and slots.
//   Plain data, no DOM, so definitions also load in Node.
//
//   import { BREAK, checkbox, dropdown, number, slot, text } from './engine.parts.js'
//
//   parts: ['🤖 Knoten', text('NAME', 'chat'), BREAK, slot('NODES', 'Knoten', 'node')]
//   A string is a label. A field holds a value, a slot holds other blocks.

//
//   Chapters:
//     PARTS   One factory per kind of part.
//

// ===========================================================================
// ================================   PARTS   ================================
// ===========================================================================
//
//   BREAK      Ends the current row, the next part starts a new one.
//   text       A text field, 'wide' for long texts like prompts.
//   number     A number field with limits.
//   dropdown   A choice, options as a list or a function of the workspace.
//   checkbox   Yes or no.
//   slot       A place for other blocks, 'accepts' names the kind of block that fits.
//

export const BREAK = { break: true }

export function text(field, defaultValue, { wide = false } = {}) {
    return { field, kind: 'text', default: defaultValue, wide }
}

export function number(field, defaultValue, { min = -Infinity, max = Infinity, step = 1 } = {}) {
    return { field, kind: 'number', default: defaultValue, min, max, step }
}

// options: [[label, value], ...] or ({ workspace, block, value }) => [[label, value], ...]
export function dropdown(field, defaultValue, options) {
    return { field, kind: 'dropdown', default: defaultValue, options }
}

export function checkbox(field, defaultValue) {
    return { field, kind: 'checkbox', default: defaultValue }
}

export function slot(name, label, accepts) {
    return { slot: name, label, accepts }
}
