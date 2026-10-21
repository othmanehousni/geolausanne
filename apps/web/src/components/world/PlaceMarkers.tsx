"use client";

import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { PLACE_CATEGORIES, type Place } from "@/lib/data/types";
import { tileKeysAt } from "@/lib/world/lod";
import { badgeSpriteName, GLOW_SELECTED_SPRITE, GLOW_SPRITE, markerAtlas, SHADOW_SPRITE, type AtlasSprite } from "@/lib/world/marker-atlas";
import { drawOrder, markerTexelSize, projectToScreen, ScreenHits, selectBounce, spriteHitRect, type ScreenPoint } from "@/lib/world/marker-screen";
import { worldUniforms } from "@/lib/world/materials";
import { LATER, surfaceAt } from "@/lib/world/picking";
import { worldRegistry } from "@/lib/world/registry";
import { SpriteBatch } from "@/lib/world/sprite-batch";
import { usePlacesStore } from "@/stores/places-store";
import { useUiStore } from "@/stores/ui-store";
import { useWorldStore } from "@/stores/world-store";

const MAX = 1000;
/** how far a hovered badge rises (CSS pixels) */
const HOVER_LIFT = 5;
/** a press that moves farther than this (CSS pixels) is a drag, not a click */
const CLICK_SLOP = 6;
/** extra margin around a badge that still counts as a hit (CSS pixels) */
const HIT_PAD = { mouse: 2, touch: 10 };
/** gap between a badge and its name tag (CSS pixels) */
const TAG_GAP = 5;
/** the selected badge is a little larger */
const SELECTED_SCALE = 1.12;
// night glow: warm saffron light; by day a faint white halo lifts badges off busy roofs
const GLOW_DAY = new THREE.Color("#ffffff");
const GLOW_NIGHT = new THREE.Color("#ffbf4a");

interface Anchor {
  x: number;
  z: number;
  /** top surface under the spot (roof or ground), refined as tiles stream in */
  y: number;
  /** keys of the tiles over the spot, finest first */
  keys: string[];
  /** the drawn tile `y` was measured on: measured again once another one is drawn there */
  tile: string | null;
  /** current hover lift (CSS pixels), eased */
  lift: number;
}

/** One marker as laid out in the current frame. */
interface Slot {
  id: string;
  anchor: Anchor;
  screen: ScreenPoint;
  distance: number;
  texel: number;
  lift: number;
  sprite: AtlasSprite;
  dim: boolean;
  selected: boolean;
}

/**
 * Name of the hovered or selected spot above its badge; decorative (the
 * panel and the list carry the name). drei's <Html> owns a separate React
 * root: it stays mounted and only its text changes, because unmounting that
 * root during a render (React 19) throws and can leave other portals
 * half-closed. For the same reason it gets a fixed `portal`: by default it
 * moves from the canvas' parent to R3F's event element once events connect,
 * and that move unmounted its root mid-commit, emptying the first tags (the
 * selected spot's name never showed). The frame loop moves it and sets its
 * height above the anchor.
 */
function NameTag({ name, tagRef, portal }: { name: string | null; tagRef: RefObject<HTMLDivElement | null>; portal: RefObject<HTMLElement> }) {
  return (
    <Html portal={portal} zIndexRange={[20, 0]} style={{ pointerEvents: "none" }} aria-hidden="true">
      <div
        ref={tagRef}
        style={{ translate: "-50% calc(-100% - 44px)" }}
        className={
          name
            ? "w-max max-w-[min(20rem,80vw)] truncate rounded-full bg-popover px-2.5 py-1 text-xs font-medium text-popover-foreground shadow-[var(--shadow-float)]"
            : "hidden"
        }
      >
        {name}
      </div>
    </Html>
  );
}

/**
 * Pixel-art badges for halal spots: a category glyph on a saffron badge
 * whose tip touches the spot, with a soft contact shadow; constant size on
 * screen, drawn over the city with two instanced draw calls (shadows, then
 * glows and badges). Hover and clicks are tested in screen space against
 * what is drawn; the accessible equivalent is the spots list.
 */
export function PlaceMarkers() {
  const places = usePlacesStore((s) => s.places);
  const hoveredId = usePlacesStore((s) => s.hoveredId);
  const selectedId = useUiStore((s) => s.selectedPlaceId);
  const manifest = useWorldStore((s) => s.manifest);
  const gl = useThree((s) => s.gl);
  // where the name tags live, the same from the first render on
  const tagHost = useMemo(() => ({ current: gl.domElement.parentElement ?? document.body }), [gl]);

  const selectedLabel = useRef<THREE.Group>(null);
  const hoveredLabel = useRef<THREE.Group>(null);
  const selectedTag = useRef<HTMLDivElement>(null);
  const hoveredTag = useRef<HTMLDivElement>(null);
  const tagOffsets = useRef({ selected: -1, hovered: -1 });
  const anchors = useRef(new Map<string, Anchor>());
  const anchorList = useRef<Anchor[]>([]);
  /** round robin over the anchors, so that every pin gets its turn */
  const cursor = useRef(0);
  const lastResolve = useRef(0);
  const hits = useRef(new ScreenHits<string>(64));
  const pointer = useRef({ inside: false, x: 0, y: 0, mouse: false, down: null as { x: number; y: number; id: number } | null });
  /** the spot this component marked as hovered (the spots list sets hover too) */
  const mapHover = useRef<string | null>(null);
  const bounce = useRef({ id: null as string | null, start: -Infinity });

  const batches = useMemo(
    () => ({
      shadows: new SpriteBatch(MAX, { name: "marker-shadows", depthTest: true, renderOrder: 10 }),
      badges: new SpriteBatch(MAX * 2, { name: "marker-badges", renderOrder: 20 }),
    }),
    [],
  );
  useEffect(
    () => () => {
      batches.shadows.dispose();
      batches.badges.dispose();
    },
    [batches],
  );

  const sprites = useMemo(() => {
    const atlas = markerAtlas();
    const get = (name: string) => atlas.sprites.get(name)!;
    // every badge of a category, indexed by dim · 4 + verified · 2 + selected
    const badges = new Map(
      PLACE_CATEGORIES.map((c) => [c, [0, 1, 2, 3, 4, 5, 6, 7].map((k) => get(badgeSpriteName(c, { dim: k >= 4, verified: (k & 2) > 0, selected: (k & 1) > 0 })))]),
    );
    const other = badges.get("other")!;
    const badge = (p: Place, dim: boolean, selected: boolean) => (badges.get(p.category) ?? other)[(dim ? 4 : 0) + (p.certification_verified ? 2 : 0) + (selected ? 1 : 0)]!;
    return { badge, glow: get(GLOW_SPRITE), glowSelected: get(GLOW_SELECTED_SPRITE), shadow: get(SHADOW_SPRITE) };
  }, []);

  const slots = useMemo(() => [] as Slot[], []);
  const depths = useMemo(() => new Float32Array(MAX), []);
  const order = useMemo(() => [] as number[], []);
  const viewProj = useMemo(() => new THREE.Matrix4(), []);
  const glowColor = useMemo(() => new THREE.Color(), []);
  const rect = useMemo((): [number, number, number, number] => [0, 0, 0, 0], []);

  // world-space anchor for each place (LV95 -> world)
  useEffect(() => {
    if (!manifest) return;
    const next = new Map<string, Anchor>();
    for (const p of places) {
      const prev = anchors.current.get(p.id);
      const x = p.easting - manifest.origin.easting;
      const z = manifest.origin.northing - p.northing;
      const fallbackY = p.elevation !== null ? p.elevation - manifest.origin.elevation : 0;
      next.set(p.id, prev && prev.x === x && prev.z === z ? prev : { x, z, y: fallbackY, keys: tileKeysAt(manifest.lods, x, z), tile: null, lift: 0 });
    }
    anchors.current = next;
    anchorList.current = [...next.values()];
  }, [places, manifest]);

  // pointer: hover is tested every frame (markers move under a still pointer
  // while the camera moves); a click is a press and release without a drag
  useEffect(() => {
    const el = gl.domElement;
    const p = pointer.current;
    const local = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      p.x = e.clientX - r.left;
      p.y = e.clientY - r.top;
    };
    const onMove = (e: PointerEvent) => {
      local(e);
      p.inside = true;
      p.mouse = e.pointerType !== "touch";
    };
    const onLeave = () => {
      p.inside = false;
    };
    const onDown = (e: PointerEvent) => {
      if (e.isPrimary && e.button === 0) p.down = { x: e.clientX, y: e.clientY, id: e.pointerId };
    };
    const onUp = (e: PointerEvent) => {
      const d = p.down;
      p.down = null;
      if (!d || d.id !== e.pointerId || Math.hypot(e.clientX - d.x, e.clientY - d.y) > CLICK_SLOP) return;
      if (useWorldStore.getState().picking) return;
      local(e);
      const id = hits.current.pick(p.x, p.y, e.pointerType === "touch" ? HIT_PAD.touch : HIT_PAD.mouse);
      if (id) useUiStore.getState().selectPlace(id);
    };
    const onCancel = () => {
      p.down = null;
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onCancel);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onCancel);
      if (mapHover.current && usePlacesStore.getState().hoveredId === mapHover.current) usePlacesStore.getState().setHovered(null);
      mapHover.current = null;
    };
  }, [gl]);

  // the selected badge hops once when it is chosen
  useEffect(() => {
    if (selectedId && selectedId !== bounce.current.id) bounce.current = { id: selectedId, start: performance.now() };
    if (!selectedId) bounce.current = { id: null, start: -Infinity };
  }, [selectedId]);

  /** Measure pin heights again on the tiles drawn under them, a few per frame; true when one moved. */
  const resolveHeights = (now: number) => {
    const tiles = worldRegistry.tiles;
    const list = anchorList.current;
    if (!tiles || now - lastResolve.current <= 600) return false;
    lastResolve.current = now;
    let probes = 40;
    let moved = false;
    for (let n = 0; n < list.length && probes > 0; n++) {
      const a = list[cursor.current % list.length]!;
      const drawn = a.keys.find((k) => tiles.isDrawn(k));
      if (drawn && drawn !== a.tile) {
        probes--;
        const hit = surfaceAt(a.x, a.z, { canWait: true });
        if (hit === LATER) {
          // a tile's BVH was just built: carry on from this pin next frame
          lastResolve.current = 0;
          break;
        }
        if (hit && hit.y !== a.y) {
          a.y = hit.y;
          moved = true;
        }
        a.tile = drawn;
      }
      cursor.current++;
    }
    return moved;
  };

  /** What the last layout was made for: nothing changed, nothing to do. */
  const laidOut = useRef({ view: new Float64Array(32), w: 0, h: 0, px: 0, night: -1, places: null as Place[] | null, hovered: null as string | null, selected: null as string | null, animating: true });
  const sameLayout = (camera: THREE.Camera, w: number, h: number, px: number, night: number, hovered: string | null, selected: string | null) => {
    const l = laidOut.current;
    let same = !l.animating && l.places === places && l.hovered === hovered && l.selected === selected && l.night === night && l.px === px && l.w === w && l.h === h;
    const a = camera.matrixWorld.elements;
    const b = camera.projectionMatrix.elements;
    for (let i = 0; i < 16; i++) {
      if (l.view[i] !== a[i] || l.view[16 + i] !== b[i]) same = false;
      l.view[i] = a[i]!;
      l.view[16 + i] = b[i]!;
    }
    Object.assign(l, { w, h, px, night, places, hovered, selected });
    return same;
  };

  /** Place a name tag on its badge: at the anchor, raised above the badge. */
  const placeTag = (group: THREE.Group | null, tag: HTMLDivElement | null, slot: Slot | undefined, key: "selected" | "hovered") => {
    if (!group || !slot) return;
    group.position.set(slot.anchor.x, slot.anchor.y, slot.anchor.z);
    const offset = Math.round((slot.sprite.hit[3] - slot.sprite.pivotY) * slot.texel + slot.lift + TAG_GAP);
    if (tag && offset !== tagOffsets.current[key]) {
      tagOffsets.current[key] = offset;
      tag.style.translate = `-50% calc(-100% - ${offset}px)`;
    }
  };

  // before drei's <Html> tags (priority 0) so that they follow in the same frame
  // named, so it shows in performance profiles
  useFrame(function markersFrame(state, delta) {
    const now = performance.now();
    const heightsMoved = resolveHeights(now);
    const { camera, size } = state;
    const world = useWorldStore.getState();
    const reduced = world.reducedMotion;
    const picking = world.picking;
    const hovered = usePlacesStore.getState().hoveredId;
    const selected = useUiStore.getState().selectedPlaceId;
    const pxPerCss = batches.badges.pxPerCss;
    const night = worldUniforms.uNight.value;
    camera.updateMatrixWorld();
    // a still view with nothing animating: last frame's layout (and hit boxes) still hold
    if (!sameLayout(camera, size.width, size.height, pxPerCss, night, hovered, selected) || heightsMoved) layout(camera, size, now, delta, reduced, hovered, selected, pxPerCss, night);

    // hover: the front-most badge under a still mouse, also while the view moves
    const p = pointer.current;
    const over = p.inside && p.mouse && !p.down && !picking ? hits.current.pick(p.x, p.y, HIT_PAD.mouse) : null;
    if (over !== mapHover.current) {
      const store = usePlacesStore.getState();
      if (over) store.setHovered(over);
      else if (store.hoveredId === mapHover.current) store.setHovered(null);
      mapHover.current = over;
      if (!picking) gl.domElement.style.cursor = over ? "pointer" : "";
    }
  }, -0.5);

  /** Lay out, sort and queue every marker in front of the camera, and their hit boxes. */
  const layout = (camera: THREE.Camera, size: { width: number; height: number }, now: number, delta: number, reduced: boolean, hovered: string | null, selected: string | null, pxPerCss: number, night: number) => {
    viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const m = viewProj.elements;
    const ease = reduced ? 1 : 1 - Math.exp(-delta * 22);
    const sinceBounce = (now - bounce.current.start) / 1000;
    const bounceLift = reduced || bounce.current.id !== selected ? 0 : selectBounce(sinceBounce);
    let animating = !reduced && bounce.current.id === selected && sinceBounce < 0.5;
    const cam = camera.position;
    // markers this far off screen cannot reach it (CSS pixels)
    const margin = 80;

    let n = 0;
    let selectedSlot = -1;
    let hoveredSlot = -1;
    for (const p of places) {
      if (n >= MAX) break;
      const a = anchors.current.get(p.id);
      if (!a) continue;
      const slot = (slots[n] ??= { id: "", anchor: a, screen: { x: 0, y: 0, depth: 0 }, distance: 0, texel: 2, lift: 0, sprite: sprites.shadow, dim: false, selected: false });
      const sc = slot.screen;
      if (!projectToScreen(m, a.x, a.y, a.z, size.width, size.height, sc)) continue;
      if (sc.x < -margin || sc.x > size.width + margin || sc.y < -margin || sc.y > size.height + margin) continue;
      const isSel = p.id === selected;
      const isHover = p.id === hovered;
      const target = isHover ? HOVER_LIFT : 0;
      a.lift += (target - a.lift) * ease;
      if (Math.abs(target - a.lift) < 0.05) a.lift = target;
      else animating = true;
      slot.id = p.id;
      slot.anchor = a;
      const dx = a.x - cam.x;
      const dy = a.y - cam.y;
      const dz = a.z - cam.z;
      slot.distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      slot.texel = markerTexelSize(slot.distance, pxPerCss, isSel ? SELECTED_SCALE : 1);
      slot.lift = a.lift + (isSel ? bounceLift : 0);
      slot.dim = p.score < 0;
      slot.selected = isSel;
      slot.sprite = sprites.badge(p, slot.dim, isSel);
      depths[n] = slot.screen.depth;
      if (isSel) selectedSlot = n;
      if (isHover) hoveredSlot = n;
      n++;
    }
    drawOrder(depths.subarray(0, n), selectedSlot, hoveredSlot, order);

    laidOut.current.animating = animating;

    // contact shadows (hidden behind buildings), glows, then badges
    const { shadows, badges } = batches;
    glowColor.copy(GLOW_DAY).lerp(GLOW_NIGHT, night);
    const glowAlpha = 0.22 + 0.63 * night;
    shadows.begin();
    badges.begin();
    hits.current.clear();
    for (const i of order) {
      const s = slots[i]!;
      const a = s.anchor;
      shadows.push(a.x, a.y, a.z, sprites.shadow, s.texel, 0, 1, 1, 1, 1 - Math.min(0.6, s.lift / 20));
      badges.push(a.x, a.y, a.z, s.selected ? sprites.glowSelected : sprites.glow, s.texel, s.lift, glowColor.r, glowColor.g, glowColor.b, glowAlpha * (s.dim ? 0.45 : 1));
    }
    for (const i of order) {
      const s = slots[i]!;
      const a = s.anchor;
      const bright = 1 + 0.12 * Math.min(1, s.lift / HOVER_LIFT);
      badges.push(a.x, a.y, a.z, s.sprite, s.texel, s.lift, bright, bright, bright, s.dim ? 0.9 : 1);
      hits.current.add(s.id, spriteHitRect(s.screen.x, s.screen.y, s.sprite, s.texel, s.lift, rect), size.width, size.height);
    }
    shadows.end();
    badges.end();

    placeTag(selectedLabel.current, selectedTag.current, selectedSlot >= 0 ? slots[selectedSlot] : undefined, "selected");
    placeTag(hoveredLabel.current, hoveredTag.current, hoveredSlot >= 0 ? slots[hoveredSlot] : undefined, "hovered");
  };

  const selectedPlace: Place | undefined = places.find((p) => p.id === selectedId);
  const hoveredPlace: Place | undefined = places.find((p) => p.id === hoveredId);
  return (
    <group name="place-markers">
      <primitive object={batches.shadows.mesh} />
      <primitive object={batches.badges.mesh} />
      {/* name tags follow their badge: the groups are positioned every frame */}
      <group ref={selectedLabel}>
        <NameTag name={selectedPlace?.name ?? null} tagRef={selectedTag} portal={tagHost} />
      </group>
      <group ref={hoveredLabel}>
        <NameTag name={hoveredPlace && hoveredPlace.id !== selectedPlace?.id ? hoveredPlace.name : null} tagRef={hoveredTag} portal={tagHost} />
      </group>
    </group>
  );
}
