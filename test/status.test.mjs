import assert from "node:assert/strict";
import test from "node:test";
import { explain, isExternalChange } from "./.build/status.mjs";

test("isExternalChange spots the conflict marker", () => {
  assert.equal(isExternalChange(new Error("EXTERNAL_CHANGE")), true);
  assert.equal(isExternalChange("Error: EXTERNAL_CHANGE (x)"), true);
  assert.equal(isExternalChange(new Error("EACCES")), false);
  assert.equal(isExternalChange(undefined), false);
});

test("explain turns each failure into advice", () => {
  assert.equal(
    explain(new Error("EXTERNAL_CHANGE")),
    "The file changed on disk.",
  );
  assert.match(explain(new Error("TOO_LARGE")), /2 MB/);
  assert.match(explain(new Error("INVALID_UTF8")), /UTF-8/);
  assert.match(explain(new Error("NOT_FILE")), /not a file/);
});

test("explain passes unknown errors through unchanged", () => {
  assert.equal(
    explain(new Error("EACCES: permission denied")),
    "Error: EACCES: permission denied",
  );
  assert.equal(typeof explain({}), "string");
});
