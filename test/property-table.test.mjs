import assert from "node:assert/strict";
import test from "node:test";
import fc from "fast-check";
import { parseTable } from "./.build/view.mjs";
import { FUZZ } from "./fixtures/fuzz.mjs";

// `parseTable` receives whatever is in a user's CSV. The example tests cover
// the shapes we thought of; these cover the combinations we did not.

const DELIMITERS = [",", "\t", ";", "|"];

/** An RFC 4180 writer that quotes every field, so any field text is legal. */
function writeTable(rows, delimiter) {
  const cell = (value) => `"${value.replace(/"/g, '""')}"`;
  return `${rows.map((row) => row.map(cell).join(delimiter)).join("\n")}\n`;
}

test("a written table parses back to the same rows", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...DELIMITERS),
      fc.array(
        fc.array(fc.string({ maxLength: 12 }), { minLength: 1, maxLength: 4 }),
        { minLength: 1, maxLength: 6 },
      ),
      (delimiter, rows) => {
        const table = parseTable(writeTable(rows, delimiter), delimiter);
        assert.deepEqual(table.header, rows[0]);
        assert.deepEqual(table.rows, rows.slice(1));
        assert.equal(table.truncated, false);
      },
    ),
    FUZZ,
  );
});

test("arbitrary input never throws and never keeps more rows than the limit", () => {
  fc.assert(
    fc.property(
      fc.string({ maxLength: 80 }),
      fc.constantFrom(...DELIMITERS),
      fc.integer({ min: 0, max: 5 }),
      (text, delimiter, limit) => {
        const table = parseTable(text, delimiter, limit);
        assert.ok(Array.isArray(table.header));
        assert.ok(
          table.rows.length <= limit,
          `kept ${table.rows.length} rows for limit ${limit}`,
        );
        if (table.truncated) assert.equal(table.rows.length, limit);
      },
    ),
    FUZZ,
  );
});

test("the limit is exact: `limit` rows is complete, `limit + 1` is truncated", () => {
  for (let limit = 0; limit <= 4; limit += 1) {
    const exact = ["h", ...Array.from({ length: limit }, (_, i) => `r${i}`)]
      .join("\n")
      .concat("\n");
    const complete = parseTable(exact, ",", limit);
    assert.equal(complete.rows.length, limit);
    assert.equal(
      complete.truncated,
      false,
      `${limit} rows with limit ${limit} reported truncation`,
    );

    const over = ["h", ...Array.from({ length: limit + 1 }, (_, i) => `r${i}`)]
      .join("\n")
      .concat("\n");
    const truncated = parseTable(over, ",", limit);
    assert.equal(truncated.rows.length, limit);
    assert.equal(truncated.truncated, true);
  }
});

test("a final row without a trailing newline still respects the limit", () => {
  const table = parseTable("h\na\nb\nc", ",", 2);
  assert.deepEqual(table.rows, [["a"], ["b"]]);
  assert.equal(table.truncated, true);
});

test("a quote inside an unquoted field is literal text", () => {
  const table = parseTable('name,note\nAda,He said "hi"\n', ",");
  assert.deepEqual(table.rows, [["Ada", 'He said "hi"']]);
});

test("quoted fields may hold the delimiter, a newline and a doubled quote", () => {
  const table = parseTable('a,b\n"x,y","line 1\nline 2"\n"say ""hi""",z\n', ",");
  assert.deepEqual(table.rows, [
    ["x,y", "line 1\nline 2"],
    ['say "hi"', "z"],
  ]);
});
