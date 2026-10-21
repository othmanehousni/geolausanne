import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setRepository } from "@/lib/data";
import { DemoRepository } from "@/lib/data/demo-repository";
import { MemoryStorage } from "@/test/memory-storage";
import { renderWithProviders } from "@/test/render";
import { useUiStore } from "@/stores/ui-store";
import { SubmitPlaceDialog } from "../SubmitPlaceDialog";

vi.mock("@/lib/geo/geocoder", () => ({ reverseGeocode: async () => "Place de l'Europe 9, 1003 Lausanne" }));

let repo: DemoRepository;

beforeEach(async () => {
  repo = new DemoRepository(new MemoryStorage());
  setRepository(repo);
  await repo.auth.signInWithEmail("ana@example.ch", "/");
  useUiStore.setState({
    submitOpen: true,
    submitLocation: { easting: 2537900, northing: 1152600, elevation: 470, lon: 6.6325, lat: 46.5205 },
  });
});

afterEach(() => useUiStore.setState({ submitOpen: false, submitLocation: null }));

describe("SubmitPlaceDialog", () => {
  // types a long list with user-event, slow on a loaded machine: more than the default 5 s
  it("refuses more cuisines than the limit instead of dropping some, even with the section closed", async () => {
    const user = userEvent.setup();
    const create = vi.spyOn(repo, "createPlace");
    renderWithProviders(<SubmitPlaceDialog />);

    const form = await screen.findByRole("dialog", { name: "Add a halal spot" });
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Falafel du Flon");
    const more = screen.getByRole("button", { name: "More details" });
    await user.click(more);
    const cuisine = screen.getByRole("textbox", { name: "Cuisine" });
    await user.type(cuisine, "lebanese, syrian, falafel, kebab, grill, mezze, desserts, tea");
    // closed again: the field is hidden when the form is sent
    await user.click(more);
    expect(more).toHaveAttribute("aria-expanded", "false");

    await user.click(screen.getByRole("button", { name: "Add spot" }));

    expect(more).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText("Up to 6 cuisines: remove some")).toBeVisible();
    expect(cuisine).toHaveFocus();
    expect(create).not.toHaveBeenCalled();

    await user.clear(cuisine);
    await user.type(cuisine, "Lebanese, falafel");
    await user.click(screen.getByRole("button", { name: "Add spot" }));
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0][0]).toMatchObject({ name: "Falafel du Flon", cuisine: ["lebanese", "falafel"] });
    expect(await screen.findByText("Spot added. Thank you!")).toBeInTheDocument();
    expect(form).not.toBeInTheDocument();
  }, 20_000);
});
