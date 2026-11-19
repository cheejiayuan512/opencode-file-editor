import assert from "node:assert/strict";
import test from "node:test";
import fc from "fast-check";
import { INDENT, indentLines, outdentLines, toggleComment } from "./.build/edit.mjs";
import { FUZZ } from "./fixtures/fuzz.mjs";

// Indent and comment are inverse pairs for the common case. A regression here
// is work loss: 0.5.2 shipped with Shift+Tab doing nothing at column 0.

test("outdent undoes indent for a whole-text selection", () => {
  fc.assert(
    fc.property(fc.string({ maxLength: 80 }), (text) => {
      // An empty text is a bare caret: indent inserts a unit, but a line that
      // is only whitespace is blank by design, so outdent leaves it.
      fc.pre(text.length > 0);
      const indented = indentLines(text, 0, text.length);
      const back = outdentLines(indented.text, 0, indented.text.length);
      assert.equal(back.text, text);
    }),
    FUZZ,
  );
});

test("toggleComment twice restores a block that was not already commented", () => {
  fc.assert(
    fc.property(fc.string({ maxLength: 80 }), (text) => {
      const token = "//";
      fc.pre(
        !text
          .split("\n")
          .some(
            (line) =>
              line.trim() !== "" && line.trimStart().startsWith(token),
          ),
      );
      const once = toggleComment(text, 0, text.length, token);
      const twice = toggleComment(once.text, 0, once.text.length, token);
      assert.equal(twice.text, text);
    }),
    FUZZ,
  );
});

test("every edit returns a caret that is inside the new text", () => {
  fc.assert(
    fc.property(
      fc.string({ maxLength: 80 }),
      fc.nat({ max: 200 }),
      fc.nat({ max: 200 }),
      (text, a, b) => {
        const start = a % (text.length + 1);
        const end = b % (text.length + 1);
        const results = [
          indentLines(text, start, end),
          outdentLines(text, start, end),
          toggleComment(text, start, end, "#"),
        ];
        for (const result of results) {
          assert.ok(result.start >= 0 && result.start <= result.text.length);
          assert.ok(result.end >= 0 && result.end <= result.text.length);
          assert.ok(result.start <= result.end);
        }
      },
    ),
    FUZZ,
  );
});

test("indent uses the unit it was given", () => {
  fc.assert(
    fc.property(fc.string({ maxLength: 40 }), fc.constantFrom(INDENT, "\t", "    "), (text, unit) => {
      const result = indentLines(text, 0, 0, unit);
      assert.equal(result.text, unit + text);
      assert.equal(result.start, unit.length);
    }),
    FUZZ,
  );
});
