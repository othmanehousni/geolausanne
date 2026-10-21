import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUiStore } from "@/stores/ui-store";
import { useWorldStore } from "@/stores/world-store";
import { renderWithProviders } from "@/test/render";
import { MapHint } from "../MapHint";

const HINT = /Drag to look around/;

/** jsdom has no matchMedia: answer the pointer query like a mouse or a touch screen. */
function pointer(coarse: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: coarse && query.includes("coarse"),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
}

beforeEach(() => {
  localStorage.clear();
  useWorldStore.setState({ firstViewReady: false, picking: false });
  useUiStore.setState({ selectedPlaceId: null, listOpen: false });
  pointer(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("MapHint", () => {
  it("waits for the city, then shows once per browser", () => {
    const first = renderWithProviders(<MapHint />);
    expect(screen.queryByText(HINT)).toBeNull();
    act(() => useWorldStore.setState({ firstViewReady: true }));
    expect(screen.getByText(HINT)).toBeInTheDocument();
    first.unmount();
    // the next visit
    renderWithProviders(<MapHint />);
    expect(screen.queryByText(HINT)).toBeNull();
  });

  it("speaks of tapping on touch screens", () => {
    pointer(true);
    useWorldStore.setState({ firstViewReady: true });
    renderWithProviders(<MapHint />);
    expect(screen.getByText(/tap a spot/)).toBeInTheDocument();
  });

  it("is hidden from assistive technology and leaves at the first key press", () => {
    vi.useFakeTimers();
    useWorldStore.setState({ firstViewReady: true });
    renderWithProviders(<MapHint />);
    expect(screen.getByText(HINT).closest('[aria-hidden="true"]')).not.toBeNull();
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
    });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(screen.queryByText(HINT)).toBeNull();
  });

  it("stays out of the way of an open spot", () => {
    useWorldStore.setState({ firstViewReady: true });
    useUiStore.setState({ selectedPlaceId: "osm-1" });
    renderWithProviders(<MapHint />);
    expect(screen.queryByText(HINT)).toBeNull();
  });
});
