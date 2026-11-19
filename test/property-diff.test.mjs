import assert from "node:assert/strict";
import test from "node:test";
import fc from "fast-check";
import { counts, diffLines, toDisplay } from "./.build/diff.mjs";
import { FUZZ } from "./fixtures/fuzz.mjs";

// The diff is read-only by design: its whole job is to describe what Reload
// would drop and what Overwrite would drop, so the two sides must reconstruct
// exactly. A lost or duplicated line is a wrong decision.

function split(text) {
  if (text === "") return [];
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

test("the rows reconstruct both sides in order", () => {
  fc.assert(
    fc.property(
      fc.string({ maxLength: 100 }),
      fc.string({ maxLength: 100 }),
      (before, after) => {
        const rows = diffLines(before, after);
        assert.deepEqual(
          rows.filter((row) => row.kind !== "added").map((row) => row.text),
          split(before),
        );
        assert.deepEqual(
          rows.filter((row) => row.kind !== "removed").map((row) => row.text),
          split(after),
        );
      },
    ),
    FUZZ,
  );
});

test("line numbers move forward on each side and match the line counts", () => {
  fc.assert(
    fc.property(
      fc.string({ maxLength: 100 }),
      fc.string({ maxLength: 100 }),
      (before, after) => {
        const rows = diffLines(before, after);
        let oldNo = 1;
        let newNo = 1;
        for (const row of rows) {
          if (row.kind !== "added") assert.equal(row.oldNo, oldNo++);
          if (row.kind !== "removed") assert.equal(row.newNo, newNo++);
        }
        assert.equal(oldNo - 1, split(before).length);
        assert.equal(newNo - 1, split(after).length);
      },
    ),
    FUZZ,
  );
});

test("counts agrees with the rows", () => {
  fc.assert(
    fc.property(
      fc.string({ maxLength: 100 }),
      fc.string({ maxLength: 100 }),
      (before, after) => {
        const rows = diffLines(before, after);
        assert.deepEqual(counts(rows), {
          added: rows.filter((row) => row.kind === "added").length,
          removed: rows.filter((row) => row.kind === "removed").length,
        });
      },
    ),
    FUZZ,
  );
});

test("the display keeps every change and only compresses unchanged runs", () => {
  fc.assert(
    fc.property(
      fc.string({ maxLength: 100 }),
      fc.string({ maxLength: 100 }),
      fc.integer({ min: 0, max: 4 }),
      (before, after, context) => {
        const rows = diffLines(before, after);
        const display = toDisplay(rows, context);
        const shown = display.filter((row) => row.kind !== "gap");
        const gaps = display.filter((row) => row.kind === "gap");

        assert.ok(display.length <= rows.length);
        assert.ok(gaps.every((gap) => gap.count > 0));
        assert.equal(
          gaps.reduce((total, gap) => total + gap.count, 0) + shown.length,
          rows.length,
        );

        // Every changed row is on screen, in its original order.
        const changed = rows.filter((row) => row.kind !== "same");
        for (const row of changed) assert.ok(shown.includes(row));
        assert.deepEqual(
          shown.filter((row) => row.kind !== "same"),
          changed,
        );
      },
    ),
    FUZZ,
  );
});
