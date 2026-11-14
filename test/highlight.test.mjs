import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_HIGHLIGHT_CHARS,
  detectLanguage,
  highlight,
  tokenize,
} from "./.build/highlight.mjs";

const texts = [
  "",
  "const x = 1;\n",
  "// a comment\nlet y = 'quote'; /* block */\n",
  'if (a < b) { return "x\\"y"; }\n',
  "def f(x):\n    return x  # note\n",
  "select * from t where a = 'x' -- note\n",
  "key = \"value\" # comment\nurl: http://x.y/#anchor\n",
  "#include <stdio.h>\nint main(void) { return 0; }\n",
  "const re = /a[/*]b/g;\n", // a regex that looks like a comment
  "/* unterminated\ncomment",
  "'unterminated string\nnext line",
];

test("tokens reproduce the input exactly", () => {
  // The one invariant a highlighter cannot break: drop a character and the
  // overlay no longer matches the textarea's own metrics.
  for (const language of ["js", "ts", "py", "sql", "yaml", "sh", "json", "plain"]) {
    for (const text of texts) {
      const joined = tokenize(text, language)
        .map((token) => token.text)
        .join("");
      assert.equal(joined, text, `${language}: ${JSON.stringify(text)}`);
    }
  }
});

test("no token is empty", () => {
  for (const token of tokenize("a // b\nc", "js"))
    assert.ok(token.text.length > 0, "empty token");
});

test("keywords are whole words only", () => {
  const kinds = (text, language) =>
    tokenize(text, language).map((token) => [token.text, token.kind]);
  assert.deepEqual(kinds("return", "js"), [["return", "keyword"]]);
  assert.deepEqual(kinds("returnValue", "js"), [["returnValue", "plain"]]);
  assert.deepEqual(kinds("my_return", "js"), [["my_return", "plain"]]);
});

test("SQL keywords are case-insensitive, C keywords are not", () => {
  assert.deepEqual(tokenize("SELECT", "sql"), [{ text: "SELECT", kind: "keyword" }]);
  assert.deepEqual(tokenize("Select", "sql"), [{ text: "Select", kind: "keyword" }]);
  assert.deepEqual(tokenize("SELECT", "c"), [{ text: "SELECT", kind: "plain" }]);
});

test("a string ends at the newline, a template string does not", () => {
  const single = tokenize("'broken\nnext", "js");
  assert.deepEqual(single[0], { text: "'broken", kind: "string" });
  assert.equal(single[1].kind, "plain");

  const template = tokenize("`a\nb`", "js");
  assert.deepEqual(template, [{ text: "`a\nb`", kind: "string" }]);
});

test("an escaped quote stays inside the string", () => {
  assert.deepEqual(tokenize('"a\\"b"', "js"), [
    { text: '"a\\"b"', kind: "string" },
  ]);
});

test("comments run to the end of the line, or to the terminator", () => {
  assert.deepEqual(tokenize("// all of it\ncode", "js"), [
    { text: "// all of it", kind: "comment" },
    { text: "\ncode", kind: "plain" },
  ]);
  const block = tokenize("/* a\nb */x", "js");
  assert.deepEqual(block[0], { text: "/* a\nb */", kind: "comment" });
  assert.deepEqual(block[1], { text: "x", kind: "plain" });
});

test("an unterminated comment is a comment to the end", () => {
  assert.deepEqual(tokenize("/* open", "js"), [
    { text: "/* open", kind: "comment" },
  ]);
});

test("a hash is a comment only where the format says so", () => {
  // YAML: after space, or at the start.
  assert.equal(tokenize("a # yes", "yaml")[1].kind, "comment");
  assert.equal(tokenize("# yes", "yaml")[0].kind, "comment");
  // A URL fragment stays text.
  const url = tokenize("http://x/#anchor", "yaml");
  assert.equal(url.every((token) => token.kind !== "comment"), true);
});

test("JSON has no // comment", () => {
  const tokens = tokenize("{\n // nope\n \"a\": 1\n}", "json");
  assert.equal(tokens.some((token) => token.kind === "comment"), false);
  assert.equal(
    tokens.find((token) => token.text === '"a"')?.kind,
    "string",
  );
});

test("numbers cover integers, decimals and exponents", () => {
  const digits = (text) =>
    tokenize(text, "js").filter((token) => token.kind === "number").map((t) => t.text);
  assert.deepEqual(digits("1 2.5 1e10 1.5e-3 1_000"), [
    "1",
    "2.5",
    "1e10",
    "1.5e-3",
    "1_000",
  ]);
  // A dot that is not part of a number is not swallowed.
  assert.deepEqual(digits("a.b"), []);
});

test("literals are separated from keywords", () => {
  assert.equal(tokenize("true", "js")[0].kind, "literal");
  assert.equal(tokenize("True", "py")[0].kind, "literal");
  assert.equal(tokenize("None", "py")[0].kind, "literal");
});

test("detectLanguage maps the extensions that matter", () => {
  assert.equal(detectLanguage("a.tsx"), "ts");
  assert.equal(detectLanguage("a.js"), "js");
  assert.equal(detectLanguage("a.json"), "json");
  assert.equal(detectLanguage("a.py"), "py");
  assert.equal(detectLanguage("a.yml"), "yaml");
  assert.equal(detectLanguage("a.rs"), "rust");
  assert.equal(detectLanguage("C:\\repo\\a.go"), "go");
  assert.equal(detectLanguage("a.md"), "plain");
  assert.equal(detectLanguage("Dockerfile"), "plain");
  assert.equal(detectLanguage("a.unknownext"), "plain");
});

test("highlight skips a language it cannot colour, and huge files", () => {
  assert.equal(highlight("text", "plain"), undefined);
  assert.ok(highlight("const x = 1;", "js"));

  const huge = "x".repeat(MAX_HIGHLIGHT_CHARS + 1);
  assert.equal(highlight(huge, "js"), undefined);
  // Exactly at the cap is still coloured.
  assert.ok(highlight("x".repeat(MAX_HIGHLIGHT_CHARS), "js"));
});

test("highlight returns undefined when a file has too many tokens", () => {
  // 12,000 is the display cap; a dense file past it falls back to plain text.
  const dense = '"a" '.repeat(8000);
  assert.equal(highlight(dense, "js"), undefined);
});
