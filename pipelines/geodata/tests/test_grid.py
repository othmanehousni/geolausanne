import shapely

from geovox import config
from geovox.build_city import plan_tiles
from geovox.grid import TileKey, height_to_level, lv95_to_world, tiles_intersecting, world_to_lv95


def test_world_roundtrip():
    e, n, h = 2_537_834.4, 1_152_510.7, 489.2
    x, y, z = lv95_to_world(e, n, h)
    assert (x, y, z) == (e - config.ORIGIN_E, h - config.ORIGIN_H, config.ORIGIN_N - n)
    assert world_to_lv95(x, y, z) == (e, n, h)


def test_quadtree_parent_children():
    t = TileKey(2, -3, 5)
    kids = t.children()
    assert len(kids) == 4
    assert all(k.parent() == t for k in kids)
    assert {(k.i, k.j) for k in kids} == {(-6, 10), (-5, 10), (-6, 11), (-5, 11)}
    assert TileKey(0, -13, 21).ancestor(3) == TileKey(3, -2, 2)


def test_tile_bounds_and_translation():
    t = TileKey(0, 1, -1)
    assert t.bounds == (config.ORIGIN_E + 128, config.ORIGIN_N - 128, config.ORIGIN_E + 256, config.ORIGIN_N)
    assert t.world_translation == (128.0, 0.0, 0.0)
    r = TileKey(3, 0, 0)
    assert r.world_translation == (0.0, 0.0, -1024.0)


def test_tiles_intersecting_covers_bbox_exactly():
    tiles = list(tiles_intersecting(0, (config.ORIGIN_E, config.ORIGIN_N, config.ORIGIN_E + 256, config.ORIGIN_N + 128)))
    assert {(t.i, t.j) for t in tiles} == {(0, 0), (1, 0)}


def test_height_quantisation_rounds_to_nearest_boundary():
    assert height_to_level(config.ORIGIN_H + 2.49, 1.0) == 2
    assert height_to_level(config.ORIGIN_H + 2.51, 1.0) == 3
    assert height_to_level(config.ORIGIN_H + 9.0, 8.0) == 1


def test_plan_has_complete_children():
    area = config.AREAS["flon"]
    plan = plan_tiles(area, shapely.box(*area.detail_bbox))
    for level, keys in plan.tiles.items():
        if level == 0:
            continue
        for k in keys:
            kids = set(k.children())
            present = kids & plan.tiles.get(level - 1, set())
            assert present in (set(), kids), f"partial refinement under {k}"
