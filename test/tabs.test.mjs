import assert from "node:assert/strict";
import test from "node:test";
import {
  keyFor,
  LAUNCHER,
  pathFromId,
  PLUGIN,
  tabId,
  tabKey,
} from "./.build/tabs.mjs";

test("tab ids round-trip through the host", () => {
  assert.equal(tabId("C:/a.ts"), "file:C:/a.ts");
  assert.equal(tabKey("C:/a.ts"), "file-editor:file:C:/a.ts");
  assert.equal(keyFor("open"), "file-editor:open");
  assert.equal(PLUGIN, "file-editor");
  assert.equal(LAUNCHER, "open");
});

test("pathFromId returns the absolute path for a file tab", () => {
  assert.equal(pathFromId("file:C:/a.ts", "C:/w"), "C:/a.ts");
  assert.equal(pathFromId("file:C:\\a.ts", "C:/w"), "C:/a.ts");
});

test("pathFromId resolves a relative id against the workspace", () => {
  assert.equal(pathFromId("file:src/a.ts", "C:/w"), "C:/w/src/a.ts");
});

test("pathFromId ignores the launcher and unknown ids", () => {
  assert.equal(pathFromId("open", "C:/w"), "");
  assert.equal(pathFromId("something-else", "C:/w"), "");
});
