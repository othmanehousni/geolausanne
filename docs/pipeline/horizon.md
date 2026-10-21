# The horizon backdrop

Without a backdrop the city would float on a void: Lausanne's identity is the
lake in front and the Alps across it. `python -m geovox horizon --out <dir>`
([`horizon.py`](../../pipelines/geodata/src/geovox/horizon.py)) writes
`horizon.glb`, loaded once next to the streamed tiles
([`Horizon.tsx`](../../apps/web/src/components/world/Horizon.tsx)).

## Source

swissALTIRegio, the 10 m national terrain model, which also covers the French
shore of the lake and the Chablais. It is read straight from swisstopo's
national cloud-optimised GeoTIFF with HTTP range requests at the overview
matching each ring, so nothing large is downloaded.

## Two rings, non-cubic voxels

| Ring | Columns | Vertical step | Extent around the origin (W, S, E, N) | Quads |
| --- | --- | --- | --- | --- |
| inner | 32 m | 8 m | −16.4 km, −14.3 km, +18.4 km, +14.3 km | 248 774 |
| outer | 128 m | 16 m | −33.8 km, −25.6 km, +42.0 km, +30.0 km | 285 253 |

Columns are wider than they are tall on purpose: at 10–40 km a 32 m cube
would flatten the Jura and the Alps into steps of 32 m, while 8 m steps keep
their silhouettes. The inner ring leaves out the rectangle covered by the
city's root tiles; the outer ring leaves out the inner ring, so the three
layers never overlap or z-fight.

## Meshing and colours

A dense 3D grid would be far too large, so the horizon uses a heightfield
mesher ([`heightfield.py`](../../pipelines/geodata/src/geovox/heightfield.py)):
tops are merged in 2D over equal (level, colour) regions and side walls along
runs of equal (low, high, colour) between neighbouring columns.

Colours come from elevation and slope: lowland fields, forested slopes
(> 12°, below 1 700 m), alpine meadows (1 300–2 100 m), rock (steep above
1 700 m, everything above 2 350 m) and snow above 2 800 m. Flat cells within
2.5 m of the lake level are water (with the water shader class), set to the
exact lake level.

Result: 1.4 MB served for the municipality build (38 MB raw), the same for
the agglomeration (whose larger hole leaves 243 044 quads in the inner ring),
1.7 MB for the Flon demo (a small hole: 364 884 inner quads). In the client
it is drawn with fog so it fades into the sky, and a large flat lake ring
underneath it reaches the fog distance.
