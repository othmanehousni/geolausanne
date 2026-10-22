import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../../../messages/en.json";
import { setRepository } from "@/lib/data";
import { DemoRepository } from "@/lib/data/demo-repository";
import type { AuthAdapter } from "@/lib/data/repository";
import { BackendError } from "@/lib/data/types";
import { useUiStore } from "@/stores/ui-store";
import { MemoryStorage } from "@/test/memory-storage";
import { renderWithProviders } from "@/test/render";
import { AuthDialog } from "../AuthDialog";

/** The demo repository with the sign-in methods of a deployment. */
function withAuth(overrides: Partial<AuthAdapter>) {
  const repo = new DemoRepository(new MemoryStorage());
  Object.assign(repo.auth, overrides);
  setRepository(repo);
}

beforeEach(() => useUiStore.getState().openAuth(null));
afterEach(() => {
  useUiStore.getState().closeAuth();
  setRepository(null);
});

describe("AuthDialog", () => {
  it("offers only the OAuth providers when e-mail links are off (no SMTP server yet)", () => {
    withAuth({ emailSignIn: false, providers: ["google", "github"] });
    renderWithProviders(<AuthDialog />);
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with GitHub" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Email address" })).toBeNull();
    expect(screen.queryByText("or")).toBeNull();
    expect(screen.getByText(messages.auth.descriptionAccounts)).toBeInTheDocument();
  });

  it("shows a provider's error under its button when there is no e-mail form", async () => {
    withAuth({
      emailSignIn: false,
      providers: ["github"],
      signInWithOAuth: vi.fn().mockRejectedValue(new BackendError("network")),
    });
    renderWithProviders(<AuthDialog />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with GitHub" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(messages.errors.network);
  });

  it("puts the e-mail form after the providers when both are offered", () => {
    withAuth({ emailSignIn: true, providers: ["github"] });
    renderWithProviders(<AuthDialog />);
    expect(screen.getByRole("button", { name: "Continue with GitHub" })).toBeInTheDocument();
    expect(screen.getByText("or")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Email address" })).toBeInTheDocument();
  });
});
