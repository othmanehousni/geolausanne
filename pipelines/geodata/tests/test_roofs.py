"""Roof colours from the orthophoto: rasterisation, robust samples, mosaics."""

import numpy as np
import rasterio
from rasterio.transform import from_origin

from geovox import materials as M
from geovox.build_city import colour_window
from geovox.raster_io import RasterSource
from geovox.roofs import rasterize_labels, read_rgb, robust_sample, roof_samples


def srgb(L, a, b):
    return M.lab_to_srgb(np.array([[L, a, b]]))[0]


TERRACOTTA = srgb(56.0, 7.0, 12.0)  # a sunlit clay roof as SWISSIMAGE shows it
SHADOW = srgb(24.0, 1.0, 2.0)
TREE = srgb(42.0, -22.0, 28.0)
GRAVEL = srgb(62.0, -0.4, 1.5)


def pixels(*groups):
    return np.concatenate([np.tile(c, (n, 1)) for c, n in groups]).astype(np.uint8)


def test_rasterize_labels_fills_cell_centres_inside_triangles():
    labels = np.zeros((10, 10), np.int32)
    tri = np.array([[[0.0, 0.0], [10.0, 0.0], [0.0, 10.0]]])  # (column, row)
    rasterize_labels(tri, labels, 7)
    assert labels[0, 0] == 7 and labels[0, 8] == 7 and labels[8, 0] == 7
    assert labels[9, 9] == 0
    assert (labels == 7).sum() == 55  # cells whose centre is under the diagonal (inclusive)


def test_robust_sample_ignores_shadows_and_overhanging_trees():
    s = robust_sample(pixels((TERRACOTTA, 200), (SHADOW, 60), (TREE, 40)))
    assert s is not None and s.pixels == 300
    assert 0.1 < s.green < 0.2
    assert abs(s.L - 56.0) < 2.0 and s.chroma > 10.0
    assert M.roof_family(s, pitched=0.9) == "terracotta"


def test_a_green_roof_is_the_majority_not_an_overhanging_tree():
    s = robust_sample(pixels((TREE, 150), (GRAVEL, 50)))
    assert s.green >= 0.5
    assert M.roof_family(s, pitched=0.0) == "green"


def test_solar_panels_are_counted():
    panel = srgb(32.0, 2.0, -9.0)
    s = robust_sample(pixels((panel, 120), (GRAVEL, 80)))
    assert s.solar > 0.5
    assert M.roof_family(s, pitched=0.0) == "solar"


def test_too_few_pixels_give_no_sample():
    assert robust_sample(pixels((GRAVEL, 5))) is None


def test_roof_samples_per_building_without_edge_pixels():
    res = 0.4
    bounds = (2_538_000.0, 1_152_000.0, 2_538_040.0, 1_152_040.0)
    img = np.zeros((100, 100, 3), np.uint8)
    img[:] = (90, 90, 90)  # asphalt around
    img[10:40, 10:40] = TERRACOTTA  # building 0
    img[10:11, 10:40] = (255, 255, 255)  # a bright wall leaking along its edge
    img[60:90, 50:90] = GRAVEL  # building 1
    w, n = bounds[0], bounds[3]

    def square(r0, c0, r1, c1):
        x0, x1 = w + c0 * res, w + c1 * res
        y0, y1 = n - r1 * res, n - r0 * res
        return np.array([[[x0, y0], [x1, y0], [x1, y1]], [[x0, y0], [x1, y1], [x0, y1]]])

    roofs = [square(10, 10, 40, 40), square(60, 50, 90, 90)]
    samples = roof_samples(img, bounds, res, roofs, np.array([10.0, 20.0]))
    assert M.roof_family(samples[0], pitched=0.9) == "terracotta"
    assert samples[0].L < 70  # the white edge row was eroded away
    assert M.roof_family(samples[1], pitched=0.0) == "gravel"


def test_taller_roofs_win_where_roofs_overlap():
    res = 0.4
    bounds = (0.0, 0.0, 40.0, 40.0)
    img = np.zeros((100, 100, 3), np.uint8)
    img[:, :50] = TERRACOTTA
    img[:, 50:] = GRAVEL
    whole = np.array([[[0.0, 0.0], [40.0, 0.0], [40.0, 40.0]], [[0.0, 0.0], [40.0, 40.0], [0.0, 40.0]]])
    right = np.array([[[20.0, 0.0], [40.0, 0.0], [40.0, 40.0]], [[20.0, 0.0], [40.0, 40.0], [20.0, 40.0]]])
    s = roof_samples(img, bounds, res, [whole, right], np.array([5.0, 30.0]))
    assert M.roof_family(s[0], pitched=0.9) == "terracotta"  # only its uncovered half is seen
    assert M.roof_family(s[1], pitched=0.0) == "gravel"


def test_read_rgb_mosaics_sheets_on_the_pixel_grid(tmp_path):
    res = 0.4

    def sheet(name, west, north, colour):
        path = tmp_path / name
        with rasterio.open(
            path, "w", driver="GTiff", width=50, height=50, count=3, dtype="uint8",
            crs="EPSG:2056", transform=from_origin(west, north, res, res),
        ) as ds:
            for b in range(3):
                ds.write(np.full((50, 50), colour[b], np.uint8), b + 1)
        return RasterSource(path, (west, north - 20.0, west + 20.0, north))

    a = sheet("a.tif", 2_538_000.0, 1_152_020.0, (200, 0, 0))
    b = sheet("b.tif", 2_538_020.0, 1_152_020.0, (0, 0, 200))
    out = read_rgb([a, b], (2_538_010.0, 1_152_004.0, 2_538_030.0, 1_152_020.0), res)
    assert out.shape == (40, 50, 3)
    assert (out[:, :25] == (200, 0, 0)).all() and (out[:, 25:] == (0, 0, 200)).all()
    # partly outside every sheet: zeros there (no photo)
    out = read_rgb([a], (2_538_016.0, 1_152_000.0, 2_538_024.0, 1_152_004.0), res)
    assert (out[:, :10] == (200, 0, 0)).all() and (out[:, 10:] == 0).all()


def test_colour_window_holds_whole_buildings_on_the_world_grid():
    bounds = (2_536_952.0, 1_150_952.0, 2_538_024.0, 1_152_024.0)
    bbox = np.array([[2_538_010.3, 1_151_000.0, 2_538_061.7, 1_151_020.0]])
    w = colour_window(bounds, bbox)
    assert w[0] == bounds[0] and w[2] >= 2_538_061.7 and w[2] < 2_538_064.0
    for v in w:
        assert (v - 2_538_000.0) % 2.0 == 0.0 or (v - 1_152_000.0) % 2.0 == 0.0
    # 2 m steps hold whole 1 m cells and whole 0.4 m pixels
    assert round((w[2] - w[0]) / 0.4, 6) == int(round((w[2] - w[0]) / 0.4))
