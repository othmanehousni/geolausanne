# 0006. Detect every tree from the surface model

Status: accepted · Date: 2026-10-21

## Context

Lausanne is very green; a city without its trees is not recognisable. The
blueprint suggested adding trees "with instancing once the underlying city is
correct". OSM tree nodes are sparse (mostly street trees), and random
scattering inside parks would put trees on lawns and paths that have none.

## Decision

* **Detect real trees**: normalised surface model (swissSURFACE3D −
  swissALTI3D) above 3 m, away from building footprints and water, confirmed
  by the orthophoto's excess-green index (rejects cranes, new buildings,
  vehicles); tree tops are local maxima of the smoothed canopy; height,
  crown radius and conifer probability are estimated per tree
  ([voxelization](../pipeline/voxelization.md#2-preparing-a-block-one-per-root-tile)).
* **Level 0**: each tree is an instance of one of six voxel prefabs
  (`EXT_mesh_gpu_instancing`), rotated by quarter turns that keep it on the
  voxel lattice. 221 656 instances for the municipality.
* **Levels 1–3**: isolated trees are stamped as voxel crowns; **forests become
  one continuous canopy volume** (smoothed mean canopy height), because
  hundreds of separate blobs at 4–8 m read as noise and mesh badly.

## Alternatives

* OSM `natural=tree` nodes only: a fraction of the real trees.
* Procedural scatter in `landuse=forest` and parks: wrong positions, no
  street trees, no private gardens.
* Billboards or textured trees: break the voxel style and need textures.

## Consequences

* Gardens, avenues and forests appear where they really are, including the
  Sauvabelin and Jorat woods.
* Tree heights come from 2023–2025 surveys; recently felled trees may remain.
* Instancing keeps level 0 tiles small: one prefab mesh per kind, 28 bytes
  per tree in the file.
