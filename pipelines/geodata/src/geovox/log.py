"""Tiny timestamped logger (the pipeline is a batch CLI, stdout is enough)."""

from __future__ import annotations

import sys
import time

_T0 = time.monotonic()


def log(msg: str) -> None:
    print(f"[{time.monotonic() - _T0:8.1f}s] {msg}", file=sys.stderr, flush=True)
