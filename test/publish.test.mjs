import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import test from "node:test";

// A publish gate: the tarball is exactly the parts the loader needs, with no
// tests, scripts, lockfile, or stray build output.
const ALLOWED = [
  /^LICENSE$/,
  /^README\.md$/,
  /^CHANGELOG\.md$/,
  /^package\.json$/,
  /^index\.ts$/,
  /^gui-experimental\.cjs$/,
  /^src\/[\w.-]+\.(ts|tsx)$/,
];

const FORBIDDEN = [
  /^test\//,
  /^scripts\//,
  /^node_modules\//,
  /^dist\//,
  /\.bak$/,
  /^package-lock\.json$/,
];

test("the packed tarball contains only what the plugin needs", () => {
  const raw = execSync("npm pack --dry-run --json --ignore-scripts", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const [pack] = JSON.parse(raw);
  const files = pack.files.map((file) => file.path);

  assert.ok(files.length > 5, "tarball looks empty");
  for (const path of files) {
    assert.ok(
      ALLOWED.some((pattern) => pattern.test(path)),
      `unexpected file in the tarball: ${path}. Add it to \`files\` on purpose and to this allowlist.`,
    );
    for (const pattern of FORBIDDEN) {
      assert.doesNotMatch(path, pattern, `must not ship: ${path}`);
    }
  }

  assert.ok(
    pack.size < 300_000,
    `tarball is ${pack.size} bytes; the bundle may have inlined a dependency`,
  );
});
