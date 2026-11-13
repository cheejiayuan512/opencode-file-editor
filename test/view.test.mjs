import assert from "node:assert/strict";
import test from "node:test";
import {
  breadcrumbs,
  crumbTrail,
  delimiterFor,
  gutterText,
  isTablePath,
  parseTable,
} from "./.build/view.mjs";

test("breadcrumbs split both separators and keep the drive", () => {
  assert.deepEqual(breadcrumbs("C:\\Users\\JIAYUAN\\a.ts"), [
    "C:",
    "Users",
    "JIAYUAN",
    "a.ts",
  ]);
  assert.deepEqual(breadcrumbs("/etc/hosts"), ["etc", "hosts"]);
  assert.deepEqual(breadcrumbs("a.ts"), ["a.ts"]);
  assert.deepEqual(breadcrumbs(""), []);
});

test("crumbTrail pairs each segment with a real path", () => {
  assert.deepEqual(crumbTrail("C:/Users/X/a.ts"), [
    { name: "C:", path: "C:" },
    { name: "Users", path: "C:/Users" },
    { name: "X", path: "C:/Users/X" },
    { name: "a.ts", path: "C:/Users/X/a.ts" },
  ]);
});

test("crumbTrail normalizes backslashes", () => {
  assert.deepEqual(crumbTrail("C:\\Users\\a.ts"), [
    { name: "C:", path: "C:" },
    { name: "Users", path: "C:/Users" },
    { name: "a.ts", path: "C:/Users/a.ts" },
  ]);
});

test("crumbTrail keeps the root so a crumb resolves on POSIX", () => {
  // Regression: the segments came back relative ("Users/tim"), so clicking one
  // in the browser resolved it against the home directory instead.
  assert.deepEqual(crumbTrail("/Users/tim/Rep/a.ts"), [
    { name: "Users", path: "/Users" },
    { name: "tim", path: "/Users/tim" },
    { name: "Rep", path: "/Users/tim/Rep" },
    { name: "a.ts", path: "/Users/tim/Rep/a.ts" },
  ]);
  assert.deepEqual(crumbTrail("/etc/"), [{ name: "etc", path: "/etc" }]);
  assert.deepEqual(crumbTrail("src/a.ts"), [
    { name: "src", path: "src" },
    { name: "a.ts", path: "src/a.ts" },
  ]);
});

test("table paths and delimiters", () => {
  assert.equal(isTablePath("a.csv"), true);
  assert.equal(isTablePath("a.TSV"), true);
  assert.equal(isTablePath("a.tsv"), true);
  assert.equal(isTablePath("a.txt"), false);
  assert.equal(delimiterFor("a.csv"), ",");
  assert.equal(delimiterFor("a.tsv"), "\t");
});

test("parseTable reads a header and rows", () => {
  const table = parseTable("a,b\n1,2\n3,4\n", ",");
  assert.deepEqual(table.header, ["a", "b"]);
  assert.deepEqual(table.rows, [
    ["1", "2"],
    ["3", "4"],
  ]);
  assert.equal(table.truncated, false);
});

test("parseTable honours quoted fields", () => {
  const text = 'name,note\n"Smith, John","said ""hi""\nthen left"\n';
  const table = parseTable(text, ",");
  assert.deepEqual(table.rows, [["Smith, John", 'said "hi"\nthen left']]);
});

test("parseTable handles CRLF and a missing trailing newline", () => {
  const table = parseTable("a,b\r\n1,2\r\n3,4", ",");
  assert.deepEqual(table.header, ["a", "b"]);
  assert.deepEqual(table.rows, [
    ["1", "2"],
    ["3", "4"],
  ]);
});

test("parseTable caps the rows and reports truncation", () => {
  const body = Array.from({ length: 20 }, (_, i) => `${i},x`).join("\n");
  const table = parseTable(`n,v\n${body}\n`, ",", 5);
  assert.equal(table.rows.length, 5);
  assert.equal(table.truncated, true);
});

test("parseTable on empty input yields nothing", () => {
  const table = parseTable("", ",");
  assert.deepEqual(table.header, []);
  assert.deepEqual(table.rows, []);
});

test("parseTable reads tabs", () => {
  const table = parseTable("a\tb\n1\t2\n", "\t");
  assert.deepEqual(table.header, ["a", "b"]);
  assert.deepEqual(table.rows, [["1", "2"]]);
});

test("gutterText numbers logical lines", () => {
  assert.equal(gutterText(3, []), "1\n2\n3");
});

test("gutterText leaves a blank row per wrapped continuation", () => {
  assert.equal(gutterText(3, [1, 3, 1]), "1\n2\n\n\n3");
  assert.equal(gutterText(2, [4, 2]), "1\n\n\n\n2\n");
});

test("gutterText tolerates missing or zero row counts", () => {
  assert.equal(gutterText(3, [2]), "1\n\n2\n3");
  assert.equal(gutterText(2, [0, 1]), "1\n2");
});

test("gutterText always has one numbered row per line", () => {
  const rows = gutterText(5, [2, 1, 3])
    .split("\n")
    .filter((row) => row !== "");
  assert.deepEqual(rows, ["1", "2", "3", "4", "5"]);
});
