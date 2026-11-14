// Checks the plugin as the running desktop app sees it. Unit tests cannot catch
// a plugin that loads without its GUI part, a stale bundle, an unregistered
// contract method, or a host version the plugin was never tested against.
//
//   node scripts/verify-live.mjs           # skips when the app is not running
//   node scripts/verify-live.mjs --strict  # fails when it is not running

import { readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const PLUGIN_ID = "file-editor";
const strict = process.argv.includes("--strict");

// A plugin-directory change makes the app reload, and for a moment the plugin
// list omits the plugin and the GUI endpoint answers 404. That produced false
// failures; retrying is what separates "still reloading" from "broken".
const ATTEMPTS = 3;
const backoff = (attempt) => sleep(400 * attempt);

function password() {
  const path = join(homedir(), ".config", "opencode", "service.json");
  return JSON.parse(readFileSync(path, "utf8")).password;
}

function baseUrl() {
  if (process.env.OPENCODE_URL) return process.env.OPENCODE_URL;
  const logs = join(process.env.APPDATA ?? "", "ai.opencode.desktop", "logs");
  const newest = readdirSync(logs).sort().at(-1);
  const text = readFileSync(join(logs, newest, "main.log"), "utf8");
  const match = [...text.matchAll(/url: 'http:\/\/127\.0\.0\.1:(\d+)'/g)].at(
    -1,
  );
  if (!match) throw new Error("could not find the service URL in main.log");
  return `http://127.0.0.1:${match[1]}`;
}

function sourceVersion() {
  const match = readFileSync("src/gui.tsx", "utf8").match(/gui v(\d+)/);
  if (!match) throw new Error("no version marker in src/gui.tsx");
  return match[1];
}

/** The API major the package was built against. */
function declaredMajor() {
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));
  const range = manifest.dependencies?.["@opencode/plugin"] ?? "";
  return range.replace(/^[^\d]*/, "").split(".")[0] || "";
}

/** The desktop app's bundled CLI version, which carries the plugin API. */
function appVersion() {
  const path = join(
    process.env.LOCALAPPDATA ?? "",
    "Programs",
    "ai.opencode.desktop",
    "resources",
    "opencode-cli.version",
  );
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return "";
  }
}

let failures = 0;
function check(name, ok, detail = "") {
  if (ok) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

let url;
try {
  url = baseUrl();
} catch (error) {
  console.log(`skipped: ${error.message}`);
  process.exit(strict ? 1 : 0);
}

const auth = `Basic ${Buffer.from(`opencode:${password()}`).toString("base64")}`;

async function get(path) {
  let last = "";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(`${url}${path}`, {
        headers: { Authorization: auth },
      });
      // 404 is what a reload answers with. Anything else — including 401 for a
      // wrong password — is an answer, and repeating it would only hide it.
      if (response.status !== 404) return response;
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error.message;
    }
    if (attempt < ATTEMPTS) await backoff(attempt);
  }
  throw new Error(`${last || "no response"} after ${ATTEMPTS} attempts`);
}

let plugin;
let listed = "nothing";
try {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const response = await get(`/api/plugin`);
    if (response.status === 401) throw new Error("unauthorized");
    const body = await response.json();
    const entries = body.data ?? [];
    listed = entries.map((entry) => entry.id).join(", ") || "nothing";
    plugin = entries.find((entry) => entry.id === PLUGIN_ID);
    if (plugin) break;
    if (attempt < ATTEMPTS) await backoff(attempt);
  }
} catch (error) {
  console.log(`skipped: OpenCode desktop is not reachable (${error.message})`);
  process.exit(strict ? 1 : 0);
}

check(
  "the plugin is registered",
  Boolean(plugin),
  plugin ? "" : `the app listed ${listed}`,
);
if (!plugin) {
  process.exit(1);
}

check(
  "it is active",
  plugin.state?.status === "active",
  JSON.stringify(plugin.state),
);
check(
  "the server advertises its GUI part",
  plugin.features?.gui === true,
  `features=${JSON.stringify(plugin.features)} — check package.json has no exports map`,
);

const gui = await get(`/api/plugin/gui?id=${PLUGIN_ID}`);
check("the GUI bundle is served", gui.status === 200, `HTTP ${gui.status}`);
if (gui.status === 200) {
  const code = await gui.text();
  const expected = sourceVersion();
  check(
    `the served bundle is the current build (v${expected})`,
    code.includes(`gui v${expected}`),
  );
  check(
    "the bundle has no Node stub in its window path",
    !code.includes("[inert module node:path]"),
  );
}

const app = appVersion();
const major = declaredMajor();
if (app && major) {
  check(
    `the app's plugin API major matches the dependency (${app})`,
    app.split(".")[0] === major,
    `package.json targets @opencode/plugin ^${major}.x but the app bundles ${app}. ` +
      "Test against this version and widen the range deliberately.",
  );
} else {
  console.log("  skip no app version available for the compatibility check");
}

console.log(
  failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
