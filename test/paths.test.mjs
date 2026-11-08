import assert from "node:assert/strict";
import test from "node:test";
import { canonicalPath, isAbsolutePath, relativeTo } from "./.build/paths.mjs";

const base = "C:\\Users\\JIAYUAN\\CursorProjects\\Rep";

test("canonicalPath joins a relative path onto the workspace", () => {
  assert.equal(
    canonicalPath("src/App.tsx", base),
    "C:/Users/JIAYUAN/CursorProjects/Rep/src/App.tsx",
  );
  assert.equal(
    canonicalPath("src\\App.tsx", base),
    "C:/Users/JIAYUAN/CursorProjects/Rep/src/App.tsx",
  );
  assert.equal(
    canonicalPath("./src/./App.tsx", base),
    "C:/Users/JIAYUAN/CursorProjects/Rep/src/App.tsx",
  );
});

test("canonicalPath walks up without leaving the drive", () => {
  assert.equal(
    canonicalPath("../other/file.ts", base),
    "C:/Users/JIAYUAN/CursorProjects/other/file.ts",
  );
  assert.equal(canonicalPath("../../../../../../x", base), "C:/x");
});

test("canonicalPath keeps absolute paths and leaves ~ for the main process", () => {
  assert.equal(
    canonicalPath("C:\\Windows\\win.ini", base),
    "C:/Windows/win.ini",
  );
  assert.equal(canonicalPath("/etc/hosts", base), "/etc/hosts");
  assert.equal(canonicalPath("D:/data/a.csv", base), "D:/data/a.csv");
  assert.equal(canonicalPath("~/notes.md", base), "~/notes.md");
});

test("canonicalPath handles empty input and empty base", () => {
  assert.equal(canonicalPath("   ", base), "");
  assert.equal(canonicalPath("src/App.tsx", ""), "src/App.tsx");
});

test("canonicalPath ignores a stubbed Node module rendered as a base", () => {
  const value = canonicalPath("src/App.tsx", "[inert module node:path]");
  assert.equal(value.includes("[inert module"), false);
});

test("isAbsolutePath recognises every absolute form", () => {
  assert.equal(isAbsolutePath("C:/x"), true);
  assert.equal(isAbsolutePath("C:\\x"), true);
  assert.equal(isAbsolutePath("/x"), true);
  assert.equal(isAbsolutePath("~/x"), true);
  assert.equal(isAbsolutePath("x/y"), false);
});

test("relativeTo strips the workspace prefix case-insensitively", () => {
  assert.equal(
    relativeTo(base, "C:/Users/JIAYUAN/CursorProjects/Rep/src/App.tsx"),
    "src/App.tsx",
  );
  assert.equal(
    relativeTo(base, "c:/users/jiayuan/cursorprojects/rep/a.ts"),
    "a.ts",
  );
});

test("relativeTo keeps paths outside the workspace", () => {
  assert.equal(relativeTo(base, "C:/Windows/win.ini"), "C:/Windows/win.ini");
  assert.equal(relativeTo("", "C:/x/a.ts"), "C:/x/a.ts");
});
