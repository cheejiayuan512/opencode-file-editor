# AGENTS.md

`opencode-file-editor` is an OpenCode Desktop GUI plugin: a file editor panel
with tabs, autosave, external-change protection, Markdown preview, and a folder
browser. Published to npm as `opencode-file-editor`.

**Before claiming anything works**, load the repo skill
`.opencode/skills/verify-before-claiming/SKILL.md` (`@verify-before-claiming`).
It lists the command that proves each kind of claim, the traps that already
shipped bugs, and what to say when a check cannot be run.

The plugin id is `file-editor`, declared in `src/index.ts`. Changing it renames
every stored tab key for existing users — do not change it. It is a public id:
another package claiming it would collide, so treat it as fixed.

## Layout

- `index.ts` — server half. Exists only to own the id; it registers nothing.
- `src/gui.tsx` — the GUI half: the Ipc contract, the panel, the editor, the tree rail, the browser.
- `src/fs-core.ts` — the only module that touches the filesystem. Main process only.
- `src/paths.ts`, `links.ts`, `tabs.ts`, `status.ts`, `view.ts`, `recent.ts`,
  `browse.ts`, `tree.ts`, `reveal.ts` — pure logic the window imports. No Node builtins.
- `test/` — Node test runner. `scripts/` — test build and live verification.
- `gui-experimental.cjs` — build output at the package root, never committed.

## Commands

```sh
npm install
npm run build        # gui-experimental.cjs at the package root
npm test             # builds, then runs every test
npm run typecheck
npm run verify:live  # asks the running desktop app what it actually loaded
npm publish          # prepublishOnly runs typecheck, build and tests
```

## Testing

`npm test` builds first, then runs 122 assertions with no app running:

| File | Guards |
|---|---|
| `paths`, `links`, `tabs`, `status`, `view`, `recent`, `browse`, `tree` | pure logic: path joining, link matching, tab ids, table parsing, wrapped-line gutters, listing caps, sorting, tree rows and keyboard picks |
| `codes` | a failure code is read from the `FILE_EDITOR:` marker, never from a word that a path or message happens to contain |
| `report` | the diagnostics block, the prefilled issue link, a single-line title, and the length cap GitHub accepts |
| `fs-core` | atomic writes, stale-baseline refusal, BOM/CRLF, size and UTF-8 limits, and file identity (`samePath` by device and inode) |
| `contract` | the Ipc id is versioned, and every declared method is provided by `main()` |
| `architecture` | renderer modules import no Node builtins, every `layout.open` uses `tab: "select"`, the panel uses `wide`, refs are attached |
| `bundle` | file-name layout (no `exports`), version marker matches the source, parses as CommonJS |
| `release` | a tag that disagrees with `package.json`, or has no CHANGELOG heading, is refused |
| `publish` | a real `npm pack` ships only the needed files and stays small |

`npm run test:coverage` reports coverage for the modules the tests load: the
pure helpers and `fs-core`. It says nothing about `src/gui.tsx`, which cannot
run outside the host — that half is covered by `verify:live` and the bundle
tests instead. The number is a baseline, not a gate.

`npm run verify:live` asks the running app what it actually loaded:

```
ok  the plugin is registered
ok  it is active
ok  the server advertises its GUI part
ok  the GUI bundle is served
ok  the served bundle is the current build (vN)
ok  the bundle has no Node stub in its window path
ok  the app's plugin API major matches the dependency (2.2.5)
```

## Rules the tests enforce

Read these before changing anything; each one exists because it already shipped
a broken build once.

1. **Never import `node:*` from a window module.** The window bundle swaps Node
   builtins for an inert stub, so a stray `node:path` becomes the literal string
   `[inert module node:path]` at runtime. Filesystem work goes through
   `src/fs-core.ts` and the Ipc contract.
2. **Bump the Ipc contract id when adding a method.** The host keeps a contract
   registered under its id for the life of the app, so a new method answers
   `no method …` until the id changes (`file-editor.fs.vN`). Update
   `test/fixtures/ipc-contract.json` in the same commit; `test/contract.test.mjs`
   fails otherwise.
3. **Open tabs with `{ tab: "select" }`.** The default reuses the preview slot,
   which the app's built-in file viewer owns, so the tab is replaced by it.
4. **Keep the file-name layout.** `package.json` must not have an `exports` map.
   With one, the loader resolves `<name>/gui-experimental` through
   `node_modules`, which cannot work for a directory you point at directly, and
   the plugin silently loads without its GUI part.
5. **Bump `gui vN`** in `src/gui.tsx` when the bundle changes; the build test and
   `verify:live` compare it against what the app is serving.
6. **Every element ref signal needs its `ref={set…}`.** An unattached ref is a
   silent no-op.
7. **Path tests loop over `test/fixtures/paths.mjs`.** One hand-written base
   (`const base = "C:\\Users\\…"`) made every test Windows-only, so a dropped
   leading `/` in 0.2.1 broke clicking a file on macOS and nobody saw it. Add
   the base to `BASES` and let the matrix exercise it; `test/architecture.test.mjs`
   fails if a test file hardcodes one.
8. **Name a failure, do not describe it.** `src/fs-core.ts` throws `FsError`,
   whose message is `FILE_EDITOR:<CODE>` from `src/codes.ts`; the window reads
   that marker with `fsCode`. A bare `throw new Error("TOO_LARGE")` is matched
   by whatever text the message contains, so a path could decide what a failure
   means. `test/architecture.test.mjs` fails a bare `new Error(` in fs-core, and
   `status.ts` will not compile with a code that has no advice.

## Behaviour worth preserving

- The workspace rail is host-backed: `props.screen.file.tree` loads one folder
  at a time and `file.search` answers quick open, so there is no second walk of
  the workspace. Only the selected tab's rail searches; every open tab keeps its
  render mounted.
- Writes are atomic (temp file + rename) and refuse when the file changed on
  disk since it was read; the panel asks **Reload** or **Overwrite**.
- BOM and CRLF are preserved; 2 MB and strict UTF-8 limits are enforced.
- Directory listings cap at `MAX_ENTRIES` (2000) and report the real total.
- Files that fail to open are never added to the recent list.
- **File identity comes from the filesystem, not the string.** `samePath`
  compares `dev` and `ino`, so `Foo.ts` and `foo.ts` on a case-insensitive
  volume are one file with one buffer. Comparing paths as text gives two tabs,
  two drafts and a silent last-save-wins.
- A failed read or write is logged in the main process (`io()` in `main()`), and
  **Copy diagnostics** / **Report a problem** in the editor menu carry the build
  marker, contract id, platform, file and last status line. A report without
  those costs a round trip for each.

## Publishing

1. `npm run verify:live` against the OpenCode Desktop version you claim to
   support. `tested with` belongs in the README compatibility table.
2. Bump `version` in `package.json` and add a `CHANGELOG.md` entry.
3. **First release:** `npm publish` from a real terminal. The npm account uses a
   passkey, so there is no OTP to pass with `--otp`; npm prints a URL and the
   browser completes the write. `prepublishOnly` gates the upload on typecheck,
   build and the full suite.
4. **Every release after that:** configure trusted publishing on npmjs.com
   (Settings → Trusted Publishing → GitHub Actions → `publish.yml`) and push a
   `v*` tag. `.github/workflows/publish.yml` publishes over OIDC with provenance,
   no OTP and no long-lived token, then opens the matching GitHub Release from
   the tag (an existing release is left alone, so re-runs are safe).
5. Do not keep a second copy in `~/.config/opencode/plugins/file-editor` after
   installing the published package: both claim the id.
