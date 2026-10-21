# @geolausanne/geo-types

Shared by the web app and mirrored by the Python pipeline:

* `swiss.ts`: rigorous LV95 (EPSG:2056) ↔ WGS84 conversion, matching PostGIS
  to below a millimetre (tested against PostGIS outputs);
* `grid.ts`: world coordinates and quadtree tile maths (mirror of
  `pipelines/geodata/src/geovox/grid.py`);
* `manifest.ts`: the voxel-city manifest schema and index (mirror of
  `geovox/manifest.py`).

```bash
bun run test        # Vitest
bun run typecheck
```

See [docs/pipeline/coordinate-system.md](../../docs/pipeline/coordinate-system.md)
and [docs/pipeline/tile-format.md](../../docs/pipeline/tile-format.md).
