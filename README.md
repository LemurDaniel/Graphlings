# 🐣 Graphlings

Agents und Graphen zum Zusammenstecken. In der Mitte baust du einen Graphen aus Karten: kleine Graphlings, die du mit Kanten von Puzzle-Nase zu Puzzle-Kerbe verbindest. In jeder Karte steckt ein Puzzle mit ihren Einstellungen. Rechts entsteht live lesbarer Python-Code, und mit ▶️ läuft der Graph sofort gegen ein eingebautes lokales Modell. Dabei leuchtet die Karte, die gerade arbeitet.

Es geht ums **Verstehen**, nicht um ein Framework. Der erzeugte Code ist reines Python (nur Standardbibliothek). State, Knoten, Kanten, die kleine Graph-Engine und der HTTP-Aufruf ans Modell stehen alle sichtbar in einer Datei. Ein Klick auf eine Karte, eine Kante oder ein Puzzleteil markiert die zugehörigen Zeilen im Code, ein Klick auf eine Zeile zeigt das Teil. Alles erklärt kurz, warum der Code so aussieht.

## Für Tester 🚀

1. `Graphlings-win-x64.zip` herunterladen und entpacken.
2. `Graphlings/Graphlings.exe` starten. Windows warnt eventuell („Unbekannter Herausgeber“): *Weitere Informationen → Trotzdem ausführen*.
3. Warten, bis oben rechts **🟢 Modell bereit** steht, dann **▶️ Graph starten** und lostippen.

Nichts zu installieren: Python, llama-server und das Modell (Qwen2.5 1.5B) stecken im Ordner. Alles läuft lokal, ohne Internet.

## Karten, Ressourcen und Puzzleteile 🧩

Zwei Arten von Linien: **durchgezogen** (Nase → Kerbe) heißt „danach läuft …“ und wird ein Eintrag in `EDGES`. **Gepunktet** (Steckplatz unten → Knubbel oben) heißt „benutzt …“ und wird ein Argument im Code, z. B. `ask_model(QWEN_MODEL, …)`.

| Schritt (Karte) | Wird im Code |
| --- | --- |
| 🟢 START / 🏁 END | Ein- und Ausgang einer Runde: `EDGES[START]`, `END` beendet `run_graph()` |
| 🤖 Agent | Knoten-Funktion: Rolle (System-Prompt) plus Verlauf an sein Modell, Antwort anhängen |
| 🗜️ Zusammenfasser | Compacting: Zusammenfassung plus die letzten N Nachrichten |
| 🔧 Werkstatt | Werkzeugkasten wie ein MCP-Server: `list_tools()` für den Agenten, als Knoten `call_tool()` für die `tool_calls` |
| 🔀 Weiche | Routing-Funktion, steht in `EDGES` statt eines Namens: „ja“/„nein“ oder ein Weg pro Option |

| Ressource | Benutzt von | Wird im Code |
| --- | --- | --- |
| 🧠 Modell | Agent, Zusammenfasser | `QWEN_MODEL = {"model": …, "temperature": …}`, zustandslos |
| 🗂️ Notizzettel (State) | START | `new_state()`: ein `dict` mit `messages` und den Feldern der Karte |
| 💾 Gedächtnis | Agent | `MEMORY[thread_id]`, der State von Runde zu Runde |
| 🔧 Werkzeug | Werkstatt | Python-Funktion plus Beschreibung in `TOOL_SCHEMAS` |
| 🔌 Werkstatt (MCP) | Agent | `tools=list_tools(WERKSTATT_TOOLS)`: das Modell bekommt die Werkzeugliste |

| Puzzleteil | Steckt in | Wird im Code |
| --- | --- | --- |
| 📏 mehr als N Nachrichten | Weiche | Bedingung der Routing-Funktion |
| 📝 enthält Wort | Weiche | Prüft die letzte Antwort, z. B. auf „OK“ vom Kritiker |
| 🔧 will Werkzeug? | Weiche | Hat die letzte Antwort `tool_calls`? Dann zur Werkstatt |
| 🧠 Modell entscheidet + Wege | Weiche | Das Modell wählt einen Weg, ein Ausgang pro Weg |
| 🔤 Feld | Notizzettel | weiterer Schlüssel in `new_state()` |
| ⚙️ Einstellungen aus .env | Bauplan | `load_env_file()`, `os.getenv()` und Prüfungen |

Im Chat endet eine Runde bei END, danach wartet `main()` auf die nächste Frage und startet den Graphen wieder bei START. Den **Bauplan** öffnest du mit ⟨ am rechten Rand der Arbeitsfläche, wenn keine Karte ausgewählt ist. Dort wählst du, welcher Agent im Chat antwortet.

**🔌 Werkstatt und MCP:** Die Werkzeuge hängen an der Werkstatt, der Agent steckt sich mit einer gepunkteten Linie ein. Das ist die Idee vom [Model Context Protocol](https://modelcontextprotocol.io): `list_tools()` entspricht `tools/list`, `call_tool()` entspricht `tools/call`. Bei echtem MCP läuft die Werkstatt als eigenes Programm, hier steht sie in derselben Datei.

**🧩 Beispiel laden** zeigt je ein Muster:

| Beispiel | Muster |
| --- | --- |
| 💬 Chat | START → chat → Weiche „zu_lang“ → summarize oder END, wie `chat.py` (Homelabs-KI) |
| 🔀 Schlaue Weiche | Das Modell entscheidet, ob der Techniker oder der Plauderer antwortet |
| 🔧 Werkzeuge | Agent-Schleife: helfer → will Werkzeug? → Werkstatt → zurück zu helfer |
| 🔁 Reflexion | Aufgabe: Schreiber und Kritiker wechseln sich ab, bis der Kritiker „OK“ sagt |

Im Bauplan stellst du **💬 Chat** (Frage um Frage) oder **📋 Aufgabe** (einmal durchlaufen, am Ende siehst du den Notizzettel) ein.

> 💡 Das kleine Modell (1,5B) nutzt Werkzeuge zuverlässiger mit einem englischen Prompt mit klaren Regeln. Gemessen: 15 von 15 Aufrufen statt 9 von 15 mit deutschem Prompt. Deshalb ist der Prompt im Werkzeug-Beispiel englisch, die Antwort kommt trotzdem auf Deutsch.

**💾 chat.py speichern** exportiert den Code. Er läuft mit jedem Python 3.11+ ohne `pip install`, solange ein OpenAI-kompatibler Server unter `http://127.0.0.1:8081/v1` läuft (oder `LLM_BASE_URL` in `.env`).

## Entwickeln 🛠️

Voraussetzung: [uv](https://docs.astral.sh/uv/) (`winget install astral-sh.uv`). uv bringt Python und pywebview mit.

```powershell
./build.ps1 -Task Runtime                                     # llama-server + Modell nach runtime/
uv run --with-requirements app/requirements.txt app/main.py   # App aus dem Quellcode starten
./build.ps1                                                   # build/Graphlings-win-x64.zip bauen
```

Build prüfen ohne Fenster: `build/dist/Graphlings/Graphlings.exe --self-test <chat.py>` schreibt das Ergebnis nach `%LOCALAPPDATA%/Graphlings/self-test.txt`.

Nur die Oberfläche ohne Chat: `web/` mit einem beliebigen statischen Webserver öffnen.

## Aufbau 📁

| Pfad | Inhalt |
| --- | --- |
| `app/` | Python: Fenster (pywebview), Runner für den erzeugten Code, Modellserver |
| `web/` | Die Seite: eigener Graph-Editor, Code-Panel, Erklärungen, Chat |
| `tests/` | Erzeugt `chat.py` aus dem Beispiel headless mit Node |
| `build.ps1` | Lädt die Runtime, baut die Exe und das Zip |
| `THIRD_PARTY_LICENSES.md` | Mitgelieferte Komponenten und ihre Lizenzen |
