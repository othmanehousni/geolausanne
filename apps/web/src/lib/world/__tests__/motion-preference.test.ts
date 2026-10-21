import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "geolausanne-motion-paused";

/** A fresh world store, as on a page load. */
async function loadStore() {
  vi.resetModules();
  return (await import("@/stores/world-store")).useWorldStore;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("pausing the map's motion", () => {
  it("is off by default; reduced motion then follows the system setting", async () => {
    const store = await loadStore();
    expect(store.getState()).toMatchObject({ motionPaused: false, reducedMotion: false });
    store.getState().setPrefersReducedMotion(true);
    expect(store.getState().reducedMotion).toBe(true);
    store.getState().setPrefersReducedMotion(false);
    expect(store.getState().reducedMotion).toBe(false);
  });

  it("stops the motion whatever the system says, and is remembered", async () => {
    const store = await loadStore();
    store.getState().setMotionPaused(true);
    expect(store.getState().reducedMotion).toBe(true);
    store.getState().setPrefersReducedMotion(false);
    expect(store.getState().reducedMotion).toBe(true);
    expect(localStorage.getItem(KEY)).toBe("1");

    const reloaded = await loadStore();
    expect(reloaded.getState()).toMatchObject({ motionPaused: true, reducedMotion: true });
    reloaded.getState().setMotionPaused(false);
    expect(reloaded.getState().reducedMotion).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("still works without storage (private browsing)", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const store = await loadStore();
    expect(store.getState().motionPaused).toBe(false);
    expect(() => store.getState().setMotionPaused(true)).not.toThrow();
    expect(store.getState()).toMatchObject({ motionPaused: true, reducedMotion: true });
  });
});
