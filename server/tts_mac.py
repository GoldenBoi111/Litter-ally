"""Qwen3-TTS on Apple Silicon (MLX), speaking the same streaming protocol as the Windows audio.cpp server.

voice_rtc.py posts to /v1/audio/speech with stream_format=sse and expects
`data: {"type":"speech.audio.delta","audio":<base64 16-bit mono PCM @ 24 kHz>}` events, then `data: [DONE]`.
"""
import asyncio
import base64
import json
import logging
import os
import threading

import numpy as np
from aiohttp import web
from mlx_audio.tts.utils import load_model

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("tts-mac")
MODEL_ID = os.getenv("MAC_TTS_MODEL", "mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-6bit")
DEFAULT_VOICE = os.getenv("LOCAL_TTS_VOICE", "Aiden")
log.info("Loading %s (first run downloads it)…", MODEL_ID)
MODEL = load_model(MODEL_ID)
SAMPLE_RATE = getattr(MODEL, "sample_rate", 24000)
LOCK = threading.Lock()  # MLX generation is not safe to run concurrently on one model.


def to_pcm16(audio):
    samples = np.clip(np.asarray(audio, dtype=np.float32).reshape(-1), -1.0, 1.0)
    return (samples * 32767).astype("<i2").tobytes()


def generate(text, voice, instruct, emit, stop):
    with LOCK:
        for result in MODEL.generate(text=text, voice=voice, instruct=instruct or None, lang_code="english", stream=True, streaming_interval=0.4):
            if stop.is_set():
                return
            emit(to_pcm16(result.audio))


async def speech(request):
    body = await request.json()
    text = str(body.get("input", "")).strip()
    if not 1 <= len(text) <= 900:
        raise web.HTTPBadRequest(text="input must be 1-900 characters")
    voice = str(body.get("voice") or DEFAULT_VOICE)
    instruct = (body.get("options") or {}).get("instruct")
    response = web.StreamResponse(headers={"Content-Type": "text/event-stream", "Cache-Control": "no-cache"})
    await response.prepare(request)
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue()
    stop = threading.Event()

    def emit(pcm):
        loop.call_soon_threadsafe(queue.put_nowait, pcm)

    def run():
        try:
            generate(text, voice, instruct, emit, stop)
        except Exception as error:  # noqa: BLE001 - reported to the client
            log.exception("Speech generation failed")
            loop.call_soon_threadsafe(queue.put_nowait, error)
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, None)

    threading.Thread(target=run, daemon=True).start()
    try:
        while (item := await queue.get()) is not None:
            if isinstance(item, Exception):
                await response.write(f"data: {json.dumps({'type': 'error', 'error': str(item)[:300]})}\n\n".encode())
                break
            event = {"type": "speech.audio.delta", "audio": base64.b64encode(item).decode()}
            await response.write(f"data: {json.dumps(event)}\n\n".encode())
        await response.write(b"data: [DONE]\n\n")
        await response.write_eof()
    except (ConnectionResetError, asyncio.CancelledError):
        stop.set()
        raise
    return response


async def health(_request):
    return web.json_response({"status": "ok", "model": MODEL_ID, "sampleRate": SAMPLE_RATE})


async def models(_request):
    return web.json_response({"data": [{"id": os.getenv("LOCAL_TTS_MODEL", "qwen3-custom"), "source": MODEL_ID}]})


app = web.Application()
app.router.add_get("/health", health)
app.router.add_get("/v1/models", models)
app.router.add_post("/v1/audio/speech", speech)

if __name__ == "__main__":
    web.run_app(app, host="127.0.0.1", port=int(os.getenv("MAC_TTS_PORT", "8187")))
