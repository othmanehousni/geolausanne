import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { setRepository } from "@/lib/data";
import { DemoRepository } from "@/lib/data/demo-repository";
import { MemoryStorage } from "@/test/memory-storage";
import { renderWithProviders } from "@/test/render";
import { ModerationConsole } from "../ModerationConsole";

let repo: DemoRepository;

/** A review is reported, then deleted by its author; a moderator opens the console. */
beforeEach(async () => {
  repo = new DemoRepository(new MemoryStorage());
  setRepository(repo);
  await repo.auth.signInWithEmail("owner@example.ch", "/");
  const place = await repo.createPlace({
    name: "Kebab du Flon",
    lon: 6.6285,
    lat: 46.521,
    category: "fast_food",
    cuisine: [],
    elevation: 480,
    address: null,
    website: null,
    phone: null,
    opening_hours: null,
    description: null,
    halal_level: "full",
    certification: "community",
    certifier: null,
    serves_alcohol: null,
  });
  await repo.auth.signInWithEmail("dan@example.ch", "/");
  await repo.upsertReview({ placeId: place.id, rating: 1, body: "rude words", halalConfirmed: false, confirmationMethod: null });
  await repo.auth.signInWithEmail("carla@example.ch", "/");
  const [review] = await repo.reviews(place.id);
  await repo.report({ reason: "offensive", reviewId: review.id });
  await repo.auth.signInWithEmail("dan@example.ch", "/");
  await repo.deleteMyReview(place.id);
  await repo.auth.signInWithEmail("mod@example.ch", "/");
});

describe("ModerationConsole", () => {
  it("keeps a deleted review readable and suspends its author after confirmation", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ModerationConsole />);

    const card = (await screen.findByText("rude words")).closest("li")!;
    expect(within(card).getByText("Deleted by its author after the report")).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "Hide review" })).toBeNull();

    await user.click(within(card).getByRole("button", { name: "Suspend the author" }));
    const confirm = await screen.findByRole("alertdialog", { name: /^Suspend member-/ });
    await user.click(within(confirm).getByRole("button", { name: "7 days" }));

    expect(await within(card).findByRole("button", { name: "Lift the suspension" })).toBeInTheDocument();
    expect(within(card).getByText(/Suspended until/)).toBeInTheDocument();

    await user.click(within(card).getByRole("button", { name: "Lift the suspension" }));
    expect(await within(card).findByRole("button", { name: "Suspend the author" })).toBeInTheDocument();
  });
});
