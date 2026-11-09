import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/gui.tsx", "utf8");

// Modules the window half imports directly. They must stay pure: the browser
// bundle swaps Node builtins for an inert stub, so one `node:path` call turns
// into the literal string "[inert module node:path]" at runtime.
const RENDERER_MODULES = [
  "paths",
  "links",
  "tabs",
  "status",
  "view",
  "recent",
  "browse",
  "tree",
  "reveal",
];

test("renderer modules never import Node builtins", () => {
  for (const name of RENDERER_MODULES) {
    const text = readFileSync(`src/${name}.ts`, "utf8");
    const imports = [...text.matchAll(/from\s+"([^"]+)"/g)].map(
      (match) => match[1],
    );
    for (const specifier of imports) {
      assert.ok(
        !specifier.startsWith("node:") && !specifier.startsWith("fs"),
        `src/${name}.ts imports "${specifier}". Window code cannot call Node APIs; ` +
          "keep them in src/fs-core.ts and call them through the Ipc contract.",
      );
    }
  }
});

test("every layout.open selects a real tab instead of the preview slot", () => {
  // The default `open` reuses the preview slot, which the app's own file viewer
  // owns, so our tab gets replaced by it.
  const opens = source.match(/ctx\.layout\.open\(/g)?.length ?? 0;
  const selects = source.match(/tab: "select"/g)?.length ?? 0;
  assert.ok(opens > 0, "expected at least one layout.open call");
  assert.equal(
    selects,
    opens,
    `${opens} layout.open calls but ${selects} with { tab: "select" }: a tab opened ` +
      "without it will be replaced by the built-in file viewer.",
  );
});

test("the panel asks for width with `wide`, not an invented prop", () => {
  assert.match(source, /wide: true/);
  assert.doesNotMatch(source, /^\s*width: \d+,/m);
});

test("the line-number gutter keeps newlines", () => {
  // The numbers are one string with "\n"; without this the browser collapses
  // them into a single row.
  assert.match(source, /"white-space": "pre"/);
});

test("every element ref signal is actually attached", () => {
  // A declared-but-unattached ref is a silent no-op: the measuring box existed
  // as a signal but was never rendered, so wrapping was never measured.
  const refs = [
    ...source.matchAll(/const \[(\w+), (set\w+)\] = createSignal<HTML/g),
  ];
  assert.ok(refs.length > 0, "expected at least one element ref signal");
  for (const [, name, setter] of refs) {
    assert.ok(
      source.includes(`ref={${setter}}`),
      `\`${name}\` is declared but \`ref={${setter}}\` is missing, so it is always undefined.`,
    );
  }
});

test("the wrap measurement box mirrors the textarea metrics", () => {
  assert.match(source, /"white-space": "pre-wrap"/);
  assert.match(source, /"overflow-wrap": "break-word"/);
});

test("the + menu shows the panel instead of toggling the region closed", () => {
  // The + menu renders inside the side region, so `side.toggle` from its item
  // closed the pane the click came from: one click, panel gone. Only the
  // keybind is allowed to close the panel it already shows.
  const start = source.indexOf("ctx.add(MenuItem");
  const end = source.indexOf("ctx.add(Command");
  assert.ok(start > -1 && end > start, "expected MenuItem then Command");
  const menuItem = source.slice(start, end);
  assert.ok(
    !menuItem.includes("side.toggle"),
    "the + menu item must select a tab, not toggle the side region",
  );
});

test("the contract id carries a version suffix", () => {
  assert.match(source, /id: "file-editor\.fs\.v\d+"/);
});
