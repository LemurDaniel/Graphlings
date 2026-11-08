# NOTE:
#   Runs the Python code generated from the blocks, exactly as written.
#   The code is saved as graph.py and loaded with runpy, its main() stays unused:
#   the chat window of the app takes over and calls its stream_answer() (chat)
#   or its run_task() (task).
#
#   runner = GraphRunner(work_dir)
#   runner.load(code)
#   runner.ask("Hallo!", on_chunk=print)
#   runner.reset()

#
#   Chapters:
#     HELPERS       Catches what stream_answer prints.
#     RUN GRAPH     Loads the code, asks questions, starts new conversations.
#

import contextlib
import io
import logging
import runpy
import threading
import uuid
from collections.abc import Callable
from pathlib import Path

# The generated code uses only the standard library. Imported here so that
# PyInstaller packs every module it may need, also those the app itself does not use.
import json  # noqa: F401
import os  # noqa: F401
import urllib.error
import urllib.request  # noqa: F401

ANSWER_PREFIX = "KI: "
# A chat graph has stream_answer, a task graph run_task.
RUN_NAMES = ("stream_answer", "run_task")

logger = logging.getLogger("graphlings.runner")


# ===========================================================================
# ===============================   HELPERS   ===============================
# ===========================================================================
#
#   ChunkWriter   A stdout replacement that hands every print to a callback.
#


class ChunkWriter(io.TextIOBase):
    """
    Hands every printed chunk to a callback, without the 'KI: ' prefix of the terminal.
    """

    def __init__(self, on_chunk: Callable[[str], None]) -> None:
        """
        :param on_chunk: (Required) Called with every printed text.
        """
        self._on_chunk = on_chunk
        self._is_first = True

    def writable(self) -> bool:
        return True

    def write(self, text: str) -> int:
        # The terminal prefix only makes sense in the terminal.
        if self._is_first and text == ANSWER_PREFIX:
            self._is_first = False
            return len(text)

        if text:
            self._on_chunk(text)
        return len(text)


# ===========================================================================
# ==============================   RUN GRAPH   ==============================
# ===========================================================================
#
#   GraphRunner   Loads the generated code once, then answers questions.
#


class GraphRunner:
    """
    Holds the loaded code and the current conversation (thread_id).
    """

    def __init__(self, work_dir: Path) -> None:
        """
        :param work_dir: (Required) Folder for the generated graph.py.
        """
        self._work_dir = work_dir
        self._lock = threading.Lock()
        self._namespace: dict | None = None
        self._thread_id = ""
        self._on_node: Callable[[str, str], None] | None = None   # set while ask runs

    def load(self, code: str) -> None:
        """
        Saves the code as graph.py and runs it as a module, which defines the graph.
        A new conversation starts with every load.

        :param code: (Required) The generated Python code.
        :raises ValueError: When the code lacks a function the app needs.
        """
        code_file = self._work_dir / "graph.py"
        code_file.parent.mkdir(parents=True, exist_ok=True)
        code_file.write_text(code, encoding="utf-8")

        # A run name other than '__main__' keeps main() from starting.
        namespace = runpy.run_path(str(code_file), run_name="graphlings_chat")
        if not any(name in namespace for name in RUN_NAMES):
            raise ValueError("Im Code fehlt stream_answer() oder run_task().")

        # run_graph looks up NODES on every step, so wrapping the functions in place
        # reports each node to the window without touching the generated code.
        nodes = namespace.get("NODES", {})
        for name, function in list(nodes.items()):
            nodes[name] = self._watch_node(name, function)

        with self._lock:
            self._namespace = namespace
        self.reset()
        logger.debug(f"[GraphRunner] Loaded {code_file}.")

    def _watch_node(self, name: str, function: Callable[[dict], dict]) -> Callable[[dict], dict]:
        """
        :param name:     (Required) The node name, a key of NODES.
        :param function: (Required) The node function of the generated code.
        :returns:        The same function, reporting 'running' before and 'done' after.
        """
        def watched(state: dict) -> dict:
            if self._on_node:
                self._on_node(name, "running")
            changes = function(state)
            if self._on_node:
                self._on_node(name, "done")
            return changes

        return watched

    def reset(self) -> None:
        """
        Starts a new conversation, the memory of the code keeps the old one under its id.
        """
        self._thread_id = str(uuid.uuid4())
        logger.debug(f"[GraphRunner] New thread {self._thread_id}.")

    def ask(
        self,
        question: str,
        on_chunk: Callable[[str], None],
        on_node: Callable[[str, str], None] | None = None,
    ) -> dict | None:
        """
        Runs stream_answer (chat) or run_task (task) of the generated code,
        its prints go to on_chunk.

        :param question: (Required) The question or the task of the user.
        :param on_chunk: (Required) Called with every streamed piece of the answer.
        :param on_node:  (Optional) Called with a node name and 'running' or 'done'.
        :returns:        The final notepad of a task, None for a chat.
        :raises RuntimeError: When no code is loaded or the model is not reachable.
        """
        with self._lock:
            if self._namespace is None:
                raise RuntimeError("Starte zuerst den Graphen.")

            # stdout is process-wide, the lock keeps one answer at a time.
            self._on_node = on_node
            try:
                with contextlib.redirect_stdout(ChunkWriter(on_chunk)):
                    if "run_task" in self._namespace:
                        return self._namespace["run_task"](question)
                    self._namespace["stream_answer"](self._thread_id, question)
                    return None
            except urllib.error.HTTPError as error:
                # The server answered, but refused: e.g. the conversation is too long for the model.
                detail = error.read().decode("utf-8", errors="replace")[:300]
                raise RuntimeError(f"Das Modell hat die Anfrage abgelehnt ({error.code}): {detail}") from None
            except urllib.error.URLError:
                raise RuntimeError(
                    "Das Modell ist nicht erreichbar. Läuft es noch (Status oben rechts)?"
                ) from None
            finally:
                self._on_node = None
