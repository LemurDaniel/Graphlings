// NOTE:
//   Turns the graph of a workspace into one readable Python file, standard library only.
//   The file holds everything a graph needs: state, nodes, edges, a small graph engine,
//   the HTTP call to the model and the tools. Nothing is hidden in a framework.
//   Every line remembers which cards, lines and pieces wrote it, so a click marks its lines.
//
//   import { generatePython } from './generator.python.js'
//   const { code, lineOwners, problems, canRun } = generatePython(workspace)   // workspace of engine.model.js

//
//   Chapters:
//     HELPERS            Python literals, names, banners and the line writer.
//     READ WORKSPACE     Collects the cards and lines into a plain model and checks it.
//     WRITE PYTHON       Writes the file chapter by chapter.
//

import { linkedCard, pieceOf, routerBranches, TOOL_KINDS, TYPES } from './blocks.graph.js'
import { t } from './i18n.js'

const LINE_WIDTH = 88
const BANNER_WIDTH = 75
const BUILTIN_MODEL = 'qwen2.5-1.5b-instruct'
const BUILTIN_BASE_URL = 'http://127.0.0.1:8081/v1'

// Names the generated file uses itself, a node must not shadow them.
const RESERVED_NAMES = new Set([
    'main', 'run_graph', 'run_task', 'ask_model', 'show_token', 'new_state', 'stream_answer', 'as_seen_by',
    'read_env_number', 'load_env_file', 'logger', 'state', 'node', 'edge', 'changes',
    'calculator', 'clock', 'dice', 'tools', 'list_tools', 'call_tool', 'random', 'datetime',
    'input', 'print', 'len', 'str', 'int', 'float', 'bool', 'list', 'dict', 'type', 'id', 'range',
    'callable', 'open', 'json', 'os', 'sys', 'uuid', 'logging', 'urllib', 'pathlib',
])

const PYTHON_KEYWORDS = new Set([
    'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class',
    'continue', 'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global',
    'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise',
    'return', 'try', 'while', 'with', 'yield',
])

const FIELD_DEFAULTS = { str: '""', int: '0', float: '0.0', bool: 'False' }

// The Python code of each tool kind: imports it needs, its function and its description for the model.
// The descriptions are English: small models pick the right tool far more often that way.
const TOOL_CODE = {
    calculator: {
        imports: [],
        summary: 'Tool: calculates a math expression.',
        lines: [
            'def calculator(expression: str) -> str:',
            '    """',
            "    Tool: calculates a math expression like '3 * (4 + 5)'.",
            '    Only digits, + - * / ( ) . and spaces get through, so eval() sees nothing else.',
            '',
            '    :param expression: (Required) The expression to calculate.',
            '    :returns:          The result, or a German error text for the model.',
            '    """',
            '    allowed = set("0123456789+-*/(). ")',
            '    if not expression or not set(expression) <= allowed or "**" in expression:',
            '        return "Nur Zahlen und + - * / ( ) sind erlaubt."',
            '    try:',
            '        return str(eval(expression, {"__builtins__": {}}, {}))',
            '    except (SyntaxError, ZeroDivisionError, TypeError) as error:',
            '        return f"Rechenfehler: {error}"',
        ],
        schema: {
            description: 'Calculate a math expression, e.g. 3 * (4 + 5). Always use it for any arithmetic.',
            properties: { expression: { type: 'string', description: 'The expression, e.g. 12 * 7' } },
            required: ['expression'],
        },
    },
    clock: {
        imports: ['from datetime import datetime'],
        summary: 'Tool: tells the weekday, date and time.',
        lines: [
            'def clock() -> str:',
            '    """',
            '    Tool: tells the weekday, date and time, the model cannot know them.',
            '',
            "    :returns: e.g. 'Sonntag, 08.11.2026, 19:42 Uhr'.",
            '    """',
            '    now = datetime.now()',
            '    weekday = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"][now.weekday()]',
            '    return f"{weekday}, {now:%d.%m.%Y, %H:%M} Uhr"',
        ],
        schema: { description: 'Get the current weekday, date and time. Always use it when asked about time or date.', properties: {}, required: [] },
    },
    dice: {
        imports: ['import random'],
        summary: 'Tool: rolls a dice.',
        lines: [
            'def dice(sides: int = 6) -> str:',
            '    """',
            '    Tool: rolls a dice with the given number of sides.',
            '',
            '    :param sides: (Optional) Number of sides. Default is 6.',
            '    :returns:     The rolled number.',
            '    """',
            '    return str(random.randint(1, max(2, int(sides))))',
        ],
        schema: {
            description: 'Roll a dice with the given number of sides.',
            properties: { sides: { type: 'integer', description: 'Number of sides, default 6' } },
            required: [],
        },
    },
}

// ===========================================================================
// ===============================   HELPERS   ===============================
// ===========================================================================
//
//   pyString          A Python string literal, safe for any user text.
//   pyStringParts     A long text as several literals that Python joins again.
//   pyNumber          A Python number literal.
//   pyValue           Plain JSON data as a Python literal (for the tool descriptions).
//   toIdentifier      A user name as a valid Python identifier.
//   chapterBanner     The three '=' lines of a chapter.
//   sectionBanner     The '-' frame of a section.
//   alignColumns      Two aligned columns for chapter descriptions.
//   PythonWriter      Collects lines and the blocks that own them.
//

function pyString(text) {
    const escaped = String(text)
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t')
        .replace(/[\x00-\x1f\x7f]/g, char => `\\x${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
    return `"${escaped}"`
}

function pyStringParts(text, indent) {
    const maxLength = LINE_WIDTH - indent - 2

    // Cut after spaces and line breaks, so joining the parts gives back exactly the original text.
    const words = text.split(/(?<=[ \n])/)
    const parts = []
    let current = ''
    for (const word of words) {
        if (current !== '' && pyString(current + word).length > maxLength) {
            parts.push(current)
            current = ''
        }
        current += word
    }
    parts.push(current)

    return parts.map(part => pyString(part))
}

function pyNumber(value, isFloat) {
    const number = Number(value)
    if (!isFloat) return String(Math.trunc(number))
    return Number.isInteger(number) ? number.toFixed(1) : String(number)
}

function pyValue(value) {
    if (typeof value === 'string') return pyString(value)
    if (Array.isArray(value)) return `[${value.map(pyValue).join(', ')}]`
    if (null != value && typeof value === 'object') {
        return `{${Object.entries(value).map(([key, inner]) => `${pyString(key)}: ${pyValue(inner)}`).join(', ')}}`
    }
    return String(value)
}

export function toIdentifier(name) {
    const identifier = String(name ?? '')
        .trim()
        .toLowerCase()
        .replace(/ä/g, 'ae')
        .replace(/ö/g, 'oe')
        .replace(/ü/g, 'ue')
        .replace(/ß/g, 'ss')
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')

    if (identifier === '') return 'node'
    if (/^[0-9]/.test(identifier)) return `node_${identifier}`
    if (PYTHON_KEYWORDS.has(identifier)) return `${identifier}_node`
    return identifier
}

function chapterBanner(title) {
    const inner = `   ${title}   `
    const left = Math.floor((BANNER_WIDTH - inner.length) / 2)
    const right = BANNER_WIDTH - inner.length - left
    const frame = `# ${'='.repeat(BANNER_WIDTH)}`
    return [frame, `# ${'='.repeat(left)}${inner}${'='.repeat(right)}`, frame]
}

function sectionBanner(title, description, indent = '') {
    const frame = `${indent}# ${'-'.repeat(BANNER_WIDTH)}`
    return [frame, `${indent}# ${title}`, `${indent}#   ${description}`, frame]
}

function alignColumns(rows, prefix) {
    const width = Math.max(...rows.map(([left]) => left.length))
    return rows.map(([left, right]) => `${prefix}${left.padEnd(width)}   ${right}`)
}

class PythonWriter {
    lines = []
    #owners = []

    line(text = '') {
        this.lines.push({ text, owners: [...this.#owners] })
    }

    many(texts) {
        texts.forEach(text => this.line(text))
    }

    // Every line written inside 'write' belongs to the block, nested blocks come last.
    // Several ids, e.g. a resource and the link to it, all own the lines, the last one is innermost.
    owned(blockIds, write) {
        const ids = [blockIds].flat().filter(id => null != id)
        this.#owners.push(...ids)
        try {
            write()
        } finally {
            this.#owners.length -= ids.length
        }
    }
}

// ===========================================================================
// ===========================   READ WORKSPACE   ============================
// ===========================================================================
//
//   1. Resources   Models, notepad, memory and tools: the cards the steps use.
//   2. Nodes       Gives every step its Python name, prompts, limits, model and tools.
//   3. Switches    Their condition and where each way leads.
//   4. Edges       Turns flow lines into code edges, switches into route functions.
//   5. Problems    Collects what keeps the graph from running, and hints.
//
//   Two kinds of lines: 'flow' edges become EDGES, 'use' links become arguments.
//   A switch card is no node in the code: an edge INTO it becomes a conditional edge
//   of the node before it, the edges OUT of it are the answers of its route function.
//   A problem with 'isError' blocks the start button, a hint only explains.
//

function readWorkspace(workspace) {
    const problems = []
    const addError = (text, block) => problems.push({ text, blockId: block?.id ?? null, isError: true })
    const addHint = (text, block) => problems.push({ text, blockId: block?.id ?? null, isError: false })

    const plan = workspace.plan
    const isTask = plan.fields.RUN_MODE === 'task'
    const settingsBlock = pieceOf(plan, 'SETUP', TYPES.settings)
    const flowEdges = workspace.edges.filter(edge => edge.kind !== 'use')
    const useLinks = (block, port) => workspace.edges.filter(edge => edge.kind === 'use' && edge.from === block?.id && edge.port === port)
    const useLink = (block, port) => useLinks(block, port)[0] ?? null

    // ---------------------------------------------------------------------------
    // Resources
    //   Models, notepad, memory and tools: the cards the steps use.
    // ---------------------------------------------------------------------------

    const modelBlocks = workspace.nodes.filter(node => node.type === TYPES.model)
    const models = modelBlocks.map(block => {
        const upper = toIdentifier(block.fields.NAME).toUpperCase()
        return {
            block,
            name: toIdentifier(block.fields.NAME),
            constant: `${upper}_MODEL`,
            temperature: Number(block.fields.TEMPERATURE ?? 0.7),
            // One model keeps the short name of chat.py, several get a prefix.
            temperatureConstant: modelBlocks.length === 1 ? 'TEMPERATURE' : `${upper}_TEMPERATURE`,
        }
    })
    const findModel = id => models.find(model => model.block.id === id) ?? null

    const startBlocks = workspace.nodes.filter(node => node.type === TYPES.start)

    // The notepad hangs at START: every run begins with it, then it travels from step to step.
    const start = startBlocks[0] ?? null
    const stateLink = useLink(start, 'state')
    const stateBlock = linkedCard(workspace, start, 'state')
    const loneStateCards = workspace.nodes.filter(node => node.type === TYPES.state && node !== stateBlock)

    // The memory hangs at START too: the chat remembers as soon as START hangs at a memory card.
    const memoryLinks = useLinks(start, 'memory')
    const memoryBlock = isTask ? null : linkedCard(workspace, start, 'memory')
    const loneMemoryCards = workspace.nodes.filter(node => node.type === TYPES.memory && node !== memoryBlock)

    const stateFields = (stateBlock?.slots.FIELDS ?? []).map(block => ({
        block,
        name: toIdentifier(block.fields.NAME),
        type: block.fields.TYPE,
    }))
    const hasSummaryField = stateFields.some(field => field.name === 'summary')

    // Tools: one Python function per kind, owned by every card of that kind.
    const toolCards = workspace.nodes.filter(node => node.type === TYPES.tool && null != TOOL_CODE[node.fields.TOOL])
    const toolKinds = [...new Set(toolCards.map(card => card.fields.TOOL))]
        .map(kind => ({ kind, name: TOOL_KINDS[kind].name, cardIds: toolCards.filter(card => card.fields.TOOL === kind).map(card => card.id) }))

    // Helper agents: sub-agents a workshop offers like tools, each with its own prompt and model.
    const helpers = workspace.nodes.filter(node => node.type === TYPES.helper).map(block => {
        const name = toIdentifier(block.fields.NAME)
        const modelLink = useLink(block, 'model')
        return {
            block,
            name,
            promptConstant: `${name.toUpperCase()}_HELPER_PROMPT`,
            prompt: block.fields.PROMPT ?? '',
            hint: block.fields.HINT ?? '',
            isAnswer: block.fields.SHOW === true,
            model: findModel(modelLink?.to),
            modelLinkId: modelLink?.id ?? null,
        }
    })
    const findHelper = id => helpers.find(helper => helper.block.id === id) ?? null

    // ---------------------------------------------------------------------------
    // Nodes
    //   Gives every step its Python name, prompts, limits, model and tools.
    // ---------------------------------------------------------------------------

    const workerTypes = [TYPES.agent, TYPES.summarize, TYPES.workshop]
    const workers = workspace.nodes.filter(node => workerTypes.includes(node.type))
    const agentCount = workers.filter(node => node.type === TYPES.agent).length
    const summarizeCount = workers.filter(node => node.type === TYPES.summarize).length

    const nodes = workers.map(block => {
        const name = toIdentifier(block.fields.NAME)
        const upper = name.toUpperCase()
        const kind = { [TYPES.agent]: 'llm', [TYPES.summarize]: 'summarize', [TYPES.workshop]: 'workshop' }[block.type]
        const isLlm = kind === 'llm'
        const modelLink = useLink(block, 'model')

        // One node of a kind keeps the short names of chat.py, several get a prefix.
        const isOnlyOfKind = isLlm ? agentCount === 1 : summarizeCount === 1
        const prefix = isOnlyOfKind ? '' : `${upper}_`
        // A workshop holds tools and helper agents, an agent plugs into one workshop and gets its tool list.
        const tools = kind !== 'workshop' ? [] : useLinks(block, 'tools')
            .map(link => {
                const card = toolCards.find(candidate => candidate.id === link.to) ?? null
                const helper = findHelper(link.to)
                const name = null != helper ? helper.name : null != card ? TOOL_KINDS[card.fields.TOOL].name : null
                return { link, card: card ?? helper?.block ?? null, helper, name }
            })
            .filter(tool => null != tool.name)
        const workshopLink = isLlm ? useLink(block, 'workshop') : null

        return {
            block,
            name,
            constant: `${upper}_NODE`,
            kind,
            prompt: block.fields.PROMPT ?? '',
            promptConstant: isLlm ? `${prefix}SYSTEM_PROMPT` : `${prefix}SUMMARY_PROMPT`,
            useSummary: isLlm && block.fields.USE_SUMMARY === true,
            isAnswer: isLlm && block.fields.SHOW === true,
            keepLast: kind === 'summarize' ? Number(block.fields.KEEP_LAST) : null,
            keepLastConstant: kind === 'summarize' ? `${prefix}KEEP_LAST` : null,
            model: findModel(modelLink?.to),
            modelLinkId: modelLink?.id ?? null,
            isMultiAgent: agentCount > 1,
            tools,
            toolboxConstant: kind === 'workshop' ? `${upper}_TOOLS` : null,
            workshopLinkId: workshopLink?.id ?? null,
            workshopId: workshopLink?.to ?? null,
        }
    })
    const findNode = id => nodes.find(node => node.block.id === id) ?? null
    // An agent knows the toolbox of the workshop it plugs into.
    for (const node of nodes) node.workshop = findNode(node.workshopId)
    const workshops = nodes.filter(node => node.kind === 'workshop')
    const hasTools = workshops.length > 0
    const isMultiAgent = agentCount > 1

    const startIds = new Set(startBlocks.map(node => node.id))
    const endIds = new Set(workspace.nodes.filter(node => node.type === TYPES.end).map(node => node.id))

    // ---------------------------------------------------------------------------
    // Switches
    //   Their condition and where each way leads.
    // ---------------------------------------------------------------------------

    const routerBlocks = workspace.nodes.filter(node => node.type === TYPES.router)
    const outgoing = (id, port) => flowEdges.find(edge => edge.from === id && edge.port === port) ?? null
    const lengthRouterCount = routerBlocks.filter(block => block.slots.CONDITION?.[0]?.type === TYPES.conditionLength).length

    const routers = routerBlocks.map(block => {
        const name = toIdentifier(block.fields.NAME)
        const upper = name.toUpperCase()
        const condition = block.slots.CONDITION?.[0] ?? null
        const conditionKind = {
            [TYPES.conditionLength]: 'length',
            [TYPES.conditionContains]: 'contains',
            [TYPES.conditionTools]: 'tools',
            [TYPES.conditionModel]: 'model',
        }[condition?.type] ?? null
        const modelLink = useLink(block, 'model')

        // Every way out: a port of the card, the edge that leaves it, the card it leads to.
        const branches = routerBranches(block).map(branch => {
            const edge = outgoing(block.id, branch.port)
            return { ...branch, target: edge?.to ?? null, edgeId: edge?.id ?? null, word: toIdentifier(branch.label) }
        })
        const options = branches.map(branch => `- ${branch.word}: ${branch.option?.fields.HINT ?? ''}`).join('\n')

        return {
            block,
            name,
            routeName: `route_${name}`,
            condition,
            conditionKind,
            branches,
            max: Number(condition?.fields.MAX ?? 0),
            maxConstant: lengthRouterCount === 1 ? 'MAX_HISTORY' : `${upper}_MAX_HISTORY`,
            word: String(condition?.fields.WORD ?? ''),
            model: findModel(modelLink?.to),
            modelLinkId: modelLink?.id ?? null,
            promptConstant: `${upper}_PROMPT`,
            prompt: 'Ordne die letzte Nachricht genau einem dieser Wege zu. '
                + `Antworte nur mit dem Namen des Weges, sonst nichts.\n${options}`,
        }
    })
    const findRouter = id => routers.find(router => router.block.id === id) ?? null

    // ---------------------------------------------------------------------------
    // Edges
    //   Turns flow lines into code edges, switches into route functions.
    // ---------------------------------------------------------------------------

    // Code edges start at START or at a worker, an edge into a switch makes them conditional.
    const edges = flowEdges
        .filter(edge => null == findRouter(edge.from))
        .map(edge => {
            const router = findRouter(edge.to)
            return null == router
                ? { id: edge.id, from: edge.from, to: edge.to, isConditional: false }
                : { id: edge.id, from: edge.from, router, isConditional: true }
        })

    const ref = id => {
        if (startIds.has(id)) return 'START'
        if (endIds.has(id)) return 'END'
        return findNode(id)?.constant ?? 'None'
    }
    const label = id => {
        if (startIds.has(id)) return 'START'
        if (endIds.has(id)) return 'END'
        return findNode(id)?.name ?? findRouter(id)?.name ?? '?'
    }

    // ---------------------------------------------------------------------------
    // Problems
    //   Collects what keeps the graph from running, and hints.
    // ---------------------------------------------------------------------------

    if (startBlocks.length !== 1) addError(t('problem.start.count'), startBlocks[1] ?? plan)
    if (endIds.size === 0) addError(t('problem.end.missing'), plan)
    if (null != start && null == stateBlock) addHint(t('hint.state.missing'), start)
    for (const card of loneStateCards) addHint(t('hint.state.lone'), card)
    if (!isTask && memoryLinks.length === 0) addHint(t('hint.memory.missing'), start ?? plan)
    if (!isTask) for (const card of loneMemoryCards) addHint(t('hint.memory.lone'), card)
    if (!nodes.some(node => node.isAnswer)) addHint(t('hint.answer.none'), plan)

    // Names: Python functions and constants must be unique and must not hide built-in names.
    const seenNames = new Set()
    for (const item of [...nodes, ...routers, ...helpers]) {
        const name = item.routeName ?? item.name
        if (seenNames.has(name)) addError(t('problem.name.duplicate', { name: item.name }), item.block)
        if (RESERVED_NAMES.has(name)) addError(t('problem.name.reserved', { name: item.name }), item.block)
        seenNames.add(name)
    }
    const seenModels = new Set()
    for (const model of models) {
        if (seenModels.has(model.name)) addError(t('problem.model.duplicate', { name: model.name }), model.block)
        seenModels.add(model.name)
    }

    // Helper agents: a model to ask, and a workshop that offers them.
    for (const helper of helpers) {
        if (null == helper.model) addError(t('problem.helper.model', { name: helper.name }), helper.block)
        if (!workshops.some(workshop => workshop.tools.some(tool => tool.helper === helper))) addHint(t('hint.helper.lone', { name: helper.name }), helper.block)
    }

    // Nodes: a model to ask, a way in and a way out.
    for (const node of nodes) {
        if (node.kind !== 'workshop' && null == node.model) {
            addError(t('problem.model.missing', { name: node.name }), node.block)
        }
        if (node.kind === 'summarize' && !hasSummaryField) {
            addError(t('problem.summary.field'), node.block)
        }
        if (node.useSummary && !hasSummaryField) {
            addHint('Auf dem Notizzettel fehlt das Feld "summary", die Zusammenfassung bleibt leer.', node.block)
        }
        if (!flowEdges.some(edge => edge.to === node.block.id)) addHint(t('hint.node.unreachable', { name: node.name }), node.block)
        if (null == outgoing(node.block.id, 'out')) addError(`Von "${node.name}" geht keine Kante weg, auch nicht zu END.`, node.block)
    }
    for (const workshop of workshops) {
        if (workshop.tools.length === 0) addHint(t('hint.workshop.empty', { name: workshop.name }), workshop.block)
        if (!nodes.some(node => node.workshop === workshop)) {
            addHint(t('hint.workshop.unplugged', { name: workshop.name }), workshop.block)
        }
    }
    for (const card of toolCards.filter(card => !workshops.some(workshop => workshop.tools.some(tool => tool.card === card)))) {
        addHint(t('hint.tool.lone'), card)
    }
    for (const startBlock of startBlocks) {
        if (null == outgoing(startBlock.id, 'out')) addError(t('problem.start.edge'), startBlock)
    }
    for (const model of models) {
        if (!workspace.edges.some(edge => edge.kind === 'use' && edge.to === model.block.id)) {
            addHint(`Das Modell "${model.name}" nutzt noch niemand.`, model.block)
        }
    }

    // Switches: a condition, every way connected, and only after a node.
    for (const router of routers) {
        if (null == router.conditionKind) addError(`Die Weiche "${router.name}" braucht eine Bedingung aus den Puzzleteilen.`, router.block)
        if (router.conditionKind === 'model' && null == router.model) {
            addError(t('problem.router.model', { name: router.name }), router.block)
        }
        if (router.conditionKind === 'model' && router.branches.length < 2) {
            addError(t('problem.router.ways', { name: router.name }), router.block)
        }
        if (router.conditionKind === 'contains' && router.word.trim() === '') {
            addError(`Bei der Weiche "${router.name}" fehlt das Wort, nach dem sie sucht.`, router.condition)
        }
        for (const branch of router.branches) {
            if (null == branch.target) addError(t('problem.router.target', { name: router.name, way: branch.label }), router.block)
            if (null != findRouter(branch.target)) {
                addError(t('problem.router.chain'), router.block)
            }
        }
        if (!flowEdges.some(edge => edge.to === router.block.id)) addHint(t('hint.router.unreachable', { name: router.name }), router.block)
    }
    const edgeIntoStart = flowEdges.find(edge => startIds.has(edge.to))
    if (null != edgeIntoStart) addError(t('problem.start.incoming'), edgeIntoStart)

    // The plan owns what belongs to the whole graph (the wiring and run_graph),
    // also the chat code, the first model the shared model code.
    return {
        plan,
        isTask,
        maxSteps: Number(plan.fields.MAX_STEPS ?? 25),
        graphBlock: plan,
        loopBlock: plan,
        settingsBlock,
        llmBlock: models[0]?.block ?? null,
        models,
        stateBlock,
        stateLinkId: stateLink?.id ?? null,
        memoryBlock,
        memoryLinkIds: memoryLinks.map(edge => edge.id),
        stateFields,
        toolKinds,
        helpers,
        workshops,
        hasTools,
        isMultiAgent,
        nodes,
        routers,
        edges,
        ref,
        label,
        problems,
    }
}

// ===========================================================================
// ============================   WRITE PYTHON   =============================
// ===========================================================================
//
//   1. Header       Usage, table of contents, imports and constants.
//   2. Helpers      load_env_file and read_env_number, only with settings from '.env'.
//   3. Settings     The values of the graph, from '.env' or fixed.
//   4. Model        ask_model: one HTTP call, the answer streamed piece by piece.
//   5. Tools        The tool functions and their descriptions for the model.
//   6. Graph        State, nodes, edges as plain data and the engine run_graph.
//   7. Run          Chat (memory, stream_answer, main) or task (run_task, main).
//   8. Generate     Reads the workspace and writes all chapters in order.
//
//   Each step is one function below, all share the writer and the model.
//

function collectSettings(model) {
    const settings = []
    const add = setting => settings.push(setting)

    if (null != model.llmBlock) {
        add({ blockId: model.llmBlock.id, constant: 'MODEL', env: 'LLM_MODEL', kind: 'text', value: BUILTIN_MODEL })
        add({ blockId: model.llmBlock.id, constant: 'BASE_URL', env: 'LLM_BASE_URL', kind: 'text', value: BUILTIN_BASE_URL })
    }
    for (const llm of model.models) {
        add({ blockId: llm.block.id, constant: llm.temperatureConstant, kind: 'float', value: llm.temperature })
    }
    for (const router of model.routers.filter(router => router.conditionKind === 'length')) {
        add({ blockId: router.condition.id, constant: router.maxConstant, kind: 'int', value: router.max })
    }
    for (const node of model.nodes.filter(node => node.kind === 'summarize')) {
        add({ blockId: node.block.id, constant: node.keepLastConstant, kind: 'int', value: node.keepLast })
    }
    for (const node of model.nodes.filter(node => node.kind !== 'workshop')) {
        add({ blockId: node.block.id, constant: node.promptConstant, kind: 'text', value: node.prompt })
    }
    for (const helper of model.helpers) {
        add({ blockId: helper.block.id, constant: helper.promptConstant, kind: 'text', value: helper.prompt })
    }
    for (const router of model.routers.filter(router => router.conditionKind === 'model')) {
        add({ blockId: router.condition.id, constant: router.promptConstant, kind: 'text', value: router.prompt })
    }

    return settings
}

// ---------------------------------------------------------------------------
// Header
//   Usage, table of contents, imports and constants.
// ---------------------------------------------------------------------------

function writeHeader(writer, model, chapters) {
    const hasSettings = null != model.settingsBlock
    const hasLlm = null != model.llmBlock

    // Usage and prerequisites
    writer.many([
        '# NOTE:',
        model.isTask
            ? '#   Runs one task through a graph built with Graphlings and prints the result.'
            : '#   Interactive terminal chat, built as a graph with Graphlings.',
        '#   Plain Python, standard library only: the graph engine and the model call',
        '#   are part of this file, nothing is hidden in a framework.',
        '#   Requires: Python 3.11+ and an OpenAI compatible model server',
        `#             (the built-in one of Graphlings listens on ${BUILTIN_BASE_URL}).`,
        '#',
        model.isTask ? `#   python graph.py "${t('python.usage.task')}"` : '#   python chat.py',
    ])
    if (hasSettings) writer.many(['#', "#   Settings come from '.env' or environment variables."])
    writer.line()

    // Table of contents
    writer.many(['#', '#   Chapters:'])
    writer.many(alignColumns(chapters, '#     '))
    writer.many(['#', ''])

    // Imports, standard library only, sorted like isort: plain imports, then from-imports.
    const toolImports = model.toolKinds.flatMap(tool => TOOL_CODE[tool.kind].imports)
    const plain = new Set(toolImports.filter(line => line.startsWith('import ')))
    const from = new Set(toolImports.filter(line => line.startsWith('from ')))
    if (hasLlm || model.isTask || model.hasTools) plain.add('import json')
    plain.add('import logging')
    if (hasSettings) plain.add('import os')
    plain.add('import sys')
    plain.add('import urllib.error')
    if (hasLlm) plain.add('import urllib.request')
    if (!model.isTask) plain.add('import uuid')
    if (hasLlm) from.add('from collections.abc import Callable')
    if (hasSettings) from.add('from pathlib import Path')
    writer.many([...plain].sort())
    writer.many([...from].sort())
    writer.line()

    // Constants
    if (!model.isTask) {
        writer.owned(model.loopBlock.id, () => writer.many([
            'EXIT_COMMANDS = ("exit", "quit")',
            'RESET_COMMAND = "/reset"',
        ]))
    }
    if (hasLlm) {
        writer.owned(model.llmBlock.id, () => writer.many([
            'REQUEST_TIMEOUT_S = 120',
            '# Stops a model that talks itself into an endless answer.',
            'MAX_ANSWER_TOKENS = 800',
        ]))
    }
    writer.owned(model.graphBlock.id, () => writer.many([
        '',
        '# START and END are no nodes, only the entry and the exit of the graph.',
        'START = "__start__"',
        'END = "__end__"',
        '# Stops a graph that loops forever, e.g. an agent loop that never finishes.',
        `MAX_STEPS = ${Math.max(2, Math.trunc(model.maxSteps))}`,
    ]))
    for (const node of model.nodes) {
        writer.owned(node.block.id, () => writer.line(`${node.constant} = ${pyString(node.name)}`))
    }
    writer.many(['', 'logger = logging.getLogger("graph")', '', ''])
}

// ---------------------------------------------------------------------------
// Helpers
//   load_env_file and read_env_number, only with settings from '.env'.
// ---------------------------------------------------------------------------

function writeHelpers(writer, model) {
    writer.owned(model.settingsBlock.id, () => {
        writer.many(chapterBanner('HELPERS'))
        writer.many([
            '#',
            "#   load_env_file     Puts the KEY=VALUE lines of '.env' into the environment.",
            '#   read_env_number   Reads a number from the environment, with a default.',
            '#',
            '',
            '',
            'def load_env_file(path: str = ".env") -> None:',
            '    """',
            "    Puts the KEY=VALUE lines of '.env' into the environment.",
            '    Variables that are already set win, empty lines and # comments are skipped.',
            '',
            "    :param path: (Optional) The file to read. Default is '.env'.",
            '    """',
            '    env_file = Path(path)',
            '    if not env_file.exists():',
            '        return',
            '',
            '    for line in env_file.read_text(encoding="utf-8").splitlines():',
            '        line = line.strip()',
            '        if not line or line.startswith("#") or "=" not in line:',
            '            continue',
            '        key, value = line.split("=", 1)',
            '        os.environ.setdefault(key.strip(), value.strip().strip(\'"\'))',
            '',
            '',
            'def read_env_number(name: str, default: str, cast: type) -> int | float:',
            '    """',
            '    Reads a number from the environment.',
            '',
            '    :param name:    (Required) Name of the environment variable.',
            '    :param default: (Required) Value used when the variable is not set.',
            "    :param cast:    (Required) Target type, 'int' or 'float'.",
            "    :returns:       The value converted to 'cast'.",
            '    :raises ValueError: When the value is no valid number of that type.',
            '',
            '    Example:',
            '        read_env_number("TEMPERATURE", "0.7", float)  # -> 0.7',
            '    """',
            '    raw_value = os.getenv(name, default)',
            '    try:',
            '        return cast(raw_value)',
            '    except ValueError:',
            '        raise ValueError(',
            '            f"{name} must be a valid {cast.__name__}, got \'{raw_value}\'."',
            '        ) from None',
            '',
            '',
        ])
    })
}

// ---------------------------------------------------------------------------
// Settings
//   The values of the graph, from '.env' or fixed.
// ---------------------------------------------------------------------------

function writeSettingFromEnv(writer, setting) {
    const env = setting.env ?? setting.constant

    if (setting.kind !== 'text') {
        const cast = setting.kind === 'float' ? 'float' : 'int'
        const literal = pyNumber(setting.value, setting.kind === 'float')
        return writer.line(`${setting.constant} = read_env_number("${env}", "${literal}", ${cast})`)
    }

    const single = `${setting.constant} = os.getenv("${env}", ${pyString(setting.value)})`
    if (single.length <= LINE_WIDTH) return writer.line(single)

    writer.line(`${setting.constant} = os.getenv(`)
    writer.line(`    "${env}",`)
    const parts = pyStringParts(setting.value, 4)
    parts.forEach((part, index) => writer.line(`    ${part}${index === parts.length - 1 ? ',' : ''}`))
    writer.line(')')
}

function writeSettingFixed(writer, setting) {
    if (setting.kind !== 'text') {
        return writer.line(`${setting.constant} = ${pyNumber(setting.value, setting.kind === 'float')}`)
    }

    const single = `${setting.constant} = ${pyString(setting.value)}`
    if (single.length <= LINE_WIDTH) return writer.line(single)

    writer.line(`${setting.constant} = (`)
    pyStringParts(setting.value, 4).forEach(part => writer.line(`    ${part}`))
    writer.line(')')
}

function writeValidations(writer, model) {
    const checks = []
    const check = (blockId, condition, message) => checks.push({ blockId, condition, message })

    check(model.settingsBlock.id, 'LOG_LEVEL not in logging.getLevelNamesMapping()', [
        'f"LOG_LEVEL must be a logging level like DEBUG or WARNING, got \'{LOG_LEVEL}\'."',
    ])
    if (null != model.llmBlock) check(model.llmBlock.id, 'not MODEL.strip()', ['"LLM_MODEL must name a model."'])
    for (const llm of model.models) {
        const name = llm.temperatureConstant
        check(llm.block.id, `not 0 <= ${name} <= 2`, [`f"${name} must be between 0 and 2, got '{${name}}'."`])
    }
    for (const router of model.routers.filter(router => router.conditionKind === 'length')) {
        const name = router.maxConstant
        check(router.condition.id, `${name} < 0`, [
            `f"${name} must be 0 (never) or greater, got '{${name}}'."`,
        ])
    }
    for (const node of model.nodes.filter(node => node.kind === 'summarize')) {
        const name = node.keepLastConstant
        const router = model.routers.find(router => router.conditionKind === 'length'
            && router.branches.some(branch => branch.port === 'then' && branch.target === node.block.id))

        // Kept messages must stay below the limit, else every answer triggers a summary.
        if (null == router) {
            check(node.block.id, `${name} < 0`, [`f"${name} must be 0 or greater, got '{${name}}'."`])
            continue
        }
        const max = router.maxConstant
        check(node.block.id, `${max} > 0 and not 0 <= ${name} < ${max}`, [
            `f"${name} must be between 0 and ${max} - 1 ({${max} - 1}), "`,
            `f"got '{${name}}'."`,
        ])
    }

    for (const { blockId, condition, message } of checks) {
        writer.owned(blockId, () => {
            writer.line(`if ${condition}:`)
            const single = `    raise ValueError(${message.join(' ')})`
            if (message.length === 1 && single.length <= LINE_WIDTH) return writer.line(single)
            writer.line('    raise ValueError(')
            message.forEach(part => writer.line(`        ${part}`))
            writer.line('    )')
        })
    }
    writer.line()
    writer.line('logging.basicConfig(level=LOG_LEVEL, format="%(levelname)s %(message)s")')
}

function writeSettings(writer, model) {
    const settings = collectSettings(model)
    writer.many(chapterBanner('SETTINGS'))

    // Fixed values
    if (null == model.settingsBlock) {
        writer.many([
            '#',
            '#   1. Values   The fixed values of the graph.',
            '#',
            '',
            ...sectionBanner('Values', 'The fixed values of the graph.'),
            '',
        ])
        settings.forEach(setting => writer.owned(setting.blockId, () => writeSettingFixed(writer, setting)))
        return writer.many(['', ''])
    }

    // Values from '.env'
    writer.owned(model.settingsBlock.id, () => {
        writer.many([
            '#',
            "#   1. Load          Reads '.env' and the environment, with defaults.",
            '#   2. Validations   Fails early on values the graph cannot work with.',
            '#',
            '',
            ...sectionBanner('Load', "Reads '.env' and the environment, with defaults."),
            '',
            'load_env_file()',
            '',
            'LOG_LEVEL = os.getenv("LOG_LEVEL", "WARNING").upper()',
        ])
        settings.forEach(setting => writer.owned(setting.blockId, () => writeSettingFromEnv(writer, setting)))
        writer.line()
        writer.many(sectionBanner('Validations', 'Fails early on values the graph cannot work with.'))
        writer.line()
        writeValidations(writer, model)
        writer.many(['', ''])
    })
}

// ---------------------------------------------------------------------------
// Model
//   ask_model: one HTTP call, the answer streamed piece by piece.
// ---------------------------------------------------------------------------

function writeModel(writer, model) {
    const example = model.models[0]?.constant ?? 'MODEL'
    const units = [
        ...model.models.map(llm => [llm.constant, 'A model: which one and how creative. No state.']),
        ['ask_model', 'Sends messages to a model, returns its answer as a message.'],
        ['show_token', 'Prints one piece of an answer right away.'],
    ]

    writer.owned(model.llmBlock.id, () => {
        writer.many([
            ...chapterBanner('TALK TO MODEL'),
            '#',
            ...alignColumns(units, '#   '),
            '#',
            '#   A message is a dict with a role and a content:',
            '#',
            '#       {"role": "system",    "content": "Du bist ein hilfreicher Assistent."}',
            '#       {"role": "user",      "content": "Was ist ein Graph?"}',
            '#       {"role": "assistant", "content": "Ein Graph besteht aus Knoten und Kanten."}',
            '#',
            '#   A model has no memory of its own. It sees only the messages of this one call,',
            '#   so every call sends the whole conversation again.',
            '#',
            '',
            '# The models: just which one to ask and how creative it may be.',
        ])
        for (const llm of model.models) {
            writer.owned(llm.block.id, () => writer.line(`${llm.constant} = {"model": MODEL, "temperature": ${llm.temperatureConstant}}`))
        }
        writer.many([
            '',
            '',
            'def ask_model(',
            '    model: dict,',
            '    messages: list[dict],',
            '    on_token: Callable[[str], None] | None = None,',
        ])
        if (model.hasTools) writer.line('    tools: list[dict] | None = None,')
        writer.many([
            ') -> dict:',
            '    """',
            '    Sends the messages to a model and returns its answer as a message.',
            '    The server streams the answer in pieces (server-sent events),',
            '    on_token sees every piece the moment it arrives.',
        ])
        if (model.hasTools) {
            writer.many([
                '    With tools the model may answer with tool_calls instead of text,',
                '    that answer comes in one piece.',
            ])
        }
        writer.many([
            '',
            `    :param model:    (Required) Which model and how creative, e.g. ${example}.`,
            '    :param messages: (Required) The conversation so far, oldest first.',
            '    :param on_token: (Optional) Called with every piece of the answer.',
        ])
        if (model.hasTools) writer.line('    :param tools:    (Optional) Descriptions of the tools the model may call.')
        writer.many([
            '    :returns:        The answer as {"role": "assistant", "content": ...}.',
            '    :raises urllib.error.URLError: When the model server is not reachable.',
            '',
            '    Example:',
            `        ask_model(${example}, [{"role": "user", "content": "Hallo!"}], on_token=show_token)`,
            '    """',
        ])
        if (model.hasTools) {
            writer.many([
                '    body = {**model, "messages": messages, "max_tokens": MAX_ANSWER_TOKENS, "stream": not tools}',
                '    if tools:',
                '        body["tools"] = tools',
            ])
        } else {
            writer.many([
                '    body = {',
                '        **model,',
                '        "messages": messages,',
                '        "max_tokens": MAX_ANSWER_TOKENS,',
                '        "stream": True,',
                '    }',
            ])
        }
        writer.many([
            '    request = urllib.request.Request(',
            '        f"{BASE_URL}/chat/completions",',
            '        data=json.dumps(body).encode("utf-8"),',
            '        headers={"Content-Type": "application/json"},',
            '    )',
            '',
        ])
        if (model.hasTools) {
            writer.many([
                '    # With tools: one answer, either text or a request to call tools.',
                '    if tools:',
                '        with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_S) as response:',
                '            message = json.loads(response.read())["choices"][0]["message"]',
                '        answer = {"role": "assistant", "content": message.get("content") or ""}',
                '        if message.get("tool_calls"):',
                '            answer["tool_calls"] = message["tool_calls"]',
                '        if on_token and answer["content"]:',
                '            on_token(answer["content"])',
                '        return answer',
                '',
            ])
        }
        writer.many([
            '    content = ""',
            '    with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_S) as response:',
            '        # Every piece is one line \'data: {...}\', the last one is \'data: [DONE]\'.',
            '        for raw_line in response:',
            '            line = raw_line.decode("utf-8").strip()',
            '            if not line.startswith("data: ") or line == "data: [DONE]":',
            '                continue',
            '',
            '            choices = json.loads(line.removeprefix("data: ")).get("choices") or []',
            '            if not choices:',
            '                continue',
            '            piece = choices[0]["delta"].get("content") or ""',
            '            content += piece',
            '            if on_token and piece:',
            '                on_token(piece)',
            '',
            '    return {"role": "assistant", "content": content}',
            '',
            '',
        ])
        if (model.isMultiAgent) {
            writer.many([
                'def as_seen_by(agent: str, messages: list[dict]) -> list[dict]:',
                '    """',
                '    The conversation from the view of one agent: its own answers stay "assistant",',
                '    the answers of other agents come in as "user", like a colleague talking to it.',
                '    A model only knows itself and a user, it cannot tell agents apart otherwise.',
                '',
                '    :param agent:    (Required) The name of the agent that asks its model.',
                '    :param messages: (Required) The messages of the notepad.',
                '    :returns:        The same messages, the ones of other agents as "user" with their name.',
                '    """',
                '    return [',
                '        {"role": "user", "content": f"[{message[\'name\']}] {message[\'content\']}"}',
                '        if message["role"] == "assistant" and message.get("name", agent) != agent',
                '        else message',
                '        for message in messages',
                '    ]',
                '',
                '',
            ])
        }
        writer.many([
            'def show_token(token: str) -> None:',
            '    """',
            '    Prints one piece of an answer right away, so it appears while it is generated.',
            '',
            '    :param token: (Required) The piece of text.',
            '    """',
            '    print(token, end="", flush=True)',
            '',
            '',
        ])
    })
}

// ---------------------------------------------------------------------------
// Tools
//   The tool functions and their descriptions for the model.
// ---------------------------------------------------------------------------

function writeTools(writer, model) {
    const units = [
        ...model.toolKinds.map(tool => [tool.name, TOOL_CODE[tool.kind].summary]),
        ...model.helpers.map(helper => [helper.name, 'Helper agent: a sub-agent with its own notepad, used like a tool.']),
        ['TOOL_SCHEMAS', 'Name to description for the model: what it does, which arguments.'],
        ...model.workshops.map(workshop => [workshop.toolboxConstant, `The toolbox of the workshop "${workshop.name}".`]),
        ['list_tools', 'Like tools/list in MCP: the descriptions of a toolbox.'],
        ['call_tool', 'Like tools/call in MCP: runs one tool of a toolbox.'],
    ]

    writer.many([
        ...chapterBanner('USE TOOLS'),
        '#',
        ...alignColumns(units, '#   '),
        '#',
        '#   A tool is a plain function. The model only gets its description and answers',
        '#   with tool_calls: which tool, which arguments. The workshop node runs them.',
        '#',
        '#   A workshop is built like an MCP server (Model Context Protocol):',
        '#',
        '#       agent    --list_tools()-->  workshop   "what can you do?"  -> descriptions',
        '#       model    --tool_calls---->  agent      "please run calculator(17 * 23)"',
        '#       workshop --call_tool()--->  tool       runs it, the result goes on the notepad',
        '#',
        '#   With MCP the workshop would be its own program, reached over a pipe or HTTP.',
        '#   Here it is a dict in the same file, the two steps are the same.',
        '#',
    ])
    if (model.helpers.length > 0) {
        writer.many([
            '#   A helper agent is a tool that is itself an agent ("agents as tools"): it gets a task,',
            '#   asks its own model with its own prompt on a fresh, empty notepad and returns only',
            '#   its answer. It never sees the conversation of the agent that called it.',
            '#',
        ])
    }
    writer.many(['', ''])
    for (const tool of model.toolKinds) {
        writer.owned(tool.cardIds, () => writer.many([...TOOL_CODE[tool.kind].lines, '', '']))
    }
    for (const helper of model.helpers) {
        writer.owned(helper.block.id, () => writeHelperAgent(writer, helper))
    }

    writer.line('TOOL_SCHEMAS = {')
    for (const tool of model.toolKinds) {
        const schema = TOOL_CODE[tool.kind].schema
        writer.owned(tool.cardIds, () => writer.many([
            `    "${tool.name}": {`,
            '        "type": "function",',
            '        "function": {',
            `            "name": "${tool.name}",`,
            `            "description": ${pyString(schema.description)},`,
            '            "parameters": {',
            '                "type": "object",',
            `                "properties": ${pyValue(schema.properties)},`,
            `                "required": ${pyValue(schema.required)},`,
            '            },',
            '        },',
            '    },',
        ]))
    }
    for (const helper of model.helpers) {
        writer.owned(helper.block.id, () => writer.many([
            `    "${helper.name}": {`,
            '        "type": "function",',
            '        "function": {',
            `            "name": "${helper.name}",`,
            `            "description": ${pyString(helper.hint)},`,
            '            "parameters": {',
            '                "type": "object",',
            '                "properties": {"task": {"type": "string", "description": "The task for the helper, complete in itself."}},',
            '                "required": ["task"],',
            '            },',
            '        },',
            '    },',
        ]))
    }
    writer.many(['}', ''])

    // One toolbox per workshop: the tools and helper agents that hang at it.
    for (const workshop of model.workshops) {
        writer.owned(workshop.block.id, () => {
            writer.line(`# The workshop "${workshop.name}": its tools, name to function.`)
            writer.line(`${workshop.toolboxConstant} = {`)
            for (const tool of workshop.tools) {
                writer.owned([tool.link.id, tool.card.id], () => writer.line(`    "${tool.name}": ${tool.name},`))
            }
            writer.many(['}', ''])
        })
    }
    writer.many([
        '',
        'def list_tools(toolbox: dict) -> list[dict]:',
        '    """',
        '    Like tools/list in MCP: tells an agent what a workshop can do.',
        '    The agent hands these descriptions to its model, the functions stay here.',
        '',
        '    :param toolbox: (Required) The tools of one workshop, name to function.',
        '    :returns:       One description per tool, in the format the model expects.',
        '    """',
        '    return [TOOL_SCHEMAS[name] for name in toolbox]',
        '',
        '',
        'def call_tool(toolbox: dict, name: str, arguments: dict) -> str:',
        '    """',
        '    Like tools/call in MCP: runs one tool of a workshop with the arguments of the model.',
        '',
        '    :param toolbox:   (Required) The tools of one workshop, name to function.',
        '    :param name:      (Required) Which tool the model asked for.',
        '    :param arguments: (Required) The arguments the model chose.',
        '    :returns:         The result as text, or a German error text the model can read.',
        '    """',
        '    if name not in toolbox:',
        '        return f"Das Werkzeug {name} gibt es in dieser Werkstatt nicht."',
        '    try:',
        '        return str(toolbox[name](**arguments))',
        '    except (TypeError, ValueError) as error:',
        '        # A wrong call goes back to the model as text, it can try again.',
        '        return f"Fehler bei {name}: {error}"',
        '',
        '',
    ])
}

function writeHelperAgent(writer, helper) {
    writer.many([
        `def ${helper.name}(task: str) -> str:`,
        '    """',
        '    Helper agent: an agent used like a tool. It works on its own, empty notepad:',
        '    it sees only the task, not the conversation, and hands back only its answer.',
        '',
        '    :param task: (Required) The task the calling agent delegates, complete in itself.',
        '    :returns:    The answer of the helper agent.',
        '    """',
        `    logger.debug(f"[${helper.name}] Task: {task}")`,
        '    answer = ask_model(',
    ])
    // The model line belongs to the use link: a click on the dotted line marks it.
    writer.owned(helper.modelLinkId, () => writer.line(`        ${helper.model?.constant ?? 'None'},`))
    writer.line(`        [{"role": "system", "content": ${helper.promptConstant}}, {"role": "user", "content": task}],`)
    if (helper.isAnswer) writer.line('        on_token=show_token,')
    writer.many([
        '    )',
        '    return answer["content"]',
        '',
        '',
    ])
}

// ---------------------------------------------------------------------------
// Graph
//   State, nodes, edges as plain data and the engine run_graph.
// ---------------------------------------------------------------------------

function writeGraphIntro(writer, model) {
    const nodeTexts = {
        llm: 'Node: an agent, asks its model.',
        summarize: 'Node: compacts old messages into the summary.',
        workshop: 'Node: runs the tools the model asked for.',
    }
    const units = [['new_state', 'The notepad of a new run.']]
    for (const node of model.nodes) units.push([node.name, nodeTexts[node.kind]])
    for (const router of model.routers) units.push([router.routeName, `Edge: the switch "${router.name}" picks the next node.`])
    units.push(['NODES, EDGES', 'The graph as plain data: names to functions and next steps.'])
    units.push(['run_graph', 'The engine: runs node after node until END.'])

    writer.many(chapterBanner('BUILD GRAPH'))
    writer.line('#')
    writer.many(alignColumns(units, '#   '))
    writer.many([
        '#',
        '#   A graph is three things:',
        '#       state   one dict that travels from node to node',
        '#       nodes   functions that read the state and return only what they change',
        '#       edges   where to go after each node, fixed or decided by a function',
        '#',
        '#   The edges of this graph:',
        '#',
    ])

    for (const edge of model.edges) {
        writer.owned(edge.id, () => {
            const from = model.label(edge.from)
            if (!edge.isConditional) return writer.line(`#       ${from} -> ${model.label(edge.to)}`)
            const rows = edge.router.branches.map(branch => [model.label(branch.target), `(${branch.label})`])
            alignColumns(rows, `#       ${from} -> `).forEach((line, index) => {
                writer.owned(edge.router.branches[index].edgeId, () => writer.line(line))
            })
        })
    }
    writer.many(['#', '', ''])
}

function writeNewState(writer, model) {
    writer.owned([model.stateLinkId, model.stateBlock?.id], () => {
        writer.many([
            'def new_state() -> dict:',
            '    """',
            '    The notepad of a new run: the messages plus the extra fields.',
            '    Every node reads it and returns only the keys it changes.',
            '',
            '    :returns: A fresh state dict.',
            '    """',
            '    return {',
            '        "messages": [],',
        ])
        for (const field of model.stateFields) {
            writer.owned(field.block.id, () => {
                writer.line(`        ${pyString(field.name)}: ${FIELD_DEFAULTS[field.type] ?? 'None'},`)
            })
        }
        writer.many(['    }', '', ''])
    })
}

function writeLlmNode(writer, node) {
    const what = node.useSummary ? 'the system prompt, summary and history' : 'the system prompt and history'

    writer.many([
        `def ${node.name}(state: dict) -> dict:`,
        '    """',
        `    Node: an agent, answers with ${what}.`,
    ])
    if (null != node.workshop) writer.line(`    Its model may call the tools of "${node.workshop.name}" instead of answering.`)
    if (node.isAnswer) writer.line('    Its answer is shown live.')
    writer.many([
        '',
        '    :param state: (Required) The current state.',
        "    :returns:     The changed 'messages', with the answer appended.",
        '    """',
    ])

    let systemPrompt = node.promptConstant
    if (node.useSummary) {
        writer.many([
            `    system_prompt = ${node.promptConstant}`,
            '    if state.get("summary"):',
            `        system_prompt += f"\\n\\n${t('python.summary.context')}\\n{state['summary']}"`,
            '',
        ])
        systemPrompt = 'system_prompt'
    }

    // The model line belongs to the use link: a click on the dotted line marks it.
    writer.line('    answer = ask_model(')
    writer.owned(node.modelLinkId, () => writer.line(`        ${node.model?.constant ?? 'None'},`))
    const history = node.isMultiAgent ? `*as_seen_by(${node.constant}, state["messages"])` : '*state["messages"]'
    writer.line(`        [{"role": "system", "content": ${systemPrompt}}, ${history}],`)
    if (node.isAnswer) writer.line('        on_token=show_token,')
    // The plug into the workshop: a click on the dotted line marks this line.
    if (null != node.workshop) {
        writer.owned(node.workshopLinkId, () => writer.line(`        tools=list_tools(${node.workshop.toolboxConstant}),`))
    }
    writer.many([
        '    )',
        // Several agents: every answer carries the name of its agent, see as_seen_by().
        node.isMultiAgent
            ? '    return {"messages": [*state["messages"], {**answer, "name": ' + node.constant + '}]}'
            : '    return {"messages": [*state["messages"], answer]}',
        '',
        '',
    ])
}

function writeSummarizeNode(writer, node) {
    const keep = node.keepLastConstant

    writer.many([
        `def ${node.name}(state: dict) -> dict:`,
        '    """',
        `    Node: folds all messages except the last ${keep} into the summary.`,
        '    An existing summary is extended, so nothing compacted earlier is lost.',
        '',
        '    :param state: (Required) The current state.',
        '    :returns:     The new summary and only the kept messages.',
        '    """',
        '    messages = state["messages"]',
        `    # Cut by count, 'messages[-0:]' would keep everything when ${keep} is 0.`,
        `    cut = len(messages) - ${keep}`,
        '    old_messages, kept_messages = messages[:cut], messages[cut:]',
        '',
        `    instruction = ${node.promptConstant}`,
        '    if state.get("summary"):',
        `        instruction += f"\\n\\n${t('python.summary.extend')}\\n{state['summary']}"`,
        '',
        `    logger.debug(f"[${node.name}] Compacting {len(old_messages)} message(s).")`,
        '    summary = ask_model(',
    ])
    writer.owned(node.modelLinkId, () => writer.line(`        ${node.model?.constant ?? 'None'},`))
    writer.many([
        '        [*old_messages, {"role": "user", "content": instruction}],',
        '    )',
        '    return {"summary": summary["content"], "messages": kept_messages}',
        '',
        '',
    ])
}

function writeWorkshopNode(writer, node) {
    writer.many([
        `def ${node.name}(state: dict) -> dict:`,
        '    """',
        '    Node: runs every tool the model asked for in the last message',
        '    and writes one result message per call, so the model can read them.',
        '',
        '    :param state: (Required) The current state.',
        "    :returns:     The 'messages' with the tool results appended.",
        '    """',
        '    calls = state["messages"][-1].get("tool_calls") or []',
        '    results = []',
        '    for call in calls:',
        '        name = call["function"]["name"]',
        '        try:',
        '            arguments = json.loads(call["function"].get("arguments") or "{}")',
        '        except ValueError:',
        '            arguments = {}',
        `        result = call_tool(${node.toolboxConstant}, name, arguments)`,
        '',
        `        logger.debug(f"[${node.name}] {name} -> {result}")`,
        '        results.append({"role": "tool", "tool_call_id": call.get("id", name), "content": str(result)})',
        '',
        '    return {"messages": [*state["messages"], *results]}',
        '',
        '',
    ])
}

function writeRoute(writer, model, router) {
    const targets = router.branches.map(branch => model.ref(branch.target))
    const [first] = targets
    const returnTo = (branch, indent = '    ') => writer.owned(branch.edgeId, () => writer.line(`${indent}return ${model.ref(branch.target)}`))

    const docs = {
        length: `${targets[0]} when the history is over ${router.maxConstant}, else ${targets[1]}.`,
        contains: `${targets[0]} when the last message contains "${router.word}", else ${targets[1]}.`,
        tools: `${targets[0]} when the model wants to call tools, else ${targets[1]}.`,
        model: `The node of the way the model picked, ${first} when its answer fits none.`,
    }
    const intro = {
        length: 'checks the length of the history',
        contains: `checks whether the last message contains the word "${router.word}"`,
        tools: 'checks whether the model wants to call tools',
        model: 'lets its model pick one of the ways',
    }

    writer.many([
        `def ${router.routeName}(state: dict) -> str:`,
        '    """',
        `    Edge: the switch "${router.name}" ${intro[router.conditionKind] ?? 'decides'}.`,
        '',
        '    :param state: (Required) The current state.',
        `    :returns:     ${docs[router.conditionKind] ?? first}`,
        '    """',
    ])

    const [yes, no] = router.branches
    writer.owned(router.condition?.id, () => {
        if (router.conditionKind === 'length') {
            writer.many([
                '    message_count = len(state["messages"])',
                `    if ${router.maxConstant} == 0 or message_count <= ${router.maxConstant}:`,
            ])
            returnTo(no, '        ')
            writer.line()
            writer.line(`    logger.debug(f"[${router.routeName}] {message_count} > {${router.maxConstant}} -> ${model.label(yes.target)}.")`)
            return returnTo(yes)
        }
        if (router.conditionKind === 'contains') {
            // Whole words only: "ok" must not match "Schokolade".
            writer.many([
                '    last = state["messages"][-1].get("content") or ""',
                `    words = [word.strip(".,;:!?\\"'()") for word in last.lower().split()]`,
                `    if ${pyString(router.word.toLowerCase())} in words:`,
            ])
            returnTo(yes, '        ')
            return returnTo(no)
        }
        if (router.conditionKind === 'tools') {
            writer.line('    if state["messages"][-1].get("tool_calls"):')
            returnTo(yes, '        ')
            return returnTo(no)
        }
        if (router.conditionKind === 'model') {
            writer.many([
                '    question = state["messages"][-1].get("content") or ""',
                '    answer = ask_model(',
            ])
            writer.owned(router.modelLinkId, () => writer.line(`        ${router.model?.constant ?? 'None'},`))
            writer.many([
                `        [{"role": "system", "content": ${router.promptConstant}}, {"role": "user", "content": question}],`,
                '    )',
                '    choice = answer["content"].strip().lower()',
                `    logger.debug(f"[${router.routeName}] The model chose {choice!r}.")`,
                '',
            ])
            for (const branch of router.branches) {
                writer.owned([branch.option?.id], () => writer.line(`    if ${pyString(branch.word)} in choice:`))
                returnTo(branch, '        ')
            }
            writer.line('    # No way fits the answer: take the first one.')
            return returnTo(router.branches[0])
        }
        writer.line(`    return ${first ?? 'END'}`)
    })
    writer.many(['', ''])
}

function writeWiring(writer, model) {
    writer.owned(model.graphBlock.id, () => {
        writer.line('# Which function runs as which node.')
        writer.line('NODES = {')
        for (const node of model.nodes) {
            writer.owned(node.block.id, () => writer.line(`    ${node.constant}: ${node.name},`))
        }
        writer.many([
            '}',
            '',
            '# Where to go after each node: a node name, or a function that picks one.',
            'EDGES = {',
        ])
        for (const edge of model.edges) {
            writer.owned(edge.id, () => {
                const target = edge.isConditional ? edge.router.routeName : model.ref(edge.to)
                writer.line(`    ${model.ref(edge.from)}: ${target},`)
            })
        }
        writer.many(['}', '', ''])
    })
}

function writeRunGraph(writer, model) {
    writer.owned(model.graphBlock.id, () => writer.many([
        'def run_graph(state: dict) -> dict:',
        '    """',
        '    The engine: runs the graph from START until END and returns the final state.',
        '    Every step runs one node, merges its changes into the state and follows its edge.',
        '',
        '    :param state: (Required) The state to start with.',
        '    :returns:     The state after the last node.',
        '    :raises RuntimeError: When END is not reached within MAX_STEPS steps.',
        '',
        '    Example:',
        '        run_graph({**new_state(), "messages": [{"role": "user", "content": "Hi"}]})',
        '    """',
        '    node = START',
        '    for _ in range(MAX_STEPS):',
        '        # A fixed edge names the next node, a conditional edge is a function that picks it.',
        '        edge = EDGES[node]',
        '        node = edge(state) if callable(edge) else edge',
        '        if node == END:',
        '            return state',
        '',
        '        # Run the node, its changes overwrite the matching keys of the state.',
        '        logger.debug(f"[run_graph] -> {node}")',
        '        changes = NODES[node](state)',
        '        state = {**state, **changes}',
        '',
        '    raise RuntimeError(f"The graph did not reach END within {MAX_STEPS} steps.")',
        '',
        '',
    ]))
}

function writeGraph(writer, model) {
    const writers = { llm: writeLlmNode, summarize: writeSummarizeNode, workshop: writeWorkshopNode }

    writeGraphIntro(writer, model)
    writeNewState(writer, model)
    for (const node of model.nodes) {
        writer.owned(node.block.id, () => writers[node.kind](writer, node))
    }
    for (const router of model.routers) {
        writer.owned(router.block.id, () => writeRoute(writer, model, router))
    }
    writeWiring(writer, model)
    writeRunGraph(writer, model)
}

// ---------------------------------------------------------------------------
// Run
//   Chat (memory, stream_answer, main) or task (run_task, main).
// ---------------------------------------------------------------------------

function writeStreamAnswer(writer, model) {
    const hasMemory = null != model.memoryBlock
    const units = []
    if (hasMemory) units.push(['MEMORY', 'The state of every conversation, by thread_id.'])
    units.push(['stream_answer', 'Runs the graph for one question, answers appear live.'])
    units.push(['main', 'Runs the chat until the user exits, returns the exit code.'])

    writer.many(chapterBanner('RUN CHAT SESSION'))
    writer.line('#')
    writer.many(alignColumns(units, '#   '))
    writer.many(['#', '', ''])

    if (hasMemory) {
        writer.owned([...model.memoryLinkIds, model.memoryBlock.id], () => writer.many([
            '# The memory: one state per conversation. The graph itself forgets everything,',
            '# so each question loads the state of its thread and saves the result again.',
            'MEMORY: dict[str, dict] = {}',
            '',
            '',
        ]))
    }

    writer.many([
        'def stream_answer(thread_id: str, question: str) -> None:',
        '    """',
        '    Runs the graph for one question. Agents that show their answer print it live.',
        '    Ctrl+C stops the answer early.',
        '',
        '    :param thread_id: (Required) Id of the conversation.',
        '    :param question:  (Required) The new question of the user.',
        '',
        '    Example:',
        '        stream_answer("4f1c...", "What is Kubernetes?")',
        '    """',
    ])
    if (hasMemory) {
        writer.owned([...model.memoryLinkIds, model.memoryBlock.id], () => writer.line('    state = MEMORY.get(thread_id) or new_state()'))
    } else {
        writer.line('    # No memory: every question starts with an empty state.')
        writer.line('    state = new_state()')
    }
    writer.many([
        '    question_message = {"role": "user", "content": question}',
        '    state = {**state, "messages": [*state["messages"], question_message]}',
        '',
        `    print("${t('python.answer.prefix')}", end="", flush=True)`,
        '    try:',
    ])
    if (hasMemory) {
        writer.owned([...model.memoryLinkIds, model.memoryBlock.id], () => writer.line('        MEMORY[thread_id] = run_graph(state)'))
    } else {
        writer.line('        run_graph(state)')
    }
    writer.many([
        '    except KeyboardInterrupt:',
        '        # Nothing is saved, the conversation stays as it was before the question.',
        '        logger.debug("[stream_answer] Ctrl+C -> answer dropped.")',
        '        print(" [abgebrochen]", end="")',
        '',
        '    print("\\n")',
        '',
        '',
    ])
}

function writeChatMain(writer) {
    const banner = (title, description) => sectionBanner(title, description, '    ')

    writer.many([
        'def main() -> int:',
        '    """',
        "    Runs the interactive chat until 'exit', 'quit', Ctrl+C or Ctrl+D.",
        '',
        '    :returns: The process exit code, 0 on a normal end.',
        '',
        '    Example:',
        '        sys.exit(main())',
        '    """',
        '',
        ...banner('Setup', 'Starts a conversation and shows the commands.'),
        '',
        '    thread_id = str(uuid.uuid4())',
        `    print(f"${t('python.model.line')}{MODEL} @ {BASE_URL}")`,
        `    print(f"${t('python.commands', { reset: '{RESET_COMMAND}' })}\\n")`,
        '    logger.debug(f"[main] Thread {thread_id}.")',
        '',
        ...banner('Chat loop', 'Sends every question through the graph.'),
        '',
        '    while True:',
        '        # Read the question. Ctrl+C and Ctrl+D end the session.',
        '        try:',
        `            question = input("${t('python.question.prefix')}").strip()`,
        '        except (EOFError, KeyboardInterrupt):',
        '            print()',
        '            break',
        '',
        '        # Commands',
        '        if not question:',
        '            continue',
        '        if question.lower() in EXIT_COMMANDS:',
        '            break',
        '        if question.lower() == RESET_COMMAND:',
        '            # A new thread starts with an empty state, the old one is left behind.',
        '            thread_id = str(uuid.uuid4())',
        '            logger.debug(f"[main] Reset -> new thread {thread_id}.")',
        `            print("${t('python.reset.done')}\\n")`,
        '            continue',
        '',
        '        # Answer. Only failures the user can fix are handled, the rest bubbles up.',
        '        try:',
        '            stream_answer(thread_id, question)',
        '        except urllib.error.URLError:',
        '            print(',
        `                f"\\n${t('python.error.unreachable', { url: '{BASE_URL}' })}"`,
        `                "${t('python.error.server')}\\n"`,
        '            )',
        '',
        ...banner('Goodbye', 'Ends the session with exit code 0.'),
        '',
        `    print("${t('python.goodbye')}")`,
        '    return 0',
        '',
        '',
        'if __name__ == "__main__":',
        '    sys.exit(main())',
    ])
}

function writeTask(writer) {
    writer.many([
        ...chapterBanner('RUN TASK'),
        '#',
        '#   run_task   Runs the graph once for a task, returns the final notepad.',
        '#   main       Takes the task from the command line or asks for it.',
        '#',
        '',
        '',
        'def run_task(task: str) -> dict:',
        '    """',
        '    Runs the graph once for a task. Agents that show their answer print it live.',
        '',
        '    :param task: (Required) What the graph should do.',
        '    :returns:    The notepad at the end, with every message of the run.',
        '',
        '    Example:',
        `        run_task("${t('python.task.example')}")`,
        '    """',
        '    state = {**new_state(), "messages": [{"role": "user", "content": task}]}',
        '',
        `    print("${t('python.answer.prefix')}", end="", flush=True)`,
        '    final_state = run_graph(state)',
        '    print("\\n")',
        '    return final_state',
        '',
        '',
        'def main() -> int:',
        '    """',
        '    Runs one task and prints the final notepad.',
        '',
        '    :returns: The process exit code, 0 when the graph reached END.',
        '',
        '    Example:',
        '        sys.exit(main())',
        '    """',
        `    task = " ".join(sys.argv[1:]).strip() or input("${t('python.task.prompt')}").strip()`,
        '    if not task:',
        `        print("${t('python.task.none')}")`,
        '        return 1',
        '',
        '    try:',
        '        final_state = run_task(task)',
        '    except urllib.error.URLError:',
        `        print(f"${t('python.error.unreachable', { url: '{BASE_URL}' })}${t('python.error.server')}")`,
        '        return 1',
        '',
        `    print("${t('python.task.notepad')}")`,
        '    print(json.dumps(final_state, ensure_ascii=False, indent=2))',
        '    return 0',
        '',
        '',
        'if __name__ == "__main__":',
        '    sys.exit(main())',
    ])
}

function writeRun(writer, model) {
    writer.owned(model.loopBlock.id, () => {
        if (model.isTask) return writeTask(writer)
        writeStreamAnswer(writer, model)
        writeChatMain(writer)
    })
}

// ---------------------------------------------------------------------------
// Generate
//   Reads the workspace and writes all chapters in order.
// ---------------------------------------------------------------------------

export function generatePython(workspace) {
    const model = readWorkspace(workspace)
    const writer = new PythonWriter()
    const hasSettings = null != model.settingsBlock

    const chapters = []
    if (hasSettings) chapters.push(['HELPERS', "Reads '.env' and numbers from the environment."])
    chapters.push(['SETTINGS', hasSettings
        ? 'Loads and validates the settings from the environment.'
        : 'The fixed values of the graph.'])
    if (null != model.llmBlock) chapters.push(['TALK TO MODEL', 'One HTTP call to a model, streamed.'])
    if (model.hasTools) chapters.push(['USE TOOLS', 'The functions the model may call.'])
    chapters.push(['BUILD GRAPH', 'State, nodes, edges and the engine.'])
    chapters.push(model.isTask
        ? ['RUN TASK', 'Runs the graph once and prints the final notepad.']
        : ['RUN CHAT SESSION', 'Reads questions, streams answers from the graph.'])

    writeHeader(writer, model, chapters)
    if (hasSettings) writeHelpers(writer, model)
    writeSettings(writer, model)
    if (null != model.llmBlock) writeModel(writer, model)
    if (model.hasTools) writeTools(writer, model)
    writeGraph(writer, model)
    writeRun(writer, model)

    // No trailing empty lines, the file ends with one newline.
    while (writer.lines.at(-1)?.text === '') writer.lines.pop()

    return {
        code: `${writer.lines.map(line => line.text).join('\n')}\n`,
        lineOwners: writer.lines.map(line => line.owners),
        problems: model.problems,
        canRun: !model.problems.some(problem => problem.isError),
        isTask: model.isTask,
        // The runner reports nodes, tools and helper agents by name, the editor knows cards by id.
        nodeIds: Object.fromEntries([
            ...model.nodes.map(node => [node.name, node.block.id]),
            ...model.helpers.map(helper => [helper.name, helper.block.id]),
            ...model.toolKinds.map(tool => [tool.name, tool.cardIds[0]]),
        ]),
        // Agents and helpers that show their answer: in the app every one gets its own chat bubble.
        answerNodeIds: [...model.nodes, ...model.helpers].filter(item => item.isAnswer).map(item => item.block.id),
    }
}
