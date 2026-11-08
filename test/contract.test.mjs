import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// The host keeps an Ipc contract registered under its id across plugin
// reloads. Adding a method without bumping the id ships a plugin whose new
// methods answer "no method …" until the app restarts. This test makes that
// impossible to forget: change the methods, update the fixture and bump the id.

const source = readFileSync("src/gui.tsx", "utf8");
const expected = JSON.parse(
  readFileSync("test/fixtures/ipc-contract.json", "utf8"),
);

function matchingBrace(text, from) {
  let depth = 0;
  for (let index = from; index < text.length; index += 1) {
    const char = text[index];
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error("unbalanced braces");
}

function contractOf(text) {
  const start = text.indexOf("Ipc.define({");
  assert.notEqual(start, -1, "Ipc.define not found");

  const blockStart = text.indexOf("{", start);
  const block = text.slice(blockStart, matchingBrace(text, blockStart));

  const id = block.match(/id:\s*"([^"]+)"/)?.[1];
  assert.ok(id, "contract id not found");

  const methodsAt = block.indexOf("methods: {");
  assert.notEqual(methodsAt, -1, "methods block not found");
  const methodsStart = block.indexOf("{", methodsAt);
  const methodsEnd = matchingBrace(block, methodsStart);
  const methods = block.slice(methodsStart, methodsEnd);

  const names = [];
  let depth = 0;
  for (let index = 0; index < methods.length; index += 1) {
    const char = methods[index];
    if (char === "{") depth += 1;
    else if (char === "}") depth -= 1;
    else if (depth === 1) {
      const match = /^([A-Za-z_$][\w$]*)\s*:/.exec(methods.slice(index));
      if (match) {
        names.push(match[1]);
        index += match[0].length - 1;
      }
    }
  }
  return { id, methods: names };
}

test("the Ipc contract id is versioned", () => {
  const { id } = contractOf(source);
  assert.match(id, /^file-editor\.fs\.v\d+$/);
});

test("the Ipc contract matches its recorded id and methods", () => {
  const actual = contractOf(source);
  assert.deepEqual(
    { id: actual.id, methods: [...actual.methods].sort() },
    { id: expected.id, methods: [...expected.methods].sort() },
    "The contract changed. Bump `id` to the next .vN and update test/fixtures/ipc-contract.json, " +
      "otherwise the host keeps answering from the old registration until the app restarts.",
  );
});

test("every contract method is also provided by the main process", () => {
  const { methods } = contractOf(source);
  const provideAt = source.indexOf("ctx.provide(Fs, {");
  assert.notEqual(provideAt, -1, "ctx.provide(Fs, …) not found");

  const objectStart = source.indexOf("{", provideAt);
  const body = source.slice(objectStart, matchingBrace(source, objectStart));
  const provided = new Set(
    [...body.matchAll(/^\s{6}([A-Za-z_$][\w$]*):/gm)].map((match) => match[1]),
  );

  for (const method of methods) {
    assert.ok(
      provided.has(method),
      `main() does not provide \`${method}\`, so the window would get "no method ${method}".`,
    );
  }
});
