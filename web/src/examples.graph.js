// NOTE:
//   The starter graphs, one per pattern, in the workspace format of engine.model.js.
//
//   import { EXAMPLES } from './examples.graph.js'
//   editor.load(EXAMPLES[0].workspace)

//
//   Chapters:
//     HELPERS       Small builders for cards, pieces and lines.
//     EXAMPLES      Chat, smart switch, tool agent, reflection.
//

import { PLAN_TYPE, TYPES } from './blocks.graph.js'
import { t } from './i18n.js'
import { MODEL_VERSION } from './engine/engine.model.js'

// ===========================================================================
// ===============================   HELPERS   ===============================
// ===========================================================================
//
//   piece      A block without position: a piece in a slot.
//   card       A block on the canvas.
//   flow, use  The two kinds of lines.
//   plan       The plan with mode and step limit.
//   notepad    The notepad card with the given fields.
//   qwen       The built-in model with a temperature.
//

const piece = (id, type, fields = {}, slots = {}) => ({ id, type, fields, slots })
const card = (id, type, x, y, fields = {}, slots = {}) => ({ ...piece(id, type, fields, slots), x, y })
const flow = (id, from, port, to) => ({ id, kind: 'flow', from, port, to })
const use = (id, from, port, to) => ({ id, kind: 'use', from, port, to })

const plan = (mode, maxSteps = 25) => piece('plan', PLAN_TYPE, { RUN_MODE: mode, MAX_STEPS: maxSteps }, { SETUP: [] })
const notepad = (x, y, fieldNames = []) => card('state', TYPES.state, x, y, {}, {
    FIELDS: fieldNames.map(name => piece(`field-${name}`, TYPES.stateField, { NAME: name, TYPE: 'str' })),
})
const qwen = (x, y, temperature = 0.7) => card('model-qwen', TYPES.model, x, y, { NAME: 'qwen', MODE: 'builtin', TEMPERATURE: temperature })

// ===========================================================================
// ===============================   EXAMPLES   ==============================
// ===========================================================================
//
//   1. Chat            The chat of chat.py (Homelabs-KI): agent, switch, summarizer, memory.
//   2. Smart switch    The model reads the question and picks a specialist.
//   3. Tool agent      The agent loop: model, tool call, workshop, back to the model.
//   4. Reflection      A writer and a critic loop until the critic says OK, as a task.
//   5. Helpers         A boss delegates to helper agents in the workshop: agents as tools.
//   6. List            All examples for the example menu.
//

// ---------------------------------------------------------------------------
// Chat
//   The chat of chat.py (Homelabs-KI): agent, switch, summarizer, memory.
// ---------------------------------------------------------------------------

//   START -> chat -> zu_lang --ja--> summarize -> END
//                            \--nein---------------> END
//
//   The summarizer sits above the line, so the 'nein' way runs straight to END.
export const EXAMPLE_CHAT = {
    version: MODEL_VERSION,
    plan: { ...plan('chat'), slots: { SETUP: [piece('settings', TYPES.settings)] } },
    nodes: [
        card('node-start', TYPES.start, 10, 108),
        card('node-chat', TYPES.agent, 330, 60, {
            NAME: t('example.chat.agent.name'),
            PROMPT: t('card.agent.prompt.default'),
            SHOW: true,
            USE_SUMMARY: true,
        }),
        card('node-router', TYPES.router, 600, 52, { NAME: t('example.chat.router.name') }, {
            CONDITION: [piece('condition-length', TYPES.conditionLength, { MAX: 20 })],
        }),
        card('node-summarize', TYPES.summarize, 850, -80, {
            NAME: t('example.chat.summarize.name'),
            KEEP_LAST: 6,
            PROMPT: t('example.chat.summarize.prompt'),
        }),
        card('node-end', TYPES.end, 1120, 115),
        qwen(800, 320),
        notepad(50, 320, ['summary']),
        card('memory', TYPES.memory, 150, 440),
    ],
    edges: [
        flow('edge-start', 'node-start', 'out', 'node-chat'),
        flow('edge-chat', 'node-chat', 'out', 'node-router'),
        flow('edge-yes', 'node-router', 'then', 'node-summarize'),
        flow('edge-no', 'node-router', 'else', 'node-end'),
        flow('edge-summarize', 'node-summarize', 'out', 'node-end'),
        use('use-chat-model', 'node-chat', 'model', 'model-qwen'),
        use('use-summarize-model', 'node-summarize', 'model', 'model-qwen'),
        use('use-start-state', 'node-start', 'state', 'state'),
        use('use-start-memory', 'node-start', 'memory', 'memory'),
    ],
}

// ---------------------------------------------------------------------------
// Smart switch
//   The model reads the question and picks a specialist.
// ---------------------------------------------------------------------------

//   START -> absicht --technik--> techniker -> END
//                    \--alltag--> plauderer -> END
const EXAMPLE_SWITCH = {
    version: MODEL_VERSION,
    plan: plan('chat'),
    nodes: [
        card('node-start', TYPES.start, 10, 108),
        card('node-switch', TYPES.router, 330, 52, { NAME: t('example.switch.router.name') }, {
            CONDITION: [piece('condition-model', TYPES.conditionModel, {}, {
                OPTIONS: [
                    piece('way-technik', TYPES.routeOption, { NAME: t('example.switch.way.tech.name'), HINT: t('example.switch.way.tech.hint') }),
                    piece('way-alltag', TYPES.routeOption, { NAME: t('example.switch.way.talk.name'), HINT: t('example.switch.way.talk.hint') }),
                ],
            })],
        }),
        card('node-tech', TYPES.agent, 600, -60, {
            NAME: t('example.switch.tech.name'),
            PROMPT: t('example.switch.tech.prompt'),
            SHOW: true,
        }),
        card('node-talk', TYPES.agent, 600, 180, {
            NAME: t('example.switch.talk.name'),
            PROMPT: t('example.switch.talk.prompt'),
            SHOW: true,
        }),
        card('node-end', TYPES.end, 880, 115),
        qwen(340, 380, 0.3),
        notepad(50, 320),
        card('memory', TYPES.memory, 150, 440),
    ],
    edges: [
        flow('edge-start', 'node-start', 'out', 'node-switch'),
        flow('edge-tech', 'node-switch', 'way-technik', 'node-tech'),
        flow('edge-talk', 'node-switch', 'way-alltag', 'node-talk'),
        flow('edge-tech-end', 'node-tech', 'out', 'node-end'),
        flow('edge-talk-end', 'node-talk', 'out', 'node-end'),
        use('use-switch-model', 'node-switch', 'model', 'model-qwen'),
        use('use-tech-model', 'node-tech', 'model', 'model-qwen'),
        use('use-talk-model', 'node-talk', 'model', 'model-qwen'),
        use('use-start-state', 'node-start', 'state', 'state'),
        use('use-start-memory', 'node-start', 'memory', 'memory'),
    ],
}

// ---------------------------------------------------------------------------
// Tool agent
//   The agent loop: model, tool call, workshop, back to the model.
// ---------------------------------------------------------------------------

//   START -> helfer -> will_werkzeug --ja--> werkstatt -> helfer (loop)
//                                    \--nein--> END
//
//   The tools hang at the workshop, the agent plugs into it (like MCP).
//   The prompt is English with clear rules: the small model then calls its tools
//   reliably (measured 15 of 15 instead of 9 of 15 with a German prompt).
const EXAMPLE_TOOLS = {
    version: MODEL_VERSION,
    plan: plan('chat', 12),
    nodes: [
        card('node-start', TYPES.start, 10, 108),
        card('node-helper', TYPES.agent, 330, 60, {
            NAME: t('example.tools.agent.name'),
            PROMPT: t('example.tools.agent.prompt'),
            SHOW: true,
        }),
        card('node-switch', TYPES.router, 600, 52, { NAME: t('example.tools.router.name') }, {
            CONDITION: [piece('condition-tools', TYPES.conditionTools)],
        }),
        card('node-end', TYPES.end, 1100, 115),
        card('node-workshop', TYPES.workshop, 600, 320, { NAME: t('example.tools.workshop.name') }),
        card('tool-calculator', TYPES.tool, 420, 540, { TOOL: 'calculator' }),
        card('tool-clock', TYPES.tool, 600, 540, { TOOL: 'clock' }),
        card('tool-dice', TYPES.tool, 780, 540, { TOOL: 'dice' }),
        qwen(340, 320, 0.2),
        notepad(50, 320),
        card('memory', TYPES.memory, 100, 440),
    ],
    edges: [
        flow('edge-start', 'node-start', 'out', 'node-helper'),
        flow('edge-helper', 'node-helper', 'out', 'node-switch'),
        { ...flow('edge-yes', 'node-switch', 'then', 'node-workshop'), points: [{ x: 810, y: 147 }, { x: 810, y: 280 }, { x: 560, y: 280 }, { x: 560, y: 391 }] },
        flow('edge-no', 'node-switch', 'else', 'node-end'),
        { ...flow('edge-back', 'node-workshop', 'out', 'node-helper'), points: [{ x: 800, y: 391 }, { x: 800, y: 490 }, { x: 300, y: 490 }, { x: 300, y: 142 }] },
        use('use-helper-model', 'node-helper', 'model', 'model-qwen'),
        use('use-helper-workshop', 'node-helper', 'workshop', 'node-workshop'),
        use('use-tool-calculator', 'node-workshop', 'tools', 'tool-calculator'),
        use('use-tool-clock', 'node-workshop', 'tools', 'tool-clock'),
        use('use-tool-dice', 'node-workshop', 'tools', 'tool-dice'),
        use('use-start-state', 'node-start', 'state', 'state'),
        use('use-start-memory', 'node-start', 'memory', 'memory'),
    ],
}

// ---------------------------------------------------------------------------
// Reflection
//   A writer and a critic loop until the critic says OK, as a task.
// ---------------------------------------------------------------------------

//   START -> schreiber -> kritiker -> gut_genug --ja--> END
//                ^                             \--nein--> schreiber (loop)
const EXAMPLE_REFLECTION = {
    version: MODEL_VERSION,
    plan: plan('task', 8),
    nodes: [
        card('node-start', TYPES.start, 10, 108),
        card('node-writer', TYPES.agent, 330, 60, {
            NAME: t('example.reflection.writer.name'),
            PROMPT: t('example.reflection.writer.prompt'),
            SHOW: true,
        }),
        card('node-critic', TYPES.agent, 600, 60, {
            NAME: t('example.reflection.critic.name'),
            PROMPT: t('example.reflection.critic.prompt'),
            SHOW: true,
        }),
        card('node-switch', TYPES.router, 870, 52, { NAME: t('example.reflection.router.name') }, {
            CONDITION: [piece('condition-ok', TYPES.conditionContains, { WORD: 'OK' })],
        }),
        card('node-end', TYPES.end, 1120, 115),
        qwen(330, 320, 0.7),
        card('model-critic', TYPES.model, 600, 320, { NAME: t('example.reflection.critic.model'), MODE: 'builtin', TEMPERATURE: 0.2 }),
        notepad(50, 320),
    ],
    edges: [
        flow('edge-start', 'node-start', 'out', 'node-writer'),
        flow('edge-write', 'node-writer', 'out', 'node-critic'),
        flow('edge-check', 'node-critic', 'out', 'node-switch'),
        flow('edge-ok', 'node-switch', 'then', 'node-end'),
        { ...flow('edge-again', 'node-switch', 'else', 'node-writer'), points: [{ x: 1080, y: 177 }, { x: 1080, y: 275 }, { x: 300, y: 275 }, { x: 300, y: 142 }] },
        use('use-writer-model', 'node-writer', 'model', 'model-qwen'),
        use('use-critic-model', 'node-critic', 'model', 'model-critic'),
        use('use-start-state', 'node-start', 'state', 'state'),
    ],
}

// ---------------------------------------------------------------------------
// Helpers
//   A boss delegates to helper agents in the workshop: agents as tools.
// ---------------------------------------------------------------------------

//   START -> chef -> will_hilfe --ja--> team -> chef (loop)
//                              \--nein--> END
//
//   The helper agents hang in the workshop like tools. Each works on its own notepad:
//   it gets only the task and returns only its answer. Each has its own model too:
//   the poet a creative one (hot), the translator a precise one (cold), the boss keeps qwen.
const EXAMPLE_HELPERS = {
    version: MODEL_VERSION,
    plan: plan('chat', 12),
    nodes: [
        card('node-start', TYPES.start, 10, 108),
        card('node-boss', TYPES.agent, 330, 60, {
            NAME: t('example.helpers.boss.name'),
            PROMPT: t('example.helpers.boss.prompt'),
            SHOW: true,
        }),
        card('node-switch', TYPES.router, 600, 52, { NAME: t('example.helpers.router.name') }, {
            CONDITION: [piece('condition-tools', TYPES.conditionTools)],
        }),
        card('node-end', TYPES.end, 1100, 115),
        card('node-workshop', TYPES.workshop, 600, 320, { NAME: t('example.helpers.workshop.name') }),
        card('helper-poet', TYPES.helper, 360, 580, {
            NAME: t('example.helpers.poet.name'),
            PROMPT: t('card.helper.prompt.default'),
            HINT: t('example.helpers.poet.hint'),
            SHOW: true,
        }),
        card('helper-translator', TYPES.helper, 640, 580, {
            NAME: t('example.helpers.translator.name'),
            PROMPT: t('example.helpers.translator.prompt'),
            HINT: t('example.helpers.translator.hint'),
            SHOW: true,
        }),
        qwen(340, 320, 0.2),
        card('model-poet', TYPES.model, 350, 790, { NAME: t('example.helpers.poet.model'), MODE: 'builtin', TEMPERATURE: 0.9 }),
        card('model-translator', TYPES.model, 630, 790, { NAME: t('example.helpers.translator.model'), MODE: 'builtin', TEMPERATURE: 0.1 }),
        notepad(50, 320),
        card('memory', TYPES.memory, 100, 440),
    ],
    edges: [
        flow('edge-start', 'node-start', 'out', 'node-boss'),
        flow('edge-boss', 'node-boss', 'out', 'node-switch'),
        { ...flow('edge-yes', 'node-switch', 'then', 'node-workshop'), points: [{ x: 810, y: 147 }, { x: 810, y: 280 }, { x: 560, y: 280 }, { x: 560, y: 391 }] },
        flow('edge-no', 'node-switch', 'else', 'node-end'),
        { ...flow('edge-back', 'node-workshop', 'out', 'node-boss'), points: [{ x: 800, y: 391 }, { x: 800, y: 490 }, { x: 300, y: 490 }, { x: 300, y: 142 }] },
        use('use-boss-model', 'node-boss', 'model', 'model-qwen'),
        use('use-boss-workshop', 'node-boss', 'workshop', 'node-workshop'),
        use('use-team-poet', 'node-workshop', 'tools', 'helper-poet'),
        use('use-team-translator', 'node-workshop', 'tools', 'helper-translator'),
        use('use-poet-model', 'helper-poet', 'model', 'model-poet'),
        use('use-translator-model', 'helper-translator', 'model', 'model-translator'),
        use('use-start-state', 'node-start', 'state', 'state'),
        use('use-start-memory', 'node-start', 'memory', 'memory'),
    ],
}

// ---------------------------------------------------------------------------
// List
//   All examples for the example menu.
// ---------------------------------------------------------------------------

export const EXAMPLES = [
    { id: 'chat', label: t('example.chat.label'), workspace: EXAMPLE_CHAT },
    { id: 'switch', label: t('example.switch.label'), workspace: EXAMPLE_SWITCH },
    { id: 'tools', label: t('example.tools.label'), workspace: EXAMPLE_TOOLS },
    { id: 'reflection', label: t('example.reflection.label'), workspace: EXAMPLE_REFLECTION },
    { id: 'helpers', label: t('example.helpers.label'), workspace: EXAMPLE_HELPERS },
]
