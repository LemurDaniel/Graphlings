// NOTE:
//   Draws blocks as HTML: rows of labels and fields, slots with their child blocks.
//   Only drawing, no events. The editor listens on the canvas for everything.
//
//   import { renderBlock } from './engine.render.js'
//   canvas.append(renderBlock(block, { definitions, workspace }))

//
//   Chapters:
//     HELPERS        Elements and dropdown options.
//     RENDER BLOCK   One block with its rows, fields and slots, recursively.
//

const MIN_TEXT_SIZE = 3
const MAX_TEXT_SIZE = 18

// ===========================================================================
// ===============================   HELPERS   ===============================
// ===========================================================================
//
//   element          A new element with classes, attributes and children.
//   resolveOptions   The options of a dropdown, with a warning entry for unknown values.
//   fillSelect       Puts options into a select and selects the value.
//   fitTextInput     Grows a text input with its content, within limits.
//

export function element(tag, { className, attributes = {}, text } = {}, children = []) {
    const node = document.createElement(tag)
    if (null != className) node.className = className
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value)
    if (null != text) node.textContent = text
    node.append(...children)
    return node
}

export function resolveOptions(part, { workspace, block }) {
    const value = block.fields[part.field]
    const options = typeof part.options === 'function'
        ? part.options({ workspace, block, value })
        : [...part.options]

    // A value that is no option any more (deleted node) stays visible as a warning.
    const isKnown = options.some(([, optionValue]) => optionValue === value)
    if (null != value && value !== '' && !isKnown) options.push(['⚠️ fehlt', value])
    if (options.length === 0) options.push(['(leer)', ''])
    return options
}

export function fillSelect(select, options, value) {
    select.replaceChildren(...options.map(([label, optionValue]) => {
        const option = element('option', { text: label })
        option.value = optionValue
        return option
    }))
    select.value = value ?? ''
}

export function fitTextInput(input) {
    input.size = Math.min(MAX_TEXT_SIZE, Math.max(MIN_TEXT_SIZE, input.value.length + 1))
}

// ===========================================================================
// ============================   RENDER BLOCK   =============================
// ===========================================================================
//
//   renderField   One input element for a field part.
//   renderSlot    A slot with its label and child blocks.
//   renderBlock   A whole block, its children included.
//
//   Data attributes connect the DOM back to the model:
//       .gl-block      data-block-id, data-type, data-fits
//       .gl-input      data-block-id, data-field
//       .gl-slot-body  data-parent-id, data-slot, data-accepts
//

function renderField(part, block, context) {
    const value = block.fields[part.field]
    const attributes = { 'data-block-id': block.id, 'data-field': part.field }

    if (part.kind === 'checkbox') {
        const input = element('input', { className: 'gl-input gl-input-checkbox', attributes: { ...attributes, type: 'checkbox' } })
        input.checked = Boolean(value)
        return input
    }
    if (part.kind === 'dropdown') {
        const select = element('select', { className: 'gl-input gl-input-select', attributes })
        fillSelect(select, resolveOptions(part, { workspace: context.workspace, block }), value)
        return select
    }
    if (part.kind === 'number') {
        const input = element('input', {
            className: 'gl-input gl-input-number',
            attributes: { ...attributes, type: 'number', min: part.min, max: part.max, step: part.step },
        })
        input.value = value
        return input
    }

    // Text: long texts get a wide field with a tooltip showing everything.
    const input = element('input', {
        className: part.wide ? 'gl-input gl-input-text gl-input-wide' : 'gl-input gl-input-text',
        attributes: { ...attributes, type: 'text', spellcheck: 'false' },
    })
    input.value = value ?? ''
    if (part.wide) input.title = input.value
    else fitTextInput(input)
    return input
}

function renderSlot(part, block, context) {
    const body = element('div', {
        className: 'gl-slot-body',
        attributes: { 'data-parent-id': block.id, 'data-slot': part.slot, 'data-accepts': part.accepts },
    })
    const children = block.slots[part.slot] ?? []
    body.append(...children.map(child => renderBlock(child, context)))
    if (children.length === 0) body.append(element('div', { className: 'gl-slot-empty', text: 'hier einstecken' }))

    return element('div', { className: 'gl-slot' }, [
        element('div', { className: 'gl-slot-label', text: part.label }),
        body,
    ])
}

export function renderBlock(block, context) {
    const definition = context.definitions.get(block.type)
    const node = element('div', {
        className: 'gl-block',
        attributes: { 'data-block-id': block.id, 'data-type': block.type },
    })
    node.style.setProperty('--block-colour', definition.colour)
    if (null != definition.fits) node.dataset.fits = definition.fits

    let row = null
    const getRow = () => {
        row ??= node.appendChild(element('div', { className: 'gl-row' }))
        return row
    }

    for (const part of definition.parts) {
        if (typeof part === 'string') {
            getRow().append(element('span', { className: 'gl-label', text: part }))
        } else if (part.break) {
            row = null
        } else if (null != part.slot) {
            node.append(renderSlot(part, block, context))
            row = null
        } else {
            getRow().append(renderField(part, block, context))
        }
    }

    if (context.isPreview) node.querySelectorAll('.gl-input').forEach(input => input.tabIndex = -1)
    return node
}
