// NOTE:
//   Generates the Python code of every example graph, headless in Node, no browser needed,
//   and checks it: no problems, the parts each pattern needs, valid Python, the migration.
//   Requires: Node 20+. Python 3.11+ on PATH (or PYTHON) for the syntax check, skipped without.
//
//   node tests/test.generator.mjs [OUTPUT_DIR]
//
//   Exit code 1 when any check fails.

//
//   Chapters:
//     CHECK EXAMPLES    Generates every example and checks the code.
//     CHECK MIGRATION   Old graphs with tools at the agent load the new way.
//

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { DEFINITIONS, migrateWorkspace, PLAN_TYPE, TYPES } from '../web/src/blocks.graph.js'
import { normalizeWorkspace } from '../web/src/engine/engine.model.js'
import { EXAMPLES } from '../web/src/examples.graph.js'
import { generatePython } from '../web/src/generator.python.js'

const outputDir = process.argv[2] ?? 'build'
const python = process.env.PYTHON ?? 'python'

// What the code of each example must contain: the pattern it shows.
const EXPECTED = {
    chat: ['def stream_answer(', 'def summarize(', 'MEMORY'],
    switch: ['def route_absicht(', 'def techniker(', 'def plauderer('],
    tools: ['WERKSTATT_TOOLS = {', 'def list_tools(', 'def call_tool(', 'tools=list_tools(WERKSTATT_TOOLS)', 'call_tool(WERKSTATT_TOOLS'],
    reflection: ['def run_task(', 'def as_seen_by(', 'def route_gut_genug('],
}

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
    const file = path.join(outputDir, `graph.${example.id}.py`)
    fs.writeFileSync(file, code)

    console.log(`${example.id}: ${lineOwners.length} lines, canRun ${canRun}`)
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
check(toolLinks.length === 3 && toolLinks.every(edge => edge.from === 'node-workshop'), 'tool links not moved to the workshop')
check(migrated.edges.some(edge => edge.from === 'node-helper' && edge.port === 'workshop' && edge.to === 'node-workshop'), 'agent not plugged into the workshop')
check(generatePython(normalizeWorkspace(migrated, DEFINITIONS, PLAN_TYPE)).problems.length === 0, 'migrated graph has problems')

console.log(failures === 0 ? 'OK' : `${failures} check(s) failed`)
if (failures > 0) process.exitCode = 1
