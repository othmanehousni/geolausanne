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


def _building_on_ground():
    """A 4 x 5 x 4 building standing on a grass slab (one table entry)."""
    grid = np.zeros((12, 8, 12), np.uint16)
    grid[:, 0, :] = M.GRASS
    grid[4:8, 1:6, 4:8] = M.BUILDING_BASE
    colors = np.array([[[200, 90, 60, M.SHADER_ROOF], [220, 210, 190, M.SHADER_WALL], [150, 140, 130, M.SHADER_WALL]]], np.uint8)
    return grid, colors


def test_ambient_occlusion_darkens_the_foot_of_walls_and_the_ground_along_them():
    grid, colors = _building_on_ground()
    opaque, _ = greedy_mesh(grid, 0, colors)
    ao = opaque.colors[:, 3] & M.AO_MASK
    cls = opaque.colors[:, 3] >> 5
    y = opaque.positions[:, 1]
    walls = cls == M.CLASS_WALL
    # wall vertices at the foot (y == 1) are occluded, at the top (y == 6) open
    assert (ao[walls & (y == 1)] > 0).all()
    assert (ao[walls & (y == 6)] == 0).all()
    # ground vertices on the building's outline are occluded, far ones are not
    ground = (cls == M.CLASS_PLAIN) & (y == 1)
    p = opaque.positions[ground]
    on_outline = (p[:, 0] >= 4) & (p[:, 0] <= 8) & (p[:, 2] >= 4) & (p[:, 2] <= 8)
    assert (ao[ground][on_outline] > 0).any()
    corner = (p[:, 0] == 0) & (p[:, 2] == 0)
    assert (ao[ground][corner] == 0).all()
    # the class survives the occlusion bits; roofs stay open
    assert set(np.unique(cls).tolist()) == {M.CLASS_PLAIN, M.CLASS_WALL, M.CLASS_ROOF}
    assert (ao[cls == M.CLASS_ROOF] == 0).all()


def test_ambient_occlusion_can_be_switched_off_and_costs_few_quads():
    grid, colors = _building_on_ground()
    with_ao, _ = greedy_mesh(grid, 0, colors)
    without, _ = greedy_mesh(grid, 0, colors, ao=False)
    assert ((without.colors[:, 3] & M.AO_MASK) == 0).all()
    # each wall gains one strip at its foot (4 here, the faces above still
    # merge), the ground a ring of strips and corners around the footprint
    walls = lambda m: int((((m.colors[::4, 3] >> 5) == M.CLASS_WALL)).sum())
    assert walls(with_ao) == walls(without) + 4
    assert without.quad_count < with_ao.quad_count <= without.quad_count + 4 + 16


def test_steps_of_a_pitched_roof_do_not_darken_each_other():
    grid = np.zeros((8, 8, 8), np.uint16)
    roof, step = M.BUILDING_BASE, M.BUILDING_BASE + 1
    grid[1:7, 0:3, 1:7] = roof
    grid[1:7, 3, 3:7] = step  # a higher step of the same roof
    colors = np.zeros((2, 3, 4), np.uint8)
    colors[:, 0] = (200, 90, 60, M.SHADER_ROOF)
    colors[:, 1] = (220, 210, 190, M.SHADER_WALL)
    colors[:, 2] = (150, 140, 130, M.SHADER_WALL)
    opaque, _ = greedy_mesh(grid, 0, colors, roof_steps=np.array([step]))
    tops = (opaque.colors[:, 3] >> 5) == M.CLASS_ROOF
    assert ((opaque.colors[tops, 3] & M.AO_MASK) == 0).all()
    # without the hint the lower step is darkened along the riser
    opaque, _ = greedy_mesh(grid, 0, colors)
    tops = (opaque.colors[:, 3] >> 5) == M.CLASS_ROOF
    assert ((opaque.colors[tops, 3] & M.AO_MASK) > 0).any()


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
