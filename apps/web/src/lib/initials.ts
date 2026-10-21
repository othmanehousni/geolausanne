const graphemes = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;

/** The first user-perceived character: a letter with its accents, a whole emoji. */
function firstGrapheme(word: string): string {
  if (graphemes) return graphemes.segment(word)[Symbol.iterator]().next().value?.segment ?? "";
  return Array.from(word)[0] ?? "";
}

/**
 * Initials for an avatar: the first letters of the first and last words that
 * start with a letter ("Ana María Ruiz" → "AR", "🦊 Fox" → "F"). Null when
 * no word does, so the caller can show an icon instead.
 */
export function initials(name: string): string | null {
  const words = name.trim().split(/\s+/).filter((w) => /^\p{L}/u.test(w));
  if (words.length === 0) return null;
  const letters = words.length > 1 ? firstGrapheme(words[0]) + firstGrapheme(words[words.length - 1]) : firstGrapheme(words[0]);
  return letters.toLocaleUpperCase();
}
