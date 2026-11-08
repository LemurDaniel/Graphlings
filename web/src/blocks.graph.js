// NOTE:
//   The cards and puzzle pieces of Graphlings: shape, colour and explanation of each.
//   Plain data for the graph editor, no DOM, so the generator test runs in Node.
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
//     DEFINE RESOURCES   The cards that steps use: model, notepad, memory, tools.
//     DEFINE PIECES      The plan of the graph and the puzzle pieces that go into slots.
//     CHAT LOOP          The dashed arc from END back to START: the chat around the graph.
//     DESCRIBE           Plain words for every card, piece and line, for beginners.
//     PALETTE            The sections of the palette.
//

import { BREAK, checkbox, dropdown, number, slot, text } from './engine/engine.parts.js'

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
    conditionLength: 'graphlings_condition_length',
    conditionContains: 'graphlings_condition_contains',
    conditionTools: 'graphlings_condition_tools',
    conditionModel: 'graphlings_condition_model',
    routeOption: 'graphlings_route_option',
    settings: 'graphlings_settings',
    stateField: 'graphlings_state_field',
}

// The tools a tool card can be: the generator writes one Python function per kind.
export const TOOL_KINDS = {
    calculator: { label: '🧮 Rechner', name: 'calculator' },
    clock: { label: '🕒 Uhrzeit', name: 'clock' },
    dice: { label: '🎲 Würfel', name: 'dice' },
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

export function routerBranches(block) {
    const condition = (block?.slots?.CONDITION ?? [])[0] ?? null
    if (condition?.type === TYPES.conditionModel) {
        return (condition.slots.OPTIONS ?? []).map(option => ({ port: option.id, label: option.fields.NAME || '…', option }))
    }
    return [{ port: 'then', label: 'ja' }, { port: 'else', label: 'nein' }]
}

export function getExplanation(type) {
    return DEFINITIONS.find(definition => definition.type === type)?.explain ?? ''
}

// A chip for a socket: the name of the linked card, or what is missing.
function linkChip(workspace, block, port, icon) {
    const card = linkedCard(workspace, block, port)
    return null == card ? `${icon} fehlt` : `${icon} ${card.fields.NAME ?? ''}`.trim()
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
    parts: ['🟢 START: Hier kommt jede neue Frage oder Aufgabe in den Graphen.'],
    node: {
        shape: 'rocket',
        emoji: '🟢',
        kind: 'neue Frage',
        title: () => 'START',
        hasInput: false,
        outputs: () => [{ port: 'out' }],
        // Every run starts with the notepad: START hands it to the first graphling.
        uses: [{ port: 'state', label: '🗂️ Notizzettel', accepts: 'state' }],
    },
    explain: 'START ist kein Knoten, sondern der Eingang einer Runde: EDGES[START] sagt, welcher Knoten zuerst läuft. '
        + 'Unten hängt der Notizzettel: Jede Runde beginnt mit einem State aus new_state(), mit Gedächtnis mit dem aus MEMORY.',
})

DEFINITIONS.push({
    type: TYPES.end,
    colour: COLOURS.end,
    parts: ['🏁 END: Die Arbeit ist fertig, die Runde endet.'],
    node: { shape: 'flag', emoji: '🏁', kind: 'fertig', title: () => 'END', hasInput: true, outputs: () => [] },
    explain: 'END beendet eine Runde: run_graph() hört auf und gibt den State zurück. '
        + 'Im Chat wartet main() danach auf die nächste Frage und lässt den Graphen wieder bei START laufen.',
})

// ---------------------------------------------------------------------------
// Graphlings
//   Agent, summarizer and workshop, the nodes that do the work.
// ---------------------------------------------------------------------------

DEFINITIONS.push({
    type: TYPES.agent,
    colour: COLOURS.agent,
    parts: [
        '🤖 Agent', text('NAME', 'chat'), BREAK,
        'System-Prompt', text('PROMPT', 'Du bist ein hilfreicher Assistent. Antworte auf Deutsch, klar und präzise.', { wide: true }), BREAK,
        '📣 Antwort zeigen', checkbox('SHOW', true), BREAK,
        '📜 Zusammenfassung mitschicken', checkbox('USE_SUMMARY', false),
    ],
    node: {
        kind: 'Agent · fragt das Modell',
        title: ({ block }) => block.fields.NAME,
        hasInput: true,
        outputs: () => [{ port: 'out' }],
        uses: [
            { port: 'model', label: '🧠 Modell', accepts: 'model' },
            { port: 'memory', label: '💾 Gedächtnis', accepts: 'memory' },
            { port: 'workshop', label: '🔌 Werkstatt (MCP)', accepts: 'workshop' },
        ],
        chips: ({ block, workspace }) => {
            const workshop = linkedCard(workspace, block, 'workshop')
            return [
                linkChip(workspace, block, 'model', '🧠'),
                null != workshop ? `🔌 ${workshop.fields.NAME}` : null,
                block.fields.USE_SUMMARY ? '📜 Zusammenfassung' : null,
                block.fields.SHOW ? '📣 zeigt Antwort' : null,
            ].filter(Boolean)
        },
    },
    explain: 'Ein Agent ist hier eine normale Python-Funktion: Sie bekommt den State und gibt nur die Änderung zurück. '
        + 'Sie schickt ihre Rolle (System-Prompt) plus Verlauf an das Modell, an dem sie unten hängt, und hängt die Antwort an. '
        + 'Hängt sie an einer Werkstatt, holt sie sich deren Werkzeugliste (list_tools) und das Modell darf sie aufrufen (tool_calls).',
})

DEFINITIONS.push({
    type: TYPES.summarize,
    colour: COLOURS.summarize,
    parts: [
        '🗜️ Zusammenfasser', text('NAME', 'summarize'), BREAK,
        'behalte die letzten', number('KEEP_LAST', 6, { min: 0, max: 100 }), 'Nachrichten', BREAK,
        'Anweisung', text('PROMPT', 'Fasse das bisherige Gespräch knapp auf Deutsch zusammen. Behalte Fakten über den Nutzer, '
            + 'getroffene Entscheidungen und offene Fragen. Antworte nur mit der Zusammenfassung.', { wide: true }),
    ],
    node: {
        kind: 'Graphling · fasst zusammen',
        title: ({ block }) => block.fields.NAME,
        hasInput: true,
        outputs: () => [{ port: 'out' }],
        uses: [{ port: 'model', label: '🧠 Modell', accepts: 'model' }],
        chips: ({ block, workspace }) => [linkChip(workspace, block, 'model', '🧠'), `📦 behält ${block.fields.KEEP_LAST}`],
    },
    explain: 'Compacting: Alte Nachrichten wandern in eine Zusammenfassung, damit der Verlauf nicht endlos wächst. '
        + 'Der Knoten lässt sein Modell die alten Nachrichten zusammenfassen '
        + 'und gibt das neue "summary" plus nur noch die letzten Nachrichten zurück.',
})

DEFINITIONS.push({
    type: TYPES.workshop,
    colour: COLOURS.workshop,
    parts: ['🔧 Werkstatt', text('NAME', 'werkstatt')],
    node: {
        kind: 'Graphling · Werkzeugkasten',
        title: ({ block }) => block.fields.NAME,
        hasInput: true,
        outputs: () => [{ port: 'out' }],
        // Like an MCP server: agents plug in to learn its tools, the tools hang below it.
        provides: 'workshop',
        uses: [{ port: 'tools', label: '🔧 Werkzeuge', accepts: 'tool', multiple: true }],
        chips: ({ block, workspace }) => {
            const tools = linkedCards(workspace, block, 'tools')
            return [tools.length > 0 ? `🔧 ${tools.length} Werkzeug${tools.length === 1 ? '' : 'e'}` : '🔧 leer']
        },
    },
    explain: 'Die Werkstatt ist ein Werkzeugkasten, gebaut wie ein MCP-Server: Ihre Werkzeuge stehen in einem dict. '
        + 'list_tools() gibt dem Agenten die Beschreibungen (wie tools/list bei MCP), '
        + 'als Knoten führt sie die tool_calls der letzten Antwort mit call_tool() aus (wie tools/call) '
        + 'und hängt jedes Ergebnis als Nachricht mit role "tool" an. Danach geht es zurück zum Agenten: die Agent-Schleife.',
})

// ---------------------------------------------------------------------------
// Switch
//   The card that decides where to go next.
// ---------------------------------------------------------------------------

DEFINITIONS.push({
    type: TYPES.router,
    colour: COLOURS.router,
    parts: ['🔀 Weiche', text('NAME', 'weiche'), slot('CONDITION', 'Bedingung', 'condition')],
    node: {
        kind: 'Weiche · entscheidet den Weg',
        title: ({ block }) => block.fields.NAME,
        hasInput: true,
        outputs: ({ block }) => routerBranches(block),
        // Only the decision by the model needs a model, the other conditions just look.
        uses: [{ port: 'model', label: '🧠 Modell', accepts: 'model' }],
        chips: ({ block }) => {
            const condition = (block.slots.CONDITION ?? [])[0]
            if (null == condition) return ['❓ keine Bedingung']
            if (condition.type === TYPES.conditionLength) return [`📏 > ${condition.fields.MAX} Nachrichten`]
            if (condition.type === TYPES.conditionContains) return [`📝 enthält „${condition.fields.WORD}“`]
            if (condition.type === TYPES.conditionTools) return ['🔧 will Werkzeug?']
            return [`🧠 Modell wählt aus ${condition.slots.OPTIONS?.length ?? 0} Wegen`]
        },
    },
    explain: 'Eine Weiche ist kein Knoten, sondern eine Entscheidung auf der Kante: '
        + 'Im Code wird sie eine Routing-Funktion, die in den State schaut und den Namen des nächsten Knotens zurückgibt. '
        + 'In EDGES steht dann statt eines Namens diese Funktion. So drehen Agents Schleifen oder biegen ab.',
})

// ===========================================================================
// ==========================   DEFINE RESOURCES   ===========================
// ===========================================================================
//
//   1. Model     Stateless: which model and how creative.
//   2. Notepad   The dict that travels through a run, with its fields.
//   3. Memory    Keeps the notepad between runs.
//   4. Tool      A Python function the model may ask for.
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
        '🧠 Modell', text('NAME', 'qwen'), BREAK,
        dropdown('MODE', 'builtin', [['🐣 eingebaut (Qwen 1.5B)', 'builtin']]), BREAK,
        'Temperatur', number('TEMPERATURE', 0.7, { min: 0, max: 2, step: 0.1 }),
    ],
    node: {
        shape: 'resource',
        emoji: '🧠',
        kind: 'Modell · zustandslos',
        title: ({ block }) => block.fields.NAME,
        provides: 'model',
        chips: ({ block }) => ['🐣 Qwen 1.5B', `🌡️ ${block.fields.TEMPERATURE}`],
    },
    explain: 'Ein Modell ist nur ein Server, den man per HTTP fragt, und es ist zustandslos: Es merkt sich nichts. '
        + 'Im Code ist es ein kleines dict mit Name und Temperatur. ask_model() schickt es zusammen mit dem ganzen Gespräch '
        + 'an /chat/completions. Mehrere Agenten können ein Modell teilen oder eigene haben, z. B. kreativ und genau.',
})

// ---------------------------------------------------------------------------
// Notepad
//   The dict that travels through a run, with its fields.
// ---------------------------------------------------------------------------

DEFINITIONS.push({
    type: TYPES.state,
    colour: COLOURS.state,
    parts: ['🗂️ Notizzettel (State): alle Nachrichten und dazu', slot('FIELDS', 'Felder', 'state_field')],
    node: {
        shape: 'resource',
        emoji: '🗂️',
        kind: 'State · was eine Runde weiß',
        title: () => 'Notizzettel',
        provides: 'state',
        chips: ({ block }) => ['messages', ...(block.slots.FIELDS ?? []).map(field => field.fields.NAME)],
    },
    explain: 'Der State ist ein dict, das durch eine Runde wandert. new_state() legt ihn an: immer mit "messages", '
        + 'dazu die Felder dieser Karte. START hängt an ihm, weil jede Runde mit so einem State beginnt. '
        + 'Danach reicht run_graph() ihn an jeden Knoten weiter, jeder gibt nur die Schlüssel zurück, die er ändert.',
})

// ---------------------------------------------------------------------------
// Memory
//   Keeps the notepad between runs.
// ---------------------------------------------------------------------------

DEFINITIONS.push({
    type: TYPES.memory,
    colour: COLOURS.memory,
    parts: ['💾 Gedächtnis: merkt sich jedes Gespräch per thread_id.'],
    node: {
        shape: 'resource',
        emoji: '💾',
        kind: 'Gedächtnis · MEMORY',
        title: () => 'Gedächtnis',
        provides: 'memory',
        chips: () => ['MEMORY[thread_id]'],
    },
    explain: 'Das Gedächtnis ist ein dict: MEMORY[thread_id] = State nach der letzten Runde. '
        + 'Hängt ein Agent daran, holt stream_answer() bei jeder Frage den alten State heraus und hängt die Frage an. '
        + 'Ohne beginnt jede Runde mit einem leeren State. Im Aufgaben-Modus gibt es nur eine Runde, dort zählt es nicht.',
})

// ---------------------------------------------------------------------------
// Tool
//   A Python function the model may ask for.
// ---------------------------------------------------------------------------

DEFINITIONS.push({
    type: TYPES.tool,
    colour: COLOURS.tool,
    parts: ['🔧 Werkzeug', dropdown('TOOL', 'calculator', Object.entries(TOOL_KINDS).map(([kind, tool]) => [tool.label, kind]))],
    node: {
        shape: 'resource',
        emoji: '🔧',
        kind: 'Werkzeug · eine Funktion',
        title: ({ block }) => TOOL_KINDS[block.fields.TOOL]?.label ?? '?',
        provides: 'tool',
        chips: ({ block }) => [`${TOOL_KINDS[block.fields.TOOL]?.name ?? '?'}()`],
    },
    explain: 'Ein Werkzeug ist eine Python-Funktion plus eine Beschreibung als JSON (Name, Zweck, Parameter). '
        + 'Die Beschreibung geht mit an das Modell. Will es das Werkzeug nutzen, antwortet es nicht mit Text, '
        + 'sondern mit tool_calls: Name und Argumente. Es hängt an einer Werkstatt, die es anbietet und ausführt.',
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
        '🚀 Modus', dropdown('RUN_MODE', 'chat', [['💬 Chat: Frage um Frage', 'chat'], ['📋 Aufgabe: einmal durchlaufen', 'task']]), BREAK,
        '🔁 höchstens', number('MAX_STEPS', 25, { min: 2, max: 200 }), 'Schritte pro Runde',
        slot('SETUP', 'Bausteine', 'setup'),
    ],
    explain: 'Der Bauplan gilt für den ganzen Graphen. Der Modus entscheidet über main(): im Chat eine Schleife über stream_answer(), '
        + 'als Aufgabe ein einziger Lauf über run_task(), der den fertigen State zurückgibt. '
        + 'MAX_STEPS bremst Graphen, die sich im Kreis drehen, z. B. eine Agent-Schleife, die nie fertig wird.',
})

// ---------------------------------------------------------------------------
// Conditions
//   What a switch asks: length, a word, a tool call, or the model.
// ---------------------------------------------------------------------------

DEFINITIONS.push({
    type: TYPES.conditionLength,
    colour: COLOURS.condition,
    fits: 'condition',
    parts: ['📏 mehr als', number('MAX', 20, { min: 0, max: 1000 }), 'Nachrichten'],
    explain: 'Ist der Verlauf länger als N Nachrichten, geht es über "ja" weiter, sonst über "nein". 0 heißt: immer "nein".',
})

DEFINITIONS.push({
    type: TYPES.conditionContains,
    colour: COLOURS.condition,
    fits: 'condition',
    parts: ['📝 letzte Antwort enthält', text('WORD', 'OK')],
    explain: 'Die Weiche schaut in die letzte Nachricht: Steht das Wort darin (groß/klein egal), geht es über "ja", sonst über "nein". '
        + 'So prüft ein Kritiker, ob ein Text gut genug ist: die Reflexions-Schleife.',
})

DEFINITIONS.push({
    type: TYPES.conditionTools,
    colour: COLOURS.condition,
    fits: 'condition',
    parts: ['🔧 Modell will ein Werkzeug benutzen'],
    explain: 'Die Weiche schaut, ob die letzte Antwort tool_calls enthält. Ja: weiter zur Werkstatt, die sie ausführt. '
        + 'Nein: Das Modell ist fertig. Das ist der Kern jeder Agent-Schleife.',
})

DEFINITIONS.push({
    type: TYPES.conditionModel,
    colour: COLOURS.condition,
    fits: 'condition',
    parts: ['🧠 Modell entscheidet zwischen', slot('OPTIONS', 'Wegen', 'route_option')],
    explain: 'Die Weiche fragt ihr Modell: Sie zählt die Wege mit ihren Beschreibungen auf und bittet um genau ein Wort. '
        + 'Die Antwort wird mit den Namen der Wege verglichen, passt keiner, nimmt sie den ersten. '
        + 'Jeder Weg ist ein eigener Ausgang an der Karte.',
})

DEFINITIONS.push({
    type: TYPES.routeOption,
    colour: COLOURS.condition,
    fits: 'route_option',
    parts: ['🏷️ Weg', text('NAME', 'technik'), BREAK, 'für', text('HINT', 'Fragen zu Technik, Computern und Programmieren', { wide: true })],
    explain: 'Ein Weg der schlauen Weiche: Der Name ist das Wort, mit dem das Modell antworten soll, '
        + 'die Beschreibung hilft ihm bei der Wahl. An der Karte wird daraus ein eigener Ausgang.',
})

// ---------------------------------------------------------------------------
// Others
//   Settings and notepad fields.
// ---------------------------------------------------------------------------

DEFINITIONS.push({
    type: TYPES.settings,
    colour: COLOURS.setup,
    fits: 'setup',
    parts: ['⚙️ Einstellungen aus .env'],
    explain: 'Ohne dieses Teil stehen Modell, Prompts und Grenzen fest im Code. '
        + 'Mit ihm liest load_env_file() die Datei .env, os.getenv() nimmt den Wert oder den Standard, '
        + 'und ein Prüfabschnitt bricht früh mit einer klaren Meldung ab, wenn ein Wert nicht passt.',
})

DEFINITIONS.push({
    type: TYPES.stateField,
    colour: COLOURS.state,
    fits: 'state_field',
    parts: [
        '🔤 Feld', text('NAME', 'summary'),
        'vom Typ', dropdown('TYPE', 'str', [
            ['Text (str)', 'str'],
            ['Zahl (int)', 'int'],
            ['Kommazahl (float)', 'float'],
            ['Ja/Nein (bool)', 'bool'],
        ]),
    ],
    explain: 'Ein Feld ist ein weiterer Schlüssel im State-dict, mit einem leeren Startwert. '
        + 'Gibt ein Knoten {"summary": ...} zurück, überschreibt die Engine genau diesen Schlüssel.',
})

// ===========================================================================
// ==============================   MIGRATE   ================================
// ===========================================================================
//
//   migrateWorkspace   Brings an older saved graph up to date.
//
//   Tools used to hang at the agent. Now they hang at a workshop and the agent
//   plugs into it: the tool links move to the first workshop, the agent gets a plug.
//

export function migrateWorkspace(workspace) {
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
    [TYPES.start]: 'Ich bin der Eingang. Jede neue Frage oder Aufgabe kommt bei mir an. '
        + 'Ich schreibe sie auf den Notizzettel, der unten an mir hängt, und gebe ihn an den ersten Graphling weiter. '
        + 'Der Zettel wandert dann von Karte zu Karte bis zum Ziel.',
    [TYPES.end]: 'Ich bin das Ziel einer Runde. Kommt die Arbeit bei mir an, ist sie fertig. '
        + 'Im Chat geht das Gespräch trotzdem weiter: Die nächste Frage beginnt wieder bei START.',
    [TYPES.agent]: 'Ich bin ein Agent! Ich lese das bisherige Gespräch vom Notizzettel, nehme meine Rolle (den System-Prompt) '
        + 'und frage damit mein Modell. Seine Antwort schreibe ich auf den Zettel. '
        + 'Hängen Werkzeuge an mir, darf das Modell sie benutzen, statt gleich zu antworten.',
    [TYPES.summarize]: 'Ich räume auf. Wird das Gespräch zu lang, lasse ich das Modell die alten Nachrichten '
        + 'zu einer kurzen Zusammenfassung verdichten und behalte nur die letzten paar.',
    [TYPES.workshop]: 'Ich bin die Werkstatt, ein Werkzeugkasten. Unten hängen meine Werkzeuge. '
        + 'Ein Agent, der an mir hängt, fragt mich, was ich alles kann. Bittet sein Modell dann um ein Werkzeug, '
        + 'führe ich es aus und schreibe das Ergebnis auf den Notizzettel. Dann darf der Agent weitermachen.',
    [TYPES.router]: 'Ich bin eine Weiche. Ich schaue mir an, wie es gerade steht, und entscheide, wohin es weitergeht. '
        + 'Mit einem Modell kann ich sogar selbst überlegen, welcher Spezialist die Frage bekommt.',
    [TYPES.model]: 'Ich bin das Sprachmodell, sozusagen ein Gehirn zum Ausleihen. Ich merke mir nichts: '
        + 'Wer mich fragt, muss mir jedes Mal das ganze Gespräch mitschicken. '
        + 'Die Temperatur sagt, wie kreativ (hoch) oder vorhersehbar (niedrig) ich antworte.',
    [TYPES.state]: 'Ich bin der Notizzettel einer Runde. Auf mir stehen alle Nachrichten und was du sonst festlegst, '
        + 'zum Beispiel eine Zusammenfassung. START gibt mich zu Beginn jeder Runde aus, '
        + 'dann wandere ich von Graphling zu Graphling, und jeder liest mich und schreibt etwas dazu.',
    [TYPES.memory]: 'Ich bin das Gedächtnis. Nach jeder Runde lege ich den Notizzettel in eine Schublade '
        + 'und hole ihn bei der nächsten Frage wieder heraus. Wer an mir hängt, erinnert sich.',
    [TYPES.tool]: 'Ich bin ein Werkzeug. Das Modell kann nicht gut rechnen und kennt die Uhrzeit nicht, ich schon. '
        + 'Ich liege in einer Werkstatt, und jeder Agent an dieser Werkstatt darf mich benutzen.',
    [PLAN_TYPE]: 'Der Bauplan gilt für den ganzen Graphen: Chat (Frage um Frage) oder Aufgabe (einmal durchlaufen), '
        + 'und wie viele Schritte eine Runde höchstens machen darf.',
    [TYPES.settings]: 'Mit diesem Teil kommen Werte wie Prompts und Grenzen aus einer Einstellungsdatei, '
        + 'statt fest im Programm zu stehen.',
    [TYPES.stateField]: 'Ein Feld ist eine weitere Zeile auf dem Notizzettel, zum Beispiel für die Zusammenfassung.',
    [TYPES.conditionLength]: 'Die Frage, die die Weiche stellt: Ist das Gespräch schon länger als so viele Nachrichten?',
    [TYPES.conditionContains]: 'Die Frage, die die Weiche stellt: Steht dieses Wort in der letzten Antwort? '
        + 'Damit kann ein Kritiker „OK“ sagen, wenn ein Text gut genug ist.',
    [TYPES.conditionTools]: 'Die Frage, die die Weiche stellt: Will das Modell gerade ein Werkzeug benutzen?',
    [TYPES.conditionModel]: 'Hier entscheidet das Modell selbst: Es liest die Frage und wählt einen der Wege.',
    [TYPES.routeOption]: 'Ein Weg, den die Weiche wählen kann. Die Beschreibung hilft dem Modell bei der Wahl.',
    flow: 'Diese Linie sagt: Wenn der eine fertig ist, ist der nächste dran. So entsteht der Ablauf.',
    'use-workshop': 'Das ist die Steckdose zwischen Agent und Werkstatt 🔌. Über sie fragt der Agent: „Was kannst du?“ '
        + 'und gibt die Antwort seinem Modell mit. Genau so funktioniert MCP (Model Context Protocol): '
        + 'Ein Programm bietet Werkzeuge an, ein Agent steckt sich ein und darf sie benutzen.',
    use: 'Diese gepunktete Linie heißt „benutzt“: Der Graphling greift darauf zu, während er arbeitet. '
        + 'Sie ist kein Schritt im Ablauf.',
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
        name: 'Graphlings',
        colour: COLOURS.agent,
        types: [TYPES.agent, TYPES.summarize, TYPES.workshop, TYPES.router, TYPES.start, TYPES.end],
    },
    {
        name: 'Ressourcen',
        colour: COLOURS.model,
        types: [TYPES.model, TYPES.state, TYPES.memory, TYPES.tool],
    },
    {
        name: 'Puzzleteile',
        colour: COLOURS.condition,
        types: [
            TYPES.conditionModel, TYPES.routeOption, TYPES.conditionTools, TYPES.conditionContains,
            TYPES.conditionLength, TYPES.stateField, TYPES.settings,
        ],
    },
]
