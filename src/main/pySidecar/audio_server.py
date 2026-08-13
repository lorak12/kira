"""
Kira audio sidecar: owns the microphone, runs openWakeWord continuously for
wake-word detection, and (once woken) captures an utterance with simple
energy-based VAD and transcribes it with faster-whisper -- or hands the raw
audio back to Node for a Groq STT fallback, depending on config.

One process owns the mic so wake-word detection and utterance capture never
fight over the audio device. Talks to the Electron main process over a local
WebSocket as newline-delimited JSON messages.

Usage:
  python audio_server.py --port 8765 --ww-model path/to/kira.onnx
    [--mute-model path/to/mute.onnx] [--threshold 0.5]
    [--stt-engine local|groq] [--whisper-model-size small]
    [--barge-in] [--barge-in-rms-threshold 1200] [--barge-in-min-speech-ms 400]
"""

import argparse
import asyncio
import base64
import io
import json
import sys
import time
import wave

import numpy as np
import sounddevice as sd
import websockets

SAMPLE_RATE = 16000
CHUNK_SAMPLES = 1280  # 80ms @ 16kHz, openWakeWord's expected chunk size
SILENCE_RMS_THRESHOLD = 300  # int16 RMS; tune per mic if VAD is too eager/lazy
SILENCE_HANG_MS = 800
MAX_UTTERANCE_MS = 15000
# Ordinary speech has brief energy dips between syllables/words (well under
# this) that shouldn't reset a barge-in detection in progress -- only a gap
# at least this long counts as the user having actually stopped/not started.
BARGE_IN_GAP_TOLERANCE_MS = 150
# Safety net: if Electron never sends start_listening (e.g. greeting synthesis
# failed), don't sit "armed" forever -- start listening anyway after this long.
ARMED_TIMEOUT_S = 8.0


def log(*args):
    ts = time.strftime("%H:%M:%S", time.localtime()) + f".{int(time.time() * 1000) % 1000:03d}"
    print(f"[{ts}]", "[sidecar]", *args, file=sys.stderr, flush=True)


def _add_cuda_dll_dirs():
    # faster-whisper/ctranslate2's GPU path needs cuBLAS + cuDNN DLLs on
    # Windows. Rather than requiring a system-wide CUDA Toolkit install, we
    # pip-install the redistributable nvidia-cublas-cu12/nvidia-cudnn-cu12
    # wheels into this venv (see requirements.txt) -- but pip-installed
    # packages don't get their bin/ folders added to the DLL search path
    # automatically, so ctranslate2 can't find them without this.
    import os
    import site

    for base in site.getsitepackages():
        for sub in ("nvidia/cublas/bin", "nvidia/cudnn/bin"):
            path = os.path.join(base, *sub.split("/"))
            if os.path.isdir(path):
                try:
                    os.add_dll_directory(path)
                except (AttributeError, OSError):
                    pass  # add_dll_directory is Windows/Python 3.8+ only


def pcm_to_wav_bytes(pcm: np.ndarray, sample_rate: int = SAMPLE_RATE) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm.astype(np.int16).tobytes())
    return buf.getvalue()


class AudioSidecar:
    def __init__(self, args):
        self.args = args
        self.audio_queue: asyncio.Queue | None = None
        self.loop: asyncio.AbstractEventLoop | None = None
        self.clients: set = set()
        self.state = "idle"  # idle -> armed -> listening -> transcribing -> idle
        self.utterance_frames: list[np.ndarray] = []
        self.silence_chunks = 0
        self.total_utterance_chunks = 0
        self.heard_speech = False
        self.armed_at: float | None = None

        # Barge-in (see config.bargeIn / TODO-barge-in.md): Electron tells us
        # via 'kira_busy' when Kira is thinking (running the LLM/tool loop)
        # or actually talking -- covers both, not just TTS playback, so an
        # interruption doesn't have to wait for her to start speaking. Only
        # while that's true do we run the extra RMS check below -- outside
        # of it, sustained loud audio is just the user talking normally and
        # 'armed'/'listening' already handle that.
        self.kira_busy = False
        self.barge_in_speech_ms = 0.0
        self.barge_in_gap_chunks = 0
        self.barge_in_max_rms_seen = 0.0

        self.ww_model = self._load_wake_word_model()
        self.whisper_model = None
        if args.stt_engine == "local":
            self.whisper_model = self._load_whisper_model()

    def _load_wake_word_model(self):
        from openwakeword.model import Model

        model_paths = [self.args.ww_model]
        if self.args.mute_model:
            model_paths.append(self.args.mute_model)
        log(f"loading wake-word models: {model_paths}")
        return Model(wakeword_models=model_paths, inference_framework="onnx")

    def _load_whisper_model(self):
        from faster_whisper import WhisperModel

        _add_cuda_dll_dirs()
        log(f"loading faster-whisper model size={self.args.whisper_model_size}, trying GPU first")
        try:
            model = WhisperModel(self.args.whisper_model_size, device="cuda", compute_type="float16")
            log("faster-whisper running on GPU (cuda/float16)")
            return model
        except Exception as e:
            # Falls back rather than crashing the sidecar -- no GPU, a
            # missing/mismatched driver, or a DLL problem shouldn't take
            # down voice input entirely when CPU still works, just slower.
            log(f"GPU load failed ({e}), falling back to CPU (int8)")
        return WhisperModel(self.args.whisper_model_size, device="cpu", compute_type="int8")

    # -- audio input --------------------------------------------------

    def _on_audio_block(self, indata, frames, time_info, status):
        if status:
            log("sounddevice status:", status)
        mono = indata[:, 0].copy()
        self.loop.call_soon_threadsafe(self.audio_queue.put_nowait, mono)

    async def audio_loop(self):
        self.loop = asyncio.get_running_loop()
        self.audio_queue = asyncio.Queue()
        stream = sd.InputStream(
            samplerate=SAMPLE_RATE,
            channels=1,
            dtype="int16",
            blocksize=CHUNK_SAMPLES,
            callback=self._on_audio_block,
        )
        with stream:
            log("microphone stream started")
            while True:
                chunk = await self.audio_queue.get()
                await self._process_chunk(chunk)

    async def _process_chunk(self, chunk: np.ndarray):
        if self.state == "idle":
            await self._check_wake_word(chunk)
        elif self.state == "armed":
            await self._check_armed_timeout()
        elif self.state == "listening":
            await self._accumulate_utterance(chunk)

    async def _check_wake_word(self, chunk: np.ndarray):
        if self.args.barge_in and self.kira_busy:
            await self._check_barge_in(chunk)
            # Deliberately falls through to the wake-word/mute checks below
            # too -- saying "Kira" over her should still work as a wake
            # word, same as it always has.

        scores = self.ww_model.predict(chunk)
        kira_key = _model_key(self.args.ww_model)
        if scores.get(kira_key, 0.0) >= self.args.threshold:
            log(f"wake word detected (score={scores[kira_key]:.2f})")
            self.ww_model.reset()
            # Don't start accumulating the command yet -- Electron plays a
            # spoken greeting first, and we don't want that audio bleeding
            # into the mic recording. Electron sends start_listening once the
            # greeting finishes playing.
            self.state = "armed"
            self.armed_at = time.monotonic()
            await self._broadcast({"type": "wake"})
            return

        if self.args.mute_model:
            mute_key = _model_key(self.args.mute_model)
            if scores.get(mute_key, 0.0) >= self.args.threshold:
                log(f"mute keyword detected (score={scores[mute_key]:.2f})")
                await self._broadcast({"type": "mute"})

    async def _check_barge_in(self, chunk: np.ndarray):
        # No acoustic echo cancellation here -- this is a plain RMS gate, so
        # it WILL sometimes fire on Kira's own voice bleeding into the mic
        # rather than the user actually interrupting. That's a live-tuning
        # problem (config.bargeIn.rmsThreshold/minSpeechMs), not something
        # fixable from the algorithm alone; see TODO-barge-in.md.
        rms = float(np.sqrt(np.mean(chunk.astype(np.float32) ** 2)))
        self.barge_in_max_rms_seen = max(self.barge_in_max_rms_seen, rms)
        chunk_ms = 1000 * CHUNK_SAMPLES / SAMPLE_RATE

        if rms >= self.args.barge_in_rms_threshold:
            self.barge_in_speech_ms += chunk_ms
            self.barge_in_gap_chunks = 0
        else:
            self.barge_in_gap_chunks += 1
            # Only a real pause (not just the gap between syllables) clears
            # accumulated progress -- see BARGE_IN_GAP_TOLERANCE_MS.
            if self.barge_in_gap_chunks * chunk_ms >= BARGE_IN_GAP_TOLERANCE_MS:
                self.barge_in_speech_ms = 0.0

        if self.barge_in_speech_ms >= self.args.barge_in_min_speech_ms:
            log(f"barge-in detected (rms={rms:.0f})")
            self.barge_in_speech_ms = 0.0
            self.barge_in_gap_chunks = 0
            # Stop treating this turn as interruptible immediately --
            # Electron will confirm with its own 'kira_busy': false once it
            # reacts, but not resetting here would let a still-loud reply
            # re-trigger every minSpeechMs until that round-trip lands.
            self.kira_busy = False
            await self._broadcast({"type": "barge_in"})

    async def _check_armed_timeout(self):
        if self.armed_at is not None and time.monotonic() - self.armed_at >= ARMED_TIMEOUT_S:
            log("armed timeout elapsed, starting to listen without a start_listening cmd")
            self._begin_listening()

    def _begin_listening(self):
        self.state = "listening"
        self.armed_at = None
        self.utterance_frames = []
        self.silence_chunks = 0
        self.total_utterance_chunks = 0
        self.heard_speech = False

    async def _accumulate_utterance(self, chunk: np.ndarray):
        self.utterance_frames.append(chunk)
        self.total_utterance_chunks += 1

        rms = float(np.sqrt(np.mean(chunk.astype(np.float32) ** 2)))
        if rms < SILENCE_RMS_THRESHOLD:
            self.silence_chunks += 1
        else:
            self.silence_chunks = 0
            self.heard_speech = True

        chunk_ms = 1000 * CHUNK_SAMPLES / SAMPLE_RATE
        silence_ms = self.silence_chunks * chunk_ms
        elapsed_ms = self.total_utterance_chunks * chunk_ms

        # A user's natural pause after the wake word (before they start their
        # sentence) looks identical to trailing silence -- only start the
        # "end of utterance" silence countdown once real speech has actually
        # been heard, so that pause doesn't cut the utterance off before it
        # begins. elapsed_ms is a hard cap regardless, so silent sessions
        # still terminate instead of listening forever.
        if (self.heard_speech and silence_ms >= SILENCE_HANG_MS) or elapsed_ms >= MAX_UTTERANCE_MS:
            await self._finish_utterance()

    async def _finish_utterance(self):
        self.state = "transcribing"
        await self._broadcast({"type": "speech_end"})

        pcm = np.concatenate(self.utterance_frames) if self.utterance_frames else np.array([], dtype=np.int16)
        self.utterance_frames = []

        if self.whisper_model is not None:
            audio_f32 = pcm.astype(np.float32) / 32768.0
            utterance_s = len(pcm) / SAMPLE_RATE
            # Per-utterance language auto-detection is unreliable on short
            # commands (a couple words) and gets pulled further off by any
            # background audio bleeding into the mic -- pinning --language
            # (when configured) skips detection and transcribes directly in
            # that language instead of guessing wrong ones like Russian for
            # Polish speech.
            t0 = time.monotonic()
            # beam_size=1 (greedy decoding) instead of the default 5 -- for
            # short voice-assistant commands the accuracy difference is
            # negligible but it's a straight multiplier on transcription
            # time (beam search runs `beam_size` hypotheses in parallel).
            segments, info = self.whisper_model.transcribe(
                audio_f32, beam_size=1, language=self.args.language
            )
            text = "".join(seg.text for seg in segments).strip()
            transcribe_s = time.monotonic() - t0
            log(
                f"transcribed {utterance_s:.1f}s of audio in {transcribe_s:.1f}s "
                f"(model={self.args.whisper_model_size})"
            )
            await self._broadcast({"type": "transcript", "text": text, "lang": info.language})
        else:
            wav_bytes = pcm_to_wav_bytes(pcm)
            await self._broadcast(
                {
                    "type": "audio",
                    "audio": base64.b64encode(wav_bytes).decode("ascii"),
                    "sampleRate": SAMPLE_RATE,
                }
            )

        self.state = "idle"
        self.heard_speech = False

    async def _abort(self):
        log("aborting current listen/transcribe session")
        self.state = "idle"
        self.armed_at = None
        self.utterance_frames = []
        self.silence_chunks = 0
        self.total_utterance_chunks = 0
        self.heard_speech = False
        self.ww_model.reset()

    # -- websocket server ----------------------------------------------

    async def _broadcast(self, message: dict):
        if not self.clients:
            return
        payload = json.dumps(message)
        await asyncio.gather(*(c.send(payload) for c in self.clients), return_exceptions=True)

    async def _handle_client(self, websocket):
        self.clients.add(websocket)
        log("electron client connected")
        try:
            async for raw in websocket:
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                cmd = msg.get("cmd")
                if cmd == "abort":
                    await self._abort()
                elif cmd == "start_listening":
                    log("start_listening received, beginning command capture")
                    self._begin_listening()
                elif cmd == "kira_busy":
                    busy = bool(msg.get("busy", False))
                    if self.args.barge_in and busy and not self.kira_busy:
                        log("kira_busy window started")
                    if self.args.barge_in and not busy and self.kira_busy:
                        # Window just ended -- log the loudest chunk seen so
                        # a "never triggers" report is diagnosable: max well
                        # below barge_in_rms_threshold means the threshold is
                        # too high for this mic/setup; a max at/near it but
                        # never sustained for barge_in_min_speech_ms means
                        # that duration is too long instead.
                        log(
                            f"kira_busy window ended, max rms seen={self.barge_in_max_rms_seen:.0f} "
                            f"(threshold={self.args.barge_in_rms_threshold:.0f})"
                        )
                    self.kira_busy = busy
                    self.barge_in_speech_ms = 0.0
                    self.barge_in_gap_chunks = 0
                    self.barge_in_max_rms_seen = 0.0
        finally:
            self.clients.discard(websocket)
            log("electron client disconnected")

    async def run(self):
        async with websockets.serve(self._handle_client, "127.0.0.1", self.args.port):
            log(f"listening on ws://127.0.0.1:{self.args.port}")
            await self.audio_loop()


def _model_key(model_path: str) -> str:
    import os

    return os.path.splitext(os.path.basename(model_path))[0]


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--port", type=int, default=8765)
    p.add_argument("--ww-model", required=True)
    p.add_argument("--mute-model", default=None)
    p.add_argument("--threshold", type=float, default=0.5)
    p.add_argument("--stt-engine", choices=["local", "groq"], default="local")
    p.add_argument("--whisper-model-size", default="small")
    p.add_argument("--language", default=None)
    p.add_argument("--barge-in", action="store_true")
    p.add_argument("--barge-in-rms-threshold", type=float, default=1200)
    p.add_argument("--barge-in-min-speech-ms", type=float, default=400)
    return p.parse_args()


if __name__ == "__main__":
    args = parse_args()
    sidecar = AudioSidecar(args)
    try:
        asyncio.run(sidecar.run())
    except KeyboardInterrupt:
        pass
