// NOTE:
//   Generates the Python code of every example graph, headless in Node, no browser needed.
//   Requires: Node 20+.
//
//   node tests/test.generator.mjs [OUTPUT_DIR]

import fs from 'node:fs'
import path from 'node:path'

import { DEFINITIONS, PLAN_TYPE } from '../web/src/blocks.graph.js'
import { normalizeWorkspace } from '../web/src/engine/engine.model.js'
import { EXAMPLES } from '../web/src/examples.graph.js'
import { generatePython } from '../web/src/generator.python.js'

const outputDir = process.argv[2] ?? 'build'
fs.mkdirSync(outputDir, { recursive: true })

for (const example of EXAMPLES) {
    // The editor normalizes every loaded workspace, the test does the same.
    const workspace = normalizeWorkspace(example.workspace, DEFINITIONS, PLAN_TYPE)
    const { code, lineOwners, problems, canRun } = generatePython(workspace)
    fs.writeFileSync(path.join(outputDir, `graph.${example.id}.py`), code)

    console.log(`${example.id}: ${lineOwners.length} lines, canRun ${canRun}`)
    problems.forEach(problem => console.log(`    ${problem.isError ? 'ERROR' : 'hint '} ${problem.text}`))
    if (!canRun) process.exitCode = 1
}
