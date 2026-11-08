// NOTE:
//   Every text the user sees, in German and English, looked up by i18n.js through t().
//   Plain data: a key maps to { de, en }. '{name}' marks a placeholder that t() fills in.
//   The keys follow the file that uses them: 'card.*' and 'piece.*' for blocks.graph.js,
//   'example.*' for examples.graph.js, 'hint.*' and 'python.*' for generator.python.js,
//   'editor.*' for the engine, 'ui.*' for index.html and app.js.
//
//   import { TEXTS } from './texts.js'
//

//
//   Chapters:
//     CARDS       The steps of the graph and the resources they use.
//     PIECES      The plan and the puzzle pieces.
//     DESCRIBE    Plain words every card says about itself, and the lines.
//     EXAMPLES    Names, prompts and labels of the starter graphs.
//     GENERATOR   Problems, hints and the terminal texts of the generated Python.
//     EDITOR      Controls, inspector and palette of the graph editor.
//     PAGE        Buttons, status, chat and dialogs of the page.
//

export const TEXTS = {

    // ===========================================================================
    // ================================   CARDS   ================================
    // ===========================================================================
    //
    //   Tools, then START, END, agent, summarizer, workshop, switch, model, notepad, memory, tool.
    //

    'tool.calculator.label': { de: '🧮 Rechner', en: '🧮 Calculator' },
    'tool.calculator.skill': { de: 'rechnet Aufgaben aus', en: 'works out calculations' },
    'tool.clock.label': { de: '🕒 Uhrzeit', en: '🕒 Clock' },
    'tool.clock.skill': { de: 'kennt Datum und Uhrzeit', en: 'knows date and time' },
    'tool.dice.label': { de: '🎲 Würfel', en: '🎲 Dice' },
    'tool.dice.skill': { de: 'würfelt eine Zahl', en: 'rolls a number' },

    'card.chip.missing': { de: 'fehlt', en: 'missing' },
    // Palette titles: the type instead of the default name of a new card.
    'card.agent.type': { de: 'Agent', en: 'Agent' },
    'card.summarize.type': { de: 'Zusammenfasser', en: 'Summarizer' },
    'card.workshop.type': { de: 'Werkstatt', en: 'Workshop' },
    'card.router.type': { de: 'Weiche', en: 'Switch' },
    'card.model.type': { de: 'Modell', en: 'Model' },
    'card.helper.type': { de: 'Hilfsagent', en: 'Helper agent' },
    'card.use.model': { de: '🧠 Modell', en: '🧠 Model' },
    'card.use.state': { de: '🗂️ Notizzettel', en: '🗂️ Notepad' },
    'card.use.memory': { de: '💾 Gedächtnis', en: '💾 Memory' },
    'card.use.workshop': { de: '🔌 Werkstatt (MCP)', en: '🔌 Workshop (MCP)' },
    'card.use.tools': { de: '🔧 Werkzeuge', en: '🔧 Tools' },

    'card.start.parts': { de: '🟢 START: Hier kommt jede neue Frage oder Aufgabe in den Graphen.', en: '🟢 START: Every new question or task enters the graph here.' },
    'card.start.kind': { de: 'neue Frage', en: 'new question' },
    'card.start.explain': {
        de: 'START ist kein Knoten, sondern der Eingang einer Runde: EDGES[START] sagt, welcher Knoten zuerst läuft. '
            + 'Unten hängt der Notizzettel: Jede Runde beginnt mit einem State aus new_state(), mit Gedächtnis mit dem aus MEMORY.',
        en: 'START is not a node but the entry of a round: EDGES[START] says which node runs first. '
            + 'The notepad hangs below: every round begins with a state from new_state(), with a memory with the one from MEMORY.',
    },

    'card.end.parts': { de: '🏁 END: Die Arbeit ist fertig, die Runde endet.', en: '🏁 END: The work is done, the round ends.' },
    'card.end.kind': { de: 'fertig', en: 'done' },
    'card.end.chip.task': { de: '📋 Notizzettel ist das Ergebnis', en: '📋 notepad is the result' },
    'card.end.chip.memory': { de: '💾 Notizzettel ins Gedächtnis', en: '💾 notepad goes into the memory' },
    'card.end.chip.bin': { de: '🗑️ Notizzettel wird verworfen', en: '🗑️ notepad is thrown away' },
    'card.end.explain': {
        de: 'END beendet eine Runde: run_graph() hört auf und gibt den State zurück. '
            + 'Im Chat wartet main() danach auf die nächste Frage und lässt den Graphen wieder bei START laufen.',
        en: 'END finishes a round: run_graph() stops and returns the state. '
            + 'In a chat main() then waits for the next question and runs the graph from START again.',
    },

    'card.agent.title': { de: '🤖 Agent', en: '🤖 Agent' },
    'card.agent.prompt': { de: 'System-Prompt', en: 'System prompt' },
    'card.agent.prompt.default': {
        de: 'Du bist ein hilfreicher Assistent. Antworte auf Deutsch, klar und präzise.',
        en: 'You are a helpful assistant. Answer in English, clearly and precisely.',
    },
    'card.agent.show': { de: '📣 Antwort zeigen', en: '📣 Show answer' },
    'card.agent.summary': { de: '📜 Zusammenfassung mitschicken', en: '📜 Send the summary along' },
    'card.agent.kind': { de: 'Agent · fragt das Modell', en: 'Agent · asks the model' },
    'card.agent.chip.summary': { de: '📜 Zusammenfassung', en: '📜 summary' },
    'card.agent.chip.show': { de: '📣 zeigt Antwort', en: '📣 shows answer' },
    'card.agent.explain': {
        de: 'Ein Agent ist hier eine normale Python-Funktion: Sie bekommt den State und gibt nur die Änderung zurück. '
            + 'Sie schickt ihre Rolle (System-Prompt) plus Verlauf an das Modell, an dem sie unten hängt, und hängt die Antwort an. '
            + 'Hängt sie an einer Werkstatt, holt sie sich deren Werkzeugliste (list_tools) und das Modell darf sie aufrufen (tool_calls).',
        en: 'An agent here is a plain Python function: it gets the state and returns only the change. '
            + 'It sends its role (system prompt) plus the history to the model it hangs at, and appends the answer. '
            + 'Hanging at a workshop, it fetches the tool list (list_tools) and the model may call them (tool_calls).',
    },

    'card.summarize.title': { de: '🗜️ Zusammenfasser', en: '🗜️ Summarizer' },
    'card.summarize.name.default': { de: 'zusammenfassen', en: 'summarize' },
    'card.summarize.keep.before': { de: 'behalte die letzten', en: 'keep the last' },
    'card.summarize.keep.after': { de: 'Nachrichten', en: 'messages' },
    'card.summarize.instruction': { de: 'Anweisung', en: 'Instruction' },
    'card.summarize.prompt.default': {
        de: 'Fasse das bisherige Gespräch knapp auf Deutsch zusammen. Behalte Fakten über den Nutzer, '
            + 'getroffene Entscheidungen und offene Fragen. Antworte nur mit der Zusammenfassung.',
        en: 'Summarize the conversation so far briefly in English. Keep facts about the user, '
            + 'decisions made and open questions. Answer with the summary only.',
    },
    'card.summarize.kind': { de: 'Graphling · fasst zusammen', en: 'Graphling · summarizes' },
    'card.summarize.chip.keep': { de: '📦 behält {count}', en: '📦 keeps {count}' },
    'card.summarize.explain': {
        de: 'Compacting: Alte Nachrichten wandern in eine Zusammenfassung, damit der Verlauf nicht endlos wächst. '
            + 'Der Knoten lässt sein Modell die alten Nachrichten zusammenfassen '
            + 'und gibt das neue "summary" plus nur noch die letzten Nachrichten zurück.',
        en: 'Compacting: old messages move into a summary, so the history does not grow forever. '
            + 'The node lets its model summarize the old messages '
            + 'and returns the new "summary" plus only the last messages.',
    },

    'card.workshop.title': { de: '🔧 Werkstatt', en: '🔧 Workshop' },
    'card.workshop.name.default': { de: 'werkstatt', en: 'workshop' },
    'card.workshop.kind': { de: 'Graphling · Werkzeugkasten', en: 'Graphling · toolbox' },
    'card.workshop.chip.one': { de: '🔧 1 Werkzeug', en: '🔧 1 tool' },
    'card.workshop.chip.many': { de: '🔧 {count} Werkzeuge', en: '🔧 {count} tools' },
    'card.workshop.chip.empty': { de: '🔧 leer', en: '🔧 empty' },
    'card.workshop.explain': {
        de: 'Die Werkstatt ist ein Werkzeugkasten, gebaut wie ein MCP-Server: Ihre Werkzeuge stehen in einem dict. '
            + 'list_tools() gibt dem Agenten die Beschreibungen (wie tools/list bei MCP), '
            + 'als Knoten führt sie die tool_calls der letzten Antwort mit call_tool() aus (wie tools/call) '
            + 'und hängt jedes Ergebnis als Nachricht mit role "tool" an. Danach geht es zurück zum Agenten: die Agent-Schleife.',
        en: 'The workshop is a toolbox built like an MCP server: its tools live in a dict. '
            + 'list_tools() gives the agent the descriptions (like tools/list in MCP), '
            + 'as a node it runs the tool_calls of the last answer with call_tool() (like tools/call) '
            + 'and appends each result as a message with role "tool". Then it goes back to the agent: the agent loop.',
    },

    'card.router.title': { de: '🔀 Weiche', en: '🔀 Switch' },
    'card.router.name.default': { de: 'weiche', en: 'switch' },
    'card.router.slot': { de: 'Bedingung', en: 'Condition' },
    'card.router.kind': { de: 'Weiche · entscheidet den Weg', en: 'Switch · picks the way' },
    'card.router.branch.yes': { de: 'ja', en: 'yes' },
    'card.router.branch.no': { de: 'nein', en: 'no' },
    'card.router.chip.none': { de: '❓ keine Bedingung', en: '❓ no condition' },
    'card.router.chip.length': { de: '📏 > {max} Nachrichten', en: '📏 > {max} messages' },
    'card.router.chip.contains': { de: '📝 enthält „{word}“', en: '📝 contains "{word}"' },
    'card.router.chip.tools': { de: '🔧 will Werkzeug?', en: '🔧 wants a tool?' },
    'card.router.chip.model': { de: '🧠 Modell wählt aus {count} Wegen', en: '🧠 model picks one of {count} ways' },
    'card.router.explain': {
        de: 'Eine Weiche ist kein Knoten, sondern eine Entscheidung auf der Kante: '
            + 'Im Code wird sie eine Routing-Funktion, die in den State schaut und den Namen des nächsten Knotens zurückgibt. '
            + 'In EDGES steht dann statt eines Namens diese Funktion. So drehen Agents Schleifen oder biegen ab.',
        en: 'A switch is not a node but a decision on the edge: '
            + 'in the code it becomes a routing function that looks into the state and returns the name of the next node. '
            + 'EDGES then holds this function instead of a name. That is how agents loop or branch.',
    },

    'card.model.title': { de: '🧠 Modell', en: '🧠 Model' },
    'card.model.builtin': { de: '📦 eingebaut (Qwen 1.5B)', en: '📦 built-in (Qwen 1.5B)' },
    'card.model.temperature': { de: 'Temperatur', en: 'Temperature' },
    'card.model.kind': { de: 'Modell · zustandslos', en: 'Model · stateless' },
    'card.model.explain': {
        de: 'Ein Modell ist nur ein Server, den man per HTTP fragt, und es ist zustandslos: Es merkt sich nichts. '
            + 'Im Code ist es ein kleines dict mit Name und Temperatur. ask_model() schickt es zusammen mit dem ganzen Gespräch '
            + 'an /chat/completions. Mehrere Agenten können ein Modell teilen oder eigene haben, z. B. kreativ und genau.',
        en: 'A model is just a server asked over HTTP, and it is stateless: it remembers nothing. '
            + 'In the code it is a small dict with name and temperature. ask_model() sends it together with the whole conversation '
            + 'to /chat/completions. Several agents can share one model or have their own, e.g. creative and precise.',
    },

    'card.state.parts': { de: '🗂️ Notizzettel (State): alle Nachrichten und dazu', en: '🗂️ Notepad (state): all messages plus' },
    'card.state.slot': { de: 'Felder', en: 'Fields' },
    'card.state.kind': { de: 'State · was eine Runde weiß', en: 'State · what a round knows' },
    'card.state.title': { de: 'Notizzettel', en: 'Notepad' },
    'card.state.chip.messages': { de: '💬 Nachrichten', en: '💬 messages' },
    'card.state.explain': {
        de: 'Der State ist ein dict, das durch eine Runde wandert. new_state() legt ihn an: immer mit "messages", '
            + 'dazu die Felder dieser Karte. START hängt an ihm, weil jede Runde mit so einem State beginnt. '
            + 'Danach reicht run_graph() ihn an jeden Knoten weiter, jeder gibt nur die Schlüssel zurück, die er ändert.',
        en: 'The state is a dict that travels through a round. new_state() creates it: always with "messages", '
            + 'plus the fields of this card. START hangs at it, because every round begins with such a state. '
            + 'Then run_graph() hands it to every node, each returns only the keys it changes.',
    },

    'card.memory.parts': { de: '💾 Gedächtnis: merkt sich jedes Gespräch per thread_id.', en: '💾 Memory: remembers every conversation by thread_id.' },
    'card.memory.kind': { de: 'Gedächtnis · merkt sich Gespräche', en: 'Memory · remembers conversations' },
    'card.memory.title': { de: 'Gedächtnis', en: 'Memory' },
    'card.memory.chip': { de: '📂 ein Fach pro Gespräch', en: '📂 one drawer per conversation' },
    'card.memory.explain': {
        de: 'Das Gedächtnis ist ein dict: MEMORY[thread_id] = State nach der letzten Runde. '
            + 'Hängt es an START, holt stream_answer() bei jeder Frage den alten State heraus und hängt die Frage an. '
            + 'Ohne beginnt jede Runde mit einem leeren State. Im Aufgaben-Modus gibt es nur eine Runde, dort zählt es nicht.',
        en: 'The memory is a dict: MEMORY[thread_id] = state after the last round. '
            + 'Hanging at START, stream_answer() takes the old state out for every question and appends the question. '
            + 'Without it every round begins with an empty state. In task mode there is only one round, so it does not count there.',
    },

    'card.tool.title': { de: '🔧 Werkzeug', en: '🔧 Tool' },
    'card.tool.kind': { de: 'Werkzeug · eine Funktion', en: 'Tool · one function' },
    'card.tool.explain': {
        de: 'Ein Werkzeug ist eine Python-Funktion plus eine Beschreibung als JSON (Name, Zweck, Parameter). '
            + 'Die Beschreibung geht mit an das Modell. Will es das Werkzeug nutzen, antwortet es nicht mit Text, '
            + 'sondern mit tool_calls: Name und Argumente. Es hängt an einer Werkstatt, die es anbietet und ausführt.',
        en: 'A tool is a Python function plus a description as JSON (name, purpose, parameters). '
            + 'The description goes to the model. When it wants the tool, it answers not with text '
            + 'but with tool_calls: name and arguments. It hangs at a workshop that offers and runs it.',
    },

    'card.helper.title': { de: '🤖 Hilfsagent', en: '🤖 Helper agent' },
    'card.helper.name.default': { de: 'dichter', en: 'poet' },
    'card.helper.prompt.default': {
        de: 'Du bist ein Dichter. Schreibe zu dem Thema ein kurzes Gedicht auf Deutsch, vier Zeilen, mit Reim. Antworte nur mit dem Gedicht.',
        en: 'You are a poet. Write a short poem about the topic in English, four lines, rhyming. Answer with the poem only.',
    },
    'card.helper.hint': { de: 'gut für', en: 'good for' },
    // The hint goes to the model as the tool description: English works best for the small model.
    'card.helper.hint.default': { de: 'Writes a short poem about a topic.', en: 'Writes a short poem about a topic.' },
    'card.helper.kind': { de: 'Hilfsagent · eigener Zettel', en: 'Helper agent · own notepad' },
    'card.helper.chip.notepad': { de: '🗒️ eigener Zettel', en: '🗒️ own notepad' },
    'card.helper.explain': {
        de: 'Ein Hilfsagent ist ein Agent, den ein anderer Agent wie ein Werkzeug ruft: Er liegt in der Werkstatt, '
            + 'das Modell des Chefs sieht seine Beschreibung und ruft ihn mit einer Aufgabe auf. Im Code ist er eine Funktion, '
            + 'die ask_model() mit eigenem System-Prompt und nur der Aufgabe aufruft: ein frischer, leerer Notizzettel. '
            + 'Zurück kommt nur seine Antwort als role "tool". Das Gespräch des Chefs sieht er nie.',
        en: 'A helper agent is an agent that another agent calls like a tool: it lies in the workshop, '
            + 'the model of the boss sees its description and calls it with a task. In the code it is a function '
            + 'that calls ask_model() with its own system prompt and only the task: a fresh, empty notepad. '
            + 'Only its answer comes back, as role "tool". It never sees the conversation of the boss.',
    },

    // ===========================================================================
    // ===============================   PIECES   ================================
    // ===========================================================================
    //
    //   Plan, conditions, way, settings, notepad field.
    //

    'piece.plan.mode': { de: '🚀 Modus', en: '🚀 Mode' },
    'piece.plan.mode.chat': { de: '💬 Chat: Frage um Frage', en: '💬 Chat: question by question' },
    'piece.plan.mode.task': { de: '📋 Aufgabe: einmal durchlaufen', en: '📋 Task: one run' },
    'piece.plan.steps.before': { de: '🔁 höchstens', en: '🔁 at most' },
    'piece.plan.steps.after': { de: 'Schritte pro Runde', en: 'steps per round' },
    'piece.plan.slot': { de: 'Bausteine', en: 'Building blocks' },
    'piece.plan.explain': {
        de: 'Der Bauplan gilt für den ganzen Graphen. Der Modus entscheidet über main(): im Chat eine Schleife über stream_answer(), '
            + 'als Aufgabe ein einziger Lauf über run_task(), der den fertigen State zurückgibt. '
            + 'MAX_STEPS bremst Graphen, die sich im Kreis drehen, z. B. eine Agent-Schleife, die nie fertig wird.',
        en: 'The plan applies to the whole graph. The mode decides main(): in a chat a loop over stream_answer(), '
            + 'as a task a single run_task() that returns the final state. '
            + 'MAX_STEPS stops graphs that go round in circles, e.g. an agent loop that never finishes.',
    },

    'piece.length.before': { de: '📏 mehr als', en: '📏 more than' },
    'piece.length.after': { de: 'Nachrichten', en: 'messages' },
    'piece.length.explain': {
        de: 'Ist der Verlauf länger als N Nachrichten, geht es über "ja" weiter, sonst über "nein". 0 heißt: immer "nein".',
        en: 'When the history is longer than N messages it continues via "yes", else via "no". 0 means: always "no".',
    },
    'piece.contains.label': { de: '📝 letzte Antwort enthält', en: '📝 last answer contains' },
    'piece.contains.explain': {
        de: 'Die Weiche schaut in die letzte Nachricht: Steht das Wort darin (groß/klein egal), geht es über "ja", sonst über "nein". '
            + 'So prüft ein Kritiker, ob ein Text gut genug ist: die Reflexions-Schleife.',
        en: 'The switch looks into the last message: when the word is in it (any case) it continues via "yes", else via "no". '
            + 'That is how a critic checks whether a text is good enough: the reflection loop.',
    },
    'piece.tools.label': { de: '🔧 Modell will ein Werkzeug benutzen', en: '🔧 Model wants to use a tool' },
    'piece.tools.explain': {
        de: 'Die Weiche schaut, ob die letzte Antwort tool_calls enthält. Ja: weiter zur Werkstatt, die sie ausführt. '
            + 'Nein: Das Modell ist fertig. Das ist der Kern jeder Agent-Schleife.',
        en: 'The switch checks whether the last answer contains tool_calls. Yes: on to the workshop that runs them. '
            + 'No: the model is done. That is the core of every agent loop.',
    },
    'piece.model.label': { de: '🧠 Modell entscheidet zwischen', en: '🧠 Model decides between' },
    'piece.model.slot': { de: 'Wegen', en: 'Ways' },
    'piece.model.explain': {
        de: 'Die Weiche fragt ihr Modell: Sie zählt die Wege mit ihren Beschreibungen auf und bittet um genau ein Wort. '
            + 'Die Antwort wird mit den Namen der Wege verglichen, passt keiner, nimmt sie den ersten. '
            + 'Jeder Weg ist ein eigener Ausgang an der Karte.',
        en: 'The switch asks its model: it lists the ways with their descriptions and asks for exactly one word. '
            + 'The answer is compared with the names of the ways, when none fits it takes the first. '
            + 'Every way is its own output on the card.',
    },
    'piece.way.label': { de: '🏷️ Weg', en: '🏷️ Way' },
    'piece.way.name.default': { de: 'technik', en: 'tech' },
    'piece.way.for': { de: 'für', en: 'for' },
    'piece.way.hint.default': { de: 'Fragen zu Technik, Computern und Programmieren', en: 'questions about technology, computers and programming' },
    'piece.way.explain': {
        de: 'Ein Weg der schlauen Weiche: Der Name ist das Wort, mit dem das Modell antworten soll, '
            + 'die Beschreibung hilft ihm bei der Wahl. An der Karte wird daraus ein eigener Ausgang.',
        en: 'A way of the smart switch: the name is the word the model should answer with, '
            + 'the description helps it choose. On the card it becomes its own output.',
    },
    'piece.settings.label': { de: '⚙️ Einstellungen aus .env', en: '⚙️ Settings from .env' },
    'piece.settings.explain': {
        de: 'Ohne dieses Teil stehen Modell, Prompts und Grenzen fest im Code. '
            + 'Mit ihm liest load_env_file() die Datei .env, os.getenv() nimmt den Wert oder den Standard, '
            + 'und ein Prüfabschnitt bricht früh mit einer klaren Meldung ab, wenn ein Wert nicht passt.',
        en: 'Without this piece model, prompts and limits are fixed in the code. '
            + 'With it load_env_file() reads the .env file, os.getenv() takes the value or the default, '
            + 'and a validation section stops early with a clear message when a value does not fit.',
    },
    'piece.field.label': { de: '🔤 Feld', en: '🔤 Field' },
    'piece.field.type': { de: 'vom Typ', en: 'of type' },
    'piece.field.type.str': { de: 'Text (str)', en: 'Text (str)' },
    'piece.field.type.int': { de: 'Zahl (int)', en: 'Number (int)' },
    'piece.field.type.float': { de: 'Kommazahl (float)', en: 'Decimal (float)' },
    'piece.field.type.bool': { de: 'Ja/Nein (bool)', en: 'Yes/No (bool)' },
    'piece.field.explain': {
        de: 'Ein Feld ist ein weiterer Schlüssel im State-dict, mit einem leeren Startwert. '
            + 'Gibt ein Knoten {"summary": ...} zurück, überschreibt die Engine genau diesen Schlüssel.',
        en: 'A field is another key in the state dict, with an empty start value. '
            + 'When a node returns {"summary": ...}, the engine overwrites exactly this key.',
    },

    // ===========================================================================
    // ==============================   DESCRIBE   ===============================
    // ===========================================================================
    //
    //   What each card says about itself, in first person, and what the lines mean.
    //

    'describe.start': {
        de: 'Ich bin der Eingang. Jede neue Frage oder Aufgabe kommt bei mir an. '
            + 'Ich schreibe sie auf den Notizzettel, der unten an mir hängt, und gebe ihn an den ersten Graphling weiter. '
            + 'Hängt an mir auch ein Gedächtnis, nehme ich den Zettel der letzten Runde statt eines leeren. '
            + 'Der Zettel wandert dann von Karte zu Karte bis zum Ziel.',
        en: 'I am the entrance. Every new question or task arrives at me. '
            + 'I write it on the notepad that hangs below me and hand it to the first graphling. '
            + 'When a memory hangs at me too, I take the notepad of the last round instead of an empty one. '
            + 'The notepad then travels from card to card until the finish.',
    },
    'describe.end': {
        de: 'Ich bin das Ziel einer Runde. Kommt der Notizzettel bei mir an, ist die Arbeit fertig. '
            + 'Gibt es ein Gedächtnis, lege ich den Zettel dort ab, sonst kommt er in den Mülleimer. '
            + 'Im Chat geht das Gespräch trotzdem weiter: Die nächste Frage beginnt wieder bei START.',
        en: 'I am the finish of a round. When the notepad reaches me, the work is done. '
            + 'If there is a memory I file the notepad there, otherwise it goes into the bin. '
            + 'In a chat the conversation still goes on: the next question starts at START again.',
    },
    'describe.agent': {
        de: 'Ich bin ein Agent! Ich lese das bisherige Gespräch vom Notizzettel, nehme meine Rolle (den System-Prompt) '
            + 'und frage damit mein Modell. Seine Antwort schreibe ich auf den Zettel. '
            + 'Hängen Werkzeuge an mir, darf das Modell sie benutzen, statt gleich zu antworten.',
        en: 'I am an agent! I read the conversation so far from the notepad, take my role (the system prompt) '
            + 'and ask my model with it. I write its answer on the notepad. '
            + 'When tools hang at me, the model may use them instead of answering right away.',
    },
    'describe.summarize': {
        de: 'Ich räume auf. Wird das Gespräch zu lang, lasse ich das Modell die alten Nachrichten '
            + 'zu einer kurzen Zusammenfassung verdichten und behalte nur die letzten paar.',
        en: 'I tidy up. When the conversation gets too long, I let the model condense the old messages '
            + 'into a short summary and keep only the last few.',
    },
    'describe.workshop': {
        de: 'Ich bin die Werkstatt, ein Werkzeugkasten. Unten hängen meine Werkzeuge. '
            + 'Ein Agent, der an mir hängt, fragt mich, was ich alles kann. Bittet sein Modell dann um ein Werkzeug, '
            + 'führe ich es aus und schreibe das Ergebnis auf den Notizzettel. Dann darf der Agent weitermachen.',
        en: 'I am the workshop, a toolbox. My tools hang below me. '
            + 'An agent that hangs at me asks me what I can do. When its model then asks for a tool, '
            + 'I run it and write the result on the notepad. Then the agent may carry on.',
    },
    'describe.router': {
        de: 'Ich bin eine Weiche. Ich schaue mir an, wie es gerade steht, und entscheide, wohin es weitergeht. '
            + 'Mit einem Modell kann ich sogar selbst überlegen, welcher Spezialist die Frage bekommt.',
        en: 'I am a switch. I look at how things stand and decide where to go next. '
            + 'With a model I can even think for myself which specialist gets the question.',
    },
    'describe.model': {
        de: 'Ich bin das Sprachmodell, sozusagen ein Gehirn zum Ausleihen. Ich merke mir nichts: '
            + 'Wer mich fragt, muss mir jedes Mal das ganze Gespräch mitschicken. '
            + 'Die Temperatur sagt, wie kreativ (hoch) oder vorhersehbar (niedrig) ich antworte.',
        en: 'I am the language model, a brain to borrow, so to speak. I remember nothing: '
            + 'whoever asks me has to send me the whole conversation every time. '
            + 'The temperature says how creative (high) or predictable (low) my answers are.',
    },
    'describe.state': {
        de: 'Ich bin der Notizzettel einer Runde. Auf mir stehen alle Nachrichten und was du sonst festlegst, '
            + 'zum Beispiel eine Zusammenfassung. START gibt mich zu Beginn jeder Runde aus, '
            + 'dann wandere ich von Graphling zu Graphling, und jeder liest mich und schreibt etwas dazu.',
        en: 'I am the notepad of a round. All messages are on me and whatever else you define, '
            + 'for example a summary. START hands me out at the beginning of every round, '
            + 'then I travel from graphling to graphling, and each one reads me and adds something.',
    },
    'describe.memory': {
        de: 'Ich bin das Gedächtnis, ein Aktenschrank mit einem Fach pro Gespräch. Nach jeder Runde kommt der Notizzettel '
            + 'in sein Fach, bei der nächsten Frage holt START ihn wieder heraus. Ohne mich landet der Zettel im Mülleimer.',
        en: 'I am the memory, a filing cabinet with one drawer per conversation. After every round the notepad '
            + 'goes into its drawer, at the next question START takes it out again. Without me the notepad ends up in the bin.',
    },
    'describe.tool': {
        de: 'Ich bin ein Werkzeug. Das Modell kann nicht gut rechnen und kennt die Uhrzeit nicht, ich schon. '
            + 'Ich liege in einer Werkstatt, und jeder Agent an dieser Werkstatt darf mich benutzen.',
        en: 'I am a tool. The model cannot calculate well and does not know the time, I do. '
            + 'I lie in a workshop, and every agent at that workshop may use me.',
    },
    'describe.helper': {
        de: 'Ich bin ein Hilfsagent. Mein Chef gibt mir eine Aufgabe, ich erledige sie auf einem eigenen, leeren Zettel '
            + 'und gebe nur das Ergebnis zurück. Das Gespräch der anderen sehe ich nicht, so bleibt mein Kopf frei. '
            + 'Ich liege in der Werkstatt, wie ein Werkzeug.',
        en: 'I am a helper agent. My boss gives me a task, I do it on my own empty notepad '
            + 'and hand back only the result. I do not see the conversation of the others, so my head stays clear. '
            + 'I lie in the workshop, like a tool.',
    },
    'describe.plan': {
        de: 'Der Bauplan gilt für den ganzen Graphen: Chat (Frage um Frage) oder Aufgabe (einmal durchlaufen), '
            + 'und wie viele Schritte eine Runde höchstens machen darf.',
        en: 'The plan applies to the whole graph: chat (question by question) or task (one run), '
            + 'and how many steps a round may take at most.',
    },
    'describe.settings': {
        de: 'Mit diesem Teil kommen Werte wie Prompts und Grenzen aus einer Einstellungsdatei, '
            + 'statt fest im Programm zu stehen.',
        en: 'With this piece values like prompts and limits come from a settings file '
            + 'instead of being fixed in the program.',
    },
    'describe.field': {
        de: 'Ein Feld ist eine weitere Zeile auf dem Notizzettel, zum Beispiel für die Zusammenfassung.',
        en: 'A field is another line on the notepad, for example for the summary.',
    },
    'describe.length': {
        de: 'Die Frage, die die Weiche stellt: Ist das Gespräch schon länger als so viele Nachrichten?',
        en: 'The question the switch asks: is the conversation already longer than this many messages?',
    },
    'describe.contains': {
        de: 'Die Frage, die die Weiche stellt: Steht dieses Wort in der letzten Antwort? '
            + 'Damit kann ein Kritiker „OK“ sagen, wenn ein Text gut genug ist.',
        en: 'The question the switch asks: is this word in the last answer? '
            + 'That lets a critic say "OK" when a text is good enough.',
    },
    'describe.tools': {
        de: 'Die Frage, die die Weiche stellt: Will das Modell gerade ein Werkzeug benutzen?',
        en: 'The question the switch asks: does the model want to use a tool right now?',
    },
    'describe.modelDecides': {
        de: 'Hier entscheidet das Modell selbst: Es liest die Frage und wählt einen der Wege.',
        en: 'Here the model decides itself: it reads the question and picks one of the ways.',
    },
    'describe.way': {
        de: 'Ein Weg, den die Weiche wählen kann. Die Beschreibung hilft dem Modell bei der Wahl.',
        en: 'A way the switch can choose. The description helps the model choose.',
    },
    'describe.flow': {
        de: 'Diese Linie sagt: Wenn der eine fertig ist, ist der nächste dran. So entsteht der Ablauf.',
        en: 'This line says: when one is done, the next one is up. That is how the flow comes together.',
    },
    'describe.useWorkshop': {
        de: 'Das ist die Steckdose zwischen Agent und Werkstatt 🔌. Über sie fragt der Agent: „Was kannst du?“ '
            + 'und gibt die Antwort seinem Modell mit. Genau so funktioniert MCP (Model Context Protocol): '
            + 'Ein Programm bietet Werkzeuge an, ein Agent steckt sich ein und darf sie benutzen.',
        en: 'This is the socket between agent and workshop 🔌. Through it the agent asks: "What can you do?" '
            + 'and passes the answer to its model. That is exactly how MCP (Model Context Protocol) works: '
            + 'a program offers tools, an agent plugs in and may use them.',
    },
    'describe.use': {
        de: 'Diese gepunktete Linie heißt „benutzt“: Der Graphling greift darauf zu, während er arbeitet. '
            + 'Sie ist kein Schritt im Ablauf.',
        en: 'This dotted line means "uses": the graphling reaches for it while it works. '
            + 'It is not a step of the flow.',
    },
    'describe.edge.code': {
        de: 'Eine Kante ist ein Eintrag in EDGES: Nach diesem Knoten läuft immer der nächste. '
            + 'Führt sie in eine Weiche, steht in EDGES statt eines Namens die Routing-Funktion der Weiche. '
            + 'Von jedem Ausgang geht genau ein Weg weg, sonst wüsste die Engine nicht, wohin.',
        en: 'An edge is an entry in EDGES: after this node the next one always runs. '
            + 'When it leads into a switch, EDGES holds the routing function of the switch instead of a name. '
            + 'Exactly one way leaves every output, otherwise the engine would not know where to go.',
    },
    'describe.use.code': {
        de: 'Eine gepunktete Linie ist kein Schritt im Ablauf, sondern heißt "benutzt": '
            + 'Ein Agent ruft sein Modell auf, wenn er läuft, im Code als erstes Argument von ask_model(). '
            + 'START benutzt State und Gedächtnis, um eine Runde zu beginnen. Eine Ressource kann von vielen benutzt werden.',
        en: 'A dotted line is not a step of the flow but means "uses": '
            + 'an agent calls its model when it runs, in the code as the first argument of ask_model(). '
            + 'START uses state and memory to begin a round. One resource can be used by many.',
    },
    'describe.useWorkshop.code': {
        de: 'Die Steckdose zwischen Agent und Werkstatt ist im Code tools=list_tools(...): '
            + 'Der Agent holt sich die Beschreibungen der Werkzeuge und gibt sie seinem Modell mit. '
            + 'Das ist die Idee von MCP (Model Context Protocol): list_tools entspricht tools/list, call_tool entspricht tools/call. '
            + 'Bei echtem MCP läuft die Werkstatt als eigenes Programm, hier steht sie in derselben Datei.',
        en: 'The socket between agent and workshop is tools=list_tools(...) in the code: '
            + 'the agent fetches the descriptions of the tools and passes them to its model. '
            + 'That is the idea of MCP (Model Context Protocol): list_tools matches tools/list, call_tool matches tools/call. '
            + 'With real MCP the workshop runs as its own program, here it lives in the same file.',
    },

    // ===========================================================================
    // ==============================   EXAMPLES   ===============================
    // ===========================================================================
    //
    //   Names become Python identifiers, so they are plain ASCII words.
    //

    'example.chat.label': { de: '💬 Chat mit Zusammenfassung', en: '💬 Chat with summary' },
    'example.chat.agent.name': { de: 'chat', en: 'chat' },
    'example.chat.router.name': { de: 'zu_lang', en: 'too_long' },
    'example.chat.summarize.name': { de: 'zusammenfassen', en: 'summarize' },
    'example.chat.summarize.prompt': {
        de: 'Fasse das bisherige Gespräch knapp auf Deutsch zusammen. '
            + 'Behalte Fakten über den Nutzer, getroffene Entscheidungen '
            + 'und offene Fragen. Antworte nur mit der Zusammenfassung.',
        en: 'Summarize the conversation so far briefly in English. '
            + 'Keep facts about the user, decisions made '
            + 'and open questions. Answer with the summary only.',
    },

    'example.switch.label': { de: '🔀 Schlaue Weiche + Spezialisten', en: '🔀 Smart switch + specialists' },
    'example.switch.router.name': { de: 'absicht', en: 'intent' },
    'example.switch.way.tech.name': { de: 'technik', en: 'tech' },
    'example.switch.way.tech.hint': { de: 'Fragen zu Technik, Computern und Programmieren', en: 'questions about technology, computers and programming' },
    'example.switch.way.talk.name': { de: 'alltag', en: 'chat' },
    'example.switch.way.talk.hint': { de: 'alles andere: Alltag, Gefühle, Smalltalk', en: 'everything else: daily life, feelings, small talk' },
    'example.switch.tech.name': { de: 'techniker', en: 'techie' },
    'example.switch.tech.prompt': {
        de: 'Du bist ein geduldiger Technik-Experte. Erkläre Schritt für Schritt auf Deutsch, mit einem kleinen Beispiel.',
        en: 'You are a patient technology expert. Explain step by step in English, with a small example.',
    },
    'example.switch.talk.name': { de: 'plauderer', en: 'chatter' },
    'example.switch.talk.prompt': {
        de: 'Du bist ein freundlicher Gesprächspartner. Antworte locker, kurz und herzlich auf Deutsch.',
        en: 'You are a friendly conversation partner. Answer casually, briefly and warmly in English.',
    },

    'example.tools.label': { de: '🔧 Werkzeug-Agent', en: '🔧 Tool agent' },
    'example.tools.agent.name': { de: 'helfer', en: 'helper' },
    // English rules in both languages: the small model calls its tools reliably only then.
    'example.tools.agent.prompt': {
        de: 'You are a helpful assistant with tools. Rules: '
            + 'Question about time, date or weekday: call clock. '
            + 'Any calculation: call calculator, never calculate yourself. '
            + 'Rolling a dice: call dice. '
            + 'Only when the tool result is there, answer briefly in German.',
        en: 'You are a helpful assistant with tools. Rules: '
            + 'Question about time, date or weekday: call clock. '
            + 'Any calculation: call calculator, never calculate yourself. '
            + 'Rolling a dice: call dice. '
            + 'Only when the tool result is there, answer briefly in English.',
    },
    'example.tools.router.name': { de: 'will_werkzeug', en: 'wants_tool' },
    'example.tools.workshop.name': { de: 'werkstatt', en: 'workshop' },

    'example.helpers.label': { de: '👔 Chef mit Hilfsagenten', en: '👔 Boss with helper agents' },
    'example.helpers.boss.name': { de: 'chef', en: 'boss' },
    // English rules in both languages, like the tools example: the small model delegates reliably only then.
    'example.helpers.boss.prompt': {
        de: 'You are a team lead with two helpers. The user writes German. Rules: '
            + 'The user wants a poem (Gedicht, Vers, Reim, dichten): call dichter with the topic, nothing else. '
            + 'The user wants a translation (übersetzen, Übersetzung, translate): call uebersetzer with the text and the target language. '
            + 'Anything else: answer yourself in German, short and friendly. Never refuse, never answer in English. '
            + 'When a helper result is there, pass it on to the user unchanged.',
        en: 'You are a team lead with two helpers. Rules: '
            + 'The user wants a poem, verse or rhyme: call poet with the topic, nothing else. '
            + 'The user wants a translation: call translator with the text and the target language. '
            + 'Anything else: answer yourself in English, short and friendly. Never refuse. '
            + 'When a helper result is there, pass it on to the user unchanged.',
    },
    'example.helpers.router.name': { de: 'will_hilfe', en: 'wants_help' },
    'example.helpers.workshop.name': { de: 'team', en: 'team' },
    // The helper names are what the boss model calls, the rules above name them the same way.
    'example.helpers.poet.name': { de: 'dichter', en: 'poet' },
    'example.helpers.poet.hint': { de: 'Writes a short poem (Gedicht) about a topic.', en: 'Writes a short poem about a topic.' },
    'example.helpers.poet.model': { de: 'kreativ', en: 'creative' },
    'example.helpers.translator.model': { de: 'genau', en: 'precise' },
    'example.helpers.translator.name': { de: 'uebersetzer', en: 'translator' },
    'example.helpers.translator.prompt': {
        de: 'Du bist Übersetzer. Übersetze den Text in die gewünschte Sprache, ohne Angabe ins Englische. Antworte nur mit der Übersetzung.',
        en: 'You are a translator. Translate the text into the requested language, German when none is given. Answer with the translation only.',
    },
    'example.helpers.translator.hint': {
        de: 'Translates a text (übersetzen) into another language, English when none is given.',
        en: 'Translates a text into another language, German when none is given.',
    },
    'example.reflection.label': { de: '🔁 Reflexion (Aufgabe)', en: '🔁 Reflection (task)' },
    'example.reflection.writer.name': { de: 'schreiber', en: 'writer' },
    'example.reflection.writer.prompt': {
        de: 'Du bist ein Autor. Schreibe zur Aufgabe einen sehr kurzen Text auf Deutsch, höchstens vier Zeilen. '
            + 'Kommt danach Kritik, schreibe den ganzen Text verbessert neu.',
        en: 'You are an author. Write a very short text in English for the task, four lines at most. '
            + 'When criticism follows, rewrite the whole text improved.',
    },
    'example.reflection.critic.name': { de: 'kritiker', en: 'critic' },
    'example.reflection.critic.prompt': {
        de: 'Du bist ein strenger, aber fairer Lektor. Prüfe den letzten Text. '
            + 'Ist er gut, antworte nur mit OK. Sonst nenne in einem Satz, was besser werden muss.',
        en: 'You are a strict but fair editor. Check the last text. '
            + 'If it is good, answer only with OK. Otherwise say in one sentence what must improve.',
    },
    'example.reflection.critic.model': { de: 'streng', en: 'strict' },
    'example.reflection.router.name': { de: 'gut_genug', en: 'good_enough' },

    // ===========================================================================
    // ==============================   GENERATOR   ==============================
    // ===========================================================================
    //
    //   Problems and hints of the graph, then the texts the generated Python prints.
    //

    'problem.start.count': { de: 'Der Graph braucht genau eine 🟢 START-Karte.', en: 'The graph needs exactly one 🟢 START card.' },
    'problem.end.missing': { de: 'Der Graph braucht eine 🏁 END-Karte.', en: 'The graph needs an 🏁 END card.' },
    'hint.state.missing': { de: 'An START hängt kein 🗂️ Notizzettel, darauf stehen dann nur die Nachrichten.', en: 'No 🗂️ notepad hangs at START, so it holds only the messages.' },
    'hint.state.lone': { de: 'Dieser Notizzettel hängt nicht an START und wird nicht benutzt.', en: 'This notepad does not hang at START and is not used.' },
    'hint.memory.missing': { de: 'An START hängt kein 💾 Gedächtnis, jede Frage beginnt mit einem leeren Notizzettel.', en: 'No 💾 memory hangs at START, every question begins with an empty notepad.' },
    'hint.memory.lone': { de: 'Dieses Gedächtnis hängt nicht an START und wird nicht benutzt.', en: 'This memory does not hang at START and is not used.' },
    'hint.answer.none': { de: 'Kein Agent hat „📣 Antwort zeigen“ an, du siehst also keine Antwort.', en: 'No agent has "📣 Show answer" on, so you will see no answer.' },
    'problem.model.missing': {
        de: '"{name}" hängt an keinem 🧠 Modell. Zieh eine Linie von seinem Modell-Steckplatz zu einer Modell-Karte.',
        en: '"{name}" hangs at no 🧠 model. Draw a line from its model socket to a model card.',
    },
    'problem.summary.field': {
        de: 'Der Zusammenfasser schreibt "summary", füge dem 🗂️ Notizzettel das Feld "summary" hinzu.',
        en: 'The summarizer writes "summary", add the field "summary" to the 🗂️ notepad.',
    },
    'hint.node.unreachable': { de: 'Zu "{name}" führt keine Kante, er läuft nie.', en: 'No edge leads to "{name}", it never runs.' },
    'hint.workshop.empty': { de: 'In der Werkstatt "{name}" liegt kein 🔧 Werkzeug. Häng Werkzeuge an ihren Steckplatz.', en: 'The workshop "{name}" holds no 🔧 tool. Hang tools at its socket.' },
    'hint.workshop.unplugged': { de: 'Kein Agent steckt in der Werkstatt "{name}" 🔌, sein Modell kennt ihre Werkzeuge nicht.', en: 'No agent is plugged into the workshop "{name}" 🔌, so no model knows its tools.' },
    'hint.tool.lone': { de: 'Dieses Werkzeug liegt in keiner Werkstatt und wird nicht benutzt.', en: 'This tool lies in no workshop and is not used.' },
    'hint.helper.lone': { de: 'Der Hilfsagent "{name}" liegt in keiner Werkstatt, kein Agent kann ihn rufen.', en: 'The helper agent "{name}" lies in no workshop, no agent can call it.' },
    'problem.helper.model': { de: 'Der Hilfsagent "{name}" hängt an keinem 🧠 Modell.', en: 'The helper agent "{name}" hangs at no 🧠 model.' },
    'problem.name.duplicate': { de: 'Den Namen "{name}" gibt es zweimal.', en: 'The name "{name}" is used twice.' },
    'problem.name.reserved': { de: '"{name}" ist schon vergeben, nimm einen anderen Namen.', en: '"{name}" is already taken, pick another name.' },
    'problem.model.duplicate': { de: 'Den Modellnamen "{name}" gibt es zweimal.', en: 'The model name "{name}" is used twice.' },
    'problem.start.edge': { de: 'Von START geht keine Kante weg, der Graph weiß nicht, wo es losgeht.', en: 'No edge leaves START, the graph does not know where to begin.' },
    'problem.router.model': { de: 'Die Weiche "{name}" soll selbst entscheiden, braucht dafür aber ein 🧠 Modell.', en: 'The switch "{name}" is to decide itself, but needs a 🧠 model for that.' },
    'problem.router.ways': { de: 'Die Weiche "{name}" braucht mindestens zwei 🏷️ Wege zur Auswahl.', en: 'The switch "{name}" needs at least two 🏷️ ways to choose from.' },
    'problem.router.target': { de: 'Bei der Weiche "{name}" führt der Weg „{way}“ nirgendwo hin.', en: 'At the switch "{name}" the way "{way}" leads nowhere.' },
    'problem.router.chain': { de: 'Eine Weiche direkt nach einer Weiche geht noch nicht, setz einen Knoten dazwischen.', en: 'A switch right after a switch is not possible yet, put a node in between.' },
    'hint.router.unreachable': { de: 'Zur Weiche "{name}" führt keine Kante.', en: 'No edge leads to the switch "{name}".' },
    'problem.start.incoming': { de: 'Eine Kante zeigt auf START. START ist nur der Eingang.', en: 'An edge points at START. START is only the entrance.' },

    // Texts inside the generated Python: strings the terminal shows and what the model reads.
    'python.usage.task': { de: 'Deine Aufgabe', en: 'Your task' },
    'python.summary.context': { de: 'Zusammenfassung des bisherigen Gesprächs:', en: 'Summary of the conversation so far:' },
    'python.summary.extend': { de: 'Bisherige Zusammenfassung, ergänze sie:', en: 'Summary so far, extend it:' },
    'python.answer.prefix': { de: 'KI: ', en: 'AI: ' },
    'python.question.prefix': { de: 'Du: ', en: 'You: ' },
    'python.model.line': { de: 'Modell: ', en: 'Model: ' },
    'python.commands': { de: 'Befehle: {reset} = neues Gespräch, exit = beenden', en: 'Commands: {reset} = new conversation, exit = quit' },
    'python.reset.done': { de: 'Neues Gespräch gestartet.', en: 'New conversation started.' },
    'python.error.unreachable': { de: '[Fehler] Das Modell ist unter {url} nicht erreichbar. ', en: '[Error] The model is not reachable at {url}. ' },
    'python.error.server': { de: 'Läuft der Server?', en: 'Is the server running?' },
    'python.goodbye': { de: 'Tschüss!', en: 'Bye!' },
    'python.task.example': { de: 'Schreib einen Vierzeiler über Raketen.', en: 'Write a four-line poem about rockets.' },
    'python.task.prompt': { de: 'Aufgabe: ', en: 'Task: ' },
    'python.task.none': { de: 'Keine Aufgabe, nichts zu tun.', en: 'No task, nothing to do.' },
    'python.task.notepad': { de: 'Notizzettel am Ende:', en: 'Notepad at the end:' },

    // ===========================================================================
    // ===============================   EDITOR   ================================
    // ===========================================================================

    'editor.trash': { de: 'Hierher ziehen zum Löschen', en: 'Drag here to delete' },
    'editor.undo': { de: 'Rückgängig (Strg+Z)', en: 'Undo (Ctrl+Z)' },
    'editor.redo': { de: 'Wiederholen (Strg+Y)', en: 'Redo (Ctrl+Y)' },
    'editor.zoomIn': { de: 'Vergrößern', en: 'Zoom in' },
    'editor.zoomOut': { de: 'Verkleinern', en: 'Zoom out' },
    'editor.fit': { de: 'Alles zeigen', en: 'Show everything' },
    'editor.inspector.fold': { de: 'Einklappen', en: 'Fold' },
    'editor.inspector.unfold': { de: 'Puzzle der Karte zeigen', en: 'Show the puzzle of the card' },
    'editor.close': { de: 'Schließen', en: 'Close' },
    'editor.inspector.plan': { de: '🛰️ Bauplan des Graphen', en: '🛰️ Plan of the graph' },
    'editor.inspector.card': { de: '👾 Karte: {title}', en: '👾 Card: {title}' },
    'editor.inspector.hint.none': { de: 'Diese Karte hat nichts einzustellen.', en: 'This card has nothing to set.' },
    'editor.inspector.hint.fields': { de: 'Das Puzzle in der Karte: hier stellst du sie ein.', en: 'The puzzle inside the card: this is where you set it up.' },
    'editor.inspector.hint.slots': { de: 'Das Puzzle in der Karte: stell sie ein und zieh passende Puzzleteile in die Fächer.', en: 'The puzzle inside the card: set it up and drag fitting pieces into the slots.' },
    'editor.inspector.hint.plan': { de: 'Gilt für den ganzen Graphen. Ziehe Puzzleteile aus der Palette in die Fächer.', en: 'Applies to the whole graph. Drag pieces from the palette into the slots.' },
    'palette.graphlings': { de: 'Graphlings', en: 'Graphlings' },
    'palette.resources': { de: 'Ressourcen', en: 'Resources' },
    'palette.pieces': { de: 'Puzzleteile', en: 'Puzzle pieces' },

    // ===========================================================================
    // ================================   PAGE   =================================
    // ===========================================================================

    'ui.tagline': { de: 'Agents und Graphen zum Zusammenstecken', en: 'Agents and graphs to plug together' },
    'ui.example.title': { de: 'Ein Beispiel-Graph zu jedem Muster', en: 'One example graph per pattern' },
    'ui.example.placeholder': { de: '🧩 Beispiel laden …', en: '🧩 Load example …' },
    'ui.example.confirm': { de: 'Den Graphen durch das Beispiel „{label}“ ersetzen?', en: 'Replace the graph with the example "{label}"?' },
    'ui.clear': { de: '🧹 Leeren', en: '🧹 Clear' },
    'ui.clear.confirm': { de: 'Alle Blöcke entfernen?', en: 'Remove all blocks?' },
    'ui.confirm.yes': { de: 'Ja', en: 'Yes' },
    'ui.confirm.no': { de: 'Abbrechen', en: 'Cancel' },
    'ui.code.title': { de: 'Den Python-Code zum Graphen zeigen', en: 'Show the Python code of the graph' },
    'ui.code.show': { de: '🐍 Code zeigen', en: '🐍 Show code' },
    'ui.code.hide': { de: '🐍 Code ausblenden', en: '🐍 Hide code' },
    'ui.copy': { de: '📋 Code kopieren', en: '📋 Copy code' },
    'ui.copy.done': { de: '✅ Kopiert', en: '✅ Copied' },
    'ui.copy.failed': { de: '⚠️ Ging nicht', en: '⚠️ Did not work' },
    'ui.save': { de: '💾 chat.py speichern', en: '💾 Save chat.py' },
    'ui.theme.title': { de: 'Hell oder dunkel', en: 'Light or dark' },
    'ui.theme.dark': { de: '🌙 Dunkel', en: '🌙 Dark' },
    'ui.theme.light': { de: '☀️ Hell', en: '☀️ Light' },
    'ui.language.title': { de: 'Sprache wechseln (lädt die Seite neu)', en: 'Switch language (reloads the page)' },
    'ui.language.switch': { de: '🌐 English', en: '🌐 Deutsch' },
    'ui.code.hint': { de: 'Klick auf eine Karte markiert ihre Zeilen', en: 'Click a card to mark its lines' },
    'ui.chat.label': { de: 'Ausprobieren', en: 'Try it out' },
    'ui.chat.title': { de: '💬 Ausprobieren', en: '💬 Try it out' },
    'ui.chat.title.task': { de: '📋 Aufgabe', en: '📋 Task' },
    'ui.chat.title.chat': { de: '💬 Chat', en: '💬 Chat' },
    'ui.status.starting': { de: '⏳ Modell startet …', en: '⏳ Model starting …' },
    'ui.status.ready': { de: '🟢 Modell bereit', en: '🟢 Model ready' },
    'ui.status.missing': { de: '⚠️ Modell fehlt', en: '⚠️ Model missing' },
    'ui.status.failed': { de: '⛔ Modell-Fehler', en: '⛔ Model error' },
    'ui.status.browser': { de: 'Nur in der App: Hier im Browser läuft kein Modell.', en: 'App only: no model runs here in the browser.' },
    'ui.reset.title': { de: 'Neues Gespräch, neue thread_id', en: 'New conversation, new thread_id' },
    'ui.chat.placeholder.start': { de: 'Erst den Graphen starten …', en: 'Start the graph first …' },
    'ui.chat.placeholder.task': { de: 'Was soll der Graph tun?', en: 'What should the graph do?' },
    'ui.chat.placeholder.chat': { de: 'Frag deinen Graphen …', en: 'Ask your graph …' },
    'ui.send': { de: 'Senden', en: 'Send' },
    'ui.speed.title': { de: 'Tempo: Pause vor jedem Schritt, damit du zusehen kannst', en: 'Speed: a pause before every step, so you can watch' },
    'ui.speed.fast': { de: '⚡ volles Tempo', en: '⚡ full speed' },
    'ui.speed.step': { de: '{seconds} s Pause pro Schritt', en: '{seconds} s pause per step' },
    'ui.run': { de: 'Ausführen', en: 'Run' },
    'ui.start': { de: '▶️ Graph starten', en: '▶️ Start graph' },
    'ui.start.loading': { de: '⏳ Modell lädt …', en: '⏳ Model loading …' },
    'ui.start.restart': { de: '▶️ Neu starten', en: '▶️ Restart' },
    'ui.start.blocked': { de: '⚠️ Graph noch nicht fertig', en: '⚠️ Graph not finished yet' },
    'ui.notepad.end': { de: '🗂️ Notizzettel am Ende ({count} Nachrichten)', en: '🗂️ Notepad at the end ({count} messages)' },
    'ui.chat.browserOnly': { de: 'Nur in der App läuft ein Modell, hier im Browser kannst du bauen und den Code ansehen.', en: 'A model runs only in the app, here in the browser you can build and read the code.' },
    'ui.chat.ready.task': { de: '👾 Graph bereit. Gib ihm eine Aufgabe.', en: '👾 Graph ready. Give it a task.' },
    'ui.chat.ready.chat': { de: '👾 Graph läuft, neues Gespräch gestartet.', en: '👾 Graph running, new conversation started.' },
    'ui.chat.reset': { de: '🔄 Neues Gespräch, neue thread_id.', en: '🔄 New conversation, new thread_id.' },
}
