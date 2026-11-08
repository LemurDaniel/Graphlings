# Progress

Read this first in a new session, update it at the end of one.

## Goal

A downloadable, playful tool (Windows exe, everything bundled) where people plug agent graphs together
from cards and puzzle pieces and see the plain Python behind it. The point is understanding agents and graphs,
not learning a framework.

## Decisions and why

| Decision | Why |
| --- | --- |
| Generated code is stdlib Python, no LangChain/LangGraph | Understanding, not a framework: every step is visible in one file |
| Own graph engine instead of Blockly | Independent, renders cards + edges the way we want (n8n-like with puzzles inside) |
| Standalone exe: pywebview + PyInstaller + llama-server + Qwen2.5 1.5B Q4_K_M | Testers download, unzip, run. No install, no internet |
| Notizzettel (state) and memory both hang at START | The memory is a drawer for the notepad per conversation, not a trait of one agent: START takes the old notepad out, END puts it back (or in the bin). Was "memory at the agent" until 2026-11-08 |
| Cards show plain German chips, code keys only in the explanation | `messages` -> "💬 Nachrichten", `MEMORY[thread_id]` -> "📂 ein Fach pro Gespräch"; the Python stays English |
| UI in German and English, all texts in `texts.js`, switch reloads the page | Cards are plain data built at load, a reload is simpler than live re-rendering. Examples and default prompts follow the language, so the model answers in it |
| Subagents are helper agents in the workshop, used like tools ("agents as tools") | A helper has its own prompt and model and a fresh notepad with only the task, it returns only its answer. This mirrors Claude Code / OpenAI agents-as-tools and teaches context isolation. No nested sub-graphs: hard in the editor, confusing for beginners. The switch + specialists stays a handoff |
| Palette shows the type as title, the canvas the name | A new card is "Agent", not "chat" |
| Tools hang at the workshop, agent plugs in (`list_tools` / `call_tool`) | Mirrors MCP (`tools/list`, `tools/call`), the workshop is the toolbox |
| English rules prompt in the tools and helpers examples | 1.5B model: 15/15 tool calls instead of 9/15 with German (2026-11-08 again: 36/36 English vs. 29/36 German over 9 cases × 4 runs; German fails dice and refuses "schreib ein Gedicht") |
| No chat-loop arc END → START | User found it confusing, the chat loop is explained in words instead |
| `CONTEXT_SIZE 8192`, `MAX_ANSWER_TOKENS 800` | Reflection overflowed 4096, a switch agent talked endlessly |
| `as_seen_by()` for several agents | llama-server refuses two assistant messages in a row |

## Done

- Editor: cards, puzzle pieces, flow edges and use links, bend points, light/dark, inspector, speech bubbles.
- Patterns as examples: chat with summarizer, smart switch, tools with agent loop, reflection as a task.
- Chat popup with per-agent bubbles, travelling notepad, task mode showing the final notepad.
- Initial commit `5305caf`, pushed to github.com/LemurDaniel/Graphlings (master).
- 2026-11-08: Exe rebuilt after the engine rewrite (`build/Graphlings-win-x64.zip`, 1.08 GB).
  `--self-test` passes for all four examples (chat, switch, tools, reflection), 3-6 s each incl. model start.
- Toolchain on this machine: uv 0.13.7 and Node 26 installed via winget, Python 3.12 via `uv python install`.
- 2026-11-08: Memory moved from the agent to START (port, examples, generator, `migrateWorkspace()` step with test).
  END shows where the notepad goes: 🗑️ bin, 💾 memory, or 📋 result of a task. Chips of notepad and memory in German.
- 2026-11-08: Language switch 🌐 DE/EN (`web/src/i18n.js`, `web/src/texts.js`, ~230 texts). Examples, prompts, hints,
  editor and the terminal texts of the generated Python follow it. `app/runner.py` strips "KI: " and "AI: ".
  The generator test runs both languages (`build/graph.<example>.en.py`).
- 2026-11-08: 🤖 Hilfsagent card (resource in the workshop, provides `tool`, own model socket), generated as a tool
  function `name(task)` with `<NAME>_HELPER_PROMPT`. Example 5 "Chef mit Hilfsagenten" (poet + translator).
  `runner.py` also watches the toolboxes, so tools and helpers glow in the window and a showing helper gets its own bubble.
  Each helper has its own model: dichter "kreativ" (0.9), uebersetzer "genau" (0.1), the boss keeps qwen (0.2, like the
  tools example: colder follows the rules better). The boss rules name German trigger words (Gedicht, Reim, übersetzen),
  say "never refuse, never answer in English" and call the helpers by their German names. Measured 3/3 per case.
  German examples use German names everywhere (zusammenfassen, dichter, uebersetzer), English ones English names.
- 2026-11-08: Dragging a card onto the trash (or back into the palette) deletes it, the card fades while it hovers there.
  Pieces and new cards could do that before, moved cards could not. The chick 🐣 is gone, the monsters 👾 took over.
- 2026-11-08: Prompts are edited in a multi-line textarea that grows with the text (2 to 10 rows, resizable), no more
  single line with an ellipsis.
- 2026-11-08: Slow mode 🐢: a slider in the chat (0 to 3 s, saved per browser) sets `GraphRunner.set_step_delay()`: every
  node, tool and helper waits after it lit up, before it works. The notepad travel takes 70 % of the pause (min 550 ms).
  Measured: 2 s pause -> chef running at 0 ms, done at 3.4 s, team at 3.4 s, poet at 5.4 s.
- 2026-11-08: `app/dev_server.py`: the page plus the chat API over HTTP (stdlib http.server), answers streamed as
  server-sent events. `app.js` picks pywebview > /api (BrowserBridge) > none. The preview in .claude/launch.json uses it.
  The own confirm dialog replaces `window.confirm()` (blocked in the Claude browser pane).
- 2026-11-08: All five examples laid out on one line of flow (START y=108, agents y=60, switches y=52, END y=115),
  resources at y=320 under the socket that uses them, memory one row lower, loops routed around the outside with bend points.
- 2026-11-08: Monsters 👾: one vector creature per graphling type in `web/src/monsters.graph.js` (agent cyclops with antenna,
  purple summarizer with glasses and papers, orange workshop with hard hat and wrench, pink three-eyed switch with arrow
  horns, lime helper with propeller cap and pencil) plus the orange mascot. They sit on the top left corner of the card and
  look over its edge (`.gl-has-monster`, `.gl-avatar-monster` in engine.css), animated via style.css (blink, wave, wiggle …).
  Palette items get room above. `prefers-reduced-motion` stops the animations.
- 2026-11-08: Monsters are alive (`web/src/monsters.live.js`): pupils follow the pointer, a running monster looks up with
  thinking dots and works fast (wrench, papers, pencil), done = cheer + stars, the notepad is thrown and caught along the
  edges (editor emits 'travel'), a click = flip / tongue / wink, every 6.5 s one monster yawns or scratches its head.
  Drawing: radial gradient body, gloss, fur all around, hands, shadow under the feet.

## Open

- ⚡ Parallel pattern (fan-out / fan-in), postponed on purpose. Could build on helper agents (ask several at once).
- Browser tab had an older saved graph in `sessionStorage` `graphlings.backup` (only if the user wants it back).
- Small-model quirks: occasionally miscopies tool results (weekday) or mixes English words into answers.
- Python-side status messages (`app/model_server.py`, `app/runner.py`) are still German only.

## Next step

Rebuild the exe (`./build.ps1`, the web/ folder changed), unzip it on a clean machine (or folder) and click
through the four examples in the window. Then decide on the parallel pattern.
