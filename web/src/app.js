// NOTE:
//   Wires the page: puzzle workspace, live Python code, explanations and the chat.
//   The blocks come from the own block engine in engine/, the Python side is window.pywebview.api.
//
//   <script type="module" src="src/app.js"></script>

//
//   Chapters:
//     HELPERS             HTML escaping and a small Python highlighter.
//     SET UP WORKSPACE    Theme, toolbox and the saved or example blocks.
//     SHOW CODE           Renders the code, marks lines, explains blocks.
//     CHAT WITH GRAPH     Model status, start, ask and reset via the Python bridge.
//     BUTTONS             Example, clear, copy, save and the light or dark theme.
//

import { DEFINITIONS, getDescription, getExplanation, migrateWorkspace, PALETTE, PLAN_TYPE, TYPES } from './blocks.graph.js'
import { GraphEditor } from './engine/engine.editor.js'
import { EXAMPLES } from './examples.graph.js'
import { generatePython } from './generator.python.js'


const STORAGE_KEY = 'graphlings.workspace.v3'
const THEME_KEY = 'graphlings.theme'
const CODE_KEY = 'graphlings.code-visible'
const EDGE_EXPLANATION = 'Eine Kante ist ein Eintrag in EDGES: Nach diesem Knoten läuft immer der nächste. '
    + 'Führt sie in eine Weiche, steht in EDGES statt eines Namens die Routing-Funktion der Weiche. '
    + 'Von jedem Ausgang geht genau ein Weg weg, sonst wüsste die Engine nicht, wohin.'
const USE_EXPLANATION = 'Eine gepunktete Linie ist kein Schritt im Ablauf, sondern heißt "benutzt": '
    + 'Ein Agent ruft sein Modell auf, wenn er läuft, im Code als erstes Argument von ask_model(). '
    + 'START benutzt State und Gedächtnis, um eine Runde zu beginnen. Eine Ressource kann von vielen benutzt werden.'
const WORKSHOP_EXPLANATION = 'Die Steckdose zwischen Agent und Werkstatt ist im Code tools=list_tools(...): '
    + 'Der Agent holt sich die Beschreibungen der Werkzeuge und gibt sie seinem Modell mit. '
    + 'Das ist die Idee von MCP (Model Context Protocol): list_tools entspricht tools/list, call_tool entspricht tools/call. '
    + 'Bei echtem MCP läuft die Werkstatt als eigenes Programm, hier steht sie in derselben Datei.'
const STATUS_POLL_MS = 1000

const PYTHON_KEYWORDS = new Set([
    'False', 'None', 'True', 'and', 'as', 'break', 'class', 'continue', 'def', 'del', 'elif',
    'else', 'except', 'finally', 'for', 'from', 'if', 'import', 'in', 'is', 'lambda', 'not',
    'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
])

const elements = {
    blocks: document.getElementById('blocks'),
    code: document.getElementById('code'),
    chat: document.getElementById('chat'),
    chatTitle: document.getElementById('chat-title'),
    buttonChatClose: document.getElementById('button-chat-close'),
    explainCode: document.getElementById('explain-code'),
    problems: document.getElementById('problems'),
    status: document.getElementById('model-status'),
    chatLog: document.getElementById('chat-log'),
    chatForm: document.getElementById('chat-form'),
    chatInput: document.getElementById('chat-input'),
    buttonStart: document.getElementById('button-start'),
    buttonSend: document.getElementById('button-send'),
    buttonReset: document.getElementById('button-reset'),
    exampleSelect: document.getElementById('example-select'),
    buttonClear: document.getElementById('button-clear'),
    buttonCopy: document.getElementById('button-copy'),
    buttonSave: document.getElementById('button-save'),
    buttonTheme: document.getElementById('button-theme'),
    buttonCode: document.getElementById('button-code'),
}

// ===========================================================================
// ===============================   HELPERS   ===============================
// ===========================================================================
//
//   escapeHtml        Makes text safe to put into innerHTML.
//   highlightLine     Colours one line of Python, docstrings span several lines.
//   readStorage       localStorage that never throws.
//   writeStorage      localStorage that never throws.
//

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
}

function highlightLine(text, state) {
    const token = (kind, value) => `<span class="tok-${kind}">${escapeHtml(value)}</span>`
    let html = ''
    let rest = text
    let previousWord = ''

    while (rest.length > 0) {
        let match = null

        // Inside a docstring until the closing quotes
        if (state.isInDocstring) {
            const end = rest.indexOf('"""')
            if (end < 0) return html + token('string', rest)
            html += token('string', rest.slice(0, end + 3))
            rest = rest.slice(end + 3)
            state.isInDocstring = false
            continue
        }

        // Docstring, comment, string, number, word, anything else
        if (rest.startsWith('"""')) {
            state.isInDocstring = true
            html += token('string', '"""')
            rest = rest.slice(3)
        } else if (rest.startsWith('#')) {
            html += token('comment', rest)
            rest = ''
        } else if ((match = rest.match(/^[fFrR]?"(?:[^"\\]|\\.)*"|^[fFrR]?'(?:[^'\\]|\\.)*'/))) {
            html += token('string', match[0])
            rest = rest.slice(match[0].length)
        } else if ((match = rest.match(/^\d+(?:\.\d+)?/))) {
            html += token('number', match[0])
            rest = rest.slice(match[0].length)
        } else if ((match = rest.match(/^[A-Za-z_]\w*/))) {
            const word = match[0]
            if (PYTHON_KEYWORDS.has(word)) html += token('keyword', word)
            else if (previousWord === 'def' || previousWord === 'class') html += token('name', word)
            else html += escapeHtml(word)
            previousWord = word
            rest = rest.slice(word.length)
        } else {
            html += escapeHtml(rest[0])
            rest = rest.slice(1)
        }
    }

    return html
}

function readStorage(key) {
    try {
        return window.localStorage.getItem(key)
    } catch {
        return null
    }
}

function writeStorage(key, value) {
    try {
        window.localStorage.setItem(key, value)
    } catch {
        // Storage is only a convenience, the page works without it.
    }
}

// ===========================================================================
// ==========================   SET UP WORKSPACE   ===========================
// ===========================================================================
//
//   1. Editor      The block engine with the graph blocks and the palette.
//   2. Workspace   Reads the saved blocks, the example when there are none.
//
//   The saved or example blocks are loaded at the end of the file, after every
//   listener is registered, so the first code is drawn by the 'change' event.
//

// ---------------------------------------------------------------------------
// Editor
//   The block engine with the graph blocks and the palette.
// ---------------------------------------------------------------------------

const editor = new GraphEditor({
    root: elements.blocks,
    definitions: DEFINITIONS,
    palette: PALETTE,
    planType: PLAN_TYPE,
    // The selected graphling explains itself in a speech bubble, in plain words.
    bubble: id => describeSelection(id).plain,
    // The notepad sits on every flow edge and travels along them while the graph runs.
    flowMark: '🗂️',
})
let selectedId = null       // set by the 'select' event of the editor, read in SHOW CODE

// ---------------------------------------------------------------------------
// Workspace
//   Reads the saved blocks, the example when there are none.
// ---------------------------------------------------------------------------

function readSavedWorkspace() {
    try {
        const saved = readStorage(STORAGE_KEY)
        return null == saved ? EXAMPLES[0].workspace : migrateWorkspace(JSON.parse(saved))
    } catch (exception) {
        console.error(exception)
        return EXAMPLES[0].workspace
    }
}

// ===========================================================================
// =============================   SHOW CODE   ===============================
// ===========================================================================
//
//   1. Render     Writes the code line by line and lists the problems.
//   2. Mark       Marks the lines of the selected block and explains it.
//   3. Listen     Regenerates on every change, follows clicks both ways.
//

let generated = { code: '', lineOwners: [], problems: [], canRun: false }

// ---------------------------------------------------------------------------
// Render
//   Writes the code line by line and lists the problems.
// ---------------------------------------------------------------------------

function renderCode() {
    generated = generatePython(editor.workspace)

    const state = { isInDocstring: false }
    elements.code.innerHTML = generated.code
        .replace(/\n$/, '')
        .split('\n')
        .map((line, index) => `<span class="code-line" data-index="${index}">${highlightLine(line, state) || ' '}</span>`)
        .join('')

    elements.problems.innerHTML = ''
    for (const problem of generated.problems) {
        const item = document.createElement('li')
        item.className = problem.isError ? 'is-error' : 'is-hint'
        item.textContent = `${problem.isError ? '⛔' : '💡'} ${problem.text}`
        if (null != problem.blockId) item.addEventListener('click', () => selectBlock(problem.blockId))
        elements.problems.append(item)
    }

    markBlock(selectedId)
    onCodeChanged()
}

// ---------------------------------------------------------------------------
// Mark
//   Marks the lines of the selected block and explains it.
// ---------------------------------------------------------------------------

function markBlock(blockId) {
    const lines = elements.code.querySelectorAll('.code-line')

    // The longest run of marked lines is the heart of the block (the function, not its constant).
    let longest = { start: -1, length: 0 }
    let run = { start: -1, length: 0 }
    lines.forEach((line, index) => {
        const isMarked = null != blockId && generated.lineOwners[index]?.includes(blockId)
        line.classList.toggle('is-marked', isMarked)

        run = isMarked ? { start: run.length === 0 ? index : run.start, length: run.length + 1 } : { start: -1, length: 0 }
        if (run.length > longest.length) longest = run
    })
    lines[longest.start]?.scrollIntoView({ block: 'start', behavior: 'smooth' })

    // The plain words are in the speech bubble on the graph, the code words above the code.
    const { code } = describeSelection(blockId)
    elements.explainCode.textContent = code === '' ? '' : `💡 ${code}`
}

// What a selection is, in plain words and in code words. Nothing selected describes the plan.
function describeSelection(blockId) {
    const selected = editor.getItem(blockId)
    let key = selected?.item.type ?? PLAN_TYPE
    if (selected?.kind === 'edge') key = selected.item.kind === 'use' ? 'use' : 'flow'
    if (key === 'use' && selected.item.port === 'workshop') key = 'use-workshop'

    const codeTexts = { flow: EDGE_EXPLANATION, use: USE_EXPLANATION, 'use-workshop': WORKSHOP_EXPLANATION }
    return { plain: getDescription(key), code: codeTexts[key] ?? getExplanation(key) }
}

function selectBlock(blockId) {
    editor.select(blockId)
    editor.reveal(blockId)
}

// ---------------------------------------------------------------------------
// Listen
//   Regenerates on every change, follows clicks both ways.
// ---------------------------------------------------------------------------

let isRenderQueued = false

editor.on('select', blockId => {
    selectedId = blockId
    markBlock(blockId)
})

editor.on('change', workspace => {
    writeStorage(STORAGE_KEY, JSON.stringify(workspace))

    // Typing fires a change per key, one render per frame is enough.
    if (isRenderQueued) return
    isRenderQueued = true
    requestAnimationFrame(() => {
        isRenderQueued = false
        renderCode()
    })
})

// A click on a line selects the innermost block that wrote it.
elements.code.addEventListener('click', event => {
    const line = event.target.closest('.code-line')
    if (null == line) return
    const blockId = generated.lineOwners[Number(line.dataset.index)]?.at(-1)
    if (null != blockId) selectBlock(blockId)
})

// ===========================================================================
// ===========================   CHAT WITH GRAPH   ===========================
// ===========================================================================
//
//   1. Bridge    Finds the Python side and shows the model status.
//   2. Bubbles   Adds messages to the chat log.
//   3. Start     Loads the current code into the Python runner.
//   4. Ask       Sends a question, tokens stream back via window.graphlings.
//
//   Without pywebview (plain browser) the chat stays off, the code still works.
//

let api = null
let runningCode = null      // the code the runner has loaded, set in Start
let isModelReady = false
let isBusy = false

// ---------------------------------------------------------------------------
// Bridge
//   Finds the Python side and shows the model status.
// ---------------------------------------------------------------------------

const STATUS_TEXT = {
    starting: '⏳ Modell startet …',
    ready: '🟢 Modell bereit',
    missing: '⚠️ Modell fehlt',
    failed: '⛔ Modell-Fehler',
}

function setStatus(state, message) {
    elements.status.className = `status status-${state}`
    elements.status.textContent = STATUS_TEXT[state] ?? state
    elements.status.title = message ?? ''
}

async function pollStatus() {
    const { state, message } = await api.model_status()
    setStatus(state, message)
    isModelReady = state === 'ready'
    updateChatControls()

    if (state === 'starting') return setTimeout(pollStatus, STATUS_POLL_MS)
    if (state !== 'ready') addBubble('error', message)
}

function connectBridge() {
    api = window.pywebview?.api ?? null
    if (null == api) return
    pollStatus().catch(exception => setStatus('failed', exception.message))
}

window.addEventListener('pywebviewready', connectBridge)
if (null != window.pywebview?.api) connectBridge()
else setStatus('missing', 'Nur in der App: Hier im Browser läuft kein Modell.')

// ---------------------------------------------------------------------------
// Bubbles
//   Adds messages to the chat log.
// ---------------------------------------------------------------------------

let answerBubble = null     // the bubble the streamed tokens go to

function addBubble(kind, text) {
    const bubble = document.createElement('div')
    bubble.className = `bubble bubble-${kind}`
    bubble.textContent = text
    elements.chatLog.append(bubble)
    elements.chatLog.scrollTop = elements.chatLog.scrollHeight
    return bubble
}

function addNotepad(state) {
    const details = document.createElement('details')
    details.className = 'notepad'
    const summary = document.createElement('summary')
    summary.textContent = `🗂️ Notizzettel am Ende (${state.messages?.length ?? 0} Nachrichten)`
    const content = document.createElement('pre')
    content.textContent = JSON.stringify(state, null, 2)
    details.append(summary, content)
    elements.chatLog.append(details)
    elements.chatLog.scrollTop = elements.chatLog.scrollHeight
}

function updateChatControls() {
    const isStarted = null != runningCode
    elements.chatInput.disabled = !isStarted || isBusy
    elements.buttonSend.disabled = !isStarted || isBusy
    elements.buttonReset.disabled = !isStarted || isBusy
    elements.buttonReset.hidden = generated.isTask
    elements.chatTitle.textContent = generated.isTask ? '📋 Aufgabe' : '💬 Ausprobieren'
    elements.buttonSend.textContent = generated.isTask ? 'Ausführen' : 'Senden'
    elements.chatInput.placeholder = !isStarted ? 'Erst den Graphen starten …'
        : generated.isTask ? 'Was soll der Graph tun?' : 'Frag deinen Graphen …'
    updateStartButton()
}

// The start button says what a click will do, and stays clickable to show why not.
function updateStartButton() {
    const isOutdated = null != runningCode && runningCode !== generated.code
    let label = '▶️ Graph starten'
    if (null != api && !isModelReady) label = '⏳ Modell lädt …'
    if (null != runningCode && !isOutdated) label = generated.isTask ? '📋 Aufgabe' : '💬 Chat'
    if (isOutdated) label = '▶️ Neu starten'
    if (!generated.canRun) label = '⚠️ Graph noch nicht fertig'

    elements.buttonStart.textContent = label
    elements.buttonStart.disabled = isBusy
    elements.buttonStart.classList.toggle('is-blocked', !generated.canRun)
}

function onCodeChanged() {
    updateStartButton()
}

function openChat(isOpen) {
    elements.chat.hidden = !isOpen
}

elements.buttonChatClose.addEventListener('click', () => openChat(false))

let runningNodeIds = {}         // node name -> card id of the code the runner has loaded
let runningAnswerIds = []       // cards of the agents that show their answer

// Every answering agent gets its own bubble, headed with its name.
function openAnswerBubble(nodeId) {
    const name = editor.getItem(nodeId)?.item.fields.NAME ?? ''
    answerBubble = addBubble('ai', '')
    answerBubble.dataset.agent = `🤖 ${name}`
}

function closeAnswerBubble() {
    if (null == answerBubble) return
    // stream_answer ends with empty lines for the terminal, the bubble does not need them.
    answerBubble.textContent = answerBubble.textContent.trimEnd()
    if (answerBubble.textContent === '') answerBubble.remove()
    answerBubble = null
}

window.graphlings = {
    // Called by app/runner.py for every printed chunk.
    onChunk(text) {
        if (null == answerBubble) return
        answerBubble.textContent += text
        elements.chatLog.scrollTop = elements.chatLog.scrollHeight
    },

    // Called by app/runner.py before and after every node: the notepad travels to the card,
    // the card glows while it works, then gets a check.
    onNode(name, status) {
        const nodeId = runningNodeIds[name]
        if (null == nodeId) return
        if (status === 'running') {
            travelTo(nodeId)
            if (runningAnswerIds.includes(nodeId)) {
                closeAnswerBubble()
                openAnswerBubble(nodeId)
            }
        }
        editor.setNodeStatus(nodeId, status)
    },
}

let lastCardId = null       // where the notepad is right now, set while a question runs

function travelTo(cardId) {
    if (null != lastCardId) editor.travel(lastCardId, cardId)
    lastCardId = cardId
}

// START and END have no function in the code, the window marks them itself.
function markEntryAndExit(type) {
    const cards = editor.workspace.nodes.filter(node => node.type === type)
    cards.forEach(node => editor.setNodeStatus(node.id, 'done'))

    // The notepad starts at START and ends at the END card it really reaches.
    if (type === TYPES.start) lastCardId = cards[0]?.id ?? null
    const reachedEnd = cards.find(node => editor.workspace.edges.some(edge => edge.from === lastCardId && edge.to === node.id))
        ?? cards.find(node => editor.workspace.edges.some(edge => edge.to === node.id))
    if (type === TYPES.end && null != reachedEnd) travelTo(reachedEnd.id)
}

// ---------------------------------------------------------------------------
// Start
//   Loads the current code into the Python runner.
// ---------------------------------------------------------------------------

// Opens the chat first, then starts the graph when everything is there.
// What is missing shows at the top of the chat (⛔ and 💡, a click selects the card).
elements.buttonStart.addEventListener('click', async () => {
    openChat(true)
    if (!generated.canRun) return
    if (null == api) return addBubble('info', 'Nur in der App läuft ein Modell, hier im Browser kannst du bauen und den Code ansehen.')
    if (!isModelReady) return
    if (runningCode === generated.code) return elements.chatInput.focus()

    isBusy = true
    updateChatControls()
    const result = await api.start_graph(generated.code)
    isBusy = false

    if (!result.ok) {
        runningCode = null
        addBubble('error', result.error)
    } else {
        runningCode = generated.code
        runningNodeIds = generated.nodeIds
        runningAnswerIds = generated.answerNodeIds
        addBubble('info', generated.isTask ? '🐣 Graph bereit. Gib ihm eine Aufgabe.' : '🐣 Graph läuft, neues Gespräch gestartet.')
    }
    onCodeChanged()
    updateChatControls()
    if (result.ok) elements.chatInput.focus()
})

// ---------------------------------------------------------------------------
// Ask
//   Sends a question, tokens stream back via window.graphlings.
// ---------------------------------------------------------------------------

elements.chatForm.addEventListener('submit', async event => {
    event.preventDefault()
    const question = elements.chatInput.value.trim()
    if (question === '' || isBusy) return

    elements.chatInput.value = ''
    addBubble('user', question)

    isBusy = true
    updateChatControls()
    editor.clearNodeStatus()
    markEntryAndExit(TYPES.start)
    const result = await api.ask(question)
    isBusy = false
    closeAnswerBubble()

    if (result.ok) markEntryAndExit(TYPES.end)
    if (!result.ok) addBubble('error', result.error)
    if (result.ok && null != result.state) addNotepad(result.state)
    updateChatControls()
    elements.chatInput.focus()
})

elements.buttonReset.addEventListener('click', async () => {
    await api.reset()
    addBubble('info', '🔄 Neues Gespräch, neue thread_id.')
})

// ===========================================================================
// ===============================   BUTTONS   ===============================
// ===========================================================================
//
//   1. Workspace   Load the example or start empty.
//   2. Code        Show or hide the code, copy it or save it as chat.py.
//   3. Theme       Light by default, dark on request, remembered per browser.
//

// ---------------------------------------------------------------------------
// Workspace
//   Load the example or start empty.
// ---------------------------------------------------------------------------

for (const example of EXAMPLES) {
    const option = document.createElement('option')
    option.value = example.id
    option.textContent = example.label
    elements.exampleSelect.append(option)
}

elements.exampleSelect.addEventListener('change', () => {
    const example = EXAMPLES.find(candidate => candidate.id === elements.exampleSelect.value)
    elements.exampleSelect.value = ''
    if (null == example || !window.confirm(`Den Graphen durch das Beispiel „${example.label}“ ersetzen?`)) return
    editor.load(example.workspace)
})

elements.buttonClear.addEventListener('click', () => {
    if (!window.confirm('Alle Blöcke entfernen?')) return
    editor.clear()
})

// ---------------------------------------------------------------------------
// Code
//   Show or hide the code, copy it or save it as chat.py.
// ---------------------------------------------------------------------------

// Hidden by default: the graph comes first, the code is the second look.
function applyCodeVisible(isVisible) {
    document.body.classList.toggle('is-code-hidden', !isVisible)
    elements.buttonCode.textContent = isVisible ? '🐍 Code ausblenden' : '🐍 Code zeigen'
}

elements.buttonCode.addEventListener('click', () => {
    const isVisible = document.body.classList.contains('is-code-hidden')
    applyCodeVisible(isVisible)
    writeStorage(CODE_KEY, String(isVisible))
    if (isVisible) markBlock(selectedId)
})

elements.buttonCopy.addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(generated.code)
        elements.buttonCopy.textContent = '✅ Kopiert'
    } catch {
        elements.buttonCopy.textContent = '⚠️ Ging nicht'
    }
    setTimeout(() => elements.buttonCopy.textContent = '📋 Code kopieren', 1500)
})

elements.buttonSave.addEventListener('click', async () => {
    // In the app Python opens a save dialog, in the browser it is a download.
    if (null != api) {
        const result = await api.save_code(generated.code)
        if (!result.ok && null != result.error) addBubble('error', result.error)
        return
    }

    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([generated.code], { type: 'text/x-python' }))
    link.download = 'chat.py'
    link.click()
    URL.revokeObjectURL(link.href)
})

// ---------------------------------------------------------------------------
// Theme
//   Light by default, dark on request, remembered per browser.
// ---------------------------------------------------------------------------

function applyTheme(theme) {
    document.documentElement.dataset.theme = theme
    elements.buttonTheme.textContent = theme === 'dark' ? '☀️ Hell' : '🌙 Dunkel'
}

elements.buttonTheme.addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
    applyTheme(theme)
    writeStorage(THEME_KEY, theme)
})

applyTheme(readStorage(THEME_KEY) === 'dark' ? 'dark' : 'light')
applyCodeVisible(readStorage(CODE_KEY) === 'true')
editor.load(readSavedWorkspace())
updateChatControls()
