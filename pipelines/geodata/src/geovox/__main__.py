"""Command line interface: ``python -m geovox <command>``."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import config


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="geovox", description="Voxel Lausanne geodata pipeline")
    sub = p.add_subparsers(dest="cmd", required=True)

    b = sub.add_parser("build", help="download sources and generate GLB tiles + manifest")
    b.add_argument("--area", default="flon", choices=sorted(config.AREAS))
    b.add_argument("--out", type=Path, required=True, help="output directory (e.g. apps/web/public/city/lausanne)")
    b.add_argument("--cache", type=Path, default=Path(".cache"), help="download/intermediate cache directory")
    b.add_argument("--workers", type=int, default=0, help="parallel processes (default: min(4, cpus))")
    b.add_argument("--root", type=str, default=None, help="only process one root tile 'i,j' (debugging)")

    h = sub.add_parser("horizon", help="generate the low-resolution horizon backdrop")
    h.add_argument("--out", type=Path, required=True)

    sp = sub.add_parser("seed-places", help="write supabase seed SQL from OSM diet:halal places")
    sp.add_argument("--out", type=Path, required=True)
    sp.add_argument("--cache", type=Path, default=Path(".cache"))
    sp.add_argument("--json", type=Path, default=None, help="also write the rows as JSON (web demo mode)")

    s = sub.add_parser("stats", help="print manifest statistics")
    s.add_argument("--out", type=Path, required=True)

    args = p.parse_args(argv)
    if args.cmd == "build":
        from .build_city import build, default_workers

        root = tuple(int(x) for x in args.root.split(",")) if args.root else None
        m = build(args.area, args.out, args.cache, args.workers or default_workers(), root)  # type: ignore[arg-type]
        json.dump(m["stats"], sys.stdout, indent=2)
        print()
        return 0
    if args.cmd == "horizon":
        from .horizon import build_horizon

        info = build_horizon(args.out)
        json.dump(info, sys.stdout, indent=2)
        print()
        return 0
    if args.cmd == "seed-places":
        from .seed_places import build_seed

        n = build_seed(args.out, args.cache, args.json)
        print(f"wrote {n} places to {args.out}")
        return 0
    if args.cmd == "stats":
        m = json.loads((args.out / "manifest.json").read_text())
        json.dump({"version": m["version"], "stats": m["stats"]}, sys.stdout, indent=2)
        print()
        return 0
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
