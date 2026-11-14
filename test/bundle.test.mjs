import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

// Runs after `npm run build`; skipped in a plain `npm test` on a clean clone.
const bundle = "gui-experimental.cjs";
const manifest = JSON.parse(readFileSync("package.json", "utf8"));

test("the package ships the file-name layout the loader resolves", () => {
  // With `exports`, the loader resolves `<name>/gui-experimental` through
  // node_modules, which cannot work for a directory you point at directly.
  assert.equal(manifest.exports, undefined);
  assert.equal(manifest.name, "opencode-file-editor");
  assert.ok(manifest.files.includes("gui-experimental.cjs"));
  assert.ok(manifest.files.includes("index.ts"));
});

test("there is no stale dist/ layout", () => {
  assert.equal(
    existsSync("dist"),
    false,
    "remove dist/: the bundle lives at the package root",
  );
});

test("the bundle exists and is the current build", (t) => {
  if (!existsSync(bundle)) {
    t.skip("run `npm run build` first");
    return;
  }

  assert.ok(statSync(bundle).size > 10_000, "bundle looks truncated");
  const code = readFileSync(bundle, "utf8");
  assert.match(code, /Open file/);
  assert.match(code, /Reveal in file manager/);
  assert.match(code, /Browse files/);
});

test("the built bundle matches the source version marker", (t) => {
  if (!existsSync(bundle)) {
    t.skip("run `npm run build` first");
    return;
  }
  const source = readFileSync("src/gui.tsx", "utf8");
  const expected = source.match(/gui v(\d+)/)?.[1];
  assert.ok(expected, "no version marker in src/gui.tsx");
  const code = readFileSync(bundle, "utf8");
  // The marker is one const that both the console log and Copy diagnostics read,
  // so the bundle holds the literal once instead of writing it into the log
  // string. Match the literal, not the old `[file-editor] gui vN` line.
  const built = code.match(/gui v(\d+)/)?.[1];
  assert.ok(
    code.includes("[file-editor] "),
    "the bundle never logs under the plugin name",
  );
  assert.equal(
    built,
    expected,
    `bundle says v${built}, source says v${expected}: run \`npm run build\` before loading it.`,
  );
});

test("the bundle parses as CommonJS", (t) => {
  if (!existsSync(bundle)) {
    t.skip("run `npm run build` first");
    return;
  }
  execFileSync(process.execPath, ["--check", bundle], { stdio: "pipe" });
});
