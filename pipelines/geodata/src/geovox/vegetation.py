"""Individual trees from the normalised surface model (nDSM = DSM - DTM).

swissSURFACE3D (2025) minus swissALTI3D gives object heights; buildings (from
swissBUILDINGS3D and OSM) and water are masked out and the orthophoto's
excess-green index rejects non-vegetation (cranes, new buildings, vehicles).
Tree tops are local maxima of the smoothed canopy height.
"""

from __future__ import annotations

import numpy as np
from scipy import ndimage
from scipy.spatial import cKDTree

from . import config
from . import materials as M
from .landcover import LEAF_BROAD, LEAF_MIXED, LEAF_NEEDLE


def _hash01(x: np.ndarray, y: np.ndarray, salt: float) -> np.ndarray:
    v = np.sin(x * 12.9898 + y * 78.233 + salt) * 43758.5453
    return v - np.floor(v)


def detect_trees(
    bounds: tuple[float, float, float, float],
    res: float,
    dtm: np.ndarray,
    dsm: np.ndarray,
    ortho_rgb: np.ndarray,
    classes: np.ndarray,
    leaf: np.ndarray,
    building_mask: np.ndarray,
) -> np.ndarray:
    """Return ``(n, 6)`` float64 rows ``(E, N, ground_H, height, radius, kind)``
    where kind is 0 for broadleaf and 1 for conifer."""
    ndsm = np.nan_to_num(dsm - dtm, nan=0.0)
    r, g, b = (np.nan_to_num(ortho_rgb[i].astype(np.float32), nan=0.0) for i in range(3))
    exg = (2 * g - r - b) / (r + g + b + 1e-3)
    blocked = ndimage.binary_dilation(building_mask, iterations=2) | (classes == M.WATER)
    veg = (ndsm > config.TREE_MIN_HEIGHT) & ~blocked & (exg > -0.02)
    veg = ndimage.binary_opening(veg, iterations=1)
    canopy = np.where(veg, ndsm, 0.0)
    smooth = ndimage.gaussian_filter(canopy, sigma=1.2)
    peaks = (smooth == ndimage.maximum_filter(smooth, size=5)) & veg & (smooth > config.TREE_MIN_HEIGHT + 1.0)
    rows, cols = np.nonzero(peaks)
    if len(rows) == 0:
        return np.zeros((0, 6))
    w, _s, _e, n = bounds
    e_coord = w + (cols + 0.5) * res
    n_coord = n - (rows + 0.5) * res
    win_max = ndimage.maximum_filter(ndsm, size=3)
    height = np.clip(win_max[rows, cols], config.TREE_MIN_HEIGHT, 45.0)
    # crown radius: distance to the canopy edge, bounded by allometry and neighbours
    edge_dist = ndimage.distance_transform_edt(veg) * res
    radius = np.minimum(edge_dist[rows, cols] + 0.5, 0.42 * height)
    pts = np.stack([e_coord, n_coord], 1)
    if len(pts) > 1:
        d, _ = cKDTree(pts).query(pts, k=2)
        radius = np.minimum(radius, d[:, 1] * 0.62)
    radius = np.clip(radius, 1.2, 7.0)
    ground = dtm[rows, cols]
    lt = leaf[rows, cols]
    forest = classes[rows, cols] == M.FOREST
    p_conifer = np.where(lt == LEAF_NEEDLE, 0.85, np.where(lt == LEAF_MIXED, 0.45, np.where(lt == LEAF_BROAD, 0.1, np.where(forest, 0.35, 0.08))))
    # tall slender crowns are more likely conifers
    p_conifer = np.clip(p_conifer + np.where(radius < 0.22 * height, 0.15, 0.0), 0, 1)
    kind = (_hash01(e_coord, n_coord, 1.7) < p_conifer).astype(np.float64)
    return np.stack([e_coord, n_coord, ground, height, radius, kind], 1)
