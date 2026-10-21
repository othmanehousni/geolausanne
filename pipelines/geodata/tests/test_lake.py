import numpy as np
import rasterio
import shapely
from rasterio.transform import from_origin

from geovox.build_city import open_lake
from geovox.raster_io import RasterSource


def _dtm(tmp_path, west: float, north: float, heights: np.ndarray, res: float = 2.0) -> RasterSource:
    path = tmp_path / "dtm.tif"
    rows, cols = heights.shape
    with rasterio.open(
        path, "w", driver="GTiff", width=cols, height=rows, count=1, dtype="float32",
        crs="EPSG:2056", transform=from_origin(west, north, res, res),
    ) as ds:
        ds.write(heights.astype(np.float32), 1)
    return RasterSource(path, (west, north - rows * res, west + cols * res, north))


def test_open_lake_keeps_large_flat_water_only(tmp_path):
    west, north, size = 2_538_000.0, 1_153_000.0, 3_000.0
    n = int(size / 2.0)
    heights = np.full((n, n), 420.0)
    heights[n // 2 :, :] = 372.13  # the lake fills the southern half: 4.5 km²
    heights[100:200, 100:200] = 372.13  # a 200 m pond on land
    src = _dtm(tmp_path, west, north, heights)

    lake = open_lake([src], (west, north - size, west + size, north))

    assert lake is not None
    assert abs(lake.area - 4.5e6) / 4.5e6 < 0.05
    assert lake.contains(shapely.Point(west + 1_500, north - 2_500))
    assert not lake.intersects(shapely.Point(west + 300, north - 300)), "small ponds keep their detail"


def test_no_lake_on_dry_land(tmp_path):
    west, north = 2_538_000.0, 1_153_000.0
    src = _dtm(tmp_path, west, north, np.full((500, 500), 500.0))
    assert open_lake([src], (west, north - 1_000, west + 1_000, north)) is None
