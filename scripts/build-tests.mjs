import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";

// The tests import built ESM, not TypeScript, so Node's test runner needs no
// loader. Each module is bundled on its own, so relative imports carry over.
const outdir = "test/.build";
const entries = [
  "codes",
  "paths",
  "links",
  "tabs",
  "report",
  "status",
  "fs-core",
  "view",
  "recent",
  "reveal",
  "browse",
  "tree",
];

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

for (const name of entries) {
  await build({
    entryPoints: [`src/${name}.ts`],
    outfile: `${outdir}/${name}.mjs`,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node20",
    logLevel: "warning",
  });
}

console.log(`built ${entries.length} test modules in ${outdir}`);
