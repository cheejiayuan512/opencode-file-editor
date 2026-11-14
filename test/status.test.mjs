import assert from "node:assert/strict";
import test from "node:test";
import { fsCode } from "./.build/codes.mjs";
import { explain, isExternalChange } from "./.build/status.mjs";

test("a code is read from the plugin's own marker, not any mention of it", () => {
  assert.equal(fsCode(new Error("FILE_EDITOR:TOO_LARGE")), "TOO_LARGE");
  assert.equal(fsCode("FILE_EDITOR:EXTERNAL_CHANGE"), "EXTERNAL_CHANGE");
  // A host that wraps the message still carries the marker.
  assert.equal(
    fsCode(
      "Error invoking 'file-editor.fs.v4:write' failed: FILE_EDITOR:BINARY",
    ),
    "BINARY",
  );
  // The bug this replaced: `includes("TOO_LARGE")` matched a path, so a
  // permission failure on this file was reported as "File is over 2 MB".
  assert.equal(
    fsCode(new Error("EACCES: open /Users/me/TOO_LARGE/notes.md")),
    undefined,
  );
  assert.equal(fsCode(new Error("FILE_EDITOR:NOT_A_CODE")), undefined);
  assert.equal(fsCode(undefined), undefined);
});

test("isExternalChange spots the conflict and nothing else", () => {
  assert.equal(isExternalChange(new Error("FILE_EDITOR:EXTERNAL_CHANGE")), true);
  assert.equal(isExternalChange(new Error("FILE_EDITOR:TOO_LARGE")), false);
  assert.equal(isExternalChange(new Error("EACCES")), false);
  assert.equal(isExternalChange(undefined), false);
});

test("explain turns each named failure into advice", () => {
  const expected = [
    ["EXTERNAL_CHANGE", /changed on disk/],
    ["TOO_LARGE", /2 MB/],
    ["INVALID_UTF8", /UTF-8/],
    ["BINARY", /binary/],
    ["NOT_FILE", /not a file/],
  ];
  for (const [code, pattern] of expected) {
    assert.match(explain(new Error(`FILE_EDITOR:${code}`)), pattern, code);
  }
});

test("explain shows the first line of an unexpected failure", () => {
  assert.equal(
    explain(new Error("EACCES: permission denied\n    at open (node:fs:1:1)")),
    "EACCES: permission denied",
  );
  // A rejection value need not be an Error.
  assert.equal(explain({ message: "socket closed" }), "socket closed");
  assert.equal(explain({}), "Something went wrong.");
  assert.equal(explain(undefined), "Something went wrong.");
});
