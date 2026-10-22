import { describe, expect, it } from "vitest";
import { signInMethods } from "@/lib/data";

describe("signInMethods (NEXT_PUBLIC_AUTH_PROVIDERS)", () => {
  it("offers e-mail links alone when nothing is listed", () => {
    expect(signInMethods(undefined)).toEqual({ emailSignIn: true, providers: [] });
    expect(signInMethods("")).toEqual({ emailSignIn: true, providers: [] });
  });

  it("offers only the listed OAuth providers, in the listed order, without e-mail", () => {
    expect(signInMethods("github,google")).toEqual({ emailSignIn: false, providers: ["github", "google"] });
  });

  it("adds e-mail links when listed, whatever the spacing, case and repeats", () => {
    expect(signInMethods(" Google , email,google ")).toEqual({ emailSignIn: true, providers: ["google"] });
  });

  it("falls back to e-mail links when nothing usable is listed, so sign-in never disappears", () => {
    expect(signInMethods("gogle, facebook")).toEqual({ emailSignIn: true, providers: [] });
  });
});
