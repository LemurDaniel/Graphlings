# NOTE:
#   Starts and stops the built-in model: llama-server from llama.cpp with a GGUF model.
#   Requires: runtime/llama/llama-server.exe and one runtime/models/*.gguf,
#             both downloaded by './build.ps1 -Task Runtime'.
#
#   server = ModelServer(runtime_dir, log_file)
#   server.start()   # returns at once, the model loads in the background
#   server.status()  # {"state": "starting" | "ready" | "missing" | "failed", "message": ...}
#   server.stop()

#
#   Chapters:
#     RUN MODEL SERVER   Finds the files, starts llama-server, waits until it answers.
#

import logging
import subprocess
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

PORT = 8081
HEALTH_URL = f"http://127.0.0.1:{PORT}/health"
STARTUP_TIMEOUT_S = 180
POLL_INTERVAL_S = 0.5
STOP_TIMEOUT_S = 5
CONTEXT_SIZE = 8192   # agents that talk to each other (reflection) need room

# Without this flag Windows opens a console window for llama-server.
CREATE_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)

logger = logging.getLogger("graphlings.model")


# ===========================================================================
# ==========================   RUN MODEL SERVER   ===========================
# ===========================================================================
#
#   ModelServer   Owns the llama-server process and its state.
#
#   The states, in the order they happen:
#
#       starting -> ready              the model answers on HEALTH_URL
#       starting -> missing            runtime files not downloaded yet
#       starting -> failed             llama-server ended or never got ready
#


class ModelServer:
    """
    Owns the llama-server process: starts it, watches its health, stops it.
    """

    def __init__(self, runtime_dir: Path, log_file: Path) -> None:
        """
        :param runtime_dir: (Required) Folder with 'llama/' and 'models/'.
        :param log_file:    (Required) File for the output of llama-server.
        """
        # Absolute, llama-server runs in its own folder and would miss relative paths.
        self._runtime_dir = runtime_dir.resolve()
        self._log_file = log_file
        self._process: subprocess.Popen | None = None
        self._lock = threading.Lock()
        self._state = "starting"
        self._message = "Das Modell wird geladen."

    def status(self) -> dict:
        """
        :returns: The current state and a German message for the user.
        """
        with self._lock:
            return {"state": self._state, "message": self._message}

    def start(self) -> None:
        """
        Starts llama-server in a background thread and returns at once.
        """
        threading.Thread(target=self._run, name="model-server", daemon=True).start()

    def stop(self) -> None:
        """
        Stops llama-server, forcefully when it does not end in time.
        """
        process = self._process
        if process is None or process.poll() is not None:
            return

        logger.debug("[ModelServer] Stopping llama-server.")
        process.terminate()
        try:
            process.wait(timeout=STOP_TIMEOUT_S)
        except subprocess.TimeoutExpired:
            process.kill()

    def _set_state(self, state: str, message: str) -> None:
        with self._lock:
            self._state = state
            self._message = message
        logger.debug(f"[ModelServer] {state}: {message}")

    def _run(self) -> None:

        # ---------------------------------------------------------------------------
        # Find files
        #   An already running server (second window) is reused as it is.
        # ---------------------------------------------------------------------------

        if is_healthy():
            self._set_state("ready", f"Modell läuft schon auf Port {PORT}.")
            return

        executable = self._runtime_dir / "llama" / "llama-server.exe"
        models = sorted((self._runtime_dir / "models").glob("*.gguf"))
        if not executable.exists() or not models:
            self._set_state(
                "missing",
                f"Kein eingebautes Modell unter '{self._runtime_dir}' gefunden. "
                "Lade es mit: ./build.ps1 -Task Runtime",
            )
            return

        # ---------------------------------------------------------------------------
        # Start
        #   Starts llama-server, its output goes into the log file.
        # ---------------------------------------------------------------------------

        command = [
            str(executable),
            "--model", str(models[0]),
            "--host", "127.0.0.1",
            "--port", str(PORT),
            "--ctx-size", str(CONTEXT_SIZE),
            # Chat template from the model file, also needed for tool calls later.
            "--jinja",
        ]
        self._log_file.parent.mkdir(parents=True, exist_ok=True)
        with self._log_file.open("w", encoding="utf-8") as log:
            self._process = subprocess.Popen(
                command,
                stdout=log,
                stderr=subprocess.STDOUT,
                cwd=executable.parent,
                creationflags=CREATE_NO_WINDOW,
            )

        # ---------------------------------------------------------------------------
        # Wait until ready
        #   /health answers 503 while the model loads and 200 when it is ready.
        # ---------------------------------------------------------------------------

        deadline = time.monotonic() + STARTUP_TIMEOUT_S
        while time.monotonic() < deadline:
            exit_code = self._process.poll()
            if exit_code is not None:
                self._set_state(
                    "failed",
                    f"llama-server hat sich mit Code {exit_code} beendet. "
                    f"Details: {self._log_file}",
                )
                return
            if is_healthy():
                self._set_state("ready", f"{models[0].name} auf Port {PORT}.")
                return
            time.sleep(POLL_INTERVAL_S)

        self._set_state(
            "failed",
            f"Das Modell war nach {STARTUP_TIMEOUT_S} s nicht bereit. Details: {self._log_file}",
        )


def is_healthy() -> bool:
    """
    :returns: True when a model server answers on HEALTH_URL with 200.
    """
    try:
        with urllib.request.urlopen(HEALTH_URL, timeout=1) as response:
            return response.status == 200
    except (urllib.error.URLError, OSError):
        return False
