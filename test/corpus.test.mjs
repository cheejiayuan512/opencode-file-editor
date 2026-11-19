import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { detectLanguage, highlight } from "./.build/highlight.mjs";
import { delimiterFor, parseTable } from "./.build/view.mjs";

// Real files instead of generated ones: the repository's own source and the
// samples the README tells users to open. If the tokenizer or the table reader
// cannot survive the files we ship, a property about random text will not save
// us.

const SOURCE = readdirSync("src")
  .filter((name) => /\.tsx?$/.test(name))
  .map((name) => `src/${name}`);

const SAMPLES = readdirSync("docs/samples").map((name) => `docs/samples/${name}`);

for (const path of [...SOURCE, ...SAMPLES]) {
  const text = readFileSync(path, "utf8");

  test(`${path} survives the tokenizer`, () => {
    const tokens = highlight(text, detectLanguage(path));
    if (!tokens) return; // plain, or over the size cap by design
    assert.equal(tokens.map((token) => token.text).join(""), text);
  });
}

for (const path of SAMPLES.filter((name) => /\.(csv|tsv)$/i.test(name))) {
  const text = readFileSync(path, "utf8");

  test(`${path} parses with a stable column count`, () => {
    const table = parseTable(text, delimiterFor(path));
    assert.ok(table.header.length > 0);
    assert.equal(table.truncated, false);
    for (const row of table.rows) {
      assert.equal(
        row.length,
        table.header.length,
        `${path} row ${JSON.stringify(row)} has a different column count`,
      );
    }
  });
}
