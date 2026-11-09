// NOTE:
//   Web worker that runs Python in the browser (Pyodide). It loads the unchanged app/runner.py,
//   so the generated code runs exactly like in the app, and patches urllib.request.urlopen
//   with shim.urllib.py: the HTTP call to the model goes to bridge.web.js instead.
//   Requires: started by bridge.web.js with a SharedArrayBuffer (cross-origin isolation).
//
//   new Worker(new URL('./worker.python.js', import.meta.url))
//   worker.postMessage({ type: 'init', id: 1, buffer, runnerUrl, shimUrl, stepDelaySeconds })

//
//   Chapters:
//     WAIT FOR MODEL   Blocks Python until the page answers its model call.
//     RUN PYTHON       init, load, ask, reset, delay: each answers with one 'result'.
//

importScripts('https://cdn.jsdelivr.net/npm/pyodide@0.29.0/pyodide.js')

const PYODIDE_URL = 'https://cdn.jsdelivr.net/npm/pyodide@0.29.0/'
const HOME = '/home/pyodide'

// ===========================================================================
// ============================   WAIT FOR MODEL   ===========================
// ===========================================================================
//
//   waitForPage   Posts a model call to the page, sleeps until it wrote the answer.
//   bridge        What shim.urllib.py imports from js: open a call, read the next line.
//
//   Layout of the buffer: see bridge.web.js, chapter TALK TO PYTHON.
//

let replyHeader = null      // set in init
let replyBytes = null
const decoder = new TextDecoder()

function waitForPage(message) {
    Atomics.store(replyHeader, 0, 0)
    self.postMessage(message)
    Atomics.wait(replyHeader, 0, 0)
    const length = Atomics.load(replyHeader, 1)
    // TextDecoder refuses views on a SharedArrayBuffer, so the bytes are copied first.
    return decoder.decode(replyBytes.slice(0, length))
}

self.bridge = {
    open: body => waitForPage({ type: 'model-open', body }),
    next: id => waitForPage({ type: 'model-next', id }),
}

// ===========================================================================
// ==============================   RUN PYTHON   =============================
// ===========================================================================
//
//   1. Init       Loads Pyodide, the shim and app/runner.py, creates the GraphRunner.
//   2. Commands   load, ask, reset and delay call the GraphRunner, like app/main.py does.
//
//   Every message carries an id, the answer is { type: 'result', id, result }.
//   While ask runs, the worker is busy: later messages wait in the queue.
//

let pyodide = null
let runner = null

// ---------------------------------------------------------------------------
// Init
//   Loads Pyodide, the shim and app/runner.py, creates the GraphRunner.
// ---------------------------------------------------------------------------

async function init({ buffer, runnerUrl, shimUrl, stepDelaySeconds }) {
    replyHeader = new Int32Array(buffer, 0, 2)
    replyBytes = new Uint8Array(buffer, 8)

    pyodide = await loadPyodide({ indexURL: PYODIDE_URL })
    const [shim, runnerCode] = await Promise.all([fetchText(shimUrl), fetchText(runnerUrl)])
    pyodide.runPython(shim)
    pyodide.FS.writeFile(`${HOME}/runner.py`, runnerCode)

    // The runner reports to the page the way app/main.py does: chunks and node events.
    pyodide.globals.set('send_chunk', text => self.postMessage({ type: 'chunk', text }))
    pyodide.globals.set('send_node', (name, status) => self.postMessage({ type: 'node', name, status }))
    runner = pyodide.runPython(`
import sys
from pathlib import Path
sys.path.insert(0, "${HOME}")
from runner import GraphRunner
GraphRunner(Path("${HOME}/work"))
`)
    runner.set_step_delay(stepDelaySeconds)
    console.debug(`[worker.python] Pyodide ${pyodide.version} ready.`)
    return { ok: true }
}

async function fetchText(url) {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Could not load ${url}: HTTP ${response.status}`)
    return response.text()
}

// ---------------------------------------------------------------------------
// Commands
//   load, ask, reset and delay call the GraphRunner, like app/main.py does.
// ---------------------------------------------------------------------------

const COMMANDS = {
    init,
    load: ({ code }) => {
        runner.load(code)
        return { ok: true }
    },
    ask: ({ question }) => {
        const send_chunk = pyodide.globals.get('send_chunk')
        const send_node = pyodide.globals.get('send_node')
        const state = runner.ask(question, send_chunk, send_node)
        // A task returns its final notepad as a Python dict, a chat returns None.
        return { ok: true, state: state?.toJs?.({ dict_converter: Object.fromEntries }) ?? null }
    },
    reset: () => {
        runner.reset()
        return { ok: true }
    },
    delay: ({ seconds }) => {
        runner.set_step_delay(seconds)
        return { ok: true }
    },
}

// Errors of the user code end up in the chat as one line, like describe_error in app/main.py.
function describeError(exception) {
    const pythonLine = String(exception.message ?? exception).trim().split('\n').at(-1)
    return pythonLine || String(exception)
}

self.addEventListener('message', async ({ data }) => {
    const { type, id } = data
    try {
        const result = await COMMANDS[type](data)
        self.postMessage({ type: 'result', id, result })
    } catch (exception) {
        console.error(exception)
        self.postMessage({ type: 'result', id, result: { ok: false, error: describeError(exception) } })
    }
})
