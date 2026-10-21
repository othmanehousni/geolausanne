import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setRepository } from "@/lib/data";
import { DemoRepository } from "@/lib/data/demo-repository";
import type { Place } from "@/lib/data/types";
import { usePlacesStore } from "@/stores/places-store";
import { useWorldStore } from "@/stores/world-store";
import { MemoryStorage } from "@/test/memory-storage";
import { renderWithProviders } from "@/test/render";
import { BottomBar } from "../BottomBar";

// like the real component, the mock draws more than the number: hidden digit wheels
vi.mock("@number-flow/react", () => ({
  default: ({ value }: { value: number }) => (
    <span>
      {value}
      <span hidden>0123456789</span>
    </span>
  ),
}));

beforeEach(() => {
  setRepository(new DemoRepository(new MemoryStorage()));
  useWorldStore.setState({ picking: false });
});

describe("BottomBar", () => {
  it("names the list button by the spots in view, whatever the counter draws", () => {
    usePlacesStore.setState({ places: [{ id: "a" }, { id: "b" }] as Place[] });
    renderWithProviders(<BottomBar />);
    const list = screen.getByRole("button", { name: "2 spots in view" });
    // the name comes from text, not aria-label (WCAG 2.5.3: the label contains what is shown)
    expect(list).not.toHaveAttribute("aria-label");
    expect(list).toHaveAttribute("aria-haspopup", "dialog");
  });

  it("says when no spot is in view", () => {
    usePlacesStore.setState({ places: [] });
    renderWithProviders(<BottomBar />);
    expect(screen.getByRole("button", { name: "No spots in view" })).toBeInTheDocument();
  });

  it("steps aside while a location is being picked", () => {
    useWorldStore.setState({ picking: true });
    const { container } = renderWithProviders(<BottomBar />);
    expect(container.querySelector("button")).toBeNull();
  });
});
