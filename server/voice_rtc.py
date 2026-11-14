import asyncio
import base64
import json
import logging
import os
import struct
import time
from collections import deque
from urllib.parse import urlsplit

import av
import numpy as np
from aiohttp import web
from aiortc import RTCConfiguration, RTCIceServer, RTCPeerConnection, RTCSessionDescription
from faster_whisper import WhisperModel
from voice_rtc_config import require_loopback_bind_host

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("voice-rtc")
MODEL = WhisperModel(os.getenv("LOCAL_STT_MODEL", "base.en"), device="cpu", compute_type="int8")
TTS_URL = os.getenv("LOCAL_TTS_URL", "http://127.0.0.1:8187").rstrip("/") + "/v1/audio/speech"
TTS_MODEL = os.getenv("LOCAL_TTS_MODEL", "qwen3-custom")
TTS_VOICE = os.getenv("LOCAL_TTS_VOICE", "Aiden")
STUN_URL = os.getenv("VOICE_RTC_STUN_URL", "").strip()
TTS_INSTRUCT = "Speak in a warm, engaged, conversational teaching voice. Match emotion to meaning, use natural pitch variation and connected phrasing, and avoid theatrical or sing-song delivery."
ALLOWED_ORIGINS = {item.strip() for item in os.getenv("VOICE_RTC_ALLOWED_ORIGINS", "http://127.0.0.1:5185,http://localhost:5185").split(",") if item.strip()}
MAX_OFFER_BYTES = 1_000_000
MAX_CONTROL_BYTES = 4_000
MAX_PEERS = 4
MAX_SEGMENT_SECONDS = 30
MAX_SEGMENT_SAMPLES = 16_000 * MAX_SEGMENT_SECONDS
RING_FRAMES = 30
CHUNK_BYTES = 12_000
pcs = set()
peer_states = {}
asr_semaphore = asyncio.Semaphore(1)


def send_json(channel, value):
    if channel and channel.readyState == "open":
        channel.send(json.dumps(value, separators=(",", ":")))


def origin_allowed(origin):
    if origin in ALLOWED_ORIGINS:
        return True
    try:
        parsed = urlsplit(origin)
        return parsed.scheme == "http" and parsed.hostname in ("localhost", "127.0.0.1")
    except ValueError:
        return False


def transcribe(samples, prompt):
    started = time.perf_counter()
    segments, _ = MODEL.transcribe(samples, language="en", beam_size=3, initial_prompt=prompt or None, vad_filter=False)
    return {"type": "transcript", "text": " ".join(segment.text.strip() for segment in segments).strip(), "latencyMs": round((time.perf_counter() - started) * 1000)}


async def transcribe_segment(channel, samples, prompt, turn):
    try:
        async with asr_semaphore:
            result = await asyncio.to_thread(transcribe, np.asarray(samples, dtype=np.float32), prompt)
        send_json(channel, {**result, "turn": turn})
    except Exception as error:
        log.exception("Local transcription failed")
        send_json(channel, {"type": "error", "turn": turn, "error": str(error)[:300]})


async def send_qwen(channel, text, request_id, tasks):
    try:
        import aiohttp

        timeout = aiohttp.ClientTimeout(total=120)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(TTS_URL, json={"model": TTS_MODEL, "input": text, "voice": TTS_VOICE, "options": {"instruct": TTS_INSTRUCT}, "stream_format": "sse"}, headers={"Accept": "text/event-stream"}) as response:
                if response.status != 200:
                    raise RuntimeError(f"Local Qwen TTS returned HTTP {response.status}.")
                pending = ""
                async for chunk in response.content.iter_any():
                    pending += chunk.decode("utf-8", errors="ignore")
                    blocks = pending.split("\n\n")
                    pending = blocks.pop()
                    for block in blocks:
                        line = next((line[6:] for line in block.splitlines() if line.startswith("data: ")), None)
                        if not line or line == "[DONE]":
                            continue
                        event = json.loads(line)
                        if event.get("type") == "error":
                            raise RuntimeError(str(event.get("error", "Qwen speech failed."))[:300])
                        audio = event.get("audio") if event.get("type") == "speech.audio.delta" else None
                        if audio:
                            pcm = base64.b64decode(audio, validate=True)
                            for offset in range(0, len(pcm) - (len(pcm) % 2), CHUNK_BYTES):
                                if asyncio.current_task().cancelled():
                                    return
                                part = pcm[offset:offset + CHUNK_BYTES]
                                if channel.readyState != "open":
                                    return
                                while channel.bufferedAmount > 256_000:
                                    await asyncio.sleep(0.01)
                                    if channel.readyState != "open":
                                        return
                                channel.send(struct.pack("!I", int(request_id)) + part)
        send_json(channel, {"type": "speech.done", "id": request_id})
    except asyncio.CancelledError:
        raise
    except Exception as error:
        log.exception("Local Qwen speech failed")
        send_json(channel, {"type": "error", "id": request_id, "error": str(error)[:300]})
    finally:
        tasks.pop(request_id, None)


async def handle_offer(request):
    origin = request.headers.get("Origin", "")
    if origin and not origin_allowed(origin):
        raise web.HTTPForbidden(text="Origin is not allowed.")
    if len(pcs) >= MAX_PEERS:
        raise web.HTTPServiceUnavailable(text="The local voice host is at capacity.")
    if request.content_length is None or request.content_length > MAX_OFFER_BYTES:
        raise web.HTTPRequestEntityTooLarge(max_size=MAX_OFFER_BYTES, actual_size=request.content_length or 0)
    try:
        offer = await request.json()
        if not isinstance(offer, dict) or offer.get("type") != "offer" or not isinstance(offer.get("sdp"), str) or len(offer["sdp"]) > MAX_OFFER_BYTES:
            raise ValueError("A bounded WebRTC offer is required.")
    except (ValueError, json.JSONDecodeError):
        raise web.HTTPBadRequest(text="A valid WebRTC offer is required.")

    ice_servers = [RTCIceServer(urls=STUN_URL)] if STUN_URL else []
    pc = RTCPeerConnection(RTCConfiguration(iceServers=ice_servers))
    pcs.add(pc)
    state = {"ring": deque(maxlen=RING_FRAMES), "segment": None, "segment_samples": 0, "recording": False, "turn": None, "channel": None, "tasks": {}}
    peer_states[pc] = state

    @pc.on("datachannel")
    def on_datachannel(channel):
        state["channel"] = channel

        @channel.on("message")
        def on_message(message):
            if not isinstance(message, str) or len(message.encode("utf-8")) > MAX_CONTROL_BYTES:
                send_json(channel, {"type": "error", "error": "Invalid voice control message."})
                return
            try:
                data = json.loads(message)
            except json.JSONDecodeError:
                send_json(channel, {"type": "error", "error": "Invalid voice control message."})
                return
            kind = data.get("type") if isinstance(data, dict) else None
            if kind == "speech.start":
                if not isinstance(data.get("turn"), int):
                    send_json(channel, {"type": "error", "error": "Invalid voice turn."})
                    return
                state["segment"] = list(state["ring"])
                state["segment_samples"] = sum(len(frame) for frame in state["segment"])
                state["recording"] = True
                state["turn"] = data.get("turn")
            elif kind == "speech.end":
                if state["segment"] is None:
                    return
                state["recording"] = False
                frames = state["segment"]
                turn = state["turn"]
                state["segment"] = None
                state["segment_samples"] = 0
                state["turn"] = None
                samples = np.concatenate(frames) if frames else np.empty(0, dtype=np.float32)
                if not data.get("ignoreResult") and 1_600 <= samples.size <= MAX_SEGMENT_SAMPLES:
                    asyncio.create_task(transcribe_segment(channel, samples, str(data.get("prompt", ""))[:2_000], turn))
                else:
                    send_json(channel, {"type": "transcript", "text": "", "latencyMs": 0, "turn": turn})
            elif kind == "speak":
                text = data.get("text")
                request_id = data.get("id")
                if not isinstance(text, str) or not 1 <= len(text.strip()) <= 900 or not isinstance(request_id, str) or not request_id.isdigit() or int(request_id) > 4_294_967_295:
                    send_json(channel, {"type": "error", "id": request_id, "error": "Speech text must be between 1 and 900 characters."})
                    return
                if request_id in state["tasks"]:
                    return
                if state["tasks"]:
                    send_json(channel, {"type": "error", "id": request_id, "error": "Speech is already being generated for this connection."})
                    return
                task = asyncio.create_task(send_qwen(channel, text.strip(), request_id, state["tasks"]))
                state["tasks"][request_id] = task
            elif kind == "cancel":
                state["recording"] = False
                state["segment"] = None
                state["segment_samples"] = 0
                for task in tuple(state["tasks"].values()):
                    task.cancel()
                state["tasks"].clear()
                send_json(channel, {"type": "cancelled"})
            elif kind == "speech.cancel":
                state["recording"] = False
                state["segment"] = None
                state["segment_samples"] = 0
            else:
                send_json(channel, {"type": "error", "error": "Unknown voice control message."})

    @pc.on("track")
    def on_track(track):
        if track.kind != "audio":
            track.stop()
            return
        asyncio.create_task(receive_audio(track, state))

    @pc.on("connectionstatechange")
    async def on_connectionstatechange():
        if pc.connectionState in ("failed", "closed"):
            await close_peer(pc, state)

    try:
        await pc.setRemoteDescription(RTCSessionDescription(sdp=offer["sdp"], type="offer"))
        answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        headers = {"Access-Control-Allow-Origin": origin, "Vary": "Origin", "Cache-Control": "no-store"} if origin_allowed(origin) else {"Cache-Control": "no-store"}
        return web.json_response({"sdp": pc.localDescription.sdp, "type": pc.localDescription.type}, headers=headers)
    except Exception:
        await close_peer(pc, state)
        raise


async def receive_audio(track, state):
    resampler = av.AudioResampler(format="flt", layout="mono", rate=16_000)
    try:
        while True:
            frame = await track.recv()
            for converted in resampler.resample(frame):
                samples = converted.to_ndarray().reshape(-1).astype(np.float32, copy=True)
                if state["recording"] and state["segment"] is not None:
                    state["segment"].append(samples)
                    state["segment_samples"] += len(samples)
                    if state["segment_samples"] > MAX_SEGMENT_SAMPLES:
                        turn = state["turn"]
                        state["recording"] = False
                        state["segment"] = None
                        state["segment_samples"] = 0
                        state["turn"] = None
                        send_json(state["channel"], {"type": "error", "turn": turn, "error": "Speech recording reached the 30 second limit."})
                else:
                    state["ring"].append(samples)
    except Exception as error:
        log.debug("Audio track ended: %s", error)


async def close_peer(pc, state):
    for task in tuple(state["tasks"].values()):
        task.cancel()
    state["tasks"].clear()
    pcs.discard(pc)
    peer_states.pop(pc, None)
    if pc.connectionState != "closed":
        await pc.close()


@web.middleware
async def cors(request, handler):
    if request.method == "OPTIONS":
        origin = request.headers.get("Origin", "")
        if not origin_allowed(origin):
            raise web.HTTPForbidden(text="Origin is not allowed.")
        return web.Response(status=204, headers={"Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "600", "Vary": "Origin"})
    response = await handler(request)
    origin = request.headers.get("Origin", "")
    if origin_allowed(origin) and not response.prepared:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
    return response


async def diagnostic_transcribe(request):
    if os.getenv("VOICE_RTC_DIAGNOSTICS", "false").lower() != "true":
        raise web.HTTPNotFound()
    if request.content_length is None or not 6_400 <= request.content_length <= 5_760_000 or request.content_length % 4:
        raise web.HTTPBadRequest(text="Audio must be between 0.1 and 90 seconds of Float32 mono PCM.")
    audio = np.frombuffer(await request.read(), dtype="<f4")
    if audio.size < 1_600 or audio.size > 16_000 * 90 or not np.isfinite(audio).all():
        raise web.HTTPBadRequest(text="Invalid Float32 speech audio.")
    prompt = request.headers.get("X-Voice-Prompt", "")[:2_000]
    async with asr_semaphore:
        return web.json_response(await asyncio.to_thread(transcribe, audio, prompt))


async def source_transcribe(request):
    if request.content_length is None or not 4 <= request.content_length <= MAX_SEGMENT_SAMPLES * 4 or request.content_length % 4:
        raise web.HTTPBadRequest(text="Audio chunks must be Float32 mono PCM no longer than 30 seconds.")
    audio = np.frombuffer(await request.read(), dtype="<f4")
    if audio.size < 1_600 or audio.size > MAX_SEGMENT_SAMPLES or not np.isfinite(audio).all():
        raise web.HTTPBadRequest(text="Invalid audio chunk.")
    async with asr_semaphore:
        result = await asyncio.to_thread(transcribe, audio, "")
    return web.json_response({"text": result["text"]})


async def diagnostic_speech(request):
    if os.getenv("VOICE_RTC_DIAGNOSTICS", "false").lower() != "true":
        raise web.HTTPNotFound()
    try:
        data = await request.json()
        text = data.get("text", "")
        if not isinstance(text, str) or not 1 <= len(text.strip()) <= 900:
            raise ValueError("Speech text must be between 1 and 900 characters.")
        text = text.strip()
        import aiohttp

        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=120)) as session:
            async with session.post(TTS_URL, json={"model": TTS_MODEL, "input": text, "voice": TTS_VOICE, "options": {"instruct": TTS_INSTRUCT}, "stream_format": "sse"}, headers={"Accept": "text/event-stream"}) as upstream:
                if upstream.status != 200:
                    raise RuntimeError(f"Local Qwen TTS returned HTTP {upstream.status}.")
                response = web.StreamResponse(headers={"Content-Type": "text/event-stream", "Cache-Control": "no-cache"})
                await response.prepare(request)
                async for chunk in upstream.content.iter_any():
                    await response.write(chunk)
                await response.write_eof()
                return response
    except (ValueError, json.JSONDecodeError) as error:
        raise web.HTTPBadRequest(text=str(error))
    except Exception as error:
        log.exception("Diagnostic Qwen request failed")
        raise web.HTTPServiceUnavailable(text=str(error)[:300])


async def on_shutdown(_app):
    await asyncio.gather(*(close_peer(pc, peer_states.get(pc, {})) for pc in tuple(pcs)), return_exceptions=True)


async def health(_request):
    return web.json_response({"status": "ok", "model": os.getenv("LOCAL_STT_MODEL", "base.en")})


app = web.Application(middlewares=[cors], client_max_size=6_000_000)
app.router.add_get("/health", health)
app.router.add_post("/offer", handle_offer)
app.router.add_post("/transcribe", diagnostic_transcribe)
app.router.add_post("/source-transcribe", source_transcribe)
app.router.add_post("/speech", diagnostic_speech)
app.on_shutdown.append(on_shutdown)

if __name__ == "__main__":
    try:
        bind_host = require_loopback_bind_host(os.getenv("VOICE_RTC_BIND", "127.0.0.1"))
    except ValueError as error:
        raise SystemExit(str(error))
    web.run_app(app, host=bind_host, port=int(os.getenv("VOICE_RTC_PORT", "8190")))
