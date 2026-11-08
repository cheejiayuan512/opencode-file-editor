import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  MAX_BYTES,
  looksLikeText,
  readTextFile,
  writeTextFile,
} from "./.build/fs-core.mjs";

const dir = await mkdtemp(join(tmpdir(), "fs-core-"));

test("CRLF and BOM survive a round trip", async () => {
  const file = join(dir, "crlf.txt");
  await writeFile(
    file,
    Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("a\r\nb\r\n")]),
  );

  const read = await readTextFile(file);
  assert.equal(read.text, "a\nb\n");
  assert.equal(read.eol, "crlf");
  assert.equal(read.bom, true);

  await writeTextFile(file, "a\nb\nc\n", read.text);
  const raw = await readFile(file);
  assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.equal(raw.includes(Buffer.from("\r\n")), true);
  assert.equal(raw.includes(Buffer.from("b\nc")), false);
});

test("an LF file stays LF", async () => {
  const file = join(dir, "lf.txt");
  await writeFile(file, "one\ntwo\n");
  const read = await readTextFile(file);
  assert.equal(read.eol, "lf");
  assert.equal(read.bom, false);

  await writeTextFile(file, "one\ntwo\nthree\n", read.text);
  assert.equal((await readFile(file)).includes(Buffer.from("\r")), false);
});

test("a stale baseline is refused and the other writer survives", async () => {
  const file = join(dir, "guard.txt");
  await writeFile(file, "original\n");
  const read = await readTextFile(file);
  await writeFile(file, "agent changed this\n");

  await assert.rejects(
    () => writeTextFile(file, "panel wins\n", read.text),
    /EXTERNAL_CHANGE/,
  );
  assert.equal(await readFile(file, "utf8"), "agent changed this\n");
});

test("a forced write replaces whatever is on disk", async () => {
  const file = join(dir, "guard.txt");
  await writeTextFile(file, "panel wins\n", null);
  assert.equal(await readFile(file, "utf8"), "panel wins\n");
});

test("a missing target is a conflict, not a silent recreate", async () => {
  const file = join(dir, "gone.txt");
  await writeFile(file, "here\n");
  const read = await readTextFile(file);
  await assert.rejects(
    () => writeTextFile(join(dir, "missing.txt"), "x", read.text),
    /EXTERNAL_CHANGE/,
  );
});

test("no temporary files are left behind", async () => {
  const leftovers = (await readdir(dir)).filter((name) =>
    name.includes(".file-editor-"),
  );
  assert.deepEqual(leftovers, []);
});

test("oversized files are refused on read and write", async () => {
  const file = join(dir, "big.txt");
  await writeFile(file, Buffer.alloc(MAX_BYTES + 1, 0x61));
  await assert.rejects(() => readTextFile(file), /TOO_LARGE/);
  await assert.rejects(
    () => writeTextFile(join(dir, "lf.txt"), "x".repeat(MAX_BYTES + 1), null),
    /TOO_LARGE/,
  );
});

test("invalid UTF-8 and NUL bytes are refused", async () => {
  const latin = join(dir, "latin1.txt");
  await writeFile(latin, Buffer.from([0x63, 0x61, 0x66, 0xe9]));
  await assert.rejects(() => readTextFile(latin), /INVALID_UTF8/);

  const binary = join(dir, "binary.txt");
  await writeFile(binary, Buffer.from([0x61, 0x00, 0x62]));
  await assert.rejects(() => readTextFile(binary), /BINARY/);
});

test("looksLikeText sniffs the first block", () => {
  assert.equal(looksLikeText(Buffer.from("hello\n")), true);
  assert.equal(looksLikeText(Buffer.from([0x61, 0x00])), false);
  assert.equal(looksLikeText(Buffer.from([0x01, 0x02])), false);
});

test("expected null creates a file", async () => {
  const file = join(dir, "new.txt");
  await writeTextFile(file, "created\n", null);
  assert.equal(await readFile(file, "utf8"), "created\n");
});
