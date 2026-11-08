import assert from "node:assert/strict";
import test from "node:test";
import { parseRecent, pushRecent, serializeRecent } from "./.build/recent.mjs";

test("pushRecent puts the newest first", () => {
  assert.deepEqual(pushRecent(["a", "b"], "c"), ["c", "a", "b"]);
});

test("pushRecent moves an existing entry to the front", () => {
  assert.deepEqual(pushRecent(["a", "b", "c"], "b"), ["b", "a", "c"]);
});

test("pushRecent ignores empty paths and caps the list", () => {
  assert.deepEqual(pushRecent(["a"], ""), ["a"]);
  const full = Array.from({ length: 9 }, (_, index) => `f${index}`);
  const next = pushRecent(full, "new");
  assert.equal(next.length, 8);
  assert.equal(next[0], "new");
  assert.equal(next.includes("f8"), false);
});

test("parseRecent survives junk", () => {
  assert.deepEqual(parseRecent(null), []);
  assert.deepEqual(parseRecent("not json"), []);
  assert.deepEqual(parseRecent('{"a":1}'), []);
  assert.deepEqual(parseRecent('["a",2,null,"b"]'), ["a", "b"]);
});

test("parseRecent caps what it reads", () => {
  const many = JSON.stringify(Array.from({ length: 20 }, (_, i) => `f${i}`));
  assert.equal(parseRecent(many).length, 8);
});

test("serializeRecent round-trips", () => {
  const list = ["C:/a.ts", "C:/b.ts"];
  assert.deepEqual(parseRecent(serializeRecent(list)), list);
});
