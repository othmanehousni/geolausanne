import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAnnouncer } from "@/stores/announcer-store";
import { usePlacesStore } from "@/stores/places-store";
import { useWorldStore, type CameraView } from "@/stores/world-store";
import { renderWithProviders } from "@/test/render";
import { compassPoint, useViewAnnouncer } from "../use-view-announcer";

function Harness() {
  useViewAnnouncer();
  return null;
}

/** A camera orbiting the origin 400 m away, as the rig reports it. */
function viewAt(heading: number): CameraView {
  const a = (heading * Math.PI) / 180;
  return { x: -Math.sin(a) * 400, y: 400, z: Math.cos(a) * 400, targetX: 0, targetY: 0, targetZ: 0, distance: 566, heading };
}

function report(heading: number) {
  act(() => useWorldStore.getState().setView(viewAt(heading)));
}

function wait(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  useWorldStore.setState({ view: viewAt(0), command: null });
  usePlacesStore.setState({ places: [] });
  useAnnouncer.setState({ message: "", nonce: 0 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("compassPoint", () => {
  it("rounds headings to the nearest of eight points", () => {
    expect(compassPoint(0)).toBe("north");
    expect(compassPoint(22)).toBe("north");
    expect(compassPoint(23)).toBe("northEast");
    expect(compassPoint(180)).toBe("south");
    expect(compassPoint(359)).toBe("north");
    expect(compassPoint(-90)).toBe("west");
    expect(compassPoint(405)).toBe("northEast");
  });
});

describe("useViewAnnouncer", () => {
  it("announces the heading and the spots in view once a keyboard move settles", () => {
    renderWithProviders(<Harness />);
    act(() => useWorldStore.getState().send({ kind: "rotate", radians: Math.PI / 4 }));
    for (const heading of [10, 25, 40, 45]) {
      wait(250);
      report(heading);
    }
    expect(useAnnouncer.getState().message).toBe("");
    wait(1000);
    expect(useAnnouncer.getState().message).toBe("Facing north-east. No spots in view.");
  });

  it("is not held back by the rig's reports of a camera that stopped", () => {
    renderWithProviders(<Harness />);
    act(() => useWorldStore.getState().send({ kind: "tilt", radians: Math.PI / 24 }));
    // tilting at the limit does not move the camera; the rig keeps reporting it
    for (let i = 0; i < 4; i++) {
      wait(250);
      report(0);
    }
    expect(useAnnouncer.getState().message).toBe("Facing north. No spots in view.");
  });

  it("waits for the spots around the new centre", () => {
    renderWithProviders(<Harness />);
    act(() => useWorldStore.getState().send({ kind: "pan", forward: 1, right: 0 }));
    wait(500);
    act(() => usePlacesStore.setState({ places: [{ id: "a" }, { id: "b" }] as never }));
    wait(500);
    expect(useAnnouncer.getState().message).toBe("");
    wait(500);
    expect(useAnnouncer.getState().message).toBe("Facing north. 2 spots in view.");
  });

  it("stays silent for pointer gestures and for flights announced elsewhere", () => {
    renderWithProviders(<Harness />);
    report(90);
    wait(1000);
    act(() => useWorldStore.getState().send({ kind: "zoom", factor: 0.6 }));
    act(() => useWorldStore.getState().send({ kind: "flyTo", target: { x: 10, y: 0, z: 10 } }));
    report(180);
    wait(1000);
    expect(useAnnouncer.getState().nonce).toBe(0);
  });
});
