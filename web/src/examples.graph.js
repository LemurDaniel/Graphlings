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
//   5. List            All examples for the example menu.
//

// ---------------------------------------------------------------------------
// Chat
//   The chat of chat.py (Homelabs-KI): agent, switch, summarizer, memory.
// ---------------------------------------------------------------------------

//   START -> chat -> zu_lang --ja--> summarize -> END
//                            \--nein---------------> END
export const EXAMPLE_CHAT = {
    version: MODEL_VERSION,
    plan: { ...plan('chat'), slots: { SETUP: [piece('settings', TYPES.settings)] } },
    nodes: [
        card('node-start', TYPES.start, 30, 150),
        card('node-chat', TYPES.agent, 230, 110, {
            NAME: 'chat',
            PROMPT: 'Du bist ein hilfreicher Assistent. Antworte auf Deutsch, klar und präzise.',
            SHOW: true,
            USE_SUMMARY: true,
        }),
        card('node-router', TYPES.router, 520, 100, { NAME: 'zu_lang' }, {
            CONDITION: [piece('condition-length', TYPES.conditionLength, { MAX: 20 })],
        }),
        card('node-summarize', TYPES.summarize, 800, 20, {
            NAME: 'summarize',
            KEEP_LAST: 6,
            PROMPT: 'Fasse das bisherige Gespräch knapp auf Deutsch zusammen. '
                + 'Behalte Fakten über den Nutzer, getroffene Entscheidungen '
                + 'und offene Fragen. Antworte nur mit der Zusammenfassung.',
        }),
        card('node-end', TYPES.end, 860, 280),
        qwen(620, 470),
        notepad(-20, 470, ['summary']),
        card('memory', TYPES.memory, 250, 470),
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
        use('use-chat-memory', 'node-chat', 'memory', 'memory'),
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
        card('node-start', TYPES.start, 30, 170),
        card('node-switch', TYPES.router, 230, 140, { NAME: 'absicht' }, {
            CONDITION: [piece('condition-model', TYPES.conditionModel, {}, {
                OPTIONS: [
                    piece('way-technik', TYPES.routeOption, { NAME: 'technik', HINT: 'Fragen zu Technik, Computern und Programmieren' }),
                    piece('way-alltag', TYPES.routeOption, { NAME: 'alltag', HINT: 'alles andere: Alltag, Gefühle, Smalltalk' }),
                ],
            })],
        }),
        card('node-tech', TYPES.agent, 560, 40, {
            NAME: 'techniker',
            PROMPT: 'Du bist ein geduldiger Technik-Experte. Erkläre Schritt für Schritt auf Deutsch, mit einem kleinen Beispiel.',
            SHOW: true,
        }),
        card('node-talk', TYPES.agent, 560, 280, {
            NAME: 'plauderer',
            PROMPT: 'Du bist ein freundlicher Gesprächspartner. Antworte locker, kurz und herzlich auf Deutsch.',
            SHOW: true,
        }),
        card('node-end', TYPES.end, 880, 180),
        qwen(380, 500, 0.3),
        notepad(-20, 470),
        card('memory', TYPES.memory, 760, 500),
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
        use('use-tech-memory', 'node-tech', 'memory', 'memory'),
        use('use-talk-memory', 'node-talk', 'memory', 'memory'),
        use('use-start-state', 'node-start', 'state', 'state'),
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
        card('node-start', TYPES.start, 30, 160),
        card('node-helper', TYPES.agent, 240, 120, {
            NAME: 'helfer',
            PROMPT: 'You are a helpful assistant with tools. Rules: '
                + 'Question about time, date or weekday: call clock. '
                + 'Any calculation: call calculator, never calculate yourself. '
                + 'Rolling a dice: call dice. '
                + 'Only when the tool result is there, answer briefly in German.',
            SHOW: true,
        }),
        card('node-switch', TYPES.router, 540, 120, { NAME: 'will_werkzeug' }, {
            CONDITION: [piece('condition-tools', TYPES.conditionTools)],
        }),
        card('node-end', TYPES.end, 1080, 170),
        card('node-workshop', TYPES.workshop, 820, 330, { NAME: 'werkstatt' }),
        card('tool-calculator', TYPES.tool, 640, 540, { TOOL: 'calculator' }),
        card('tool-clock', TYPES.tool, 830, 540, { TOOL: 'clock' }),
        card('tool-dice', TYPES.tool, 1020, 540, { TOOL: 'dice' }),
        qwen(260, 400, 0.2),
        notepad(-60, 400),
        card('memory', TYPES.memory, 40, 540),
    ],
    edges: [
        flow('edge-start', 'node-start', 'out', 'node-helper'),
        flow('edge-helper', 'node-helper', 'out', 'node-switch'),
        flow('edge-yes', 'node-switch', 'then', 'node-workshop'),
        flow('edge-no', 'node-switch', 'else', 'node-end'),
        { ...flow('edge-back', 'node-workshop', 'out', 'node-helper'), points: [{ x: 1060, y: 370 }, { x: 1060, y: 60 }, { x: 200, y: 60 }, { x: 200, y: 170 }] },
        use('use-helper-model', 'node-helper', 'model', 'model-qwen'),
        use('use-helper-memory', 'node-helper', 'memory', 'memory'),
        use('use-helper-workshop', 'node-helper', 'workshop', 'node-workshop'),
        use('use-tool-calculator', 'node-workshop', 'tools', 'tool-calculator'),
        use('use-tool-clock', 'node-workshop', 'tools', 'tool-clock'),
        use('use-tool-dice', 'node-workshop', 'tools', 'tool-dice'),
        use('use-start-state', 'node-start', 'state', 'state'),
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
        card('node-start', TYPES.start, 30, 170),
        card('node-writer', TYPES.agent, 220, 130, {
            NAME: 'schreiber',
            PROMPT: 'Du bist ein Autor. Schreibe zur Aufgabe einen sehr kurzen Text auf Deutsch, höchstens vier Zeilen. '
                + 'Kommt danach Kritik, schreibe den ganzen Text verbessert neu.',
            SHOW: true,
        }),
        card('node-critic', TYPES.agent, 500, 130, {
            NAME: 'kritiker',
            PROMPT: 'Du bist ein strenger, aber fairer Lektor. Prüfe den letzten Text. '
                + 'Ist er gut, antworte nur mit OK. Sonst nenne in einem Satz, was besser werden muss.',
            SHOW: true,
        }),
        card('node-switch', TYPES.router, 780, 130, { NAME: 'gut_genug' }, {
            CONDITION: [piece('condition-ok', TYPES.conditionContains, { WORD: 'OK' })],
        }),
        card('node-end', TYPES.end, 1060, 170),
        qwen(260, 470, 0.7),
        card('model-critic', TYPES.model, 520, 470, { NAME: 'streng', MODE: 'builtin', TEMPERATURE: 0.2 }),
        notepad(-20, 470),
    ],
    edges: [
        flow('edge-start', 'node-start', 'out', 'node-writer'),
        flow('edge-write', 'node-writer', 'out', 'node-critic'),
        flow('edge-check', 'node-critic', 'out', 'node-switch'),
        flow('edge-ok', 'node-switch', 'then', 'node-end'),
        { ...flow('edge-again', 'node-switch', 'else', 'node-writer'), points: [{ x: 1000, y: 60 }, { x: 160, y: 60 }, { x: 160, y: 190 }] },
        use('use-writer-model', 'node-writer', 'model', 'model-qwen'),
        use('use-critic-model', 'node-critic', 'model', 'model-critic'),
        use('use-start-state', 'node-start', 'state', 'state'),
    ],
}

// ---------------------------------------------------------------------------
// List
//   All examples for the example menu.
// ---------------------------------------------------------------------------

export const EXAMPLES = [
    { id: 'chat', label: '💬 Chat mit Zusammenfassung', workspace: EXAMPLE_CHAT },
    { id: 'switch', label: '🔀 Schlaue Weiche + Spezialisten', workspace: EXAMPLE_SWITCH },
    { id: 'tools', label: '🔧 Werkzeug-Agent', workspace: EXAMPLE_TOOLS },
    { id: 'reflection', label: '🔁 Reflexion (Aufgabe)', workspace: EXAMPLE_REFLECTION },
]
