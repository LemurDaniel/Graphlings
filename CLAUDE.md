# Graphlings

A playful learning tool: build agent graphs from cards and puzzle pieces, get readable Python.
Goal: understand agents and graphs **in general**. The generated code is plain Python (stdlib only),
**no LangChain/LangGraph**: state, nodes, edges, engine and the HTTP call to the model are visible in one file.

## Layout

- `web/`: the page. Own graph engine in `web/src/engine/` (no Blockly), cards and pieces in `blocks.graph.js`,
  examples in `examples.graph.js`, Python generator in `generator.python.js`, glue in `app.js`.
- `app/`: pywebview window (`main.py`), runs the generated code (`runner.py`), starts llama-server (`model_server.py`).
- `build.ps1`: runtime download (llama.cpp + Qwen2.5 1.5B GGUF into `runtime/`), PyInstaller exe, zip.
- `tests/test.generator.mjs`: writes `build/graph.<example>.py` for every example.

## Commands

```powershell
./build.ps1 -Task Runtime                                     # llama-server + model into runtime/
uv run --with-requirements app/requirements.txt app/main.py   # run the app from source
node tests/test.generator.mjs                                 # generate all examples (node is not on PATH here)
./build.ps1                                                   # exe + zip, only on request (takes long)
```

UI only: serve `web/` with any static server. After editing JS/CSS, browsers cache modules:
`fetch(url, {cache: 'reload'})` then reload.

## Conventions

- Load the `code-style` skill before writing code. JS: ESM, no semicolons, 4 spaces. Identifiers and code comments English.
- UI texts, card descriptions and speech bubbles: German, plain words, cards speak in first person.
- Generated Python must stay readable for beginners: docstrings, chapter banners, no hidden magic.
- "State" is shown as "Notizzettel". It hangs at START. Memory hangs at the agent. Tools hang at the workshop,
  the agent plugs into the workshop (like MCP: `list_tools` / `call_tool`).

## Gotchas

- The 1.5B model calls tools reliably only with an **English prompt with clear rules** and English tool descriptions
  (measured 15/15 vs. 9/15). Answers still come in German.
- Text fields are single-line inputs: no `\n` in prompts of examples.
- Saved graphs live in localStorage (`graphlings.workspace.v3`). Changing ports needs a step in `migrateWorkspace()`.
- llama-server: `--ctx-size 8192` and `MAX_ANSWER_TOKENS` are needed for multi-agent graphs (reflection).

## Rules

- Never commit or push without an explicit request.
- Never modify `../Homelabs-KI/chat.py` (the original the chat example is modeled on).

## Notes

- 2026-11-08: The "Claude Code 16 tips" checklist has been reviewed for this repo (see the session from that day).
