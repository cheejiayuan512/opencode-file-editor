import assert from "node:assert/strict";
import test from "node:test";
import {
  findMatches,
  matchAt,
  matchIndexAt,
  replaceAll,
  stepMatch,
} from "./.build/find.mjs";

const text = "alpha Beta beta ALPHA alpha";

test("an empty query matches nothing", () => {
  assert.deepEqual(findMatches("abc", ""), []);
  assert.deepEqual(findMatches("", "a"), []);
});

test("matches are case-insensitive by default and in order", () => {
  const matches = findMatches(text, "beta");
  assert.equal(matches.length, 2);
  assert.deepEqual(matches[0], { start: 6, end: 10 });
  assert.equal(text.slice(matches[1].start, matches[1].end), "beta");
  assert.equal(matches[1].start, 11);
});

test("case sensitivity and whole words are opt-in", () => {
  // "alpha", "ALPHA" and "alpha": three spells, one query.
  assert.equal(findMatches(text, "alpha").length, 3);
  assert.equal(findMatches(text, "ALPHA", { caseSensitive: true }).length, 1);
  assert.equal(findMatches(text, "alpha", { caseSensitive: true }).length, 2);

  const word = findMatches("cat concat cats", "cat", { wholeWord: true });
  assert.equal(word.length, 1);
  assert.equal(word[0].start, 0);

  // A match at the very start and very end has an implicit boundary.
  assert.equal(findMatches("cat", "cat", { wholeWord: true }).length, 1);
  assert.equal(findMatches("cat.txt", "txt", { wholeWord: true }).length, 1);
  assert.equal(findMatches("catalog", "cat", { wholeWord: true }).length, 0);
});

test("a query is literal, never a pattern", () => {
  assert.deepEqual(findMatches("a.b aXb", "a.b"), [{ start: 0, end: 3 }]);
  // The characters that would be a class or an anchor in a regex.
  assert.deepEqual(findMatches("f(x) [y] *z", "f(x)"), [{ start: 0, end: 4 }]);
  assert.deepEqual(findMatches("f(x)", "*"), []);
});

test("matches do not overlap", () => {
  // Overlapping "aa" in "aaaa" would be positions 0 and 2; a find-next that
  // returned 1 would never make progress in a replace-all.
  assert.deepEqual(findMatches("aaaa", "aa"), [
    { start: 0, end: 2 },
    { start: 2, end: 4 },
  ]);
});

test("stepping wraps in both directions", () => {
  const matches = findMatches(text, "alpha");
  assert.deepEqual(
    matches.map((match) => match.start),
    [0, 16, 22],
  );

  assert.equal(stepMatch(matches, 0).start, 0);
  assert.equal(stepMatch(matches, 1).start, 16);
  assert.equal(stepMatch(matches, 22).start, 22);
  assert.equal(stepMatch(matches, 30).start, 0, "wraps past the end");

  assert.equal(stepMatch(matches, 22, true).start, 16);
  assert.equal(stepMatch(matches, 0, true).start, 22, "wraps before the start");
  assert.equal(stepMatch([], 0), undefined);
});

test("the caret's match is the one highlighted in the count", () => {
  const matches = findMatches(text, "beta");
  assert.equal(matchIndexAt(matches, 7), 0);
  assert.equal(matchIndexAt(matches, 12), 1);
  assert.equal(matchIndexAt(matches, 0), 0, "off a match, the first is current");
});

test("matchAt finds the match the caret is inside or at the end of", () => {
  const matches = findMatches(text, "beta");
  // 6..10 is "Beta".
  assert.deepEqual(matchAt(matches, 6), { start: 6, end: 10 });
  assert.deepEqual(matchAt(matches, 8), { start: 6, end: 10 }, "inside");
  assert.deepEqual(matchAt(matches, 10), { start: 6, end: 10 }, "at the end");
  assert.deepEqual(
    matchAt(matches, 11),
    { start: 11, end: 15 },
    "the next match starts there",
  );
  assert.equal(matchAt(matches, 0), undefined, "outside every match");
  assert.equal(matchAt([], 0), undefined);
});

test("replace all replaces every match and reports the count", () => {
  const result = replaceAll("one two one", "one", "1");
  assert.deepEqual(result, { text: "1 two 1", count: 2 });

  assert.deepEqual(replaceAll("abc", "x", "y"), { text: "abc", count: 0 });
});

test("a replacement is literal text", () => {
  // `$&` is a pattern in some editors; here it means those two characters.
  assert.deepEqual(replaceAll("a a", "a", "$&"), { text: "$& $&", count: 2 });
  assert.deepEqual(replaceAll("x", "x", "\\n"), { text: "\\n", count: 1 });
});

test("replace all keeps the text it was not asked to touch", () => {
  const source = "const x = 1;\nconst xx = 2;\nconst x = 3;\n";
  const result = replaceAll(source, "const", "let");
  assert.equal(result.count, 3);
  assert.equal(
    result.text,
    "let x = 1;\nlet xx = 2;\nlet x = 3;\n",
  );
});
