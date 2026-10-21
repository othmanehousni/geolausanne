import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";

type Messages = { [key: string]: string | Messages };

function keys(messages: Messages, prefix = ""): string[] {
  return Object.entries(messages).flatMap(([k, v]) =>
    typeof v === "string" ? [`${prefix}${k}`] : keys(v, `${prefix}${k}.`),
  );
}

function lookup(messages: Messages, path: string): string {
  return path.split(".").reduce<string | Messages>((node, k) => (node as Messages)[k]!, messages) as string;
}

/** Index of the brace closing the one opened at `start`. */
function closing(s: string, start: number): number {
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === "{") depth++;
    else if (s[i] === "}" && --depth === 0) return i;
  }
  return s.length;
}

/**
 * ICU argument names (`{count}`, `{count, plural, …}`) including those nested
 * in plural/select branches, plus rich-text tag names (`<link>`). Branch
 * texts such as `=0 {No spots}` are not arguments.
 */
function slots(text: string): string[] {
  const found = new Set<string>();
  const scan = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      if (s[i] !== "{") continue;
      const end = closing(s, i);
      const inner = s.slice(i + 1, end);
      const [name, type, ...rest] = inner.split(",");
      found.add(`{${name!.trim()}}`);
      if (type !== undefined && rest.length) {
        const branches = rest.join(",");
        for (let k = 0; k < branches.length; k++) {
          if (branches[k] !== "{") continue;
          const close = closing(branches, k);
          scan(branches.slice(k + 1, close));
          k = close;
        }
      }
      i = end;
    }
  };
  scan(text);
  for (const m of text.matchAll(/<(\w+)>/g)) found.add(`<${m[1]}>`);
  return [...found].sort();
}

describe("translations", () => {
  it("French and English define the same keys", () => {
    expect(keys(fr as Messages).sort()).toEqual(keys(en as Messages).sort());
  });

  it("every message has the same placeholders and tags in both languages", () => {
    for (const key of keys(en as Messages)) {
      expect(slots(lookup(fr as Messages, key)), key).toEqual(slots(lookup(en as Messages, key)));
    }
  });

  it("finds nested arguments but not plural branch texts", () => {
    expect(slots("{count, plural, =0 {No spots} one {# spot near {place}} other {# spots}}")).toEqual(["{count}", "{place}"]);
    expect(slots("Data <swisstopo>© swisstopo</swisstopo> by {name}")).toEqual(["<swisstopo>", "{name}"]);
  });
});
