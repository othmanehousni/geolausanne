"""Central configuration of the voxel city.

Every number that influences the geometry of the generated world lives here so
that the pipeline, the manifest and the web client agree on one definition.
See docs/pipeline/coordinate-system.md for the rationale behind each value.
"""

from __future__ import annotations

from dataclasses import dataclass, field

# ---------------------------------------------------------------------------
# Coordinate system
# ---------------------------------------------------------------------------

#: Fixed city origin in Swiss LV95 (EPSG:2056) + LN02 heights.
#: (E0, N0) sits next to Lausanne-Flon on a round kilometre; H0 is the mean
#: level of Lake Geneva so that the lake surface is world y = 0.
ORIGIN_E = 2_538_000.0
ORIGIN_N = 1_152_000.0
ORIGIN_H = 372.0

#: Number of voxels along each horizontal edge of a tile, identical at every
#: LOD so that every tile is a 128 x 128 column grid (a quadtree node).
TILE_VOXELS = 128


@dataclass(frozen=True)
class LodSpec:
    level: int
    voxel_size: float  # metres per voxel edge

    @property
    def tile_size(self) -> float:
        return self.voxel_size * TILE_VOXELS


#: LOD 0 is the most detailed level. Each level doubles the voxel size, so a
#: LOD n tile has exactly four LOD n-1 children.
LODS: tuple[LodSpec, ...] = (
    LodSpec(0, 1.0),
    LodSpec(1, 2.0),
    LodSpec(2, 4.0),
    LodSpec(3, 8.0),
)
ROOT_LEVEL = LODS[-1].level

#: Voxel size of the always-loaded horizon backdrop (lake shore, Jura, Alps).
HORIZON_VOXEL = 32.0
#: Horizon extent around the origin, in metres (west, south, east, north).
HORIZON_EXTENT = (-33_792.0, -25_600.0, 41_984.0, 29_952.0)

#: Mean lake level of Lake Geneva in LN02 metres (used for water surfaces).
LAKE_LEVEL = 372.0


# ---------------------------------------------------------------------------
# Areas
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class AreaSpec:
    """A build target.

    ``detail_bbox`` limits where LOD 0/1 tiles are generated, ``coarse_bbox``
    limits LOD 2/3 tiles. Both are LV95 (west, south, east, north).
    """

    name: str
    description: str
    detail_bbox: tuple[float, float, float, float]
    coarse_bbox: tuple[float, float, float, float]
    #: Use the municipality polygon (buffered) to restrict detailed tiles.
    clip_to_municipality: bool = False
    municipality_bfs: int = 5586  # Lausanne
    municipality_buffer: float = 250.0
    lods: tuple[int, ...] = field(default=(0, 1, 2, 3))


AREAS: dict[str, AreaSpec] = {
    # M1/M2 prototype: ~1 km around Lausanne-Flon (Flon, Gare, Cité, Ouchy edge).
    "flon": AreaSpec(
        name="flon",
        description="Lausanne-Flon test area (about 1 x 1 km).",
        detail_bbox=(2_537_472.0, 1_151_872.0, 2_538_496.0, 1_152_896.0),
        coarse_bbox=(2_536_960.0, 1_151_488.0, 2_539_008.0, 1_153_536.0),
    ),
    # M4: the entire municipality of Lausanne (incl. the northern "zone foraine").
    "lausanne": AreaSpec(
        name="lausanne",
        description="Entire municipality of Lausanne with its surroundings at coarse LOD.",
        detail_bbox=(2_534_000.0, 1_150_000.0, 2_545_500.0, 1_161_800.0),
        coarse_bbox=(2_530_000.0, 1_149_000.0, 2_546_500.0, 1_162_500.0),
        clip_to_municipality=True,
    ),
}


# ---------------------------------------------------------------------------
# Data sources (all free / open government data or ODbL)
# ---------------------------------------------------------------------------

STAC_ROOT = "https://data.geo.admin.ch/api/stac/v1"
COLLECTION_ALTI3D = "ch.swisstopo.swissalti3d"
COLLECTION_SURFACE3D = "ch.swisstopo.swisssurface3d-raster"
COLLECTION_BUILDINGS3D = "ch.swisstopo.swissbuildings3d_3_0"
COLLECTION_BOUNDARIES = "ch.swisstopo.swissboundaries3d"
COLLECTION_SWISSIMAGE = "ch.swisstopo.swissimage-dop10"
SWISSALTIREGIO_COG = (
    "https://data.geo.admin.ch/ch.swisstopo.swissaltiregio/swissaltiregio/"
    "swissaltiregio_2056_5728.tif"
)
#: Regional OpenStreetMap extract of the canton of Vaud (ODbL).
OSM_EXTRACT_URL = "https://download.openstreetmap.fr/extracts/europe/switzerland/vaud-latest.osm.pbf"

#: Preferred dataset editions (newest first). The pipeline picks the newest
#: available edition for each tile and records it in the manifest.
ALTI3D_RESOLUTION = "2"  # metres; the 0.5 m product is 16x larger
SURFACE3D_RESOLUTION = "0.5"
SWISSIMAGE_RESOLUTION = "2"


# ---------------------------------------------------------------------------
# Rendering-related constants baked into the tiles
# ---------------------------------------------------------------------------

#: Skirts: every tile is closed downwards to ``min surface - SKIRT_METRES`` so
#: that neighbouring tiles of different LODs never show cracks.
SKIRT_METRES = 8.0

#: Trees are instanced prefabs on LOD 0 and baked voxel canopies above.
INSTANCED_TREE_LODS = (0,)
#: Minimum height of vegetation (nDSM) counted as a tree, in metres.
TREE_MIN_HEIGHT = 3.0
