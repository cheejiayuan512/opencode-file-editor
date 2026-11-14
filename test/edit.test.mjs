import assert from "node:assert/strict";
import test from "node:test";
import {
  INDENT,
  commentToken,
  indentLines,
  lineBlock,
  outdentLines,
  toggleComment,
} from "./.build/edit.mjs";

test("a caret indents by one unit and stays after it", () => {
  const result = indentLines("abc", 1, 1);
  assert.equal(result.text, "a  bc");
  assert.equal(result.start, 3);
  assert.equal(result.end, 3);
});

test("a selection indents every line it touches", () => {
  const text = "one\ntwo\nthree";
  // From inside "one" to the end of "two".
  const result = indentLines(text, 1, 7);
  assert.equal(result.text, "  one\n  two\nthree");
  assert.equal(result.text.slice(result.start, result.end), "  one\n  two");
});

test("a selection ending at a line start does not indent that line", () => {
  // The classic off-by-one: dragging from line 1 through its newline selects
  // nothing of line 2, so only line 1 may change.
  const text = "one\ntwo\nthree";
  const result = indentLines(text, 0, 4);
  assert.equal(result.text, "  one\ntwo\nthree");
});

test("blank lines are left blank", () => {
  const text = "one\n\nthree";
  assert.equal(indentLines(text, 0, text.length).text, "  one\n\n  three");
});

test("outdent undoes indent", () => {
  const text = "  one\n  two";
  const result = outdentLines(text, 0, text.length);
  assert.equal(result.text, "one\ntwo");

  // And again, on text that was never indented by us.
  assert.equal(outdentLines("one\n  two", 0, 9).text, "one\ntwo");
});

test("outdent takes back a tab or a partial unit", () => {
  assert.equal(outdentLines("\tone", 0, 4).text, "one");
  assert.equal(outdentLines(" one", 0, 4).text, "one");
  // Nothing to take: the line is untouched.
  assert.equal(outdentLines("one", 0, 3).text, "one");
});

test("a caret outdents the line wherever it sits in the indentation", () => {
  const text = "    value";
  const atEnd = outdentLines(text, 9, 9);
  assert.equal(atEnd.text, "  value");
  assert.equal(atEnd.start, 7);

  // Column 0 outdents too: Shift+Tab at the start of a line is the common case.
  const atStart = outdentLines(text, 0, 0);
  assert.equal(atStart.text, "  value");
  assert.equal(atStart.start, 0);

  // Inside the indentation the whole unit moves, not just the spaces to the
  // left of the caret, and the caret cannot end up before the line.
  const inside = outdentLines(text, 1, 1);
  assert.equal(inside.text, "  value");
  assert.equal(inside.start, 0);

  // A line with no indentation is left alone.
  assert.deepEqual(outdentLines("value", 2, 2), {
    text: "value",
    start: 2,
    end: 2,
  });
});

test("lineBlock reports the whole lines a selection covers", () => {
  const text = "aa\nbb\ncc";
  assert.deepEqual(lineBlock(text, 0, 0), { first: 0, last: 2 });
  assert.deepEqual(lineBlock(text, 1, 1), { first: 0, last: 2 });
  assert.deepEqual(lineBlock(text, 1, 4), { first: 0, last: 5 });
  assert.deepEqual(lineBlock(text, 3, 3), { first: 3, last: 5 });
  assert.deepEqual(lineBlock(text, 7, 7), { first: 6, last: 8 });
  assert.deepEqual(lineBlock(text, 0, text.length), { first: 0, last: 8 });
});

test("toggleComment adds the token and keeps indentation", () => {
  const text = "  value\nother";
  const result = toggleComment(text, 0, 11, "//");
  assert.equal(result.text, "  // value\n// other");
});

test("toggleComment removes the token it added", () => {
  const added = toggleComment("value", 0, 5, "//");
  assert.equal(added.text, "// value");
  const removed = toggleComment(added.text, 0, added.text.length, "//");
  assert.equal(removed.text, "value");
});

test("a partly commented block gains a comment on every line", () => {
  const text = "// one\ntwo";
  assert.equal(toggleComment(text, 0, 10, "//").text, "// // one\n// two");
});

test("toggleComment skips blank lines", () => {
  const text = "a\n\nb";
  const result = toggleComment(text, 0, text.length, "#");
  assert.equal(result.text, "# a\n\n# b");
  // And removing leaves them blank.
  assert.equal(
    toggleComment(result.text, 0, result.text.length, "#").text,
    "a\n\nb",
  );
});

test("a blank block is not treated as commented", () => {
  const text = "\n\n";
  assert.equal(toggleComment(text, 0, 2, "//").text, "\n\n");
});

test("the selection covers the comment block", () => {
  const result = toggleComment("a\nb", 0, 3, "//");
  assert.equal(result.text.slice(result.start, result.end), "// a\n// b");
});

test("a comment token exists only where the format has one", () => {
  assert.equal(commentToken("src/a.ts"), "//");
  assert.equal(commentToken("src/a.tsx"), "//");
  assert.equal(commentToken("C:\\repo\\main.go"), "//");
  assert.equal(commentToken("script.py"), "#");
  assert.equal(commentToken("deploy.yaml"), "#");
  assert.equal(commentToken("query.sql"), "--");
  assert.equal(commentToken("Dockerfile"), "#", "a file with no extension");
  assert.equal(commentToken("data.json"), undefined, "JSON has no comments");
  assert.equal(commentToken("style.css"), undefined);
  assert.equal(commentToken("notes.md"), undefined);
  assert.equal(INDENT, "  ");
});
