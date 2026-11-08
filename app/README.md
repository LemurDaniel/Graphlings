# App

| File | Content |
| --- | --- |
| `main.py` | Entry point: opens the window, bridges the page to Python, stops the model on close. |
| `runner.py` | Loads the generated chat.py and runs its `stream_answer` for the chat window. |
| `model_server.py` | Starts llama-server with the GGUF model and reports its state. |
| `requirements.txt` | Python packages of the app, the generated code needs none. |
