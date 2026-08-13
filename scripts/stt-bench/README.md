# Kira STT Bench

A standalone utility to compare speech-to-text models on real clips of you
saying "Kira, ..." commands/questions, to help pick what `stt.engine` (and
which model/size) Kira should actually use. Lives entirely under
`scripts/stt-bench/` -- doesn't touch the app or `kira.config.json`.

## Models covered

Chosen from what independent 2026 ASR benchmarks currently rank as the best
English options, restricted to ones you can actually hit with a plain API
key (no GPU cluster / enterprise contract required):

| Provider | Model | Notes |
|---|---|---|
| Groq | `whisper-large-v3` | what Kira's `stt.engine: "groq"` fallback already uses |
| Groq | `whisper-large-v3-turbo` | faster/cheaper, slightly higher WER |
| OpenAI | `whisper-1` | original Whisper API |
| OpenAI | `gpt-4o-transcribe` | OpenAI's newer transcription model, better WER than whisper-1 |
| OpenAI | `gpt-4o-mini-transcribe` | cheaper variant of the above |
| Deepgram | `nova-3` | ~5.3% WER on independent leaderboards, very fast |
| ElevenLabs | `scribe_v1` | leads several independent English WER benchmarks (~3-4%) |
| AssemblyAI | Universal (`best`) | strong general accuracy, async API |
| local `faster-whisper` | `tiny`/`base`/`small`/`medium`/`large-v3` | same engine as the Python sidecar (`src/main/pySidecar`), zero API cost, runs on your GPU |

Not included (needs more setup than a REST call + API key, or no
API-accessible offering): NVIDIA Canary-Qwen (self-hosted HF model),
Speechmatics Melia-1 (enterprise-oriented API).

## 1. Set up

```
cd scripts/stt-bench
cp .env.example .env
```

Fill in whichever provider keys you have/want to test (leave others blank --
they're just skipped). Groq and ElevenLabs keys you likely already have from
`kira.config.json`.

## 2. Record clips

Drop `.wav` files (16kHz mono, what Kira's mic pipeline uses) into `clips/`.
Easiest way, using the same venv the sidecar already has `sounddevice` in:

```
../../src/main/pySidecar/.venv/Scripts/python.exe record_clip.py open_browser 6
```

Name each clip after what it's testing (`open_browser`, `set_timer_5min`,
`freeform_question_1`, ...). Say "Kira, ..." like you normally would --
commands AND some free-form conversational sentences, per karol's plan.

**Ground truth (optional but recommended):** write the exact words you said
into a `.txt` file with the same basename, e.g. `clips/open_browser.txt`
containing `Kira open Chrome`. Any clip with a matching `.txt` gets scored
by word error rate (WER); clips without one still get transcribed and shown
side-by-side in the report for eyeballing, just without a WER number.

## 3. Run it

```
node run.mjs                                    # cloud providers only
node run.mjs --local                             # + local faster-whisper
node run.mjs --local --sizes=small,large-v3      # pick which sizes
node run.mjs --language=en                       # force language instead of auto-detect
```

Takes a while the first time `--local` loads each whisper size (downloads +
GPU/CPU load per size). Cloud providers run once per clip per enabled
provider.

## 4. Read the results

- `results/report.html` -- open in a browser: ranked summary table (avg WER,
  avg latency) plus a full clip x provider grid of transcripts.
- `results/results-<timestamp>.json` -- raw data if you want to slice it
  differently.
- `results/results-<timestamp>.csv` -- same, flat, for a spreadsheet.

Ranking logic: providers with any WER-scored clips are ranked by avg WER
first; providers with zero reference transcripts fall back to being ranked
by avg latency. Add a couple of `.txt` references to get a real accuracy
ranking rather than just a speed one.

## Wiring the winner back into Kira

Once you've picked a model:
- Groq/OpenAI turbo variants: swap the `model` in
  `src/main/stt/groqWhisperEngine.ts` (or add a sibling engine + register it
  in `src/main/stt/index.ts`) and set `stt.engine` accordingly in
  `kira.config.json`.
- A local faster-whisper size: change `stt.localWhisper.modelSize` in
  `kira.config.json` (passed to `audio_server.py --whisper-model-size`).
- A brand-new provider (Deepgram/ElevenLabs/AssemblyAI): needs a new
  `SttEngine` implementation under `src/main/stt/` mirroring
  `groqWhisperEngine.ts`, registered in `src/main/stt/index.ts`.
