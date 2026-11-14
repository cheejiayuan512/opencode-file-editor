import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_URL,
  REPO,
  composeReport,
  formatReport,
  titleOf,
} from "./.build/report.mjs";

const sample = formatReport({
  version: "gui v35",
  contract: "file-editor.fs.v4",
  platform: "Win32",
  userAgent: "OpenCode/2.2.7",
  facts: {
    file: "",
    base: "C:/repo",
    status: "Load failed: FILE_EDITOR:TOO_LARGE",
  },
});

test("formatReport puts each fact on its own line", () => {
  assert.equal(
    sample,
    [
      "opencode-file-editor gui v35",
      "contract file-editor.fs.v4",
      "platform Win32",
      "file (empty)",
      "base C:/repo",
      "status Load failed: FILE_EDITOR:TOO_LARGE",
      "user agent OpenCode/2.2.7",
    ].join("\n"),
  );
});

test("a prefilled issue carries the report in its body", () => {
  const { url, body } = composeReport(sample);
  assert.ok(
    url.startsWith(`${REPO}/issues/new?`),
    `unexpected link: ${url.slice(0, 80)}`,
  );

  // Decode it the way GitHub will, rather than trusting the builder.
  const parsed = new URL(url);
  assert.equal(
    parsed.searchParams.get("title"),
    "Bug: Load failed: FILE_EDITOR:TOO_LARGE",
  );
  assert.equal(parsed.searchParams.get("body"), body);
  assert.match(body, /### What happened/);
  assert.ok(body.includes(sample), "the report is missing from the body");
});

test("a multi-line status cannot leak into the title", () => {
  const report = "status first line\nsecond line";
  assert.equal(titleOf(report), "Bug: first line");
  assert.equal(
    new URL(composeReport(report).url).searchParams.get("title"),
    "Bug: first line",
  );
});

test("a report without a status still has a usable title", () => {
  assert.equal(titleOf("platform Win32"), "Bug: the file editor");
  // Long failures are cut, not pasted into the title field.
  assert.ok(titleOf(`status ${"x".repeat(500)}`).length <= 96);
});

test("an oversized report still makes a link GitHub will accept", () => {
  assert.ok(MAX_URL < 8000, "GitHub rejects URLs past about 8 KB");
  const huge = `status ${"boom ".repeat(5000)}`;
  const { url, body } = composeReport(huge);

  assert.ok(url.length <= MAX_URL, `url is ${url.length} chars`);
  assert.match(body, /truncated - use Copy diagnostics/);
  // The questions survive: the diagnostics are what gets shortened.
  assert.match(body, /### What happened/);
  assert.match(body, /### Diagnostics/);
  assert.equal(new URL(url).searchParams.get("body"), body);
});
