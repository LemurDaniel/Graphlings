// NOTE:
//   Runs the page with the model in the browser (wllama + Pyodide, like on GitHub Pages) in a
//   real Edge or Chrome and checks that the examples answer: start the graph, ask, read the bubbles.
//   Requires: Node 20+, Python 3.11+ on PATH (or PYTHON) for app/dev_server.py, Edge or Chrome,
//             playwright-core: 'npm install --prefix tests' once (tests/package.json).
//             Internet on the first run: the model (about 1 GB) is cached in build/web-profile.
//
//   node tests/test.web.mjs                 # headless Edge
//   node tests/test.web.mjs --headed        # watch it
//   $env:BROWSER_CHANNEL = 'chrome'         # Chrome instead of Edge
//   $env:GRAPHLINGS_URL = 'https://lemurdaniel.github.io/Graphlings/'   # an already served site, no dev server
//
//   Exit code 1 when any case fails. Only local: the model download is too large for CI.

//
//   Chapters:
//     CASES        Example, language, question and what the answer must contain.
//     RUN CASES    Starts the dev server and the browser, runs every case, prints the result.
//

import { spawn } from 'node:child_process'
import path from 'node:path'

import { chromium } from 'playwright-core'

const REPO = path.resolve(import.meta.dirname, '..')
const PORT = 8779
// Order of precedence: GRAPHLINGS_URL (a served site, e.g. Pages) > the dev server started below.
const SITE_URL = process.env.GRAPHLINGS_URL ?? null
const PAGE_URL = SITE_URL ?? `http://127.0.0.1:${PORT}/?engine=web`
const PROFILE_DIR = path.join(REPO, 'build', 'web-profile')   // keeps the model between runs
const MODEL_TIMEOUT_MS = 15 * 60 * 1000                         // the first run downloads 1 GB
const ANSWER_TIMEOUT_MS = 5 * 60 * 1000                         // the processor without WebGPU is slow
const isHeaded = process.argv.includes('--headed')

// ===========================================================================
// ================================   CASES   ================================
// ===========================================================================
//
//   tools.calculator   The tool agent calls the calculator: 17 * 23 = 391.
//   chat.hello         The chat streams an answer at all (streaming path of the shim).
//   reflection.task    A task ends with the final notepad (task path, dict back to JS).
//

const CASES = [
    { name: 'tools.calculator', example: 'tools', question: 'What is 17 * 23?', expect: answer => answer.includes('391') },
    { name: 'chat.hello', example: 'chat', question: 'Hello! Who are you?', expect: answer => answer.trim().length > 0 },
    { name: 'reflection.task', example: 'reflection', question: 'A haiku about rain.', expect: (answer, page) => page.locator('.notepad').count().then(count => count > 0) },
]

// ===========================================================================
// ==============================   RUN CASES   ==============================
// ===========================================================================
//
//   1. Server    app/dev_server.py without llama-server, it only serves the page
//                (skipped with GRAPHLINGS_URL).
//   2. Browser   Edge with a kept profile, English page, log of the page on errors.
//   3. Cases     Loads the example, starts the graph, asks, checks the answer.
//   4. Report    Prints every case and stops browser and server.
//

// ---------------------------------------------------------------------------
// Server
//   app/dev_server.py without llama-server, it only serves the page.
// ---------------------------------------------------------------------------

const python = process.env.PYTHON ?? 'python'
const server = null != SITE_URL ? null : spawn(python, [path.join(REPO, 'app', 'dev_server.py'), '--no-model', '--port', String(PORT)], { stdio: 'ignore' })
if (null != server) await waitForServer()

async function waitForServer() {
    for (let attempt = 0; attempt < 50; attempt++) {
        try {
            if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) return
        } catch {
            // not up yet
        }
        await new Promise(resolve => setTimeout(resolve, 200))
    }
    throw new Error(`app/dev_server.py did not answer on port ${PORT}.`)
}

// ---------------------------------------------------------------------------
// Browser
//   Edge with a kept profile, English page, log of the page on errors.
// ---------------------------------------------------------------------------

const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: process.env.BROWSER_CHANNEL ?? 'msedge',
    headless: !isHeaded,
})
const page = browser.pages()[0] ?? await browser.newPage()
const pageLog = []
page.on('console', message => pageLog.push(`[${message.type()}] ${message.text()}`))
page.on('pageerror', error => pageLog.push(`[pageerror] ${error.message}`))
await page.addInitScript(() => window.localStorage.setItem('graphlings.language', 'en'))

// ---------------------------------------------------------------------------
// Cases
//   Loads the example, starts the graph, asks, checks the answer.
// ---------------------------------------------------------------------------

// The bubbles the page shows once a graph runs (web/src/texts.js, ui.chat.ready.*, English).
const READY_TEXTS = ['👾 Graph ready. Give it a task.', '👾 Graph running, new conversation started.']

function countReadyBubbles() {
    return page.locator('.bubble-info').evaluateAll((bubbles, texts) => bubbles.filter(bubble => texts.includes(bubble.textContent)).length, READY_TEXTS)
}

const results = []
try {
    await page.goto(PAGE_URL)
    for (const testCase of CASES) {
        results.push(await runCase(testCase))
    }
} finally {
    await browser.close()
    server?.kill()
}

async function runCase({ name, example, question, expect }) {
    const startedAt = Date.now()
    try {
        // Load the example, the page asks before it replaces the graph.
        await page.selectOption('#example-select', example)
        const confirm = page.locator('#confirm-dialog[open] .confirm-ok')
        if (await confirm.isVisible().catch(() => false)) await confirm.click()

        // Start: the first click loads the model, the graph runs once the page says so in a new bubble.
        const readyCount = await countReadyBubbles()
        await page.click('#button-start')
        // A failed load or start ends the wait too, with an error bubble.
        await page.waitForFunction(
            ({ texts, before }) => document.querySelector('.bubble-error')
                || [...document.querySelectorAll('.bubble-info')].filter(bubble => texts.includes(bubble.textContent)).length > before,
            { texts: READY_TEXTS, before: readyCount },
            { timeout: MODEL_TIMEOUT_MS, polling: 500 },
        )
        const status = await page.textContent('#model-status')
        const startErrors = await page.locator('.bubble-error').allTextContents()
        if (startErrors.length > 0) throw new Error(`Start failed: ${startErrors.join(' | ')}`)

        // Ask and wait until the page is ready for the next question.
        const bubbleCount = await page.locator('.bubble').count()
        await page.fill('#chat-input', question)
        await page.click('#button-send')
        await page.waitForFunction(() => document.getElementById('chat-input').disabled, null, { timeout: 5000 }).catch(() => null)
        await page.waitForFunction(() => !document.getElementById('chat-input').disabled, null, { timeout: ANSWER_TIMEOUT_MS })

        const newBubbles = (await page.locator('.bubble').allTextContents()).slice(bubbleCount)
        const errors = await page.locator('.bubble-error').allTextContents()
        const answer = await page.locator('.bubble-ai').evaluateAll(
            (bubbles, before) => bubbles.filter(bubble => [...document.querySelectorAll('.bubble')].indexOf(bubble) >= before).map(bubble => bubble.textContent).join('\n'),
            bubbleCount,
        )
        const isPassed = errors.length === 0 && await expect(answer, page)
        await page.locator('.bubble-error').evaluateAll(bubbles => bubbles.forEach(bubble => bubble.remove()))
        return { name, isPassed, seconds: (Date.now() - startedAt) / 1000, status, detail: isPassed ? answer : [...errors, ...newBubbles].join(' | ') }
    } catch (exception) {
        return { name, isPassed: false, seconds: (Date.now() - startedAt) / 1000, detail: exception.message }
    } finally {
        // A fresh page per case: the next example starts from START with an empty chat.
        await page.click('#button-chat-close').catch(() => null)
    }
}

// ---------------------------------------------------------------------------
// Report
//   Prints every case and stops browser and server.
// ---------------------------------------------------------------------------

for (const { name, isPassed, seconds, status, detail } of results) {
    console.log(`${isPassed ? 'OK  ' : 'FAIL'} ${name} (${seconds.toFixed(1)} s, ${status ?? '-'}): ${String(detail).replace(/\s+/g, ' ').slice(0, 160)}`)
}
const failed = results.filter(result => !result.isPassed)
if (failed.length > 0) {
    console.log('\nPage log (last 40 lines):\n' + pageLog.slice(-40).join('\n'))
    process.exitCode = 1
}
console.log(failed.length === 0 ? `\nOK: ${results.length} cases` : `\nFAILED: ${failed.length} of ${results.length}`)
