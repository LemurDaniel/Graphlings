# Graphlings

A playful learning tool: build agent graphs from cards and puzzle pieces, get readable Python.
Goal: understand agents and graphs **in general**. The generated code is plain Python (stdlib only),
**no LangChain/LangGraph**: state, nodes, edges, engine and the HTTP call to the model are visible in one file.

Read `progress.md` first (goal, decisions, open items, next step) and update it at the end of a session.

## Layout

- `web/`: the page. Own graph engine in `web/src/engine/` (no Blockly), cards and pieces in `blocks.graph.js`,
  examples in `examples.graph.js`, Python generator in `generator.python.js`, glue in `app.js`.
  Every visible text lives in `texts.js` (German + English) and is read through `t()` from `i18n.js`.
  The monsters (SVG per graphling type, mascot) live in `monsters.graph.js`, their behaviour in `monsters.live.js`,
  the animations in `web/style.css`.
- `app/`: pywebview window (`main.py`), runs the generated code (`runner.py`), starts llama-server (`model_server.py`),
  `dev_server.py` serves the page plus the chat API over HTTP for a plain browser.
- `build.ps1`: runtime download (llama.cpp + Qwen2.5 1.5B GGUF into `runtime/`), PyInstaller exe, zip.
- `tests/test.generator.mjs`: writes `build/graph.<example>.py` for every example.
- `.github/workflows/release.yaml`: on a `v*` tag builds the zip on windows-latest, runs generator test and exe self-test, creates the release.

## Commands

```powershell
./build.ps1 -Task Runtime                                     # llama-server + model into runtime/
uv run --with-requirements app/requirements.txt app/main.py   # run the app from source
python app/dev_server.py                                      # page + chat in the browser at http://127.0.0.1:8777 (stdlib only)
node tests/test.generator.mjs                                 # generate + check all examples in both languages (set $env:PYTHON = (uv python find 3.12) for the syntax check)
python tests/test.model.py                                    # examples against the real model, checks the way taken
./build.ps1                                                   # exe + zip, only on request (takes long)
```

The dev server sends no-store, so edits show on a plain reload. With another static server browsers cache modules:
`fetch(url, {cache: 'reload'})` then reload.

## Conventions

- Load the `code-style` skill before writing code. JS: ESM, no semicolons, 4 spaces. Identifiers and code comments English.
- UI texts, card descriptions and speech bubbles: plain words, cards speak in first person. Every text goes into
  `web/src/texts.js` as `{ de, en }` and is read with `t('key')`, never written inline. German is the reference.
  The language is picked when the page loads (`GRAPHLINGS_LANGUAGE`, localStorage, browser), switching reloads.
- Generated Python must stay readable for beginners: docstrings, chapter banners, no hidden magic.
- "State" is shown as "Notizzettel". It hangs at START, the memory too (a drawer for the notepad per conversation).
  Tools and helper agents hang at the workshop, the agent plugs into the workshop (like MCP: `list_tools` / `call_tool`).
  A helper agent is an agent used like a tool: own prompt, own model, fresh notepad with only the task ("agents as tools").

## Gotchas

- The 1.5B model calls tools reliably only with an **English prompt with clear rules** and English tool descriptions
  (measured 15/15 vs. 9/15). The answer language follows the UI language (last rule of the prompt).
- Wide text fields (prompts) are multi-line textareas, short ones single-line inputs. Newlines in prompts are fine,
  the generator writes them as Python string literals.
- Saved graphs live in localStorage (`graphlings.workspace.v3`). Changing ports needs a step in `migrateWorkspace()`.
- llama-server: `--ctx-size 8192` and `MAX_ANSWER_TOKENS` are needed for multi-agent graphs (reflection).
- Never use `window.confirm()`/`alert()`: the Claude browser pane (and some webviews) block native dialogs and return false.
  Use `askConfirm()` in `app.js` (the `<dialog>` in index.html).

## Rules

- Never commit or push without an explicit request.
- Never modify `../Homelabs-KI/chat.py` (the original the chat example is modeled on).

## Notes

- 2026-11-08: The "Claude Code 16 tips" checklist has been reviewed for this repo. Adopted: progress.md (#10/#12/#16),
  tests that check (#14), context audit (#1). Declined: settings gate for git push (#15).
