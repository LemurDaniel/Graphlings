# NOTE:
#   Runs once in Pyodide (worker.python.js) before the generated code. In the browser there is
#   no llama-server and no socket, so urllib.request.urlopen is replaced: the request body goes
#   to the model in the page (bridge.web.js) and the answer comes back in the shape the
#   generated ask_model() reads, one JSON body or 'data: {...}' lines of a stream.
#   The generated code itself stays unchanged, it still runs against llama-server on a PC.
#
#   Requires: Pyodide with the JavaScript object 'bridge' (open, next) of worker.python.js.

#
#   Chapters:
#     ANSWER AS RESPONSE   The page's answer as a file-like response, with errors as in urllib.
#     REPLACE URLOPEN      Sends the request to the page and patches urllib.request.
#

import io
import json
import urllib.error
import urllib.request

from js import bridge


# ===========================================================================
# ==========================   ANSWER AS RESPONSE   =========================
# ===========================================================================
#
#   raise_model_error   A refusal of the model as HTTPError, like llama-server would send it.
#   ModelResponse       read() for a whole body, iteration for the lines of a stream.
#


def raise_model_error(url: str, text: str) -> None:
    """
    :param url:  (Required) The URL the generated code called.
    :param text: (Required) The error the model in the page reported.
    :raises urllib.error.HTTPError: Always, runner.py turns it into one line for the chat.
    """
    raise urllib.error.HTTPError(url, 500, text, {}, io.BytesIO(text.encode("utf-8")))


class ModelResponse(io.RawIOBase):
    """
    What urlopen returns: a whole JSON body (with tools) or a stream of 'data: ...' lines.
    """

    def __init__(self, url: str, first: dict) -> None:
        """
        :param url:   (Required) The URL the generated code called, for error messages.
        :param first: (Required) The page's first answer: kind 'body' with text, or kind 'stream' with id.
        """
        self._url = url
        self._stream_id = first.get("id")
        self._body = first["text"].encode("utf-8") if first["kind"] == "body" else None

    def readable(self) -> bool:
        return True

    def read(self, size: int = -1) -> bytes:
        if self._body is None:
            return b"".join(self)
        data, self._body = self._body, b""
        return data

    def __iter__(self):
        if self._body is not None:
            yield from io.BytesIO(self.read())
            return

        # One blocking call per line, until the page says the stream ended.
        while True:
            message = json.loads(bridge.next(self._stream_id))
            if message["kind"] == "end":
                return
            if message["kind"] == "error":
                raise_model_error(self._url, message["text"])
            yield message["text"].encode("utf-8")


# ===========================================================================
# ============================   REPLACE URLOPEN   ==========================
# ===========================================================================
#
#   urlopen   Takes a Request like the real one, the body goes to the page.
#


def urlopen(request, data=None, timeout=None, **kwargs) -> ModelResponse:
    """
    :param request: (Required) A urllib.request.Request with the JSON body, or a URL with data.
    :param data:    (Optional) The body when request is a plain URL.
    :param timeout: (Optional) Ignored: the model in the page has no network timeout.
    :returns:       The answer of the model as a response object.
    """
    is_request = isinstance(request, urllib.request.Request)
    url = request.full_url if is_request else str(request)
    body = request.data if is_request else data
    if body is None:
        raise urllib.error.URLError(f"In the browser only the model can be called, with a JSON body: {url}")

    first = json.loads(bridge.open(body.decode("utf-8")))
    if first["kind"] == "error":
        raise_model_error(url, first["text"])
    return ModelResponse(url, first)


urllib.request.urlopen = urlopen
