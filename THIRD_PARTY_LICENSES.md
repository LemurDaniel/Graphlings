# Third-party licenses

Graphlings ships these components. The full license texts are in the `licenses/` folder next to `Graphlings.exe`.

| Component | License | Source |
| --- | --- | --- |
| llama.cpp (llama-server) | MIT | https://github.com/ggml-org/llama.cpp |
| Qwen2.5 1.5B Instruct (GGUF) | Apache 2.0 | https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF |
| Python | PSF License | https://www.python.org |
| pywebview and all other Python packages | see `licenses/python-packages.LICENSES.txt` | https://pypi.org |
| PyInstaller bootloader | GPL 2.0 with bootloader exception | https://pyinstaller.org |

The web version (GitHub Pages) loads these at runtime, pinned, from jsDelivr and Hugging Face. Only coi-serviceworker is in this repo.

| Component | License | Source |
| --- | --- | --- |
| wllama 3.13.0 (llama.cpp as WebAssembly) | MIT | https://github.com/ngxson/wllama |
| Pyodide 0.29.0 (Python as WebAssembly) | MPL 2.0 | https://pyodide.org |
| Qwen2.5 1.5B Instruct (GGUF) | Apache 2.0 | https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF |
| coi-serviceworker 0.1.7 (`web/coi-serviceworker.js`) | MIT, Copyright (c) 2021 Guido Zuidhof | https://github.com/gzuidhof/coi-serviceworker |
