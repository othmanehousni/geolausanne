"""Ground colours: fields from the photo, pools, water depth, crown shades."""

import numpy as np
import shapely

from geovox import materials as M
from geovox.build_city import canopy_values, tree_leaf_values
from geovox.landcover import _area_class, classify, field_class, water_depth_classes
from geovox.osm import Feature


def px(rgb, n=100):
    return np.tile(np.array(rgb, float)[:, None], (1, n))


def test_fields_take_their_colour_from_the_photo():
    assert field_class(px((110, 140, 70)), "w1") == M.FIELD_GREEN
    assert field_class(px((196, 178, 120)), "w2") == M.FIELD_GOLD
    assert field_class(px((120, 100, 80)), "w3") == M.FIELD_BROWN
    # no pixels: a deterministic pick
    a = field_class(np.zeros((3, 0)), "w4")
    assert a == field_class(np.zeros((3, 0)), "w4") and a in (M.FIELD_GREEN, M.FIELD_GOLD, M.FIELD_BROWN)


def test_outdoor_pools_only():
    assert _area_class(Feature(shapely.box(0, 0, 1, 1), {"leisure": "swimming_pool"}))[1] == M.POOL
    assert _area_class(Feature(shapely.box(0, 0, 1, 1), {"leisure": "swimming_pool", "indoor": "yes"})) is None
    assert _area_class(Feature(shapely.box(0, 0, 1, 1), {"leisure": "swimming_pool", "location": "roof"})) is None
    assert _area_class(Feature(shapely.box(0, 0, 1, 1), {"landuse": "flowerbed"}))[1] == M.FLOWERBED
    assert _area_class(Feature(shapely.box(0, 0, 1, 1), {"landuse": "allotments"}))[1] == M.GARDEN
    assert _area_class(Feature(shapely.box(0, 0, 1, 1), {"landuse": "construction"}))[1] == M.DIRT


def test_small_pools_survive_the_clean_up_of_tiny_regions():
    bounds = (0.0, 0.0, 40.0, 40.0)
    ortho = np.full((3, 40, 40), 100.0, np.float32)
    ortho[1] = 140.0  # green everywhere: lawn
    pool = Feature(shapely.box(10, 10, 13, 12), {"leisure": "swimming_pool"})
    lc = classify(bounds, 1.0, ortho, [], [], [pool])
    assert (lc.cls == M.POOL).sum() == 6


def test_lake_water_is_tinted_by_distance_from_the_shore():
    cls = np.full((1, 400), M.WATER, np.uint8)
    dist = np.arange(400, dtype=float)[None, :]
    out = water_depth_classes(cls, dist)
    assert out[0, 0] == M.WATER_SHALLOW and out[0, 100] == M.WATER and out[0, 300] == M.WATER_DEEP
    land = np.full((1, 3), M.GRASS, np.uint8)
    assert (water_depth_classes(land, np.zeros((1, 3))) == M.GRASS).all()


def test_forest_canopies_are_patchy_and_conifers_darker():
    needle = np.zeros((128, 128), bool)
    needle[:, 64:] = True
    mixed = np.zeros_like(needle)
    v = canopy_values(2_538_000.0, 1_152_000.0, 1.0, 128, needle, mixed)
    assert set(np.unique(v[:, :64]).tolist()) == {M.LEAVES, M.LEAVES_LIGHT}
    assert set(np.unique(v[:, 64:]).tolist()) == {M.LEAVES_DARK, M.CONIFER_BLUE}
    # anchored to the world: a coarser level agrees where its cells overlap
    v2 = canopy_values(2_538_000.0, 1_152_000.0, 2.0, 64, needle[::2, ::2], mixed[::2, ::2])
    agree = (v2[:, :32] == v[::2, :64:2]).mean()
    assert agree > 0.8


def test_stamped_trees_have_two_shades_per_kind_and_are_stable():
    trees = np.array([[2_538_000.0 + i * 7.3, 1_152_000.0 + i * 3.1, 400.0, 10.0, 3.0, i % 2] for i in range(200)])
    a = tree_leaf_values(trees)
    assert np.array_equal(a, tree_leaf_values(trees))
    assert set(np.unique(a[trees[:, 5] == 0]).tolist()) == {M.LEAVES, M.LEAVES_LIGHT}
    assert set(np.unique(a[trees[:, 5] == 1]).tolist()) == {M.LEAVES_DARK, M.CONIFER_BLUE}
