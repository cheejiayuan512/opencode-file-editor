import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkRelease } from "../scripts/check-release.mjs";

const changelog = "## 0.2.5\n\n- a fix\n\n## 0.2.4\n";

test("a matching tag, version and changelog entry pass", () => {
  assert.deepEqual(checkRelease("v0.2.5", "0.2.5", changelog), []);
  assert.deepEqual(
    checkRelease("v0.2.5-rc.1", "0.2.5-rc.1", "## 0.2.5-rc.1"),
    [],
  );
});

test("a branch run has no tag and nothing to check", () => {
  assert.deepEqual(checkRelease("", "0.2.5", ""), []);
});

test("a tag that disagrees with package.json is refused", () => {
  // The release this exists for: tagging v0.3.0 on a 0.2.5 package publishes
  // nothing, because 0.2.5 already exists, and creates a release anyway.
  const problems = checkRelease("v0.3.0", "0.2.5", changelog);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /v0\.3\.0/);
  assert.match(problems[0], /0\.2\.5/);
});

test("a tag without the v prefix is refused", () => {
  const problems = checkRelease("0.2.5", "0.2.5", changelog);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /must start with v/);
});

test("a version with no changelog heading is refused", () => {
  const problems = checkRelease("v0.2.5", "0.2.5", "## 0.2.4\n- older\n");
  assert.equal(problems.length, 1);
  assert.match(problems[0], /0\.2\.5/);
  // "0.2.50" must not satisfy "0.2.5".
  assert.equal(checkRelease("v0.2.5", "0.2.5", "## 0.2.50").length, 1);
});

test("the script refuses the repository's own mismatch", () => {
  const version = JSON.parse(readFileSync("package.json", "utf8")).version;
  const other = `${version.slice(0, -1)}${Number(version.slice(-1)) + 1}`;
  assert.throws(
    () =>
      execFileSync(process.execPath, ["scripts/check-release.mjs", `v${other}`], {
        stdio: "pipe",
      }),
    /Command failed/,
  );
});
