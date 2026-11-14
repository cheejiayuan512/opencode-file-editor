// Find and replace over the open file.
//
// Literal, not regular expressions: this is a textarea, and a query typed with
// the intent to find `foo` must never become a pattern that throws or matches
// everything. Case folding is applied per slice so a match index always points
// into the original text, which is what the textarea needs.

export type Match = { start: number; end: number };

export type FindOptions = {
  /** Fold ASCII case. Off by default, like the rest of the app's search. */
  caseSensitive?: boolean;
  /** Require a non-word character (or an end) on both sides. */
  wholeWord?: boolean;
};

const WORD = /[A-Za-z0-9_]/;

function isWordBoundary(text: string, start: number, end: number) {
  const before = start === 0 ? "" : text[start - 1];
  const after = end >= text.length ? "" : text[end];
  return !WORD.test(before ?? "") && !WORD.test(after ?? "");
}

/** Every non-overlapping match, in order. An empty query matches nothing. */
export function findMatches(
  text: string,
  query: string,
  options: FindOptions = {},
): Match[] {
  const { caseSensitive = false, wholeWord = false } = options;
  if (query === "") return [];

  // Slicing keeps indices honest: a lowercase form that changes length (some
  // Unicode letters do) simply fails to match instead of shifting everything.
  const matches: Match[] = [];
  const needle = caseSensitive ? query : query.toLowerCase();
  const last = text.length - query.length;

  for (let i = 0; i <= last; i += 1) {
    const slice = text.slice(i, i + query.length);
    if ((caseSensitive ? slice : slice.toLowerCase()) !== needle) continue;
    if (wholeWord && !isWordBoundary(text, i, i + query.length)) continue;
    matches.push({ start: i, end: i + query.length });
    i += query.length - 1;
  }
  return matches;
}

/**
 * The next match at or after `position`, wrapping; backwards, the previous one
 * at or before it. `undefined` when there is nothing to move to.
 */
export function stepMatch(
  matches: readonly Match[],
  position: number,
  backwards = false,
): Match | undefined {
  if (matches.length === 0) return undefined;
  if (backwards) {
    for (let i = matches.length - 1; i >= 0; i -= 1)
      if (matches[i].start < position) return matches[i];
    return matches[matches.length - 1];
  }
  for (const match of matches) if (match.start >= position) return match;
  return matches[0];
}

/** Which match index a caret sits on, for "3 of 17". */
export function matchIndexAt(matches: readonly Match[], position: number) {
  const index = matches.findIndex(
    (match) => position >= match.start && position < match.end,
  );
  return index === -1 ? 0 : index;
}

/**
 * Replace every match. The replacement is literal: `$&` stays `$&`, because a
 * user typing it means those two characters.
 */
export function replaceAll(
  text: string,
  query: string,
  replacement: string,
  options: FindOptions = {},
): { text: string; count: number } {
  const matches = findMatches(text, query, options);
  if (matches.length === 0) return { text, count: 0 };

  let out = "";
  let last = 0;
  for (const match of matches) {
    out += text.slice(last, match.start) + replacement;
    last = match.end;
  }
  return { text: out + text.slice(last), count: matches.length };
}
