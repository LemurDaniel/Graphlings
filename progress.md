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
| Notizzettel (state) hangs at START, memory at the agent | START begins every run with a notepad, the agent is the one that remembers |
| Tools hang at the workshop, agent plugs in (`list_tools` / `call_tool`) | Mirrors MCP (`tools/list`, `tools/call`), the workshop is the toolbox |
| English rules prompt in the tools example | 1.5B model: 15/15 tool calls instead of 9/15 with German |
| No chat-loop arc END → START | User found it confusing, the chat loop is explained in words instead |
| `CONTEXT_SIZE 8192`, `MAX_ANSWER_TOKENS 800` | Reflection overflowed 4096, a switch agent talked endlessly |
| `as_seen_by()` for several agents | llama-server refuses two assistant messages in a row |

## Done

- Editor: cards, puzzle pieces, flow edges and use links, bend points, light/dark, inspector, speech bubbles.
- Patterns as examples: chat with summarizer, smart switch, tools with agent loop, reflection as a task.
- Chat popup with per-agent bubbles, travelling notepad, task mode showing the final notepad.
- Initial commit `5305caf` (nothing pushed, remote is empty).

## Open

- ⚡ Parallel pattern (fan-out / fan-in), postponed on purpose.
- Exe not rebuilt since the engine rewrite: `./build.ps1`, then test the zip.
- Browser tab had an older saved graph in `sessionStorage` `graphlings.backup` (only if the user wants it back).
- Small-model quirks: occasionally miscopies tool results (weekday) or mixes English words into answers.

## Next step

Rebuild the exe and run `--self-test` against the four examples.
