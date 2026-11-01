import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "geolausanne-pixel-style";

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

describe("the city's pixel size", () => {
  it("is fine by default", async () => {
    const store = await loadStore();
    expect(store.getState().pixelStyle).toBe("fine");
  });

  it("is remembered in this browser, and the default leaves nothing behind", async () => {
    const store = await loadStore();
    store.getState().setPixelStyle("large");
    expect(localStorage.getItem(KEY)).toBe("large");
    expect((await loadStore()).getState().pixelStyle).toBe("large");

    const again = await loadStore();
    again.getState().setPixelStyle("fine");
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("ignores a stored value it does not know", async () => {
    localStorage.setItem(KEY, "huge");
    expect((await loadStore()).getState().pixelStyle).toBe("fine");
  });

  it("still works without storage (private browsing)", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const store = await loadStore();
    expect(store.getState().pixelStyle).toBe("fine");
    expect(() => store.getState().setPixelStyle("sharp")).not.toThrow();
    expect(store.getState().pixelStyle).toBe("sharp");
  });
});
