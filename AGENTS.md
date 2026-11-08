# AGENTS.md

`opencode-file-editor` is an OpenCode Desktop GUI plugin: a file editor panel
with tabs, autosave, external-change protection, Markdown preview, and a folder
browser. Published to npm as `opencode-file-editor`.

The plugin id is `file-editor`, declared in `src/index.ts`. Changing it renames
every stored tab key for existing users — do not change it. It is a public id:
another package claiming it would collide, so treat it as fixed.

## Layout

- `index.ts` — server half. Exists only to own the id; it registers nothing.
- `src/gui.tsx` — the GUI half: the Ipc contract, the panel, the editor, the browser.
- `src/fs-core.ts` — the only module that touches the filesystem. Main process only.
- `src/paths.ts`, `links.ts`, `tabs.ts`, `status.ts`, `view.ts`, `recent.ts`,
  `browse.ts`, `reveal.ts` — pure logic the window imports. No Node builtins.
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

## Behaviour worth preserving

- Writes are atomic (temp file + rename) and refuse when the file changed on
  disk since it was read; the panel asks **Reload** or **Overwrite**.
- BOM and CRLF are preserved; 2 MB and strict UTF-8 limits are enforced.
- Directory listings cap at `MAX_ENTRIES` (2000) and report the real total.
- Files that fail to open are never added to the recent list.

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
   no OTP and no long-lived token.
5. Do not keep a second copy in `~/.config/opencode/plugins/file-editor` after
   installing the published package: both claim the id.
