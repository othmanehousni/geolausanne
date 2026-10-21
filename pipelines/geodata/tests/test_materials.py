import numpy as np

from geovox import materials as M

TILES = {M._hex(c) for c in M.ROOF_TILES} | {M._hex("#9a4e3a")}
GREYS = {M._hex(c) for c in ("#5a5d63", "#7f8287", "#a3a49f", "#c4c0b6")}


def test_pitched_warm_roofs_become_tiles():
    # a hazy terracotta as seen on SWISSIMAGE: barely saturated
    assert M.snap_roof_color((140.0, 118.0, 104.0), "a", pitched=0.9) in TILES
    assert M.snap_roof_color((128.0, 112.0, 101.0), "b", pitched=0.7) in TILES


def test_pitched_neutral_dark_roofs_are_slate():
    assert M.snap_roof_color((88.0, 90.0, 94.0), "c", pitched=0.9) == M._hex("#5a5d63")


def test_flat_roofs_follow_lightness():
    assert M.snap_roof_color((200.0, 200.0, 198.0), "d", pitched=0.0) == M._hex("#c4c0b6")
    assert M.snap_roof_color((120.0, 121.0, 119.0), "e", pitched=0.1) in GREYS


def test_green_roof_needs_clear_evidence():
    assert M.snap_roof_color((96.0, 130.0, 70.0), "f", pitched=0.0) == M._hex("#6f8e57")
    # slightly greenish grey stays grey
    assert M.snap_roof_color((118.0, 124.0, 114.0), "g", pitched=0.0) in GREYS


def test_missing_sample_is_deterministic_and_family_aware():
    a = M.snap_roof_color(None, "uuid-1", pitched=1.0)
    assert a == M.snap_roof_color((np.nan, np.nan, np.nan), "uuid-1", pitched=1.0)
    assert a in {M._hex(c) for c in M.ROOF_TILES}
    assert M.snap_roof_color(None, "uuid-2", pitched=0.0) in {M._hex(c) for c in M.ROOF_FLAT}
