// NOTE:
//   The cards and puzzle pieces of Graphlings: shape, colour and explanation of each.
//   Plain data for the graph editor, no DOM, so the generator test runs in Node.
//   Every visible text comes from texts.js through t(), in the language picked at load.
//
//   import { DEFINITIONS, PALETTE, PLAN_TYPE } from './blocks.graph.js'
//   new GraphEditor({ root, definitions: DEFINITIONS, palette: PALETTE, planType: PLAN_TYPE })
//
//   Two kinds of lines connect the cards:
//       flow   nose -> notch    "then runs ..."   becomes an entry in EDGES
//       use    socket -> knob   "calls / uses ..." becomes an argument, e.g. ask_model(QWEN_MODEL, ...)

//
//   Chapters:
//     HELPERS            Type names, lookups of pieces, links and switch branches.
//     DEFINE CARDS       The steps of the graph: START, END, agent, summarizer, workshop, switch.
//     DEFINE RESOURCES   The cards that steps use: model, notepad, memory, tools, helper agents.
//     DEFINE PIECES      The plan of the graph and the puzzle pieces that go into slots.
//     MIGRATE            Brings older saved graphs up to date.
//     DESCRIBE           Plain words for every card, piece and line, for beginners.
//     PALETTE            The sections of the palette.
//

import { BREAK, checkbox, dropdown, number, slot, text } from './engine/engine.parts.js'
import { t } from './i18n.js'
import { MONSTERS } from './monsters.graph.js'

export const PLAN_TYPE = 'graphlings_plan'

export const TYPES = {
    start: 'graphlings_start',
    end: 'graphlings_end',
    agent: 'graphlings_node_llm',
    summarize: 'graphlings_node_summarize',
    workshop: 'graphlings_node_tools',
    router: 'graphlings_router',
    model: 'graphlings_model',
    state: 'graphlings_state',
    memory: 'graphlings_memory',
    tool: 'graphlings_tool',
    helper: 'graphlings_helper',
    conditionLength: 'graphlings_condition_length',
    conditionContains: 'graphlings_condition_contains',
    conditionTools: 'graphlings_condition_tools',
    conditionModel: 'graphlings_condition_model',
    routeOption: 'graphlings_route_option',
    settings: 'graphlings_settings',
    stateField: 'graphlings_state_field',
}

// The tools a tool card can be: the generator writes one Python function per kind,
// the card shows 'skill' as a plain-words chip.
export const TOOL_KINDS = {
    calculator: { label: t('tool.calculator.label'), name: 'calculator', skill: t('tool.calculator.skill') },
    clock: { label: t('tool.clock.label'), name: 'clock', skill: t('tool.clock.skill') },
    dice: { label: t('tool.dice.label'), name: 'dice', skill: t('tool.dice.skill') },
}

const COLOURS = {
    start: '#2fbf71',
    end: '#e0566f',
    agent: '#58c25a',
    summarize: '#3fb8af',
    workshop: '#e8a33d',
    router: '#ff6f91',
    model: '#a36bf0',
    state: '#ff9f2e',
    memory: '#c86ad1',
    tool: '#d9893a',
    helper: '#8fbc5a',
    condition: '#ff8fab',
    setup: '#5b8def',
    plan: '#4c5fd5',
}

// ===========================================================================
// ===============================   HELPERS   ===============================
// ===========================================================================
//
//   pieceOf          The first piece of a type in a slot of a block.
//   linkedCard       The card a socket of a card is linked to.
//   linkedCards      All cards a socket is linked to, for sockets that take several.
//   startMemory      The memory card at START, null when the graph forgets after every round.
//   routerBranches   The ways out of a switch: ja/nein, or one per way of the model decision.
//   getExplanation   The explain text of a type.
//

export function pieceOf(block, slotName, type) {
    return (block?.slots?.[slotName] ?? []).find(piece => piece.type === type) ?? null
}

export function linkedCard(workspace, block, port) {
    return linkedCards(workspace, block, port)[0] ?? null
}

export function linkedCards(workspace, block, port) {
    return workspace.edges
        .filter(edge => edge.kind === 'use' && edge.from === block?.id && edge.port === port)
        .map(edge => workspace.nodes.find(node => node.id === edge.to))
        .filter(Boolean)
}

export function startMemory(workspace) {
    const start = workspace.nodes.find(node => node.type === TYPES.start) ?? null
    return linkedCard(workspace, start, 'memory')
}

export function routerBranches(block) {
    const condition = (block?.slots?.CONDITION ?? [])[0] ?? null
    if (condition?.type === TYPES.conditionModel) {
        return (condition.slots.OPTIONS ?? []).map(option => ({ port: option.id, label: option.fields.NAME || '…', option }))
    }
    return [{ port: 'then', label: t('card.router.branch.yes') }, { port: 'else', label: t('card.router.branch.no') }]
}

export function getExplanation(type) {
    return DEFINITIONS.find(definition => definition.type === type)?.explain ?? ''
}

// A chip for a socket: the name of the linked card, or what is missing.
function linkChip(workspace, block, port, icon) {
    const card = linkedCard(workspace, block, port)
    return null == card ? `${icon} ${t('card.chip.missing')}` : `${icon} ${card.fields.NAME ?? ''}`.trim()
}

// ===========================================================================
// ============================   DEFINE CARDS   =============================
// ===========================================================================
//
//   1. Entry and exit   START and END.
//   2. Graphlings       Agent, summarizer and workshop, the nodes that do the work.
//   3. Switch           The card that decides where to go next.
//
//   A card has 'node': what the card on the canvas shows (see engine.cards.js).
//   'uses' are sockets at the bottom, linked to resource cards.
//   Its 'parts' are the puzzle inside, shown in the inspector.
//   'explain' says how the code does it, for the code view.
//

export const DEFINITIONS = []

// ---------------------------------------------------------------------------
// Entry and exit
//   START and END.
// ---------------------------------------------------------------------------

DEFINITIONS.push({
    type: TYPES.start,
    colour: COLOURS.start,
    parts: [t('card.start.parts')],
    node: {
        shape: 'rocket',
        emoji: '🟢',
        kind: t('card.start.kind'),
        title: () => 'START',
        hasInput: false,
        outputs: () => [{ port: 'out' }],
        // Every run starts with the notepad: START hands it to the first graphling.
        // With a memory, START takes the notepad of the last round instead of a fresh one.
        uses: [
            { port: 'state', label: t('card.use.state'), accepts: 'state' },
            { port: 'memory', label: t('card.use.memory'), accepts: 'memory' },
        ],
    },
    explain: t('card.start.explain'),
})

DEFINITIONS.push({
    type: TYPES.end,
    colour: COLOURS.end,
    parts: [t('card.end.parts')],
    node: {
        shape: 'flag',
        emoji: '🏁',
        kind: t('card.end.kind'),
        title: () => 'END',
        hasInput: true,
        outputs: () => [],
        // Where the notepad goes after the round: result of a task, into the memory, or into the bin.
        chips: ({ workspace }) => {
            if (workspace.plan?.fields?.RUN_MODE === 'task') return [t('card.end.chip.task')]
            return [null != startMemory(workspace) ? t('card.end.chip.memory') : t('card.end.chip.bin')]
        },
    },
    explain: t('card.end.explain'),
})

// ---------------------------------------------------------------------------
// Graphlings
//   Agent, summarizer and workshop, the nodes that do the work.
// ---------------------------------------------------------------------------

DEFINITIONS.push({
    type: TYPES.agent,
    colour: COLOURS.agent,
    parts: [
        t('card.agent.title'), text('NAME', 'chat'), BREAK,
        t('card.agent.prompt'), text('PROMPT', t('card.agent.prompt.default'), { wide: true }), BREAK,
        t('card.agent.show'), checkbox('SHOW', true), BREAK,
        t('card.agent.summary'), checkbox('USE_SUMMARY', false),
    ],
    node: {
        avatar: MONSTERS.agent,
        kind: t('card.agent.kind'),
        title: ({ block, isPalette }) => isPalette ? t('card.agent.type') : block.fields.NAME,
        hasInput: true,
        outputs: () => [{ port: 'out' }],
        uses: [
            { port: 'model', label: t('card.use.model'), accepts: 'model' },
            { port: 'workshop', label: t('card.use.workshop'), accepts: 'workshop' },
        ],
        chips: ({ block, workspace }) => {
            const workshop = linkedCard(workspace, block, 'workshop')
            return [
                linkChip(workspace, block, 'model', '🧠'),
                null != workshop ? `🔌 ${workshop.fields.NAME}` : null,
                block.fields.USE_SUMMARY ? t('card.agent.chip.summary') : null,
                block.fields.SHOW ? t('card.agent.chip.show') : null,
            ].filter(Boolean)
        },
    },
    explain: t('card.agent.explain'),
})

DEFINITIONS.push({
    type: TYPES.summarize,
    colour: COLOURS.summarize,
    parts: [
        t('card.summarize.title'), text('NAME', t('card.summarize.name.default')), BREAK,
        t('card.summarize.keep.before'), number('KEEP_LAST', 6, { min: 0, max: 100 }), t('card.summarize.keep.after'), BREAK,
        t('card.summarize.instruction'), text('PROMPT', t('card.summarize.prompt.default'), { wide: true }),
    ],
    node: {
        avatar: MONSTERS.summarize,
        kind: t('card.summarize.kind'),
        title: ({ block, isPalette }) => isPalette ? t('card.summarize.type') : block.fields.NAME,
        hasInput: true,
        outputs: () => [{ port: 'out' }],
        uses: [{ port: 'model', label: t('card.use.model'), accepts: 'model' }],
        chips: ({ block, workspace }) => [linkChip(workspace, block, 'model', '🧠'), t('card.summarize.chip.keep', { count: block.fields.KEEP_LAST })],
    },
    explain: t('card.summarize.explain'),
})

DEFINITIONS.push({
    type: TYPES.workshop,
    colour: COLOURS.workshop,
    parts: [t('card.workshop.title'), text('NAME', t('card.workshop.name.default'))],
    node: {
        avatar: MONSTERS.workshop,
        kind: t('card.workshop.kind'),
        title: ({ block, isPalette }) => isPalette ? t('card.workshop.type') : block.fields.NAME,
        hasInput: true,
        outputs: () => [{ port: 'out' }],
        // Like an MCP server: agents plug in to learn its tools, the tools hang below it.
        provides: 'workshop',
        uses: [{ port: 'tools', label: t('card.use.tools'), accepts: 'tool', multiple: true }],
        chips: ({ block, workspace }) => {
            const tools = linkedCards(workspace, block, 'tools')
            if (tools.length === 0) return [t('card.workshop.chip.empty')]
            return [tools.length === 1 ? t('card.workshop.chip.one') : t('card.workshop.chip.many', { count: tools.length })]
        },
    },
    explain: t('card.workshop.explain'),
})

// ---------------------------------------------------------------------------
// Switch
//   The card that decides where to go next.
// ---------------------------------------------------------------------------

DEFINITIONS.push({
    type: TYPES.router,
    colour: COLOURS.router,
    parts: [t('card.router.title'), text('NAME', t('card.router.name.default')), slot('CONDITION', t('card.router.slot'), 'condition')],
    node: {
        avatar: MONSTERS.router,
        kind: t('card.router.kind'),
        title: ({ block, isPalette }) => isPalette ? t('card.router.type') : block.fields.NAME,
        hasInput: true,
        outputs: ({ block }) => routerBranches(block),
        // Only the decision by the model needs a model, the other conditions just look.
        uses: [{ port: 'model', label: t('card.use.model'), accepts: 'model' }],
        chips: ({ block }) => {
            const condition = (block.slots.CONDITION ?? [])[0]
            if (null == condition) return [t('card.router.chip.none')]
            if (condition.type === TYPES.conditionLength) return [t('card.router.chip.length', { max: condition.fields.MAX })]
            if (condition.type === TYPES.conditionContains) return [t('card.router.chip.contains', { word: condition.fields.WORD })]
            if (condition.type === TYPES.conditionTools) return [t('card.router.chip.tools')]
            return [t('card.router.chip.model', { count: condition.slots.OPTIONS?.length ?? 0 })]
        },
    },
    explain: t('card.router.explain'),
})

// ===========================================================================
// ==========================   DEFINE RESOURCES   ===========================
// ===========================================================================
//
//   1. Model     Stateless: which model and how creative.
//   2. Notepad   The dict that travels through a run, with its fields.
//   3. Memory    Keeps the notepad between runs.
//   4. Tool      A Python function the model may ask for.
//   5. Helper    An agent used like a tool: own notepad, only the task, only the answer.
//
//   A resource has 'provides': a knob on top that fits the sockets of the same name.
//   It is no step of the graph: nothing flows into it, steps only use it.
//

// ---------------------------------------------------------------------------
// Model
//   Stateless: which model and how creative.
// ---------------------------------------------------------------------------

DEFINITIONS.push({
    type: TYPES.model,
    colour: COLOURS.model,
    parts: [
        t('card.model.title'), text('NAME', 'qwen'), BREAK,
        dropdown('MODE', 'builtin', [[t('card.model.builtin'), 'builtin']]), BREAK,
        t('card.model.temperature'), number('TEMPERATURE', 0.7, { min: 0, max: 2, step: 0.1 }),
    ],
    node: {
        shape: 'resource',
        emoji: '🧠',
        kind: t('card.model.kind'),
        title: ({ block, isPalette }) => isPalette ? t('card.model.type') : block.fields.NAME,
        provides: 'model',
        chips: ({ block }) => ['📦 Qwen 1.5B', `🌡️ ${block.fields.TEMPERATURE}`],
    },
    explain: t('card.model.explain'),
})

// ---------------------------------------------------------------------------
// Notepad
//   The dict that travels through a run, with its fields.
// ---------------------------------------------------------------------------

DEFINITIONS.push({
    type: TYPES.state,
    colour: COLOURS.state,
    parts: [t('card.state.parts'), slot('FIELDS', t('card.state.slot'), 'state_field')],
    node: {
        shape: 'resource',
        emoji: '🗂️',
        kind: t('card.state.kind'),
        title: () => t('card.state.title'),
        provides: 'state',
        chips: ({ block }) => [t('card.state.chip.messages'), ...(block.slots.FIELDS ?? []).map(field => `🔤 ${field.fields.NAME}`)],
    },
    explain: t('card.state.explain'),
})

// ---------------------------------------------------------------------------
// Memory
//   Keeps the notepad between runs.
// ---------------------------------------------------------------------------

DEFINITIONS.push({
    type: TYPES.memory,
    colour: COLOURS.memory,
    parts: [t('card.memory.parts')],
    node: {
        shape: 'resource',
        emoji: '💾',
        kind: t('card.memory.kind'),
        title: () => t('card.memory.title'),
        provides: 'memory',
        chips: () => [t('card.memory.chip')],
    },
    explain: t('card.memory.explain'),
})

// ---------------------------------------------------------------------------
// Tool
//   A Python function the model may ask for.
// ---------------------------------------------------------------------------

DEFINITIONS.push({
    type: TYPES.tool,
    colour: COLOURS.tool,
    parts: [t('card.tool.title'), dropdown('TOOL', 'calculator', Object.entries(TOOL_KINDS).map(([kind, tool]) => [tool.label, kind]))],
    node: {
        shape: 'resource',
        emoji: '🔧',
        kind: t('card.tool.kind'),
        title: ({ block }) => TOOL_KINDS[block.fields.TOOL]?.label ?? '?',
        provides: 'tool',
        chips: ({ block }) => [`✨ ${TOOL_KINDS[block.fields.TOOL]?.skill ?? '?'}`],
    },
    explain: t('card.tool.explain'),
})

// ---------------------------------------------------------------------------
// Helper
//   An agent used like a tool: own notepad, only the task, only the answer.
// ---------------------------------------------------------------------------

DEFINITIONS.push({
    type: TYPES.helper,
    colour: COLOURS.helper,
    parts: [
        t('card.helper.title'), text('NAME', t('card.helper.name.default')), BREAK,
        t('card.agent.prompt'), text('PROMPT', t('card.helper.prompt.default'), { wide: true }), BREAK,
        t('card.helper.hint'), text('HINT', t('card.helper.hint.default'), { wide: true }), BREAK,
        t('card.agent.show'), checkbox('SHOW', true),
    ],
    node: {
        // A graphling like the agent, but a resource: it hangs in the workshop like a tool.
        shape: 'resource',
        avatar: MONSTERS.helper,
        kind: t('card.helper.kind'),
        title: ({ block, isPalette }) => isPalette ? t('card.helper.type') : block.fields.NAME,
        provides: 'tool',
        uses: [{ port: 'model', label: t('card.use.model'), accepts: 'model' }],
        chips: ({ block, workspace }) => [
            linkChip(workspace, block, 'model', '🧠'),
            t('card.helper.chip.notepad'),
            block.fields.SHOW ? t('card.agent.chip.show') : null,
        ].filter(Boolean),
    },
    explain: t('card.helper.explain'),
})

// ===========================================================================
// ============================   DEFINE PIECES   ============================
// ===========================================================================
//
//   1. Plan         The global puzzle of the graph: mode, step limit, settings.
//   2. Conditions   What a switch asks: length, a word, a tool call, or the model.
//   3. Others       Settings and notepad fields.
//
//   A piece with 'fits' goes into a slot whose 'accepts' has the same name.
//

// ---------------------------------------------------------------------------
// Plan
//   The global puzzle of the graph: mode, step limit, settings.
// ---------------------------------------------------------------------------

DEFINITIONS.push({
    type: PLAN_TYPE,
    colour: COLOURS.plan,
    parts: [
        t('piece.plan.mode'), dropdown('RUN_MODE', 'chat', [[t('piece.plan.mode.chat'), 'chat'], [t('piece.plan.mode.task'), 'task']]), BREAK,
        t('piece.plan.steps.before'), number('MAX_STEPS', 25, { min: 2, max: 200 }), t('piece.plan.steps.after'),
        slot('SETUP', t('piece.plan.slot'), 'setup'),
    ],
    explain: t('piece.plan.explain'),
})

// ---------------------------------------------------------------------------
// Conditions
//   What a switch asks: length, a word, a tool call, or the model.
// ---------------------------------------------------------------------------

DEFINITIONS.push({
    type: TYPES.conditionLength,
    colour: COLOURS.condition,
    fits: 'condition',
    parts: [t('piece.length.before'), number('MAX', 20, { min: 0, max: 1000 }), t('piece.length.after')],
    explain: t('piece.length.explain'),
})

DEFINITIONS.push({
    type: TYPES.conditionContains,
    colour: COLOURS.condition,
    fits: 'condition',
    parts: [t('piece.contains.label'), text('WORD', 'OK')],
    explain: t('piece.contains.explain'),
})

DEFINITIONS.push({
    type: TYPES.conditionTools,
    colour: COLOURS.condition,
    fits: 'condition',
    parts: [t('piece.tools.label')],
    explain: t('piece.tools.explain'),
})

DEFINITIONS.push({
    type: TYPES.conditionModel,
    colour: COLOURS.condition,
    fits: 'condition',
    parts: [t('piece.model.label'), slot('OPTIONS', t('piece.model.slot'), 'route_option')],
    explain: t('piece.model.explain'),
})

DEFINITIONS.push({
    type: TYPES.routeOption,
    colour: COLOURS.condition,
    fits: 'route_option',
    parts: [t('piece.way.label'), text('NAME', t('piece.way.name.default')), BREAK, t('piece.way.for'), text('HINT', t('piece.way.hint.default'), { wide: true })],
    explain: t('piece.way.explain'),
})

// ---------------------------------------------------------------------------
// Others
//   Settings and notepad fields.
// ---------------------------------------------------------------------------

DEFINITIONS.push({
    type: TYPES.settings,
    colour: COLOURS.setup,
    fits: 'setup',
    parts: [t('piece.settings.label')],
    explain: t('piece.settings.explain'),
})

DEFINITIONS.push({
    type: TYPES.stateField,
    colour: COLOURS.state,
    fits: 'state_field',
    parts: [
        t('piece.field.label'), text('NAME', 'summary'),
        t('piece.field.type'), dropdown('TYPE', 'str', [
            [t('piece.field.type.str'), 'str'],
            [t('piece.field.type.int'), 'int'],
            [t('piece.field.type.float'), 'float'],
            [t('piece.field.type.bool'), 'bool'],
        ]),
    ],
    explain: t('piece.field.explain'),
})

// ===========================================================================
// ==============================   MIGRATE   ================================
// ===========================================================================
//
//   migrateWorkspace   Brings an older saved graph up to date.
//
//   Tools used to hang at the agent. Now they hang at a workshop and the agent
//   plugs into it: the tool links move to the first workshop, the agent gets a plug.
//   The memory used to hang at the agent too. Now it hangs at START, next to the
//   notepad: the first memory link moves to START, the others are dropped.
//

export function migrateWorkspace(workspace) {
    return moveMemoryToStart(moveToolsToWorkshop(workspace))
}

function moveToolsToWorkshop(workspace) {
    const edges = workspace?.edges ?? []
    const nodes = workspace?.nodes ?? []
    const oldLinks = edges.filter(edge => edge.kind === 'use' && edge.port === 'tools'
        && nodes.find(node => node.id === edge.from)?.type === TYPES.agent)
    if (oldLinks.length === 0) return workspace

    const workshop = nodes.find(node => node.type === TYPES.workshop)
    const kept = edges.filter(edge => !oldLinks.includes(edge))
    if (null == workshop) return { ...workspace, edges: kept }

    const moved = [...new Set(oldLinks.map(edge => edge.to))]
        .map(toolId => ({ id: `use-${workshop.id}-${toolId}`, kind: 'use', from: workshop.id, port: 'tools', to: toolId }))
    const plugs = [...new Set(oldLinks.map(edge => edge.from))]
        .map(agentId => ({ id: `use-${agentId}-workshop`, kind: 'use', from: agentId, port: 'workshop', to: workshop.id }))
    return { ...workspace, edges: [...kept, ...moved, ...plugs] }
}

function moveMemoryToStart(workspace) {
    const edges = workspace?.edges ?? []
    const nodes = workspace?.nodes ?? []
    const start = nodes.find(node => node.type === TYPES.start)
    const oldLinks = edges.filter(edge => edge.kind === 'use' && edge.port === 'memory' && edge.from !== start?.id)
    if (oldLinks.length === 0) return workspace

    const kept = edges.filter(edge => !oldLinks.includes(edge))
    const hasStartMemory = kept.some(edge => edge.kind === 'use' && edge.from === start?.id && edge.port === 'memory')
    if (null == start || hasStartMemory) return { ...workspace, edges: kept }

    const moved = { id: `use-${start.id}-memory`, kind: 'use', from: start.id, port: 'memory', to: oldLinks[0].to }
    return { ...workspace, edges: [...kept, moved] }
}

// ===========================================================================
// ==============================   DESCRIBE   ===============================
// ===========================================================================
//
//   DESCRIPTIONS     Plain words for every card, piece and line, no code terms.
//   getDescription   The plain description of a type or of a line kind.
//
//   'explain' in the definitions says how the code works, for the code view.
//   These texts say what a thing DOES, so a beginner understands the graph first.
//   Cards speak for themselves: they are little creatures, the graphlings.
//

const DESCRIPTIONS = {
    [TYPES.start]: t('describe.start'),
    [TYPES.end]: t('describe.end'),
    [TYPES.agent]: t('describe.agent'),
    [TYPES.summarize]: t('describe.summarize'),
    [TYPES.workshop]: t('describe.workshop'),
    [TYPES.router]: t('describe.router'),
    [TYPES.model]: t('describe.model'),
    [TYPES.state]: t('describe.state'),
    [TYPES.memory]: t('describe.memory'),
    [TYPES.tool]: t('describe.tool'),
    [TYPES.helper]: t('describe.helper'),
    [PLAN_TYPE]: t('describe.plan'),
    [TYPES.settings]: t('describe.settings'),
    [TYPES.stateField]: t('describe.field'),
    [TYPES.conditionLength]: t('describe.length'),
    [TYPES.conditionContains]: t('describe.contains'),
    [TYPES.conditionTools]: t('describe.tools'),
    [TYPES.conditionModel]: t('describe.modelDecides'),
    [TYPES.routeOption]: t('describe.way'),
    flow: t('describe.flow'),
    'use-workshop': t('describe.useWorkshop'),
    use: t('describe.use'),
}

export function getDescription(typeOrKind) {
    return DESCRIPTIONS[typeOrKind] ?? ''
}

// ===========================================================================
// ===============================   PALETTE   ===============================
// ===========================================================================
//
//   PALETTE   Steps first, then what they use, then the pieces.
//

export const PALETTE = [
    {
        name: t('palette.graphlings'),
        colour: COLOURS.agent,
        types: [TYPES.agent, TYPES.summarize, TYPES.workshop, TYPES.router, TYPES.start, TYPES.end],
    },
    {
        name: t('palette.resources'),
        colour: COLOURS.model,
        types: [TYPES.model, TYPES.state, TYPES.memory, TYPES.tool, TYPES.helper],
    },
    {
        name: t('palette.pieces'),
        colour: COLOURS.condition,
        types: [
            TYPES.conditionModel, TYPES.routeOption, TYPES.conditionTools, TYPES.conditionContains,
            TYPES.conditionLength, TYPES.stateField, TYPES.settings,
        ],
    },
]
