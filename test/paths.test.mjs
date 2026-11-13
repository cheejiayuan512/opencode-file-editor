import assert from "node:assert/strict";
import test from "node:test";
import { BASES, POSIX_BASE, RELATIVES, WINDOWS_BASE } from "./fixtures/paths.mjs";
import { canonicalPath, isAbsolutePath, relativeTo } from "./.build/paths.mjs";

const base = WINDOWS_BASE;

// The guard that 0.2.2 and 0.2.3 needed: every relative form, on every base.
// An absolute result must stay absolute, keep forward slashes, normalize "..",
// and survive the round trip back to the relative form the host stores.
test("every relative path round-trips on every base", () => {
  for (const { label, base: root } of BASES) {
    for (const [input, expected] of RELATIVES) {
      const joined = canonicalPath(input, root);
      assert.equal(
        isAbsolutePath(joined),
        true,
        `${label}: "${input}" joined to "${root}" produced the relative "${joined}"`,
      );
      assert.equal(
        joined.includes("\\"),
        false,
        `${label}: "${joined}" kept a backslash`,
      );
      assert.equal(
        relativeTo(root, joined),
        expected,
        `${label}: "${joined}" did not round-trip to "${expected}"`,
      );
      assert.equal(
        canonicalPath(relativeTo(root, joined), root),
        joined,
        `${label}: rejoining "${joined}" changed it`,
      );
    }
  }
});

test("walking up stays normalized and never leaves the root", () => {
  for (const { label, base: root } of BASES) {
    const joined = canonicalPath("../../../../../../x", root);
    assert.equal(isAbsolutePath(joined), true, `${label}: not absolute`);
    assert.deepEqual(
      joined.split("/").includes(".."),
      false,
      `${label}: "${joined}" kept a ".."`,
    );
    assert.equal(joined.endsWith("x"), true, `${label}: "${joined}"`);
  }
});

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

test("canonicalPath keeps the leading slash of a POSIX workspace root", () => {
  // Regression: the split dropped the root's first empty segment, so the rail's
  // relative click on macOS produced "Users/me/app/a.ts". The main process then
  // resolved that relative path against the base again, which failed to load.
  const posix = POSIX_BASE;
  assert.equal(
    canonicalPath("src/App.tsx", posix),
    "/Users/tim/Rep/src/App.tsx",
  );
  assert.equal(
    canonicalPath("./a/b.ts", `${posix}/`),
    "/Users/tim/Rep/a/b.ts",
  );
  assert.equal(
    canonicalPath("../other/x.ts", posix),
    "/Users/tim/other/x.ts",
  );
  assert.equal(canonicalPath("src/App.tsx", "/"), "/src/App.tsx");
  assert.equal(canonicalPath("../../../../etc/hosts", "/home/tim"), "/etc/hosts");
});

test("a POSIX path round-trips back to the workspace-relative form", () => {
  const spaced = BASES.find((entry) => entry.label.includes("space")).base;
  const absolute = canonicalPath("docs/read me.md", spaced);
  assert.equal(absolute, "/Users/tim/My Project/docs/read me.md");
  assert.equal(relativeTo(spaced, absolute), "docs/read me.md");
});

test("isAbsolutePath recognises every absolute form", () => {
  assert.equal(isAbsolutePath("C:/x"), true);
  assert.equal(isAbsolutePath("C:\\x"), true);
  assert.equal(isAbsolutePath("/x"), true);
  assert.equal(isAbsolutePath("~/x"), true);
  assert.equal(isAbsolutePath("x/y"), false);
});

test("relativeTo strips the prefix, ignoring case only for a drive letter", () => {
  assert.equal(
    relativeTo(base, "C:/Users/JIAYUAN/CursorProjects/Rep/src/App.tsx"),
    "src/App.tsx",
  );
  // Windows sources differ on the drive letter's case; nothing else.
  assert.equal(
    relativeTo(base, "c:/Users/JIAYUAN/CursorProjects/Rep/a.ts"),
    "a.ts",
  );
});

test("relativeTo stays case-sensitive on a POSIX workspace", () => {
  // Regression: the whole path was lowercased, so on a case-sensitive
  // filesystem a sibling that differs in case was treated as inside.
  assert.equal(
    relativeTo("/home/tim/Rep", "/home/tim/rep/a.ts"),
    "/home/tim/rep/a.ts",
  );
  assert.equal(relativeTo("/home/tim/Rep", "/home/tim/Rep/a.ts"), "a.ts");
});

test("relativeTo keeps paths outside the workspace", () => {
  assert.equal(relativeTo(base, "C:/Windows/win.ini"), "C:/Windows/win.ini");
  assert.equal(relativeTo("", "C:/x/a.ts"), "C:/x/a.ts");
});
