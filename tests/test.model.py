# NOTE:
#   Runs the generated example graphs against the real built-in model and checks
#   that each pattern takes the right way through its graph.
#   Requires: runtime/ from './build.ps1 -Task Runtime', build/graph.*.py from
#             'node tests/test.generator.mjs'. Python 3.11+, stdlib only.
#
#   python tests/test.model.py [RUNS]
#
#   A small model is not deterministic: every case runs RUNS times (default 2)
#   and must hit its way in every run. Exit code 1 when any case fails.

#
#   Chapters:
#     CASES       Question, graph and the way it must take.
#     RUN CASES   Starts the model, runs every case, prints the result.
#

import sys
import tempfile
import time
from collections.abc import Callable
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "app"))

import model_server  # noqa: E402
from runner import GraphRunner  # noqa: E402

DEFAULT_RUNS = 2


# ===========================================================================
# ===============================   CASES   =================================
# ===========================================================================
#
#   CASES   Example id, question, check of the visited nodes, what the check means.
#
#   The check gets the node names in the order they ran.
#

def visits(name: str) -> Callable[[list[str]], bool]:
    return lambda path: name in path


def avoids(name: str) -> Callable[[list[str]], bool]:
    return lambda path: name not in path


CASES = [
    ("tools", "Wie spät ist es gerade?", visits("werkstatt"), "fragt die Uhr"),
    ("tools", "Was ist 17 * 23?", visits("werkstatt"), "nimmt den Rechner"),
    ("tools", "Welcher Tag ist heute?", visits("werkstatt"), "fragt die Uhr"),
    ("tools", "Würfel mal für mich.", visits("werkstatt"), "nimmt den Würfel"),
    ("tools", "Hallo, wie geht's?", avoids("werkstatt"), "antwortet ohne Werkzeug"),
    ("switch", "Wie installiere ich Python unter Windows? Kurz.", visits("techniker"), "geht zum Techniker"),
    ("switch", "Mir geht es heute nicht so gut.", visits("plauderer"), "geht zum Plauderer"),
    ("reflection", "Schreib einen Zweizeiler über Raketen.", visits("kritiker"), "der Kritiker liest mit"),
]


# ===========================================================================
# =============================   RUN CASES   ===============================
# ===========================================================================

def main() -> int:
    runs = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_RUNS

    # ---------------------------------------------------------------------------
    # Start model
    #   Reuses a server that already runs on the port.
    # ---------------------------------------------------------------------------

    log_file = Path(tempfile.gettempdir()) / "graphlings-test-llama.log"
    server = model_server.ModelServer(REPO / "runtime", log_file)
    server.start()
    while server.status()["state"] == "starting":
        time.sleep(0.5)
    status = server.status()
    if status["state"] != "ready":
        print(f"Modell nicht bereit: {status['message']}")
        return 1

    # ---------------------------------------------------------------------------
    # Run cases
    #   A fresh conversation per run, so earlier answers do not steer the model.
    # ---------------------------------------------------------------------------

    failures = 0
    runners: dict[str, GraphRunner] = {}
    try:
        for example, question, check, meaning in CASES:
            if example not in runners:
                code_file = REPO / "build" / f"graph.{example}.py"
                if not code_file.exists():
                    print(f"{code_file} fehlt, erst 'node tests/test.generator.mjs' ausführen.")
                    return 1
                runners[example] = GraphRunner(Path(tempfile.mkdtemp()))
                runners[example].load(code_file.read_text(encoding="utf-8"))
            runner = runners[example]

            for _ in range(runs):
                runner.reset()
                path: list[str] = []
                chunks: list[str] = []
                started = time.monotonic()
                runner.ask(question, chunks.append, lambda name, state: state == "running" and path.append(name))

                is_ok = check(path)
                failures += not is_ok
                answer = "".join(chunks).strip().replace("\n", " ")[:100]
                print(f"{'ok  ' if is_ok else 'FAIL'} [{example}] {question} ({meaning}, {time.monotonic() - started:.1f}s)")
                print(f"       Weg: {' -> '.join(path)} | {answer}")
    finally:
        server.stop()

    print("OK" if failures == 0 else f"{failures} Lauf/Läufe falsch")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
