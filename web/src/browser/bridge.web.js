// NOTE:
//   The Python side without any install: the model runs in the browser (wllama, llama.cpp as
//   WebAssembly), the generated code in Pyodide in a worker (worker.python.js). Same calls as
//   window.pywebview.api in the app, so app.js does not care which one it talks to.
//   Requires: cross-origin isolation (SharedArrayBuffer), see coi-serviceworker.js and app/dev_server.py.
//
//   import { WebBridge } from './browser/bridge.web.js'
//   const api = new WebBridge({ runnerUrl: 'runner.py' })
//   if (await api.isModelCached()) api.start_model()

//
//   Chapters:
//     LOAD MODEL        Picks WebGPU or the processor, downloads once, caches in the browser.
//     ANSWER MODEL      Answers the HTTP calls the Python code makes, streamed or in one piece.
//     TALK TO PYTHON    The worker: start, ask, reset, slow mode, the blocking reply channel.
//

// Imported on first use, not at the top: the offline app loads this file too and has no internet.
const WLLAMA_URL = 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.13.0/esm/index.js'
const WLLAMA_WASM_URL = 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.13.0/esm/wasm/wllama.wasm'
// The same model the app ships with (build.ps1), straight from Hugging Face.
const MODEL_URL = 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf'
const CONTEXT_SIZE = 8192           // like app/model_server.py: reflection needs it
const ALL_LAYERS = 99               // n_gpu_layers: everything on the graphics card
const MAX_CPU_THREADS = 8           // measured 2026-11-09: 16 threads collapse to 0.3 tok/s, 8 give 5.8
const REPLY_BUFFER_BYTES = 4 * 1024 * 1024
const WORKER_URL = new URL('./worker.python.js', import.meta.url)
const SHIM_URL = new URL('./shim.urllib.py', import.meta.url)


export class WebBridge {
    #runnerUrl

    /**
     * @param {object} options
     * @param {string} options.runnerUrl (Required) URL of app/runner.py, served next to the page.
     */
    constructor({ runnerUrl }) {
        this.#runnerUrl = new URL(runnerUrl, document.baseURI).href
    }

    /**
     * @returns {boolean} Whether this browser can run the model and Python at all.
     */
    static get isSupported() {
        return globalThis.crossOriginIsolated === true && typeof SharedArrayBuffer === 'function'
    }

    // ===========================================================================
    // ==============================   LOAD MODEL   =============================
    // ===========================================================================
    //
    //   1. Status    What app.js polls: idle, starting (with percent), ready, failed.
    //   2. Device    WebGPU when the browser offers an adapter, else the processor.
    //   3. Load      Downloads once (about 1 GB), later loads from the browser cache,
    //                falls back to the processor when WebGPU fails.
    //

    // ---------------------------------------------------------------------------
    // Status
    //   What app.js polls: idle, starting (with percent), ready, failed.
    // ---------------------------------------------------------------------------

    #wllama = null              // a promise of the Wllama instance, see #getWllama
    #status = { state: 'idle', message: '', percent: null, device: null }
    #loading = null

    async model_status() {
        return { ...this.#status }
    }

    #getWllama() {
        this.#wllama ??= import(WLLAMA_URL)
            .then(({ Wllama }) => new Wllama({ default: WLLAMA_WASM_URL }, { allowOffline: true }))
            .catch(exception => {
                this.#wllama = null     // offline or blocked: the next attempt imports again
                throw exception
            })
        return this.#wllama
    }

    /**
     * @returns {Promise<boolean>} Whether the model is already in the browser cache, so loading needs no download.
     */
    async isModelCached() {
        try {
            const cache = (await this.#getWllama()).cacheManager
            return null != await cache.getMetadata(await cache.getNameFromURL(MODEL_URL))
        } catch (exception) {
            console.warn('[WebBridge] Could not check the model cache.', exception)
            return false
        }
    }

    /**
     * Starts loading the model and Python. Parallel calls share one load.
     *
     * @returns {Promise<void>} Resolves when both are ready or the load failed (see model_status).
     */
    start_model() {
        this.#loading ??= this.#load()
        return this.#loading
    }

    // ---------------------------------------------------------------------------
    // Device
    //   WebGPU when the browser offers an adapter, else the processor.
    // ---------------------------------------------------------------------------

    static CPU_SETTINGS = {
        n_gpu_layers: 0,
        n_threads: Math.max(1, Math.min(MAX_CPU_THREADS, Math.floor((navigator.hardwareConcurrency ?? 2) / 2))),
    }

    async #hasGpu() {
        const adapter = await navigator.gpu?.requestAdapter().catch(() => null)
        return null != adapter
    }

    // ---------------------------------------------------------------------------
    // Load
    //   Downloads once (about 1 GB), later loads from the browser cache.
    // ---------------------------------------------------------------------------

    async #loadModel(device, settings) {
        console.debug(`[WebBridge] Loading the model on ${device}.`, settings)
        this.#status.device = device
        const wllama = await this.#getWllama()
        await wllama.loadModelFromUrl(MODEL_URL, {
            n_ctx: CONTEXT_SIZE,
            ...settings,
            progressCallback: ({ loaded, total }) => {
                this.#status.percent = total > 0 ? Math.floor(loaded / total * 100) : null
            },
        })
        return device
    }

    /*
        > With a WebGPU adapter
            - Load all layers onto the graphics card.
            - When that fails (too little memory, driver), start over on the processor.
        > Without one
            - Load on the processor, with at most MAX_CPU_THREADS threads.
    */
    async #loadModelOnBestDevice() {
        if (!await this.#hasGpu()) return this.#loadModel('cpu', WebBridge.CPU_SETTINGS)

        try {
            return await this.#loadModel('gpu', { n_gpu_layers: ALL_LAYERS })
        } catch (exception) {
            console.warn('[WebBridge] WebGPU failed, loading on the processor instead.', exception)
            await (await this.#getWllama()).exit().catch(() => null)
            this.#wllama = null
            return this.#loadModel('cpu', WebBridge.CPU_SETTINGS)
        }
    }

    async #load() {
        this.#status = { state: 'starting', message: '', percent: 0, device: null }
        try {
            // Python starts while the model downloads, both take a while.
            const [device] = await Promise.all([this.#loadModelOnBestDevice(), this.#startPython()])
            this.#status = { state: 'ready', message: '', percent: null, device }
        } catch (exception) {
            console.error(exception)
            this.#status = { state: 'failed', message: exception.message, percent: null, device: this.#status.device }
            this.#loading = null      // a click on start may try again
        }
    }

    // ===========================================================================
    // =============================   ANSWER MODEL   ============================
    // ===========================================================================
    //
    //   #openModelCall   One request of the generated code: answered whole, or opened as a stream.
    //   #nextLine        The next 'data: {...}' line of an open stream, like llama-server sends it.
    //
    //   The generated code posts the OpenAI body to BASE_URL/chat/completions. The shim in
    //   Python (shim.urllib.py) hands that body here, wllama answers like llama-server would.
    //

    #streams = new Map()        // stream id -> async iterator of SSE lines
    #nextStreamId = 1

    async #openModelCall(bodyText) {
        const body = JSON.parse(bodyText)
        if (!body.stream) {
            const response = await (await this.#getWllama()).createChatCompletion(body)
            return { kind: 'body', text: JSON.stringify(response) }
        }

        const id = this.#nextStreamId++
        this.#streams.set(id, this.#streamLines(body))
        return { kind: 'stream', id }
    }

    async *#streamLines(body) {
        const chunks = await (await this.#getWllama()).createChatCompletion({ ...body, stream: true })
        for await (const chunk of chunks) yield `data: ${JSON.stringify(chunk)}\n`
        yield 'data: [DONE]\n'
    }

    async #nextLine(id) {
        const lines = this.#streams.get(id)
        if (null == lines) return { kind: 'end' }

        const { value, done } = await lines.next()
        if (!done) return { kind: 'line', text: value }

        this.#streams.delete(id)
        return { kind: 'end' }
    }

    // ===========================================================================
    // ============================   TALK TO PYTHON   ===========================
    // ===========================================================================
    //
    //   1. Reply channel   Wakes the waiting worker with the answer to its model call.
    //   2. Worker          Starts Pyodide and routes its messages.
    //   3. Calls           start_graph, ask, reset, set_step_delay: the same as in the app.
    //
    //   Python waits for the model synchronously (urllib.request.urlopen), a worker cannot
    //   await. So it blocks with Atomics.wait on a SharedArrayBuffer until this side writes
    //   the answer and notifies. Layout: int32[0] flag (0 waiting, 1 answer there),
    //   int32[1] byte length, the UTF-8 bytes from offset 8.
    //

    // ---------------------------------------------------------------------------
    // Reply channel
    //   Wakes the waiting worker with the answer to its model call.
    // ---------------------------------------------------------------------------

    #replyBuffer = new SharedArrayBuffer(8 + REPLY_BUFFER_BYTES)
    #replyHeader = new Int32Array(this.#replyBuffer, 0, 2)
    #replyBytes = new Uint8Array(this.#replyBuffer, 8)
    #encoder = new TextEncoder()

    #reply(message) {
        const bytes = this.#encoder.encode(JSON.stringify(message))
        if (bytes.length > REPLY_BUFFER_BYTES) {
            return this.#reply({ kind: 'error', text: `The model answer is larger than ${REPLY_BUFFER_BYTES} bytes.` })
        }
        this.#replyBytes.set(bytes)
        Atomics.store(this.#replyHeader, 1, bytes.length)
        Atomics.store(this.#replyHeader, 0, 1)
        Atomics.notify(this.#replyHeader, 0)
    }

    // ---------------------------------------------------------------------------
    // Worker
    //   Starts Pyodide and routes its messages.
    // ---------------------------------------------------------------------------

    #worker = null
    #pending = new Map()        // call id -> resolve of the call that waits for its result
    #nextCallId = 1
    #stepDelaySeconds = 0       // slow mode, set by set_step_delay in Calls

    async #startPython() {
        // A failed load leaves its worker behind, a new attempt starts fresh.
        this.#worker?.terminate()
        this.#worker = new Worker(WORKER_URL)
        this.#worker.addEventListener('message', event => this.#onWorkerMessage(event.data))
        this.#worker.addEventListener('error', event => console.error('[WebBridge] Worker error', event.message))
        const result = await this.#call('init', {
            buffer: this.#replyBuffer,
            runnerUrl: this.#runnerUrl,
            shimUrl: SHIM_URL.href,
            stepDelaySeconds: this.#stepDelaySeconds,
        })
        if (!result.ok) throw new Error(result.error)
    }

    async #onWorkerMessage(message) {
        // Streamed pieces and node events go where the app's runner sends them.
        if (message.type === 'chunk') return window.graphlings?.onChunk(message.text)
        if (message.type === 'node') return window.graphlings?.onNode(message.name, message.status)
        if (message.type === 'result') {
            this.#pending.get(message.id)?.(message.result)
            return this.#pending.delete(message.id)
        }

        // Model calls: the worker waits on the reply channel, every path must reply.
        try {
            if (message.type === 'model-open') return this.#reply(await this.#openModelCall(message.body))
            if (message.type === 'model-next') return this.#reply(await this.#nextLine(message.id))
        } catch (exception) {
            console.error(exception)
            this.#reply({ kind: 'error', text: exception.message })
        }
    }

    #call(type, payload = {}) {
        const id = this.#nextCallId++
        return new Promise(resolve => {
            this.#pending.set(id, resolve)
            this.#worker.postMessage({ type, id, ...payload })
        })
    }

    // ---------------------------------------------------------------------------
    // Calls
    //   start_graph, ask, reset, set_step_delay: the same as in the app.
    // ---------------------------------------------------------------------------

    start_graph(code) {
        return this.#call('load', { code })
    }

    ask(question) {
        return this.#call('ask', { question })
    }

    reset() {
        return this.#call('reset')
    }

    set_step_delay(seconds) {
        // Before Python runs there is no worker yet: the pause is kept and handed over in Worker.
        this.#stepDelaySeconds = seconds
        if (null == this.#worker) return Promise.resolve({ ok: true })
        return this.#call('delay', { seconds })
    }
}
