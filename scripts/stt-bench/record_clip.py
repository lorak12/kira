"""
Quick mic -> wav recorder for building the STT bench clip set, using the
same venv/sample rate (16kHz mono) as the production audio sidecar so
results are representative of what Kira actually hears.

Usage:
  .venv/Scripts/python.exe record_clip.py <name> [seconds]

Records into clips/<name>.wav. Press Enter to start, recording runs for
`seconds` (default 6). Say "Kira, <your command/sentence>" like you would
to the real assistant.
"""

import sys
import wave
from pathlib import Path

import numpy as np
import sounddevice as sd

SAMPLE_RATE = 16000


def main():
    if len(sys.argv) < 2:
        print('Usage: record_clip.py <name> [seconds]', file=sys.stderr)
        sys.exit(1)
    name = sys.argv[1]
    seconds = float(sys.argv[2]) if len(sys.argv) > 2 else 6.0

    clips_dir = Path(__file__).parent / 'clips'
    clips_dir.mkdir(exist_ok=True)
    out_path = clips_dir / f'{name}.wav'

    input(f'Press Enter, then say your line (recording for {seconds:.0f}s) ...')
    print('recording...')
    audio = sd.rec(int(seconds * SAMPLE_RATE), samplerate=SAMPLE_RATE, channels=1, dtype='int16')
    sd.wait()
    print('done')

    with wave.open(str(out_path), 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(audio.astype(np.int16).tobytes())

    print(f'saved {out_path}')
    print(f'(optional) write the exact words you said into {out_path.with_suffix(".txt")} to enable WER scoring')


if __name__ == '__main__':
    main()
