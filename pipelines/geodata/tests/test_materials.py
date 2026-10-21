import numpy as np
import pytest

from geovox import materials as M
from geovox.materials import GwrInfo, RoofSample


# --- the shader byte ----------------------------------------------------------


def test_shader_byte_packs_class_variant_and_leaves_room_for_occlusion():
    assert M.SHADER_WALL == 32 and M.SHADER_ROOF == 64 and M.SHADER_WATER == 128 and M.SHADER_ROAD == 160
    b = M.shader_byte(M.CLASS_WALL, M.WINDOWS_GLASS)
    assert b == 32 + 2 * 4
    for ao in range(4):
        assert M.shader_class(b | ao) == M.CLASS_WALL
        assert ((b | ao) >> 2) & 7 == M.WINDOWS_GLASS
    with pytest.raises(ValueError):
        M.shader_byte(8)
    with pytest.raises(ValueError):
        M.shader_byte(0, 8)


def test_class_table_is_complete_and_classes_stay_below_buildings():
    t = M.class_color_table()
    assert M.NUM_CLASSES <= M.BUILDING_BASE
    for cls in range(1, M.NUM_CLASSES):
        assert t[cls, 0, :3].any(), cls
        assert (t[cls, :, 3] & M.AO_MASK == 0).all()
    for cls in M.WATER_CLASSES:
        assert M.shader_class(t[cls, 0, 3]) == M.CLASS_WATER
    for cls in (M.LEAVES_DARK, M.CONIFER_BLUE):
        assert t[cls, 0, 3] == M.shader_byte(M.CLASS_LEAVES, M.LEAF_CONIFER)
    for cls in (M.LEAVES, M.LEAVES_LIGHT):
        assert t[cls, 0, 3] == M.shader_byte(M.CLASS_LEAVES, M.LEAF_BROADLEAF)
    # conifers are darker and bluer than broadleaf crowns
    lab = M.srgb_to_lab(t[[M.LEAVES, M.LEAVES_DARK], 0, :3].astype(float))
    assert lab[1, 0] < lab[0, 0] and lab[1, 2] < lab[0, 2]


def test_lab_round_trip():
    rgb = np.array([[200.0, 100.0, 60.0], [12.0, 240.0, 90.0], [128.0, 128.0, 128.0]])
    assert np.allclose(M.lab_to_srgb(M.srgb_to_lab(rgb)), rgb, atol=0.6)


# --- roofs ----------------------------------------------------------------------


def lab(L, a, b, pixels=200, green=0.0, solar=0.0) -> RoofSample:
    return RoofSample(L, a, b, pixels, green, solar)


# CIELAB values measured on SWISSIMAGE roofs of the Cité and Sous-Gare (0.4 m,
# robust sample): the orthophoto is hazy, clay tiles reach C* 6-17 only.


def test_hazy_warm_pitched_roofs_are_clay_tiles():
    assert M.roof_family(lab(54.4, 6.2, 10.7), pitched=0.9) == "terracotta"
    assert M.roof_family(lab(52.3, 3.7, 6.4), pitched=0.8) == "terracotta"
    # duller: weathered brown tiles
    assert M.roof_family(lab(52.0, 2.8, 4.8), pitched=0.9) == "brown"
    assert M.roof_family(lab(49.1, 3.1, 2.7), pitched=0.9) == "brown"
    # light and faded: sand
    assert M.roof_family(lab(73.3, 3.6, 7.2), pitched=0.9) == "sand"
    # a warm flat roof is gravel or a deck, not clay tiles
    assert M.roof_family(lab(61.0, 1.5, 3.4), pitched=0.0) == "gravel"


def test_neutral_roofs_follow_shape_and_lightness():
    assert M.roof_family(lab(40.0, 0.4, -1.8), pitched=0.9) == "slate"
    assert M.roof_family(lab(59.9, 0.3, -2.6), pitched=0.9) == "metal"
    assert M.roof_family(lab(61.9, -0.5, 1.4), pitched=0.0) == "gravel"
    assert M.roof_family(lab(77.4, 0.4, -1.0), pitched=0.1) == "membrane"
    assert M.roof_family(lab(38.0, 0.0, -1.5), pitched=0.0) == "slate"


def test_green_copper_and_solar_roofs():
    assert M.roof_family(lab(57.5, -5.2, 11.4), pitched=0.0) == "green"
    assert M.roof_family(lab(60.0, -0.5, 1.0, green=0.7), pitched=0.0) == "green"
    # slightly greenish grey stays grey
    assert M.roof_family(lab(55.0, -2.4, 3.6), pitched=0.0) == "gravel"
    assert M.roof_family(lab(63.6, -7.0, -1.5), pitched=0.3) == "copper"
    assert M.roof_family(lab(34.0, 0.5, -6.0), pitched=0.0) == "solar"
    assert M.roof_family(lab(53.4, 0.5, -3.0, solar=0.52), pitched=0.9) == "solar"
    # light blue-grey is metal or glass, not panels
    assert M.roof_family(lab(61.3, -0.8, -3.5), pitched=0.0) == "metal"


def test_missing_photo_falls_back_on_the_shape_deterministically():
    a = M.classify_roof(None, 1.0, "uuid-1")
    assert a == M.classify_roof(RoofSample(float("nan"), 0.0, 0.0, 0), 1.0, "uuid-1")
    assert a[0] in ("terracotta", "brown", "slate")
    assert M.classify_roof(None, 0.0, "uuid-2")[0] in ("gravel", "membrane", "metal")
    assert M.snap_roof_color(None, "uuid-1", 1.0) == a[1]


def test_roof_colour_is_a_palette_shade_with_its_variant():
    fam, rgb, variant = M.classify_roof(lab(54.4, 6.2, 10.7), 0.9, "x")
    shades, var, _ = M.ROOF_FAMILIES[fam]
    assert rgb in {M._hex(c) for c in shades} and variant == var == M.ROOF_TILES
    # the hint wins (greenhouses)
    assert M.classify_roof(lab(54.4, 6.2, 10.7), 0.9, "x", hint="glass")[0] == "glass"


def test_shades_vary_a_little_between_buildings():
    s = lab(58.5, 6.2, 10.7)  # near the light/mid boundary of the clay shades
    shades = {M.classify_roof(s, 0.9, f"b{i}")[1] for i in range(60)}
    assert 2 <= len(shades) <= 3


# --- facades --------------------------------------------------------------------


def test_facade_palette_follows_the_construction_era():
    def pal(year, klass=1122):
        return M.facade_style("u", "Gebaeude Einzelhaus", GwrInfo(year, klass))[0]

    assert pal(1850) == "old"
    assert pal(1930) == "interwar"
    assert pal(1960) == "postwar"
    assert pal(1985) == "late"
    assert pal(2015) == "recent"


def test_facade_by_building_type():
    church = M.facade_style("u", "Sakrales Gebaeude", None)
    assert church[0] == "stone" and church[2] == M.WINDOWS_CHURCH
    assert M.facade_style("u", "Gebaeude Einzelhaus", GwrInfo(1990, 1251))[0] == "industrial"
    office = M.facade_style("u", "Gebaeude Einzelhaus", GwrInfo(2005, 1220))
    assert office[0] == "glass" and office[2] == M.WINDOWS_GLASS
    assert M.facade_style("u", "Gebaeude Einzelhaus", GwrInfo(1900, 1271))[0] == "barn"
    assert M.facade_style("u", "Lagertank", None)[2] == M.WINDOWS_NONE
    assert M.facade_style("u", "Hochhaus", GwrInfo(1968, 1122))[2] == M.WINDOWS_BLOCK
    assert M.facade_style("u", "Gebaeude Einzelhaus", GwrInfo(1890, 1110))[2] == M.WINDOWS_OLD


def test_facade_without_register_guesses_the_era_from_the_roof():
    old = {M.facade_style(f"b{i}", "Gebaeude Einzelhaus", None, "terracotta")[0] for i in range(40)}
    assert old <= {"old", "interwar"}
    new = {M.facade_style(f"b{i}", "Gebaeude Einzelhaus", None, "gravel")[0] for i in range(40)}
    assert new <= {"postwar", "late"}


def test_osm_colour_and_material_override_the_register():
    style = M.facade_style("u", "Gebaeude Einzelhaus", GwrInfo(1970, 1122), None, {"building:colour": "#d9bd97"})
    assert style[0] == "osm"
    assert style[1] in {M._hex(c) for pal in M.FACADE_PALETTES.values() for c in pal}
    assert M.facade_style("u", "Gebaeude Einzelhaus", None, None, {"building:material": "glass"})[0] == "glass"


def test_facades_are_deterministic_and_vary_between_buildings():
    a = M.facade_style("uuid-1", "Gebaeude Einzelhaus", GwrInfo(1890, 1122))
    assert a == M.facade_style("uuid-1", "Gebaeude Einzelhaus", GwrInfo(1890, 1122))
    colours = {M.facade_style(f"b{i}", "Gebaeude Einzelhaus", GwrInfo(1890, 1122))[1] for i in range(80)}
    assert len(colours) >= 5


def test_parse_colour():
    assert M.parse_colour("#AbC") == (0xAA, 0xBB, 0xCC)
    assert M.parse_colour("#d9bd97") == (0xD9, 0xBD, 0x97)
    assert M.parse_colour("Silver") == (192, 192, 192)
    assert M.parse_colour("grey;white") == (128, 128, 128)
    assert M.parse_colour("not a colour") is None
    assert M.parse_colour(None) is None


def test_building_rows_carry_classes_and_variants():
    rows = M.building_rows((200, 100, 60), M.ROOF_TILES, (230, 220, 200), M.WINDOWS_OLD)
    assert rows.shape == (4, 4)
    assert rows[0, 3] == M.shader_byte(M.CLASS_ROOF, M.ROOF_TILES)
    assert rows[1, 3] == M.shader_byte(M.CLASS_WALL, M.WINDOWS_OLD)
    assert rows[2, 3] == rows[0, 3] and (rows[2, :3] < rows[0, :3]).all()  # risers: a shade darker
    assert M.shader_class(rows[3, 3]) == M.CLASS_WALL
