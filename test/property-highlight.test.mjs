import assert from "node:assert/strict";
import test from "node:test";
import fc from "fast-check";
import {
  MAX_HIGHLIGHT_CHARS,
  detectLanguage,
  highlight,
  tokenize,
} from "./.build/highlight.mjs";
import { FUZZ } from "./fixtures/fuzz.mjs";

// The token layer paints under the textarea. If its text stops matching the
// textarea, the user sees one thing and edits another, so round-tripping is the
// property that matters most.

const LANGUAGES = [
  "js",
  "ts",
  "json",
  "css",
  "py",
  "sh",
  "rb",
  "sql",
  "yaml",
  "toml",
  "c",
  "go",
  "rust",
  "lua",
];

test("tokens reproduce the input for every language", () => {
  fc.assert(
    fc.property(
      fc.string({ maxLength: 120 }),
      fc.constantFrom(...LANGUAGES),
      (text, language) => {
        const tokens = tokenize(text, language);
        assert.equal(tokens.map((token) => token.text).join(""), text);
        assert.ok(tokens.every((token) => token.text.length > 0));
      },
    ),
    FUZZ,
  );
});

test("highlight returns undefined only for plain or oversized input", () => {
  fc.assert(
    fc.property(
      fc.string({ maxLength: 120 }),
      fc.constantFrom(...LANGUAGES),
      (text, language) => {
        const tokens = highlight(text, language);
        if (text.length > MAX_HIGHLIGHT_CHARS) {
          assert.equal(tokens, undefined);
          return;
        }
        if (!tokens) return;
        assert.equal(tokens.map((token) => token.text).join(""), text);
      },
    ),
    FUZZ,
  );
});

test("detectLanguage never invents a language for an unknown extension", () => {
  assert.equal(detectLanguage("notes.unknown"), "plain");
  assert.equal(detectLanguage("Makefile"), "plain");
  assert.equal(detectLanguage("A.TSX"), "ts");
});
