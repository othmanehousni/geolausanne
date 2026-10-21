// @vitest-environment node
import { describe, expect, it } from "vitest";
import { safeNext } from "../AuthCallback";

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/fr?spot=abc", "/fr")).toBe("/fr?spot=abc");
  });
  it("rejects anything that could leave the site", () => {
    const bad = [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      // browsers strip tabs and newlines from URLs, turning these into "//evil.example"
      "/\t/evil.example",
      "/\n/evil.example",
      "/\r/evil.example",
      "javascript:alert(1)",
      "",
      null,
    ];
    for (const value of bad) expect(safeNext(value, "/en")).toBe("/en");
  });
  it("keeps encoded slashes inside the path", () => {
    expect(safeNext("/%2F%2Fevil.example", "/en")).toBe("/%2F%2Fevil.example");
  });
});
