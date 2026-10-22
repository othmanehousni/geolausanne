import type { CityManifest } from "@geolausanne/geo-types";
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setRepository } from "@/lib/data";
import { DemoRepository } from "@/lib/data/demo-repository";
import { useWorldStore } from "@/stores/world-store";
import { MemoryStorage } from "@/test/memory-storage";
import { renderWithProviders } from "@/test/render";
import { Attribution } from "../Attribution";

// next-intl's localized Link needs the Next.js router
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: React.ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

beforeEach(() => setRepository(new DemoRepository(new MemoryStorage())));
afterEach(() => useWorldStore.setState({ manifest: null }));

describe("Attribution", () => {
  it("says when only the small demo city that ships with the code is loaded", () => {
    useWorldStore.setState({ manifest: { area: "flon" } as CityManifest });
    renderWithProviders(<Attribution />);
    expect(screen.getByRole("button", { name: "Demo city" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Demo mode" })).toBeInTheDocument();
  });

  it("stays quiet about the city once the agglomeration is loaded", () => {
    useWorldStore.setState({ manifest: { area: "agglomeration" } as CityManifest });
    renderWithProviders(<Attribution />);
    expect(screen.queryByRole("button", { name: "Demo city" })).toBeNull();
    // the credits are always there
    expect(screen.getByRole("link", { name: /OpenStreetMap contributors/ })).toBeInTheDocument();
  });
});
