// @vitest-environment node
import { describe, expect, it } from "vitest";
import { safeNext } from "../AuthCallback";

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/fr?spot=abc", "/fr")).toBe("/fr?spot=abc");
  });
  it("rejects anything that could leave the site", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "", null]) {
      expect(safeNext(bad, "/en")).toBe("/en");
    }
  });
});
