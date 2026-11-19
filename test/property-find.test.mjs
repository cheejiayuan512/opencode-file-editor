import assert from "node:assert/strict";
import test from "node:test";
import fc from "fast-check";
import {
  findMatches,
  matchAt,
  matchIndexAt,
  replaceAll,
  stepMatch,
} from "./.build/find.mjs";
import { FUZZ } from "./fixtures/fuzz.mjs";

// A query is literal text. These properties keep the indices honest, because
// every one of them is fed back into `setSelectionRange`.

function fold(value, caseSensitive) {
  return caseSensitive ? value : value.toLowerCase();
}

test("matches are ordered, non-overlapping and point at the query", () => {
  fc.assert(
    fc.property(
      fc.string({ maxLength: 60 }),
      fc.string({ maxLength: 6 }),
      fc.boolean(),
      (text, query, caseSensitive) => {
        const matches = findMatches(text, query, { caseSensitive });
        let previousEnd = 0;
        for (const match of matches) {
          assert.ok(match.start >= previousEnd && match.end <= text.length);
          assert.ok(match.start < match.end);
          assert.equal(
            fold(text.slice(match.start, match.end), caseSensitive),
            fold(query, caseSensitive),
          );
          previousEnd = match.end;
        }
      },
    ),
    FUZZ,
  );
});

test("replaceAll reports every match and replaces only those spans", () => {
  fc.assert(
    fc.property(
      fc.string({ maxLength: 60 }),
      fc.string({ minLength: 1, maxLength: 6 }),
      fc.string({ maxLength: 6 }),
      fc.boolean(),
      (text, query, replacement, caseSensitive) => {
        const matches = findMatches(text, query, { caseSensitive });
        const result = replaceAll(text, query, replacement, { caseSensitive });
        assert.equal(result.count, matches.length);

        // Rebuilding from the reported spans must equal the function's answer.
        let rebuilt = "";
        let last = 0;
        for (const match of matches) {
          rebuilt += text.slice(last, match.start) + replacement;
          last = match.end;
        }
        rebuilt += text.slice(last);
        assert.equal(result.text, rebuilt);
      },
    ),
    FUZZ,
  );
});

test("replacing a case-sensitive query with itself is a no-op", () => {
  fc.assert(
    fc.property(
      fc.string({ maxLength: 60 }),
      fc.string({ minLength: 1, maxLength: 6 }),
      (text, query) => {
        const result = replaceAll(text, query, query, { caseSensitive: true });
        assert.equal(result.text, text);
      },
    ),
    FUZZ,
  );
});

test("stepping and the match count always land on a listed match", () => {
  fc.assert(
    fc.property(
      fc.string({ maxLength: 40 }),
      fc.string({ minLength: 1, maxLength: 4 }),
      fc.nat({ max: 100 }),
      fc.boolean(),
      (text, query, rawPosition, backwards) => {
        const matches = findMatches(text, query);
        const position = rawPosition % (text.length + 1);
        const found = stepMatch(matches, position, backwards);
        if (matches.length === 0) {
          assert.equal(found, undefined);
        } else {
          assert.ok(matches.includes(found));
        }

        const inside = matchAt(matches, position);
        if (inside) assert.ok(matches.includes(inside));
        if (matches.length > 0) {
          const index = matchIndexAt(matches, position);
          assert.ok(index >= 0 && index < matches.length);
        }
      },
    ),
    FUZZ,
  );
});

test("whole-word matches have a non-word character on both sides", () => {
  fc.assert(
    fc.property(
      fc.string({ maxLength: 60 }),
      fc.string({ minLength: 1, maxLength: 4 }),
      (text, query) => {
        for (const match of findMatches(text, query, { wholeWord: true })) {
          const before = match.start === 0 ? "" : text[match.start - 1];
          const after = match.end >= text.length ? "" : text[match.end];
          assert.ok(!/[A-Za-z0-9_]/.test(before ?? ""));
          assert.ok(!/[A-Za-z0-9_]/.test(after ?? ""));
        }
      },
    ),
    FUZZ,
  );
});
