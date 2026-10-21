import struct

import numpy as np

from geovox import materials as M
from geovox.buildings import parse_wkb_triangles
from geovox.voxelize import fill_terrain, rasterize_footprint, stamp_trees, voxelize_building


def box_triangles(x0, y0, z0, x1, y1, z1):
    """Closed axis-aligned box as 12 triangles (local voxel units)."""
    v = np.array(
        [
            [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
            [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
        ],
        dtype=float,
    )
    faces = [
        (0, 2, 1), (0, 3, 2), (4, 5, 6), (4, 6, 7),
        (0, 1, 5), (0, 5, 4), (3, 7, 6), (3, 6, 2),
        (0, 4, 7), (0, 7, 3), (1, 2, 6), (1, 6, 5),
    ]
    return np.array([[v[a], v[b], v[c]] for a, b, c in faces])


def test_box_voxelises_to_exact_volume():
    grid = np.zeros((16, 16, 16), np.uint16)
    top = np.full((16, 16), -32768, np.int32)
    voxelize_building(grid, 0, box_triangles(2, 1, 3, 7, 9, 8), 40, top)
    filled = grid == 40
    assert filled.sum() == 5 * 8 * 5
    assert filled[2:7, 1:9, 3:8].all()
    assert top[3, 2] == 8  # top[z, x]: highest filled level of a covered column


def test_pitched_roof_follows_slope():
    # a gable: two sloped quads over a 10 x 10 footprint from y=4 (eaves) to y=9 (ridge)
    tris = []
    b = box_triangles(0, 0, 0, 10, 4, 10)
    tris.extend(b[[0, 1, 2, 3, 4, 5, 8, 9, 10, 11]])  # four walls + floor, open top
    ridge = 9.3  # avoid exact ties with voxel centres
    pts = {
        "a": [0, 4, 0], "b": [10, 4, 0], "c": [10, 4, 10], "d": [0, 4, 10],
        "e": [0, ridge, 5], "f": [10, ridge, 5],
    }
    P = {k: np.array(v, float) for k, v in pts.items()}
    tris += [
        [P["a"], P["e"], P["b"]], [P["b"], P["e"], P["f"]],  # north slope
        [P["d"], P["c"], P["e"]], [P["c"], P["f"], P["e"]],  # south slope
        [P["a"], P["d"], P["e"]], [P["b"], P["f"], P["c"]],  # gable ends
    ]
    grid = np.zeros((12, 12, 12), np.uint16)
    top = np.full((12, 12), -32768, np.int32)
    voxelize_building(grid, 0, np.array(tris), 33, top)
    heights = [(grid[5, :, z] == 33).sum() for z in range(10)]
    assert heights[0] < heights[4]  # ridge column taller than eaves
    assert heights == heights[::-1]  # symmetric gable


def test_fill_terrain_puts_class_on_top_and_soil_below():
    levels = np.array([[3, 5], [4, 4]], np.int32)
    classes = np.array([[M.GRASS, M.ROAD], [M.WATER, M.SAND]], np.uint8)
    grid = np.zeros((2, 8, 2), np.uint16)
    fill_terrain(grid, 0, levels, classes)
    assert grid[0, 2, 0] == M.GRASS and grid[0, 1, 0] == M.SOIL and grid[0, 3, 0] == 0
    assert grid[1, 4, 0] == M.ROAD


def test_footprint_mask():
    mask = np.zeros((16, 16), bool)
    rasterize_footprint(box_triangles(2, 0, 3, 7, 5, 8), mask)
    assert mask[3:8, 2:7].all() and mask.sum() == 25


def test_trees_are_stamped_only_into_air():
    grid = np.zeros((20, 30, 20), np.uint16)
    grid[:, :2, :] = M.SOIL
    trees = np.array([[10.0, 10.0, 2.0, 12.0, 3.0, 0.0]])
    stamp_trees(grid, 0, trees, 1.0, np.array([M.LEAVES, M.LEAVES_DARK], np.uint16))
    assert (grid == M.LEAVES).sum() > 50
    assert (grid == M.TRUNK).sum() >= 3
    assert (grid[:, :2, :] == M.SOIL).all()


def _wkb_tin(triangles):
    out = bytearray(struct.pack("<BII", 1, 1016, len(triangles)))
    for t in triangles:
        out += struct.pack("<BIII", 1, 1017, 1, 4)
        for p in list(t) + [t[0]]:
            out += struct.pack("<ddd", *p)
    return bytes(out)


def test_parse_iso_tin_fast_path():
    tris = box_triangles(0, 0, 0, 1, 1, 1)
    parsed = parse_wkb_triangles(_wkb_tin(tris))
    assert parsed.shape == (12, 3, 3)
    assert np.allclose(parsed, tris)


def test_parse_multipolygon_fan_triangulates_quads():
    quad = [(0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0), (0, 0, 0)]
    wkb = struct.pack("<BII", 1, 1006, 1) + struct.pack("<BII", 1, 1003, 1) + struct.pack("<I", 5)
    wkb += b"".join(struct.pack("<ddd", *p) for p in quad)
    parsed = parse_wkb_triangles(wkb)
    assert parsed.shape == (2, 3, 3)


def gable_house(eaves=4.0, ridge=9.3, size=10.0):
    """Closed house: box walls up to the eaves and a gable roof along x."""
    tris = []
    b = box_triangles(0, 0, 0, size, eaves, size)
    tris.extend(b[[0, 1, 2, 3, 4, 5, 8, 9, 10, 11]])  # walls + floor, open top
    half = size / 2
    P = {
        "a": [0, eaves, 0], "b": [size, eaves, 0], "c": [size, eaves, size], "d": [0, eaves, size],
        "e": [0, ridge, half], "f": [size, ridge, half],
    }
    P = {k: np.array(v, float) for k, v in P.items()}
    tris += [
        [P["a"], P["e"], P["b"]], [P["b"], P["e"], P["f"]],
        [P["d"], P["c"], P["e"]], [P["c"], P["f"], P["e"]],
        [P["a"], P["d"], P["e"]], [P["b"], P["f"], P["c"]],
    ]
    return np.array(tris)


def test_steps_of_a_pitched_roof_take_the_roof_value():
    grid = np.zeros((12, 12, 12), np.uint16)
    top = np.full((12, 12), -32768, np.int32)
    voxelize_building(grid, 0, gable_house(), 70, top, roof_value=71)
    roof = grid == 71
    assert roof.any() and (grid == 70).any()
    # roof steps only above the eaves; the eaves columns keep the facade
    assert np.nonzero(roof)[1].min() >= 4
    assert grid[5, 4, 0] == 70
    # both slopes have steps
    assert (grid[5, :, 1] == 71).any() and (grid[5, :, 8] == 71).any()
    # walls below the eaves are untouched
    below = grid[:, 0:4, :]
    assert (below[below > 0] == 70).all()


def test_flat_roofs_and_towers_keep_their_facade():
    grid = np.zeros((16, 20, 16), np.uint16)
    top = np.full((16, 16), -32768, np.int32)
    # a podium with a tower: flat roofs, a 10-voxel step is a facade
    tris = np.concatenate([box_triangles(0, 0, 0, 14, 4, 14), box_triangles(4, 0, 4, 8, 14, 8)])
    voxelize_building(grid, 0, tris, 70, top, roof_value=71)
    assert not (grid == 71).any()
