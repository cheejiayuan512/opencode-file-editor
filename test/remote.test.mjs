import assert from "node:assert/strict";
import test from "node:test";
import { usesLocalDisk } from "./.build/remote.mjs";

// Issue #10: the panel read through the desktop's main process, so a file in a
// WSL workspace (an absolute POSIX path) was looked for on the Windows disk and
// reported missing. The decision has to follow the server, not the path.
test("the app's own server is read from the local disk", () => {
  assert.equal(
    usesLocalDisk(
      { builtin: true, url: "http://127.0.0.1:28894" },
      "http://127.0.0.1:28894",
    ),
    true,
  );
});

test("a builtin server is local when the app lists no own URL", () => {
  assert.equal(
    usesLocalDisk({ builtin: true, url: "http://127.0.0.1:28894" }, undefined),
    true,
  );
});

test("another builtin-looking server is not this machine's disk", () => {
  assert.equal(
    usesLocalDisk(
      { builtin: true, url: "http://127.0.0.1:63721" },
      "http://127.0.0.1:28894",
    ),
    false,
  );
});

test("a WSL or remote server never reads the local disk", () => {
  assert.equal(
    usesLocalDisk(
      { builtin: false, url: "http://127.0.0.1:63721" },
      "http://127.0.0.1:28894",
    ),
    false,
  );
  assert.equal(
    usesLocalDisk({ builtin: false, url: "https://opencode.example" }, undefined),
    false,
  );
});
