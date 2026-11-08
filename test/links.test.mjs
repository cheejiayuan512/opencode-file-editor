import assert from "node:assert/strict";
import test from "node:test";
import {
  basenameOf,
  BINARY_EXTENSIONS,
  extension,
  folderOf,
  hrefPath,
  isFileLink,
  isMarkdown,
  isTextPath,
  linkBase,
  looksLikeFileName,
} from "./.build/links.mjs";

test("extension reads the last segment only", () => {
  assert.equal(extension("src/App.TSX"), "tsx");
  assert.equal(extension("C:\\a\\b.tar.gz"), "gz");
  assert.equal(extension("Makefile"), "");
  assert.equal(extension(".env"), "");
});

test("isTextPath routes binaries to the app preview", () => {
  assert.equal(isTextPath("a.png"), false);
  assert.equal(isTextPath("a.PDF"), false);
  assert.equal(isTextPath("a.ts"), true);
  assert.equal(isTextPath("Makefile"), true);
  assert.equal(BINARY_EXTENSIONS.has("png"), true);
  assert.equal(BINARY_EXTENSIONS.has("ts"), false);
});

test("isMarkdown covers the extensions the host renderer handles", () => {
  assert.equal(isMarkdown("README.md"), true);
  assert.equal(isMarkdown("docs/x.MDX"), true);
  assert.equal(isMarkdown("a.markdown"), true);
  assert.equal(isMarkdown("a.txt"), false);
});

test("basenameOf keeps the file name", () => {
  assert.equal(basenameOf("C:\\a\\b.ts"), "b.ts");
  assert.equal(basenameOf("/a/b.ts"), "b.ts");
  assert.equal(basenameOf("b.ts"), "b.ts");
});

test("folderOf keeps everything before the file name", () => {
  assert.equal(folderOf("C:/Users/X/Rep/a.ts"), "C:/Users/X/Rep");
  assert.equal(folderOf("C:\\Users\\X\\a.ts"), "C:/Users/X");
  assert.equal(folderOf("a.ts"), "");
});

test("looksLikeFileName accepts bare names with an extension only", () => {
  assert.equal(looksLikeFileName("README.md"), true);
  assert.equal(looksLikeFileName("Node.js"), true);
  assert.equal(looksLikeFileName("file.tar.gz"), true);
  assert.equal(looksLikeFileName("e.g."), false);
  assert.equal(looksLikeFileName("src/a.ts"), false);
  assert.equal(looksLikeFileName(".env"), false);
});

test("isFileLink accepts files and rejects URLs and prose", () => {
  assert.equal(isFileLink({ href: "README.md" }), true);
  assert.equal(isFileLink({ href: "src/a.ts" }), true);
  assert.equal(isFileLink({ href: "C:\\x\\a.ts" }), true);
  assert.equal(isFileLink({ href: "file:///C:/x/a.ts" }), true);
  assert.equal(isFileLink({ href: "dir", exact: true }), true);
  assert.equal(isFileLink({ href: "https://example.com" }), false);
  assert.equal(isFileLink({ href: "mailto:a@b.co" }), false);
  assert.equal(isFileLink({ href: "node:path" }), false);
  assert.equal(isFileLink({ href: "#anchor" }), false);
  assert.equal(isFileLink({ href: "" }), false);
  assert.equal(isFileLink({ href: "dir" }), false);
});

test("hrefPath turns file URLs into paths", () => {
  assert.equal(hrefPath("file:///C:/x/a.ts"), "C:/x/a.ts");
  assert.equal(hrefPath("file:///home/a.ts"), "/home/a.ts");
  assert.equal(hrefPath("file:///C:/My%20Docs/a.ts"), "C:/My Docs/a.ts");
  assert.equal(hrefPath("src/a.ts"), "src/a.ts");
});

test("linkBase prefers the absolute base and joins a relative one", () => {
  assert.equal(linkBase({ base: "C:\\x" }, "C:/w"), "C:\\x");
  assert.equal(linkBase({ base: "/abs" }, "C:/w"), "/abs");
  assert.equal(linkBase({ base: "~/x" }, "C:/w"), "~/x");
  assert.equal(linkBase({ base: "sub" }, "C:/w"), "C:/w/sub");
  assert.equal(linkBase({}, "C:/w"), "C:/w");
  assert.equal(linkBase({ base: "sub" }, ""), "sub");
});
