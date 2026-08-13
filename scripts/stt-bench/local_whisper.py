"""
Benchmarks faster-whisper at several model sizes against a folder of wav
clips, using the same venv/model cache as the production audio sidecar
(src/main/pySidecar). Prints one JSON object to stdout when done so
run.mjs can merge it into the rest of the report.

Usage:
  .venv/Scripts/python.exe local_whisper.py --clips-dir clips --sizes small,medium,large-v3
"""

import argparse
import json
import sys
import time
from pathlib import Path


def log(*args):
    print(*args, file=sys.stderr, flush=True)


def _add_cuda_dll_dirs():
    # Mirrors audio_server.py's _add_cuda_dll_dirs -- ctranslate2's GPU path
    # needs cuBLAS/cuDNN DLLs from the pip-installed nvidia-cublas-cu12 /
    # nvidia-cudnn-cu12 wheels, but pip doesn't add their bin/ dirs to the
    # DLL search path automatically. Without this, WhisperModel(device="cuda")
    # loads "successfully" but transcribe() blows up later on a missing DLL.
    import os
    import site

    for base in site.getsitepackages():
        for sub in ("nvidia/cublas/bin", "nvidia/cudnn/bin"):
            path = os.path.join(base, *sub.split("/"))
            if os.path.isdir(path):
                try:
                    os.add_dll_directory(path)
                except (AttributeError, OSError):
                    pass


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--clips-dir', required=True)
    parser.add_argument('--sizes', default='small,medium,large-v3')
    parser.add_argument('--language', default=None)
    args = parser.parse_args()

    _add_cuda_dll_dirs()
    from faster_whisper import WhisperModel

    clips_dir = Path(args.clips_dir)
    clips = sorted(clips_dir.glob('*.wav'))
    sizes = [s.strip() for s in args.sizes.split(',') if s.strip()]

    results = {}  # size -> { clip_filename -> {text, latencyMs} }
    for size in sizes:
        log(f'loading faster-whisper size={size} ...')
        try:
            model = WhisperModel(size, device='cuda', compute_type='float16')
            device = 'cuda/float16'
        except Exception as e:
            log(f'  GPU load failed ({e}), falling back to CPU/int8')
            model = WhisperModel(size, device='cpu', compute_type='int8')
            device = 'cpu/int8'
        log(f'  loaded on {device}')

        per_clip = {}
        for clip in clips:
            start = time.monotonic()
            segments, _info = model.transcribe(str(clip), language=args.language, beam_size=5)
            text = ' '.join(seg.text.strip() for seg in segments).strip()
            latency_ms = (time.monotonic() - start) * 1000
            per_clip[clip.name] = {'text': text, 'latencyMs': latency_ms}
            log(f'  {clip.name}: {latency_ms:.0f}ms')
        results[f'local-whisper-{size}'] = per_clip
        del model  # free VRAM/RAM before loading the next size

    print(json.dumps(results))


if __name__ == '__main__':
    main()
