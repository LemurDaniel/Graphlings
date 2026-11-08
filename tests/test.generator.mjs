// NOTE:
//   Generates the Python code of every example graph, headless in Node, no browser needed,
//   and checks it: no problems, the parts each pattern needs, valid Python, the migration.
//   Requires: Node 20+. Python 3.11+ on PATH (or PYTHON) for the syntax check, skipped without.
//
//   node tests/test.generator.mjs [OUTPUT_DIR]
//
//   Runs in German, then starts itself again with GRAPHLINGS_LANGUAGE=en for the English
//   examples (the language is picked when the modules load, see web/src/i18n.js).
//
//   Exit code 1 when any check fails.

//
//   Chapters:
//     CHECK EXAMPLES    Generates every example and checks the code.
//     CHECK MIGRATION   Old graphs with tools at the agent load the new way.
//     CHECK ENGLISH     The same checks with the English texts, in a second process.
//

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { DEFINITIONS, migrateWorkspace, PLAN_TYPE, TYPES } from '../web/src/blocks.graph.js'
import { normalizeWorkspace } from '../web/src/engine/engine.model.js'
import { EXAMPLES } from '../web/src/examples.graph.js'
import { generatePython } from '../web/src/generator.python.js'
import { LANGUAGE } from '../web/src/i18n.js'

const outputDir = process.argv[2] ?? 'build'
const fileSuffix = LANGUAGE === 'de' ? '' : `.${LANGUAGE}`
const python = process.env.PYTHON ?? 'python'

// What the code of each example must contain: the pattern it shows. Names follow the language.
const EXPECTED = {
    de: {
        chat: ['def stream_answer(', 'def zusammenfassen(', 'MEMORY', 'print("KI: "'],
        switch: ['def route_absicht(', 'def techniker(', 'def plauderer('],
        tools: ['WERKSTATT_TOOLS = {', 'def list_tools(', 'def call_tool(', 'tools=list_tools(WERKSTATT_TOOLS)', 'call_tool(WERKSTATT_TOOLS'],
        reflection: ['def run_task(', 'def as_seen_by(', 'def route_gut_genug('],
        helpers: ['def dichter(task: str) -> str:', 'def uebersetzer(task: str) -> str:', 'DICHTER_HELPER_PROMPT', 'TEAM_TOOLS = {', '"dichter": dichter,', 'def route_will_hilfe(', 'KREATIV_MODEL', 'GENAU_MODEL'],
    },
    en: {
        chat: ['def stream_answer(', 'def summarize(', 'MEMORY', 'print("AI: "'],
        switch: ['def route_intent(', 'def techie(', 'def chatter('],
        tools: ['WORKSHOP_TOOLS = {', 'def list_tools(', 'def call_tool(', 'tools=list_tools(WORKSHOP_TOOLS)', 'call_tool(WORKSHOP_TOOLS'],
        reflection: ['def run_task(', 'def as_seen_by(', 'def route_good_enough('],
        helpers: ['def poet(task: str) -> str:', 'def translator(task: str) -> str:', 'POET_HELPER_PROMPT', 'TEAM_TOOLS = {', '"poet": poet,', 'def route_wants_help(', 'CREATIVE_MODEL', 'PRECISE_MODEL'],
    },
}[LANGUAGE]

let failures = 0

function check(isOk, message) {
    if (isOk) return
    failures += 1
    console.log(`    FAIL ${message}`)
}

// ===========================================================================
// ==========================   CHECK EXAMPLES   =============================
// ===========================================================================

fs.mkdirSync(outputDir, { recursive: true })
let hasPython = true

for (const example of EXAMPLES) {
    // The editor normalizes every loaded workspace, the test does the same.
    const workspace = normalizeWorkspace(example.workspace, DEFINITIONS, PLAN_TYPE)
    const { code, lineOwners, problems, canRun } = generatePython(workspace)
    const file = path.join(outputDir, `graph.${example.id}${fileSuffix}.py`)
    fs.writeFileSync(file, code)

    console.log(`${example.id} (${LANGUAGE}): ${lineOwners.length} lines, canRun ${canRun}`)
    check(canRun, 'the graph cannot run')
    // An example is a model answer: not even a hint.
    problems.forEach(problem => check(false, `${problem.isError ? 'error' : 'hint'}: ${problem.text}`))
    const lineCount = code.replace(/\n$/, '').split('\n').length
    check(lineOwners.length === lineCount, `every line needs an owner entry (${lineOwners.length} owners, ${lineCount} lines)`)
    for (const part of EXPECTED[example.id] ?? []) check(code.includes(part), `missing "${part}"`)
    check(null != EXPECTED[example.id], 'no expectations for this example, add them to EXPECTED')

    if (!hasPython) continue
    const result = spawnSync(python, ['-m', 'py_compile', file], { encoding: 'utf8' })
    if (null != result.error) {
        hasPython = false
        console.log(`    skip syntax check: "${python}" not found, set PYTHON`)
        continue
    }
    check(result.status === 0, `invalid Python: ${result.stderr.trim()}`)
}

// ===========================================================================
// =========================   CHECK MIGRATION   =============================
// ===========================================================================

const tools = EXAMPLES.find(example => example.id === 'tools').workspace
const oldStyle = {
    ...tools,
    edges: [
        ...tools.edges.filter(edge => !(edge.port === 'tools' || edge.port === 'workshop')),
        ...tools.nodes.filter(node => node.type === TYPES.tool)
            .map(node => ({ id: `old-${node.id}`, kind: 'use', from: 'node-helper', port: 'tools', to: node.id })),
    ],
}
const migrated = migrateWorkspace(oldStyle)
const toolLinks = migrated.edges.filter(edge => edge.port === 'tools')

console.log('migration: tools at the agent move to the workshop')
const chat = EXAMPLES.find(example => example.id === 'chat').workspace
const oldMemory = {
    ...chat,
    edges: [
        ...chat.edges.filter(edge => edge.port !== 'memory'),
        { id: 'old-chat-memory', kind: 'use', from: 'node-chat', port: 'memory', to: 'memory' },
    ],
}
const memoryLinks = migrateWorkspace(oldMemory).edges.filter(edge => edge.port === 'memory')
console.log('migration: the memory at the agent moves to START')
check(memoryLinks.length === 1 && memoryLinks[0].from === 'node-start' && memoryLinks[0].to === 'memory', 'memory link not moved to START')
check(toolLinks.length === 3 && toolLinks.every(edge => edge.from === 'node-workshop'), 'tool links not moved to the workshop')
check(migrated.edges.some(edge => edge.from === 'node-helper' && edge.port === 'workshop' && edge.to === 'node-workshop'), 'agent not plugged into the workshop')
check(generatePython(normalizeWorkspace(migrated, DEFINITIONS, PLAN_TYPE)).problems.length === 0, 'migrated graph has problems')

// ===========================================================================
// ==========================   CHECK ENGLISH   ==============================
// ===========================================================================

if (LANGUAGE === 'de') {
    const english = spawnSync(process.execPath, [process.argv[1], outputDir], {
        encoding: 'utf8',
        env: { ...process.env, GRAPHLINGS_LANGUAGE: 'en' },
    })
    process.stdout.write(english.stdout)
    process.stderr.write(english.stderr)
    check(english.status === 0, 'the English run failed')
}

console.log(failures === 0 ? `OK (${LANGUAGE})` : `${failures} check(s) failed (${LANGUAGE})`)
if (failures > 0) process.exitCode = 1
