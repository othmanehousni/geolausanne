import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setRepository } from "@/lib/data";
import { DemoRepository } from "@/lib/data/demo-repository";
import { usePlace } from "@/lib/data/hooks";
import { useUiStore } from "@/stores/ui-store";
import { MemoryStorage } from "@/test/memory-storage";
import { renderWithProviders } from "@/test/render";
import { VoteControl } from "../VoteControl";

// the animated counter relies on browser animation APIs jsdom lacks
vi.mock("@number-flow/react", () => ({ default: ({ value }: { value: number }) => <span aria-hidden="true">{value}</span> }));

function Harness({ id }: { id: string }) {
  const { data } = usePlace(id);
  return data ? <VoteControl place={data} /> : null;
}

let repo: DemoRepository;
let placeId: string;
let placeName: string;

beforeEach(async () => {
  repo = new DemoRepository(new MemoryStorage());
  setRepository(repo);
  useUiStore.setState({ authOpen: false, authReason: null, authThen: null });
  const [first] = await repo.placesInBounds({ west: 6.5, south: 46.45, east: 6.8, north: 46.6 });
  placeId = first.id;
  placeName = first.name;
});

describe("VoteControl", () => {
  it("is a named group of two toggle buttons", async () => {
    renderWithProviders(<Harness id={placeId} />);
    const group = await screen.findByRole("group", { name: `Vote for ${placeName}` });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upvote" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Downvote" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Score 0")).toBeInTheDocument();
  });

  it("asks visitors to sign in, then resumes the vote", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness id={placeId} />);
    await user.click(await screen.findByRole("button", { name: "Upvote" }));
    const ui = useUiStore.getState();
    expect(ui).toMatchObject({ authOpen: true, authReason: "vote" });
    // sign-in completes without leaving the page (demo mode): the vote goes through
    await repo.auth.signInWithEmail("ann@example.ch", "/");
    ui.authThen?.();
    await waitFor(() => expect(screen.getByRole("button", { name: "Upvote" })).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByText("Score 1")).toBeInTheDocument();
  });

  it("lets members change and withdraw their vote", async () => {
    await repo.auth.signInWithEmail("bob@example.ch", "/");
    const user = userEvent.setup();
    renderWithProviders(<Harness id={placeId} />);
    const down = await screen.findByRole("button", { name: "Downvote" });
    await user.click(down);
    await waitFor(() => expect(down).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByText("Score -1")).toBeInTheDocument();
    await user.click(down);
    await waitFor(() => expect(down).toHaveAttribute("aria-pressed", "false"));
    expect(screen.getByText("Score 0")).toBeInTheDocument();
  });

  it("is disabled on the member's own spot", async () => {
    await repo.auth.signInWithEmail("owner@example.ch", "/");
    const mine = await repo.createPlace({
      name: "Chez Owner",
      lon: 6.62,
      lat: 46.52,
      category: "restaurant",
      cuisine: [],
      elevation: null,
      address: null,
      website: null,
      phone: null,
      opening_hours: null,
      description: null,
      halal_level: "full",
      certification: "self_declared",
      certifier: null,
      serves_alcohol: null,
    });
    renderWithProviders(<Harness id={mine.id} />);
    expect(await screen.findByText("You added this spot")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upvote" })).toBeDisabled();
  });
});
