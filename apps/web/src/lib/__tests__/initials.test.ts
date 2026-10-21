import { describe, expect, it } from "vitest";
import { initials } from "../initials";

describe("initials", () => {
  it("takes the first letters of the first and last words", () => {
    expect(initials("Ana María Ruiz")).toBe("AR");
    expect(initials("  lea  ")).toBe("L");
  });

  it("keeps accented letters whole, decomposed or not", () => {
    expect(initials("élise Ündüz")).toBe("ÉÜ");
    expect(initials("e\u0301lise")).toBe("E\u0301");
  });

  it("skips words that do not start with a letter", () => {
    expect(initials("🦊 Fox")).toBe("F");
    expect(initials("Sam 🍔")).toBe("S");
  });

  it("returns null when no word starts with a letter", () => {
    expect(initials("🦊")).toBeNull();
    expect(initials("42")).toBeNull();
    expect(initials("")).toBeNull();
  });
});
