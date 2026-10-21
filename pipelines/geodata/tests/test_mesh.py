import numpy as np

from geovox import materials as M
from geovox.mesh import greedy_mesh


def _quads_by_normal(mesh):
    """Return a dict normal -> count using the winding of each quad."""
    out = {}
    p = mesh.positions.astype(np.int64).reshape(-1, 4, 3)
    n = np.cross(p[:, 1] - p[:, 0], p[:, 2] - p[:, 0])
    n = np.sign(n)
    for row in n:
        key = tuple(int(x) for x in row)
        out[key] = out.get(key, 0) + 1
    return out


def test_single_voxel_has_five_faces_without_floor():
    grid = np.zeros((4, 4, 4), np.uint16)
    grid[1, 0, 1] = M.GRASS  # sits on the grid floor: its bottom face is never visible
    opaque, water = greedy_mesh(grid, 0, np.zeros((0, 3, 4), np.uint8))
    assert water.is_empty()
    assert opaque.quad_count == 5
    normals = _quads_by_normal(opaque)
    assert normals == {(1, 0, 0): 1, (-1, 0, 0): 1, (0, 1, 0): 1, (0, 0, 1): 1, (0, 0, -1): 1}


def test_floating_voxel_has_six_faces():
    grid = np.zeros((4, 4, 4), np.uint16)
    grid[1, 2, 1] = M.ROCK
    opaque, _ = greedy_mesh(grid, 0, np.zeros((0, 3, 4), np.uint8))
    assert opaque.quad_count == 6


def test_flat_slab_merges_into_single_top_quad():
    grid = np.zeros((16, 3, 16), np.uint16)
    grid[:, 0, :] = M.GRASS
    opaque, _ = greedy_mesh(grid, 0, np.zeros((0, 3, 4), np.uint8))
    normals = _quads_by_normal(opaque)
    assert normals[(0, 1, 0)] == 1  # whole top is one quad
    # skirts: one quad per side of the tile
    assert normals[(1, 0, 0)] == normals[(-1, 0, 0)] == normals[(0, 0, 1)] == normals[(0, 0, -1)] == 1


def test_positions_are_offset_by_k_min_and_integer():
    grid = np.zeros((2, 2, 2), np.uint16)
    grid[0, 0, 0] = M.SOIL
    opaque, _ = greedy_mesh(grid, 37, np.zeros((0, 3, 4), np.uint8))
    assert opaque.positions.dtype == np.int16
    assert opaque.positions[:, 1].min() == 37
    assert opaque.positions[:, 1].max() == 38


def test_water_is_split_into_its_own_primitive():
    grid = np.zeros((4, 2, 4), np.uint16)
    grid[:, 0, :2] = M.WATER
    grid[:, 0, 2:] = M.SAND
    opaque, water = greedy_mesh(grid, 0, np.zeros((0, 3, 4), np.uint8))
    assert not water.is_empty()
    assert (water.colors[:, 3] == M.SHADER_WATER).all()
    assert (opaque.colors[:, 3] != M.SHADER_WATER).all()


def test_building_faces_use_roof_and_wall_colours():
    grid = np.zeros((3, 3, 3), np.uint16)
    grid[1, 0:2, 1] = M.BUILDING_BASE
    colors = np.array([[[200, 10, 10, M.SHADER_ROOF], [10, 200, 10, M.SHADER_WALL], [5, 100, 5, M.SHADER_WALL]]], np.uint8)
    opaque, _ = greedy_mesh(grid, 0, colors)
    shaders = set(opaque.colors[:, 3].tolist())
    assert shaders == {M.SHADER_ROOF, M.SHADER_WALL}
    roof_quads = opaque.colors[::4][:, 3] == M.SHADER_ROOF
    assert roof_quads.sum() == 1


def test_mesh_is_closed_for_interior_tile():
    """Every edge of a closed voxel surface is shared by exactly two quads when
    no faces are omitted (floating blob)."""
    rng = np.random.default_rng(1)
    grid = np.zeros((8, 8, 8), np.uint16)
    grid[2:6, 2:6, 2:6] = (rng.random((4, 4, 4)) > 0.3) * M.ROCK
    opaque, _ = greedy_mesh(grid, 0, np.zeros((0, 3, 4), np.uint8))
    # area check: total face area equals number of exposed voxel faces
    p = opaque.positions.astype(np.int64).reshape(-1, 4, 3)
    area = np.linalg.norm(np.cross(p[:, 1] - p[:, 0], p[:, 3] - p[:, 0]), axis=1).sum()
    solid = grid > 0
    exposed = 0
    for axis in range(3):
        for s in (1, -1):
            nb = np.roll(solid, -s, axis=axis)
            # voxels on the boundary are never adjacent to solids outside the grid
            idx = [slice(None)] * 3
            idx[axis] = -1 if s > 0 else 0
            nb[tuple(idx)] = False
            exposed += int((solid & ~nb).sum())
    assert area == exposed
