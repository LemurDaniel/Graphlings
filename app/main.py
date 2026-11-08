# NOTE:
#   Graphlings: agents and graphs to plug together. Opens the window and wires it to Python.
#   Requires: the packages from app/requirements.txt, and for the chat the built-in
#             model from './build.ps1 -Task Runtime' (the blocks work without it).
#
#   uv run --with-requirements app/requirements.txt app/main.py
#
#   As Graphlings.exe (built by build.ps1) the files sit next to the exe:
#   web/ for the page and runtime/ for llama-server and the model.
#
#   Graphlings.exe --self-test chat.py   # no window: loads chat.py, asks one question,
#                                        # writes the result to %LOCALAPPDATA%/Graphlings/self-test.txt

#
#   Chapters:
#     HELPERS           Paths of the app files and of the user data.
#     BRIDGE TO PAGE    The functions the page calls as window.pywebview.api.
#     RUN APP           Starts the model, opens the window, cleans up.
#

import json
import logging
import os
import sys
import time
import traceback
from pathlib import Path

import webview

from model_server import ModelServer
from runner import GraphRunner

APP_NAME = "Graphlings"
WINDOW_SIZE = (1440, 900)
WINDOW_MIN_SIZE = (960, 640)
SELF_TEST_QUESTION = "Sag in einem Satz Hallo."

logger = logging.getLogger("graphlings")


# ===========================================================================
# ===============================   HELPERS   ===============================
# ===========================================================================
#
#   find_base_dir       Folder with web/ and runtime/, next to the exe or the repo root.
#   find_work_dir       Writable folder for chat.py, logs and the page storage.
#   unblock_app_files   Removes the download mark from the packed files, .NET refuses them otherwise.
#   describe_error      One readable line for the chat, the full trace for the log.
#


def find_base_dir() -> Path:
    """
    :returns: The folder next to Graphlings.exe, or the repo root when run from source.
    """
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent.parent


def find_work_dir() -> Path:
    """
    :returns: %LOCALAPPDATA%/Graphlings, writable also when the exe sits in a read-only folder.
    """
    root = os.getenv("LOCALAPPDATA") or str(Path.home())
    work_dir = Path(root) / APP_NAME
    work_dir.mkdir(parents=True, exist_ok=True)
    return work_dir


def unblock_app_files(base_dir: Path) -> int:
    """
    Files unzipped from a browser download carry the Mark-of-the-Web (the
    'Zone.Identifier' stream). .NET Framework refuses to load such a managed DLL,
    so pywebview dies with "Failed to resolve Python.Runtime.Loader.Initialize".
    Removing the stream is what 'Unblock-File' does, here for every file of the app.

    :param base_dir: (Required) The folder next to Graphlings.exe.
    :returns:        The number of unblocked files, 0 when run from source or not on Windows.
    """
    if os.name != "nt" or not getattr(sys, "frozen", False):
        return 0

    unblocked = 0
    for file in base_dir.rglob("*"):
        if not file.is_file():
            continue
        try:
            os.remove(f"{file}:Zone.Identifier")
            unblocked += 1
        except FileNotFoundError:
            continue        # no mark on this file, the normal case
        except OSError as error:
            # A read-only install folder: the first start then needs 'Unblock-File' by hand.
            logger.warning("[unblock_app_files] Could not unblock '%s': %s", file, error)
    if unblocked:
        logger.warning("[unblock_app_files] Removed the download mark from %d files.", unblocked)
    return unblocked


def describe_error(error: Exception) -> str:
    """
    :param error: (Required) The caught error.
    :returns:     '<Type>: <message>' for the chat window.
    """
    logger.error("".join(traceback.format_exception(error)))
    return f"{type(error).__name__}: {error}"


# ===========================================================================
# ===========================   BRIDGE TO PAGE   ============================
# ===========================================================================
#
#   Api   Public methods are callable from JavaScript, each returns a dict.
#
#   pywebview runs every call in its own thread, so a long answer does not
#   block the window. Streamed tokens go back via window.graphlings.onChunk.
#


class Api:
    """
    The functions of window.pywebview.api. Fields start with '_', so pywebview
    does not hand them to the page.
    """

    def __init__(self, server: ModelServer, runner: GraphRunner) -> None:
        self._server = server
        self._runner = runner
        self._window = None

    def attach(self, window) -> None:
        """
        :param window: (Required) The pywebview window, needed to stream into the page.
        """
        self._window = window

    def model_status(self) -> dict:
        return self._server.status()

    def start_graph(self, code: str) -> dict:
        try:
            self._runner.load(code)
            return {"ok": True}
        except Exception as error:  # noqa: BLE001 - any error of user code goes to the chat
            return {"ok": False, "error": describe_error(error)}

    def ask(self, question: str) -> dict:
        def send_chunk(text: str) -> None:
            self._window.evaluate_js(f"window.graphlings.onChunk({json.dumps(text)})")

        # The card of the running node glows in the window, a done node gets a check.
        def send_node(name: str, status: str) -> None:
            self._window.evaluate_js(f"window.graphlings.onNode({json.dumps(name)}, {json.dumps(status)})")

        try:
            # A task returns its final notepad, the window shows it under the answer.
            final_state = self._runner.ask(question, send_chunk, send_node)
            return {"ok": True, "state": final_state}
        except Exception as error:  # noqa: BLE001 - any error of user code goes to the chat
            return {"ok": False, "error": describe_error(error)}

    def reset(self) -> dict:
        self._runner.reset()
        return {"ok": True}

    def set_step_delay(self, seconds: float) -> dict:
        self._runner.set_step_delay(seconds)
        return {"ok": True}

    def save_code(self, code: str) -> dict:
        result = self._window.create_file_dialog(
            webview.FileDialog.SAVE,
            save_filename="chat.py",
            file_types=("Python (*.py)",),
        )
        if not result:
            return {"ok": False, "error": None}

        # Depending on the platform the dialog returns a path or a tuple of paths.
        path = result if isinstance(result, str) else result[0]
        try:
            Path(path).write_text(code, encoding="utf-8")
            return {"ok": True}
        except OSError as error:
            return {"ok": False, "error": describe_error(error)}


# ===========================================================================
# ===============================   RUN APP   ===============================
# ===========================================================================
#
#   run_self_test   Checks a build without a window: model, generated code, one answer.
#   main            Starts the model, opens the window, stops the model on close.
#


def run_self_test(code_file: Path, server: ModelServer, runner: GraphRunner, work_dir: Path) -> int:
    """
    Loads the code like the start button does and asks one question.

    :param code_file: (Required) A chat.py generated by Graphlings.
    :param server:    (Required) The model server, not started yet.
    :param runner:    (Required) The runner for the code.
    :param work_dir:  (Required) Where self-test.txt with the result goes.
    :returns:         0 when an answer came back, else 1.
    """
    result_file = work_dir / "self-test.txt"
    chunks = []

    server.start()
    try:
        while server.status()["state"] == "starting":
            time.sleep(0.5)
        status = server.status()
        if status["state"] != "ready":
            raise RuntimeError(status["message"])

        runner.load(code_file.read_text(encoding="utf-8"))
        runner.ask(SELF_TEST_QUESTION, chunks.append)
    except Exception as error:  # noqa: BLE001 - every failure is a failed test
        result_file.write_text(f"FAILED {describe_error(error)}\n", encoding="utf-8")
        return 1
    finally:
        server.stop()

    answer = "".join(chunks).strip()
    result_file.write_text(f"{'OK' if answer else 'FAILED empty answer'} {answer}\n", encoding="utf-8")
    return 0 if answer else 1


def main() -> int:
    """
    :returns: The process exit code, 0 when the window was closed normally.
    """
    base_dir = find_base_dir()
    work_dir = find_work_dir()
    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "WARNING").upper(),
        filename=work_dir / "graphlings.log",
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    unblock_app_files(base_dir)

    server = ModelServer(base_dir / "runtime", work_dir / "llama-server.log")
    runner = GraphRunner(work_dir)
    if len(sys.argv) == 3 and sys.argv[1] == "--self-test":
        return run_self_test(Path(sys.argv[2]), server, runner, work_dir)

    api = Api(server, runner)

    window = webview.create_window(
        APP_NAME,
        url=str(base_dir / "web" / "index.html"),
        js_api=api,
        width=WINDOW_SIZE[0],
        height=WINDOW_SIZE[1],
        min_size=WINDOW_MIN_SIZE,
    )
    api.attach(window)

    # The model loads while the window opens, the page shows its status.
    server.start()
    try:
        webview.start(
            http_server=True,
            private_mode=False,
            storage_path=str(work_dir / "webview"),
        )
    finally:
        server.stop()

    return 0


if __name__ == "__main__":
    sys.exit(main())
