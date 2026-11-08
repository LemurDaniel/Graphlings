# NOTE:
#   Dev server for the browser: serves web/ and offers the chat of the app over HTTP, so the
#   page runs with the real model in a normal browser instead of the pywebview window.
#   Standard library only. The page talks to /api/* like it talks to window.pywebview.api,
#   streamed pieces of an answer come back as server-sent events.
#   Requires: Python 3.11+, the model from './build.ps1 -Task Runtime' (the page works without).
#
#   python app/dev_server.py                 # http://127.0.0.1:8777
#   python app/dev_server.py --port 9000
#   python app/dev_server.py --no-model      # page only, the chat says the model is missing

#
#   Chapters:
#     HELPERS          Paths and the one-line error text.
#     SERVE PAGE       Static files from web/, never cached, so edits show at once.
#     SERVE API        model_status, start_graph, ask (streamed), reset, set_step_delay.
#     RUN SERVER       Starts the model and the server, stops both on Ctrl+C.
#

import argparse
import json
import logging
import os
import sys
import traceback
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from model_server import ModelServer  # noqa: E402
from runner import GraphRunner  # noqa: E402

APP_NAME = "Graphlings"
DEFAULT_PORT = 8777

logger = logging.getLogger("graphlings.dev")


# ===========================================================================
# ===============================   HELPERS   ===============================
# ===========================================================================
#
#   find_work_dir    %LOCALAPPDATA%/Graphlings, like the app.
#   describe_error   One readable line for the chat, the full trace for the log.
#


def find_work_dir() -> Path:
    """
    :returns: %LOCALAPPDATA%/Graphlings, the same folder the app uses.
    """
    root = os.getenv("LOCALAPPDATA") or str(Path.home())
    work_dir = Path(root) / APP_NAME
    work_dir.mkdir(parents=True, exist_ok=True)
    return work_dir


def describe_error(error: Exception) -> str:
    """
    :param error: (Required) The caught error.
    :returns:     '<Type>: <message>' for the chat window.
    """
    logger.error("".join(traceback.format_exception(error)))
    return f"{type(error).__name__}: {error}"


# ===========================================================================
# ==============================   SERVE PAGE   =============================
# ===========================================================================
#
#   DevHandler   One handler for the page and the API, one instance per request.
#
#   The page files come from web/. Every response says 'no-store', so the browser
#   loads changed JS and CSS at once, without the fetch(url, {cache: 'reload'}) dance.
#


class DevHandler(SimpleHTTPRequestHandler):
    """
    Serves web/ and the API. The server passes model and runner through 'context'.
    """

    context: dict = {}

    def __init__(self, *args, **kwargs) -> None:
        super().__init__(*args, directory=str(self.context["web_dir"]), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, format: str, *args) -> None:  # noqa: A002 - signature of the base class
        logger.debug("[DevHandler] " + format, *args)

    # ---------------------------------------------------------------------------
    # Routes
    #   GET serves the page or the model status, POST runs the chat.
    # ---------------------------------------------------------------------------

    def do_GET(self) -> None:  # noqa: N802 - name of the base class
        if self.path == "/api/model_status":
            return self._send_json(self.context["server"].status())
        if self.path.startswith("/api/"):
            return self._send_json({"ok": False, "error": f"Unknown route {self.path}"}, HTTPStatus.NOT_FOUND)
        return super().do_GET()

    def do_POST(self) -> None:  # noqa: N802 - name of the base class
        body = self._read_json()
        if self.path == "/api/start_graph":
            return self._send_json(self._start_graph(body.get("code", "")))
        if self.path == "/api/reset":
            self.context["runner"].reset()
            return self._send_json({"ok": True})
        if self.path == "/api/set_step_delay":
            self.context["runner"].set_step_delay(float(body.get("seconds") or 0))
            return self._send_json({"ok": True})
        if self.path == "/api/ask":
            return self._ask(body.get("question", ""))
        return self._send_json({"ok": False, "error": f"Unknown route {self.path}"}, HTTPStatus.NOT_FOUND)

    # ===========================================================================
    # ==============================   SERVE API   ==============================
    # ===========================================================================
    #
    #   _start_graph   Loads the generated code into the runner.
    #   _ask           Runs one question, streams chunk and node events, ends with done.
    #   _read_json     The request body as a dict, {} when empty or broken.
    #   _send_json     One JSON response.
    #   _send_event    One server-sent event: 'event: name' and 'data: json'.
    #

    def _start_graph(self, code: str) -> dict:
        try:
            self.context["runner"].load(code)
            return {"ok": True}
        except Exception as error:  # noqa: BLE001 - any error of user code goes to the chat
            return {"ok": False, "error": describe_error(error)}

    def _ask(self, question: str) -> None:
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.end_headers()

        # The runner calls back on its own thread, which is this request's thread: write straight through.
        def send_chunk(text: str) -> None:
            self._send_event("chunk", {"text": text})

        def send_node(name: str, status: str) -> None:
            self._send_event("node", {"name": name, "status": status})

        try:
            final_state = self.context["runner"].ask(question, send_chunk, send_node)
            self._send_event("done", {"ok": True, "state": final_state})
        except Exception as error:  # noqa: BLE001 - any error of user code goes to the chat
            self._send_event("done", {"ok": False, "error": describe_error(error)})

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if length == 0:
            return {}
        try:
            return json.loads(self.rfile.read(length))
        except ValueError:
            return {}

    def _send_json(self, payload: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _send_event(self, name: str, payload: dict) -> None:
        self.wfile.write(f"event: {name}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n".encode("utf-8"))
        self.wfile.flush()


# ===========================================================================
# ==============================   RUN SERVER   =============================
# ===========================================================================
#
#   1. Arguments   Port and whether to start the model.
#   2. Context     Model server and runner, shared by every request.
#   3. Serve       Runs until Ctrl+C, then stops the model.
#


def main() -> int:
    """
    :returns: The process exit code, 0 after Ctrl+C.
    """
    # ---------------------------------------------------------------------------
    # Arguments
    #   Port and whether to start the model.
    # ---------------------------------------------------------------------------

    parser = argparse.ArgumentParser(description="Graphlings in the browser, with the model.")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"port of the page, default {DEFAULT_PORT}")
    parser.add_argument("--no-model", action="store_true", help="do not start llama-server, the chat stays off")
    arguments = parser.parse_args()

    base_dir = Path(__file__).resolve().parent.parent
    work_dir = find_work_dir()
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO").upper(), format="%(levelname)s %(name)s %(message)s")

    # ---------------------------------------------------------------------------
    # Context
    #   Model server and runner, shared by every request.
    # ---------------------------------------------------------------------------

    server = ModelServer(base_dir / "runtime", work_dir / "llama-server.log")
    DevHandler.context = {"web_dir": base_dir / "web", "server": server, "runner": GraphRunner(work_dir)}
    if not arguments.no_model:
        server.start()

    # ---------------------------------------------------------------------------
    # Serve
    #   Runs until Ctrl+C, then stops the model.
    # ---------------------------------------------------------------------------

    httpd = ThreadingHTTPServer(("127.0.0.1", arguments.port), DevHandler)
    logger.info(f"[dev_server] Graphlings at http://127.0.0.1:{arguments.port} (Ctrl+C stops it)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        logger.info("[dev_server] Stopping.")
    finally:
        httpd.server_close()
        server.stop()
    return 0


if __name__ == "__main__":
    sys.exit(main())
