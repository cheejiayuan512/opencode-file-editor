import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTEXT,
  MAX_CELLS,
  counts,
  diffLines,
  toDisplay,
} from "./.build/diff.mjs";

const text = (...lines) => (lines.length ? `${lines.join("\n")}\n` : "");

test("identical texts have no changes", () => {
  const rows = diffLines(text("a", "b"), text("a", "b"));
  assert.deepEqual(counts(rows), { added: 0, removed: 0 });
  assert.deepEqual(
    rows.map((row) => row.kind),
    ["same", "same"],
  );
});

test("an edit in the middle keeps numbering on both sides", () => {
  const rows = diffLines(text("a", "b", "c"), text("a", "B", "c"));
  assert.deepEqual(rows, [
    { kind: "same", text: "a", oldNo: 1, newNo: 1 },
    { kind: "removed", text: "b", oldNo: 2 },
    { kind: "added", text: "B", newNo: 2 },
    { kind: "same", text: "c", oldNo: 3, newNo: 3 },
  ]);
  assert.deepEqual(counts(rows), { added: 1, removed: 1 });
});

test("an insertion at the top shifts only the new numbering", () => {
  const rows = diffLines(text("a", "b"), text("new", "a", "b"));
  assert.deepEqual(rows[0], { kind: "added", text: "new", newNo: 1 });
  assert.deepEqual(rows[1], { kind: "same", text: "a", oldNo: 1, newNo: 2 });
  assert.deepEqual(rows.at(-1), { kind: "same", text: "b", oldNo: 2, newNo: 3 });
});

test("a deletion at the end leaves the trailing lines alone", () => {
  const rows = diffLines(text("a", "b", "c"), text("a", "b"));
  assert.deepEqual(rows.at(-1), { kind: "removed", text: "c", oldNo: 3 });
  assert.deepEqual(counts(rows), { added: 0, removed: 1 });
});

test("a trailing newline is not a line", () => {
  // Both spellings are the same file; a diff must not invent a last line.
  assert.deepEqual(counts(diffLines("a\nb", "a\nb\n")), { added: 0, removed: 0 });
  // An empty text has no lines at all, so one newline is one empty line.
  assert.deepEqual(diffLines("", "\n"), [
    { kind: "added", text: "", newNo: 1 },
  ]);
});

test("an empty file is all additions, and the reverse", () => {
  assert.deepEqual(diffLines("", text("a", "b")), [
    { kind: "added", text: "a", newNo: 1 },
    { kind: "added", text: "b", newNo: 2 },
  ]);
  assert.deepEqual(diffLines(text("a"), ""), [
    { kind: "removed", text: "a", oldNo: 1 },
  ]);
});

test("blank lines inside a file are real lines", () => {
  const rows = diffLines(text("a", "", "b"), text("a", "", "b", ""));
  // "a\n\nb\n" is 3 lines; "a\n\nb\n\n" adds a 4th, empty one.
  assert.deepEqual(counts(rows), { added: 1, removed: 0 });
  assert.deepEqual(rows.at(-1), { kind: "added", text: "", newNo: 4 });
});

test("an unchanged run collapses to one gap row", () => {
  const before = text(...Array.from({ length: 100 }, (_, i) => `line ${i}`));
  const after = before.replace("line 50", "line fifty");
  const display = toDisplay(diffLines(before, after));

  const gaps = display.filter((row) => row.kind === "gap");
  assert.equal(gaps.length, 2, "one gap before and one after the change");

  // The change is surrounded by CONTEXT lines on each side.
  const start = display.findIndex(
    (row) => row.kind !== "gap" && row.text === "line 50",
  );
  assert.ok(start > 0, "no change row found");
  const sameBefore = display.slice(1, start).filter((r) => r.kind === "same");
  assert.equal(sameBefore.length, CONTEXT);

  // The gaps account for every unchanged line that is not shown.
  const hidden = gaps.reduce((sum, row) => sum + row.count, 0);
  const shownSame = display.filter((row) => row.kind === "same").length;
  assert.equal(hidden + shownSame, 99, "unchanged lines went missing");
});

test("an unchanged file displays as a single gap", () => {
  const display = toDisplay(diffLines(text("a", "b", "c"), text("a", "b", "c")));
  assert.deepEqual(display, [{ kind: "gap", count: 3 }]);
});

test("line numbers only move forward on each side", () => {
  const before = text("a", "b", "c", "d", "e");
  const after = text("a", "x", "c", "y", "d", "e");
  const rows = diffLines(before, after);

  let oldLast = 0;
  let newLast = 0;
  for (const row of rows) {
    if (row.oldNo !== undefined) {
      assert.equal(row.oldNo, oldLast + 1, `old ${row.oldNo} after ${oldLast}`);
      oldLast = row.oldNo;
    }
    if (row.newNo !== undefined) {
      assert.equal(row.newNo, newLast + 1, `new ${row.newNo} after ${newLast}`);
      newLast = row.newNo;
    }
  }
  assert.equal(oldLast, 5);
  assert.equal(newLast, 6);
});

test("a huge rewrite answers instead of hanging", () => {
  // Both sides differ entirely, so the LCS table would be past the cap.
  const size = Math.ceil(Math.sqrt(MAX_CELLS)) + 50;
  const before = text(...Array.from({ length: size }, (_, i) => `a${i}`));
  const after = text(...Array.from({ length: size }, (_, i) => `b${i}`));

  const started = Date.now();
  const rows = diffLines(before, after);
  const took = Date.now() - started;

  assert.deepEqual(counts(rows), { added: size, removed: size });
  assert.ok(took < 2000, `took ${took}ms`);
});

test("context is configurable and a gap is never zero", () => {
  const before = text("a", "b", "c", "d", "e");
  const after = text("a", "b", "C", "d", "e");
  const none = toDisplay(diffLines(before, after), 0);
  assert.equal(none.filter((row) => row.kind === "same").length, 0);
  for (const row of none)
    if (row.kind === "gap") assert.ok(row.count > 0, "empty gap row");
});
