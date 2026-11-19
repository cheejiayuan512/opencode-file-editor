import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as host from "@opencode/plugin/gui";
import * as solid from "solid-js";
import { Schema } from "effect";

// `test/contract.test.mjs` reads the source; this one loads the installed host
// package and asks what it actually exports. A host release can remove a value
// while the type declarations here still compile against a cached version, and
// then the panel fails at load with a bare "undefined is not an object".

const source = readFileSync("src/gui.tsx", "utf8");

function importedFrom(specifier) {
  const pattern = new RegExp(
    `import\\s*\\{([^}]*)\\}\\s*from\\s*["']${specifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
  );
  const match = pattern.exec(source);
  assert.ok(match, `src/gui.tsx no longer imports from ${specifier}`);
  return match[1]
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0 && !name.startsWith("type "))
    .map((name) => name.replace(/\s+as\s+.*$/, ""));
}

test("the installed host exports every runtime symbol the panel imports", () => {
  const names = importedFrom("@opencode/plugin/gui");
  assert.ok(names.length > 0, "no runtime imports found — this guard is stale");
  for (const name of names) {
    assert.ok(
      name in host,
      `@opencode/plugin/gui does not export \`${name}\`. The panel would fail to load; ` +
        "pin a host version that still has it, or update the import.",
    );
  }
});

test("the host pieces the panel calls are callable", () => {
  assert.equal(typeof host.Ipc.define, "function");
  assert.equal(typeof host.Plugin.define, "function");
  assert.equal(typeof host.usePanel, "function");
  // These are registered by value, not called here; presence is the contract.
  for (const name of ["Panel", "Command", "MenuItem", "LinkHandler"])
    assert.ok(name in host, `missing host registration ${name}`);
});

test("solid and effect still provide what the panel imports", () => {
  for (const name of importedFrom("solid-js"))
    assert.ok(name in solid, `solid-js no longer exports ${name}`);
  assert.equal(typeof Schema.Struct, "function");
});
