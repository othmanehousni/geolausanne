"""Build areas: municipality lookup by name, unions, boxes and tile plans."""

from pathlib import Path

import pytest
import shapely

from geovox import config
from geovox.boundary import match_municipalities, municipalities_union, resolve_municipalities
from geovox.build_city import file_estimate, plan_tiles, suggest_bboxes

ROWS = [
    ("Lausanne", 5586),
    ("Renens (VD)", 5591),
    ("Ecublens (VD)", 5635),
    ("Saint-Sulpice (VD)", 5648),
    ("Chavannes-près-Renens", 5627),
    ("Le Mont-sur-Lausanne", 5587),
    ("Jouxtens-Mézery", 5585),
    ("Sainte-Croix", 5568),
]


def test_exact_official_names_resolve():
    got = match_municipalities(ROWS, ["Lausanne", "Renens (VD)", "Jouxtens-Mézery"])
    assert [(m.name, m.bfs) for m in got] == [("Lausanne", 5586), ("Renens (VD)", 5591), ("Jouxtens-Mézery", 5585)]


def test_names_without_canton_suffix_or_accents_resolve_to_the_official_name():
    got = match_municipalities(ROWS, ["Ecublens", "Saint-Sulpice", "chavannes pres renens", "Jouxtens-Mezery"])
    assert [m.name for m in got] == ["Ecublens (VD)", "Saint-Sulpice (VD)", "Chavannes-près-Renens", "Jouxtens-Mézery"]
    assert [m.bfs for m in got] == [5635, 5648, 5627, 5585]


def test_unknown_name_fails_with_suggestions():
    with pytest.raises(ValueError, match="Lausanne"):
        match_municipalities(ROWS, ["Lausane"])


def test_ambiguous_name_fails():
    rows = ROWS + [("Renens (FR)", 9999)]  # hypothetical homonym in the same table
    with pytest.raises(ValueError, match="ambiguous"):
        match_municipalities(rows, ["Renens"])


def test_one_name_with_several_numbers_fails():
    with pytest.raises(ValueError, match="several"):
        match_municipalities([("X", 1), ("X", 2)], ["X"])


def test_areas_are_well_formed():
    for name, area in config.AREAS.items():
        assert area.name == name
        w, s, e, n = area.detail_bbox
        cw, cs, ce, cn = area.coarse_bbox
        assert w < e and s < n
        # the context ring contains the detailed box
        assert cw <= w and cs <= s and ce >= e and cn >= n, name
    agglo = config.AREAS["agglomeration"]
    assert len(agglo.municipalities) == 16 and agglo.municipalities[0] == "Lausanne"
    # every place the old `lausanne` seed covered stays inside the seed area
    old = config.AREAS["lausanne"].coarse_bbox
    seed = config.AREAS[config.SEED_AREA].coarse_bbox
    assert seed[0] <= old[0] and seed[1] <= old[1] and seed[2] >= old[2] and seed[3] >= old[3]


def test_suggested_boxes_cover_the_buffered_land_on_the_tile_grid():
    land = shapely.box(2_530_090.0, 1_150_552.0, 2_544_978.0, 1_161_554.0)
    detail, coarse = suggest_bboxes(land, buffer=250.0, snap=128.0, margin=1024.0)
    assert shapely.box(*detail).contains(land.buffer(250.0))
    for v, o in zip(detail, (config.ORIGIN_E, config.ORIGIN_N, config.ORIGIN_E, config.ORIGIN_N)):
        assert (v - o) % 128.0 == 0
    assert coarse == (detail[0] - 1024.0, detail[1] - 1024.0, detail[2] + 1024.0, detail[3] + 1024.0)
    # not more than one grid step of slack
    b = land.buffer(250.0).bounds
    assert detail[0] > b[0] - 128 and detail[2] < b[2] + 128


def test_plan_of_two_disjoint_municipalities_is_complete_and_local():
    """A union of separate polygons refines around each of them only, and
    every refined node keeps its four children."""
    area = config.AreaSpec(
        name="t",
        description="",
        detail_bbox=(2_536_000.0, 1_150_000.0, 2_541_000.0, 1_153_000.0),
        coarse_bbox=(2_535_000.0, 1_149_000.0, 2_542_000.0, 1_154_000.0),
    )
    a = shapely.box(2_536_100.0, 1_150_100.0, 2_536_400.0, 1_150_400.0)
    b = shapely.box(2_540_500.0, 1_152_500.0, 2_540_800.0, 1_152_800.0)
    region = shapely.union_all([a, b]).buffer(50.0)
    plan = plan_tiles(area, region)
    l0 = plan.tiles[0]
    assert l0, "level 0 tiles around the municipalities"
    for t in l0:
        assert shapely.box(*t.parent().bounds).intersects(region)
    for level, keys in plan.tiles.items():
        if level == 0:
            continue
        for t in keys:
            kids = set(t.children())
            present = kids & plan.tiles.get(level - 1, set())
            assert present in (set(), kids)
    assert file_estimate(plan) == sum(len(k) for k in plan.tiles.values()) + 3


BOUNDARIES = sorted(Path(__file__).resolve().parents[1].glob(".cache/boundaries/*.gpkg"))


@pytest.mark.skipif(not BOUNDARIES, reason="swissBOUNDARIES3D not in the local cache")
def test_agglomeration_resolves_against_the_real_boundaries():
    munis = resolve_municipalities(BOUNDARIES[-1], config.AREAS["agglomeration"].municipalities)
    assert len({m.bfs for m in munis}) == 16
    union = municipalities_union(BOUNDARIES[-1], [m.bfs for m in munis])
    assert union.geom_type in ("Polygon", "MultiPolygon")
    # the union dissolves shared borders into (nearly) one piece
    parts = getattr(union, "geoms", [union])
    assert max(p.area for p in parts) > 0.95 * union.area
