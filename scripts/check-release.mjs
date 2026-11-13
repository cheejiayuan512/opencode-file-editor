// A tag is what users see; package.json is what npm receives. A tag that
// disagrees with the version publishes nothing (that version already exists) and
// still creates a release, so the mismatch stays invisible until someone reports
// a missing fix. This refuses that release instead.
//
// Run by .github/workflows/publish.yml with the pushed tag. Imported by
// test/release.test.mjs, which is why the logic is a pure function.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function checkRelease(tag, version, changelog) {
  const problems = [];
  // A branch or pull-request run has no tag to compare.
  if (!tag) return problems;

  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version))
    problems.push(`package.json version "${version}" is not semver`);

  if (!tag.startsWith("v")) {
    problems.push(`tag "${tag}" must start with v, such as v${version}`);
  } else if (tag.slice(1) !== version) {
    problems.push(
      `tag "${tag}" does not match package.json ${version}: npm would receive ` +
        `${version}, not ${tag.slice(1)}`,
    );
  }

  const escaped = version.replace(/\./g, "\\.");
  if (!new RegExp(`^##\\s+.*${escaped}(?![\\d.-])`, "m").test(changelog))
    problems.push(`CHANGELOG.md has no "## ${version}" heading`);

  return problems;
}

function invokedDirectly() {
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  const tag = process.argv[2] ?? "";
  const version = JSON.parse(readFileSync("package.json", "utf8")).version;
  const changelog = readFileSync("CHANGELOG.md", "utf8");
  const problems = checkRelease(tag, version, changelog);

  for (const problem of problems) console.error(`::error::${problem}`);
  if (problems.length > 0) process.exit(1);
  console.log(tag ? `${tag} matches ${version}` : "no tag to check");
}
