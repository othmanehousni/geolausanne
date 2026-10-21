"""Cached, checksum-verified HTTP downloads.

Downloads go through the standard proxy/CA environment variables
(``HTTPS_PROXY``, ``SSL_CERT_FILE``/``REQUESTS_CA_BUNDLE``) honoured by urllib.
Raw files are untrusted data: they are only ever parsed by GDAL/numpy, never
executed or imported.
"""

from __future__ import annotations

import hashlib
import os
import shutil
import ssl
import time
import urllib.request
from pathlib import Path

from .log import log

_USER_AGENT = "geolausanne-geovox/1.0 (+https://github.com/othmanehousni/geolausanne)"


def _ssl_context() -> ssl.SSLContext:
    cafile = os.environ.get("SSL_CERT_FILE") or os.environ.get("REQUESTS_CA_BUNDLE")
    return ssl.create_default_context(cafile=cafile) if cafile else ssl.create_default_context()


def open_url(url: str, timeout: float = 120.0):
    req = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})
    return urllib.request.urlopen(req, timeout=timeout, context=_ssl_context())


def _verify_multihash(path: Path, multihash: str | None) -> bool:
    if not multihash:
        return True
    mh = multihash.lower()
    if not mh.startswith("1220"):  # only sha2-256 multihashes are produced by swisstopo
        return True
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest() == mh[4:]


def fetch(url: str, dest: Path, checksum: str | None = None, retries: int = 4) -> Path:
    """Download ``url`` to ``dest`` unless a verified copy already exists."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and _verify_multihash(dest, checksum):
        return dest
    tmp = dest.with_suffix(dest.suffix + ".part")
    delay = 2.0
    for attempt in range(1, retries + 1):
        try:
            log(f"download {url}")
            with open_url(url) as resp, tmp.open("wb") as out:
                shutil.copyfileobj(resp, out, length=1 << 20)
            if not _verify_multihash(tmp, checksum):
                raise IOError(f"checksum mismatch for {url}")
            tmp.replace(dest)
            return dest
        except Exception as exc:  # network hiccups are retried with backoff
            if attempt == retries:
                raise
            log(f"  retry {attempt}/{retries} after error: {exc}")
            time.sleep(delay)
            delay *= 2
    raise AssertionError("unreachable")
