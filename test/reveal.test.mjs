import assert from "node:assert/strict";
import test from "node:test";
import { revealCommand } from "./.build/reveal.mjs";

test("Windows selects the file in Explorer", () => {
  assert.deepEqual(revealCommand("win32", "C:\\Users\\X\\a b.ts"), [
    "explorer.exe",
    ["/select,C:\\Users\\X\\a b.ts"],
  ]);
});

test("macOS reveals it in Finder", () => {
  assert.deepEqual(revealCommand("darwin", "/Users/x/a.ts"), [
    "open",
    ["-R", "/Users/x/a.ts"],
  ]);
});

test("Linux opens the containing folder", () => {
  assert.deepEqual(revealCommand("linux", "/home/x/a.ts"), [
    "xdg-open",
    ["/home/x"],
  ]);
});

test("Linux falls back to the filesystem root", () => {
  assert.deepEqual(revealCommand("linux", "a.ts"), ["xdg-open", ["/"]]);
});
