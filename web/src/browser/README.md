# Browser

The Python side without any install, for GitHub Pages: the model and the generated code run right in the browser.

| File | Content |
| --- | --- |
| `bridge.web.js` | `WebBridge`: loads the model with wllama (WebGPU, else the processor), answers the model calls, talks to the worker. Same calls as `window.pywebview.api`. |
| `worker.python.js` | Web worker with Pyodide: loads the unchanged `app/runner.py`, runs start, ask, reset and slow mode. |
| `shim.urllib.py` | Replaces `urllib.request.urlopen` in Pyodide, so the generated code reaches the model in the page instead of llama-server. |

How a question travels: `app.js` → `WebBridge.ask()` → worker → `runner.ask()` → generated `ask_model()` →
`urlopen` (shim) → blocks with `Atomics.wait` → `WebBridge` asks wllama → writes the answer into the
SharedArrayBuffer → the worker wakes up. That needs cross-origin isolation: `app/dev_server.py` sends
COOP/COEP, on GitHub Pages `web/coi-serviceworker.js` adds them.
