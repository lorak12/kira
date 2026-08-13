# Kira TTS Bench

Sibling to `../stt-bench` -- same idea, other direction: synthesizes a fixed
set of Polish test sentences (`texts.mjs`) through several TTS models/voices
so you can listen side-by-side and pick one, instead of judging blind.

There's no automatic quality score for TTS (unlike STT's WER) -- the report
is a grid of `<audio>` players, one per (text, provider) cell. Latency is
measured and ranked automatically; naturalness/pronunciation you judge by
ear.

## Models covered

| Provider | Model/voice | Notes |
|---|---|---|
| ElevenLabs | `eleven_multilingual_v2` | Kira's current default (`kira.config.json` `tts.model`) |
| ElevenLabs | `eleven_flash_v2_5` | ElevenLabs' low-latency model (~75ms), meant for real-time use like a voice assistant |
| ElevenLabs | `eleven_v3` | ElevenLabs' most expressive/natural model, but explicitly not meant for real-time (higher latency) |
| Edge (free) | `pl-PL-ZofiaNeural` | Kira's current free-tier default |
| Edge (free) | `pl-PL-MarekNeural` | male voice, for comparison |
| OpenAI | `tts-1` | needs `OPENAI_API_KEY` with credits |
| OpenAI | `gpt-4o-mini-tts` | newer, steerable-tone OpenAI model |

Not included: Groq's PlayAI TTS (English/Arabic only, no Polish support as
of testing), Azure/Google Cloud TTS (need separate cloud project + service
account setup, not a plain API key).

## Test sentences (`texts.mjs`)

Four sentences shaped like real Kira replies -- short confirmations, a
music/playlist response naming Polish artists, a system-status readout
mixing inflected app names ("Discorda", "Chrome'a", "OBS-a" -- Polish
grammar bending English brand names is a common TTS stumble), and a longer
witty reply with times/numbers. Edit `texts.mjs` to add your own.

## 1. Set up

```
cd scripts/tts-bench
cp .env.example .env
```

`ELEVENLABS_API_KEY`/`OPENAI_API_KEY` are also picked up from
`../stt-bench/.env` automatically if you already set them there -- no need
to duplicate. Edge needs no key.

## 2. Run it

```
node run.mjs
```

## 3. Read the results

Open `results/report.html` -- latency ranking table up top, then a full
text x provider grid where every cell is a playable `<audio>` element.
Raw files also land in `outputs/` if you want to grab one directly.

## Wiring the winner back into Kira

- Different ElevenLabs model: change `tts.model` in `kira.config.json`
  (`elevenLabsClient.ts` already reads it, no code change needed).
- Different Edge voice: change `tts.edge.voices.pl` in `kira.config.json`.
- Switching engines entirely (e.g. to OpenAI): needs a new `TtsEngine`
  implementation under `src/main/tts/` mirroring `elevenLabsClient.ts`,
  registered in `src/main/tts/index.ts`.
