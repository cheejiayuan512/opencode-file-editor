# opencode-file-editor

[![npm version](https://img.shields.io/npm/v/opencode-file-editor?logo=npm)](https://www.npmjs.com/package/opencode-file-editor)
[![npm downloads](https://img.shields.io/npm/dm/opencode-file-editor)](https://www.npmjs.com/package/opencode-file-editor)
[![license](https://img.shields.io/npm/l/opencode-file-editor)](https://github.com/cheejiayuan512/opencode-file-editor/blob/main/LICENSE)
[![CI](https://github.com/cheejiayuan512/opencode-file-editor/actions/workflows/ci.yml/badge.svg)](https://github.com/cheejiayuan512/opencode-file-editor/actions/workflows/ci.yml)
[![GitHub stars](https://img.shields.io/github/stars/cheejiayuan512/opencode-file-editor?style=flat)](https://github.com/cheejiayuan512/opencode-file-editor/stargazers)

A file editor panel for **OpenCode Desktop**. Files open in their own tabs, edits
autosave, and writes never clobber what the agent just changed.

Built on the `@opencode/plugin/gui` SDK, so it uses the app's own buttons, fields,
tooltips, themes and Markdown renderer instead of its own widgets.

Requires **OpenCode Desktop 2.2 or newer**.

## Preview

<img src="https://raw.githubusercontent.com/cheejiayuan512/opencode-file-editor/main/docs/table-view.png" alt="A CSV opened in the table view, with recent files in the side panel" width="880">

<img src="https://raw.githubusercontent.com/cheejiayuan512/opencode-file-editor/main/docs/folder-browser.png" alt="Folder browser with folders in amber and files in neutral" width="880">

<img src="https://raw.githubusercontent.com/cheejiayuan512/opencode-file-editor/main/docs/editor.png" alt="Source editor with line numbers and unsaved-changes marker" width="880">

<sub>Previews use sample data. The panel follows your OpenCode theme.</sub>

## Features

- **Tabs** — one per file, restored per session. `●` marks unsaved changes.
- **Autosave** with `Ctrl/Cmd+S`, undo/redo, and drafts that survive tab switches.
- **Conflict guard** — if a file changes on disk while it is open, autosave stops
  and asks **Reload** or **Overwrite**. It never silently overwrites.
- **Atomic writes** — temp file then rename, so a crash cannot truncate a file.
- **Byte-faithful** — CRLF and UTF-8 BOM are preserved.
- **Markdown preview** rendered by the app's timeline renderer, with a Source toggle.
  Links inside a preview open in another tab.
- **CSV/TSV table view** with row numbers and zebra rows (RFC 4180 quoted fields).
- **Line numbers** that follow word wrap, plus wrap and auto-save toggles.
- **Folder browser** — click any breadcrumb segment to browse, with folders and
  files colour-coded. One Browse tab, no tab per folder.
- **Recent files** on the **Open file** tab.
- **Reveal in file manager** and **copy relative path**.
- Opens file links from chat in a tab instead of the read-only preview.

## Install

```sh
opencode plugin add opencode-file-editor
```

Or add it to your global config so every window has it:

```jsonc
// ~/.config/opencode/opencode.jsonc
{
  "plugins": ["opencode-file-editor"]
}
```

**`npm install` alone does not install the plugin.** It only downloads the files
into the current project's `node_modules`, and OpenCode never looks there. Use
`opencode plugin add`, or list the package in `plugins` as above — OpenCode then
installs it under its own prefix and loads it.

Restart OpenCode Desktop, then open the panel with `Ctrl+Shift+E`
(`Cmd+Shift+E` on macOS), `/editor`, or **+ → File editor** in the session panel.

## Use

- **Open a file** — click a file path in chat, type one in the panel
  (`src/App.tsx`, `C:\...`, `~/notes.md`, `../other/file.ts`), or pick from
  **Recent** / **Browse files**.
- **Navigate** — breadcrumb segments are buttons; each opens the folder.
- **Save** — autosave after a pause; `Ctrl/Cmd+S` saves now. **Reload** re-reads
  from disk. `⋯` holds save, discard, reload, copy path, browse, reveal, settings.
- **Markdown** — `.md`, `.markdown`, `.mdx` open rendered; toggle to source.
- **Tables** — `.csv`, `.tsv` open as a table; first 500 rows, then a note.

## Limits

- 2 MB per file; the panel is not a replacement for a large-file editor.
- UTF-8 only. Invalid UTF-8 and binary files fall back to the app's preview.
- Folder listings cap at 2,000 entries and show the real total.
- This editor only exists inside OpenCode Desktop (GUI plugins are desktop-only).
- Everything runs locally: it reads and writes the files you point it at. Nothing
  is uploaded anywhere.

## Compatibility

| opencode-file-editor | OpenCode Desktop | `@opencode/plugin` |
|---|---|---|
| 0.1.x | 2.2.x | ^2.2.5 |

Tested against OpenCode Desktop 2.2.5. Each release checks the app's plugin-API
major against the dependency before publishing, so a host upgrade fails the
build instead of breaking users.

## Troubleshooting

**Nothing opens when I click a file path.** Update to the latest version and
restart OpenCode Desktop. If it still happens, open **Settings → Extensions →
Plugins**, find the plugin and press **Reload**; a failed load is reported there.

**The panel shows an error instead of a folder.** Restart OpenCode Desktop. The
plugin's Ipc contract is registered for the life of the app, so a freshly updated
plugin needs the app to reconnect.

**Two editor tabs fight over the same file.** You have two copies installed.
Remove either `~/.config/opencode/plugins/file-editor` or the npm package — both
claim the id `file-editor`.

## Development

```sh
npm install
npm run build        # gui-experimental.cjs at the package root
npm test             # builds, then runs every test
npm run typecheck
npm run verify:live  # asks the running desktop app what it actually loaded
```

The package deliberately has **no `exports` map**. OpenCode resolves a plugin's
parts by file name at the package root (`index.ts`, `gui-experimental.cjs`). A
package `exports` entry makes it resolve `<name>/gui-experimental` through
`node_modules`, which cannot work for a directory you point at directly.

The pure logic lives in `src/paths.ts`, `src/links.ts`, `src/tabs.ts`,
`src/status.ts`, `src/view.ts`, `src/recent.ts`, `src/browse.ts` and
`src/reveal.ts`; the filesystem is isolated in `src/fs-core.ts`; the UI is
`src/gui.tsx`.

To try a local checkout instead of the published package:

```jsonc
{ "plugins": ["/absolute/path/to/opencode-file-editor"] }
```

See [`AGENTS.md`](https://github.com/cheejiayuan512/opencode-file-editor/blob/main/AGENTS.md)
for the rules the tests enforce and why each one exists.

## Testing

`npm test` — 83 assertions, no app needed:

| File | Guards |
|---|---|
| `paths`, `links`, `tabs`, `status`, `view`, `recent`, `browse` | pure logic: path joining, link matching, tab ids, table parsing, wrapped-line gutters, listing caps, sorting |
| `contract` | the Ipc id is versioned, and every declared method is provided by `main()` |
| `architecture` | renderer modules import no Node builtins, every `layout.open` uses `tab: "select"`, the panel uses `wide`, refs are attached |
| `bundle` | file-name layout (no `exports`), version marker matches the source, parses as CommonJS |
| `publish` | a real `npm pack` ships only the needed files and stays small |

`npm run verify:live` asks the running app:

```
ok  the plugin is registered
ok  it is active
ok  the server advertises its GUI part
ok  the GUI bundle is served
ok  the served bundle is the current build (vN)
ok  the bundle has no Node stub in its window path
ok  the app's plugin API major matches the dependency (2.2.5)
```

## Releasing

Maintainer notes live in [`AGENTS.md`](https://github.com/cheejiayuan512/opencode-file-editor/blob/main/AGENTS.md).
In short: bump `version`, add a `CHANGELOG.md` entry, push a `v<version>` tag —
`.github/workflows/publish.yml` publishes over OIDC with provenance, no token and
no one-time password.

## License

[MIT](https://github.com/cheejiayuan512/opencode-file-editor/blob/main/LICENSE)
