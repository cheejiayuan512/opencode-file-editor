---
name: Verify before claiming
description: Before saying anything works — a build, a fix, a published release, a UI change — run the check that proves it and quote the output. Use when finishing any task in this repo.
---

# Verify before claiming

Claiming something works without running the check is the failure mode this repo
was built around. Every version from 0.1.0 to 0.1.5 shipped at least one bug that
the tests did not catch because nobody looked at the running app.

## The law

**No claim without fresh evidence from this turn.**

If the command was not run in this message, the claim is not allowed. "Should
work", "probably fine", "the tests pass" from an earlier turn — none of those
count.

## The five-step gate

1. **Identify** the one command that would disprove the claim.
2. **Run** it in full.
3. **Read** the entire output and the exit code.
4. **Decide**: does the output actually prove the claim?
5. **State** the claim *with* the evidence, or state the real status.

## Claims and their proof

| Claim | Needs | Not enough |
|---|---|---|
| Tests pass | `npm test` → `# fail 0` | a previous run |
| Build works | `npm run build` → `built in …` | typecheck passing |
| Typecheck clean | `npm run typecheck` → no output | the editor showing no squiggles |
| The plugin loaded | `npm run verify:live` → `features.gui` ok | "it should load" |
| The bundle is current | `verify:live` reports `v<source version>` | the build succeeding |
| Published to npm | `npm view <pkg>@<version> version` returns it | the workflow finishing |
| Images render on npm | page DOM shows `naturalWidth > 0` | the registry readme containing the tag |
| A UI change looks right | a screenshot of the running app | the code compiling |

## Repo-specific traps (each one shipped a bug)

1. **`[inert module node:path]`** — window modules must not import `node:*`.
   Filesystem work lives in `src/fs-core.ts` and crosses the Ipc contract.
2. **Ipc contract id** — the host caches a contract under its id for the life of
   the app. Adding a method without bumping `file-editor.fs.vN` gives
   `no method …` until restart. `test/contract.test.mjs` enforces it.
3. **`{ tab: "select" }`** — the default reuses the preview slot, which the app's
   file viewer owns, so the tab disappears. Every `layout.open` needs it.
4. **No `exports` map** — it makes the loader resolve `<name>/gui-experimental`
   through `node_modules`, which fails for a local directory, and the plugin
   loads with no GUI part. `test/bundle.test.mjs` enforces the layout.
5. **Version marker** — bump `gui vN` when the bundle changes; `verify:live`
   compares it against what the app is actually serving.
6. **The server, not the docs** — when behaviour is unclear, read the running
   server (`/api/plugin`, `/api/plugin/gui`) or the CLI binary's resolver strings
   before assuming how a documented feature behaves locally.

## When you cannot verify

Say so, name the blocker, and stop. An unverified claim is worse than "I could
not check this", because it removes the user's chance to check it themselves.

Examples of honest stops:

- "The publish needs a passkey in a real terminal; npm redacts the auth URL when
  stdout is not a TTY, so I cannot complete it from here."
- "The npm package page is cached at an older version; the registry shows the new
  one but I have not seen the page render it."
