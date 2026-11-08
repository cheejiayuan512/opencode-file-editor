import assert from "node:assert/strict";
import test from "node:test";
import { limitEntries, parentOf, sortEntries } from "./.build/browse.mjs";

test("sortEntries puts folders first, then names in human order", () => {
  const sorted = sortEntries([
    { name: "b.ts", dir: false },
    { name: "a.ts", dir: false },
    { name: "src", dir: true },
    { name: "10.ts", dir: false },
    { name: "2.ts", dir: false },
    { name: "Assets", dir: true },
  ]);
  assert.deepEqual(
    sorted.map((entry) => entry.name),
    ["Assets", "src", "2.ts", "10.ts", "a.ts", "b.ts"],
  );
});

test("sortEntries does not mutate its input", () => {
  const input = [
    { name: "b", dir: false },
    { name: "a", dir: false },
  ];
  sortEntries(input);
  assert.equal(input[0].name, "b");
});

test("parentOf walks up a directory", () => {
  assert.equal(parentOf("C:/Users/X/Rep/src"), "C:/Users/X/Rep");
  assert.equal(parentOf("C:\\Users\\X\\Rep"), "C:/Users/X");
});

test("parentOf keeps a drive rooted", () => {
  assert.equal(parentOf("C:/Users"), "C:/");
});

test("parentOf at a root has no parent", () => {
  assert.equal(parentOf("C:/"), "");
  assert.equal(parentOf("C:"), "");
  assert.equal(parentOf("/"), "");
});

test("parentOf handles a posix root", () => {
  assert.equal(parentOf("/etc/hosts"), "/etc");
  assert.equal(parentOf("/etc"), "/");
});

test("parentOf trims trailing separators", () => {
  assert.equal(parentOf("C:/Users/X/"), "C:/Users");
});

test("limitEntries caps a huge folder and reports the real total", () => {
  const many = Array.from({ length: 5000 }, (_, index) => ({
    name: `f${index}`,
    dir: false,
  }));
  const { entries, total } = limitEntries(many);
  assert.equal(entries.length, 2000);
  assert.equal(total, 5000);
  assert.equal(entries[0].name, "f0");
});

test("limitEntries keeps a small folder whole", () => {
  const { entries, total } = limitEntries([{ name: "a", dir: false }]);
  assert.equal(entries.length, 1);
  assert.equal(total, 1);
});
