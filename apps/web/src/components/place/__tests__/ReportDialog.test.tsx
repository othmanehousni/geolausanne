import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setRepository } from "@/lib/data";
import { DemoRepository } from "@/lib/data/demo-repository";
import { MemoryStorage } from "@/test/memory-storage";
import { renderWithProviders } from "@/test/render";
import { ReportDialog, type ReportTarget } from "../ReportDialog";

let repo: DemoRepository;

beforeEach(async () => {
  repo = new DemoRepository(new MemoryStorage());
  setRepository(repo);
  await repo.auth.signInWithEmail("carla@example.ch", "/");
});

/** The dialog as PlaceDetails uses it: one target at a time, reopened for another. */
function Harness() {
  const [target, setTarget] = useState<ReportTarget | null>(null);
  return (
    <>
      <button type="button" onClick={() => setTarget({ placeId: "osm-0", name: "Kebab du Flon" })}>
        report spot
      </button>
      <button type="button" onClick={() => setTarget({ reviewId: "r-1", name: "Kebab du Flon" })}>
        report review
      </button>
      <ReportDialog target={target} onClose={() => setTarget(null)} />
    </>
  );
}

describe("ReportDialog", () => {
  it("starts every report afresh: no reason or error left from the last one", async () => {
    const user = userEvent.setup();
    const report = vi.spyOn(repo, "report").mockResolvedValue();
    renderWithProviders(<Harness />);

    // a spot report: send without a reason, then pick one and cancel
    await user.click(screen.getByRole("button", { name: "report spot" }));
    await user.click(await screen.findByRole("button", { name: "Send report" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose what is wrong");
    await user.click(screen.getByRole("radio", { name: "It has closed" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    // a review report: only review reasons, nothing chosen, no stale error
    await user.click(screen.getByRole("button", { name: "report review" }));
    const dialog = await screen.findByRole("dialog");
    expect(screen.queryByRole("radio", { name: "It has closed" })).toBeNull();
    expect(screen.getAllByRole("radio").map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "false", "false"]);
    expect(screen.queryByRole("alert")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Send report" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose what is wrong");
    expect(report).not.toHaveBeenCalled();

    await user.click(screen.getByRole("radio", { name: "Spam" }));
    await user.click(screen.getByRole("button", { name: "Send report" }));
    expect(report).toHaveBeenCalledWith({ reason: "spam", placeId: undefined, reviewId: "r-1", details: undefined });
    expect(await screen.findByText("Report sent to the moderators")).toBeInTheDocument();
    expect(dialog).not.toBeInTheDocument();
  });
});
