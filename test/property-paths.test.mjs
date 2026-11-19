import assert from "node:assert/strict";
import test from "node:test";
import fc from "fast-check";
import { canonicalPath, isAbsolutePath, relativeTo } from "./.build/paths.mjs";
import { BASES } from "./fixtures/paths.mjs";
import { FUZZ } from "./fixtures/fuzz.mjs";

// Path bugs are the ones that shipped twice (0.2.2 and 0.2.3): every example
// was on Windows, so the POSIX branch was never run. These properties run
// against every fixture base instead of one hand-written shape.

const BASE_VALUES = BASES.map((entry) => entry.base);

test("canonicalPath is idempotent when the base is absolute", () => {
  fc.assert(
    fc.property(
      fc.string({ maxLength: 40 }),
      fc.constantFrom(...BASE_VALUES),
      (path, base) => {
        const once = canonicalPath(path, base);
        assert.equal(canonicalPath(once, base), once);
      },
    ),
    FUZZ,
  );
});

test("a trailing space is part of the name, not padding", () => {
  // The fuzzer found this at seed 777: trim() kept the space on the first call
  // and removed it on the second, so the same file became two paths.
  assert.equal(canonicalPath("/work/note ", "/work"), "/work/note ");
  assert.equal(canonicalPath("note ", "/work"), "/work/note ");
  assert.equal(
    canonicalPath(canonicalPath("/work/note ", "/work"), "/work"),
    "/work/note ",
  );
});

test("a relative path joined to an absolute base has no `..` left", () => {
  fc.assert(
    fc.property(
      fc.string({ maxLength: 40 }),
      fc.constantFrom(...BASE_VALUES),
      (path, base) => {
        // An absolute input is kept as the user typed it, by design.
        fc.pre(!isAbsolutePath(path.trim()));
        const joined = canonicalPath(path, base);
        assert.ok(
          !joined.split("/").includes(".."),
          `${JSON.stringify(path)} on ${base} produced ${JSON.stringify(joined)}`,
        );
      },
    ),
    FUZZ,
  );
});

test("a relative path joined to an absolute base is absolute", () => {
  fc.assert(
    fc.property(
      fc.string({ maxLength: 40 }),
      fc.constantFrom(...BASE_VALUES),
      (path, base) => {
        fc.pre(!isAbsolutePath(path.trim()));
        const joined = canonicalPath(path, base);
        if (!joined) return;
        assert.ok(
          isAbsolutePath(joined),
          `${JSON.stringify(path)} on ${base} produced ${JSON.stringify(joined)}`,
        );
      },
    ),
    FUZZ,
  );
});

test("every generated relative path round-trips through relativeTo", () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.stringMatching(/^[A-Za-z0-9_-][A-Za-z0-9._-]*$/),
        { minLength: 1, maxLength: 4 },
      ),
      fc.constantFrom(...BASE_VALUES),
      (segments, base) => {
        const relative = segments.join("/");
        // Use the real join, not string concatenation: a base of "/" would
        // otherwise produce "//a" and test a shape the panel never builds.
        const absolute = canonicalPath(relative, base);
        assert.equal(relativeTo(base, absolute), relative);
      },
    ),
    FUZZ,
  );
});
