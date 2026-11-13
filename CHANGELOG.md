# Changelog

## 0.2.2

- **Fixed: clicking a file did nothing on macOS and Linux.** Joining a
  workspace-relative path onto a POSIX root dropped the leading `/`, so the tab
  was keyed by `Users/me/app/a.ts` instead of `/Users/me/app/a.ts`. The main
  process then resolved that relative path against the base a second time and
  the read failed. Windows paths (`C:/…`) never lost a slash, which is why it
  only showed up off Windows.
- Opening a path that cannot be read (deleted between listing and clicking, or a
  folder) now reports "not a text file" instead of throwing out of the Ipc
  handler.

## 0.2.1

- README previews now show the workspace rail and quick open. The demo gained a
  quick-open frame, and `docs/preview.html` renders the tree so the screenshots
  can be regenerated.

## 0.2.0

- **Workspace tree** in a collapsible sidebar, beside every file tab. It reads
  the app's own file model: folders load as you open them, ignored files stay
  muted, and the rail survives tab switches.
- **Quick open**: type in the rail's filter for fuzzy path results, move with
  `Up`/`Down`, and press `Enter` to open. `Esc` clears the filter.
- The rail's width and open state are the app's shared panel sidebar, so they
  persist across restarts; drag its edge to resize.
- No new Ipc method: updating from 0.1.x needs no app restart.

## 0.1.6

- The **File editor** entry in the `+` menu now shows the panel instead of
  collapsing the side pane. The menu renders inside the pane, so the old
  `side.toggle` closed the region the click came from.
- `Ctrl/Cmd+Shift+E` keeps toggling: it closes the panel only when the panel is
  on screen, and shows it when the region is showing Review, Browser or Terminal.

## 0.1.5

- Preview images and the demo GIF are cropped to the panel, with no empty canvas
  around them.

## 0.1.4

- README: animated demo covering the table view, source editor, Markdown preview
  and folder browser.
- Sample files to try the panel with (`docs/samples`): a CSV, a Markdown file and
  a TypeScript module.
- README: testing matrix and live-check output moved to `AGENTS.md`, so the
  package page stays focused on using the plugin.

## 0.1.3

- README rewritten for public readers: explicit requirement line, `Ctrl/Cmd`
  shortcuts, user-level troubleshooting, and absolute links so they resolve on
  npmjs.com as well as GitHub.
- Preview images regenerated with neutral paths (no personal username in the
  breadcrumbs).

## 0.1.2

- README: preview images for the table view, folder browser and source editor.
- The previews are generated from `docs/preview.html` with sample data.

## 0.1.1

- README: npm version, downloads, license, CI and stars badges.
- README: explain that `npm install` alone does not register the plugin.
- CI: OIDC publish workflow for `v*` tags (provenance, no token, no OTP).

## 0.1.0

First release for OpenCode Desktop.

- File editor panel with one tab per file, restored per session.
- Autosave, `Ctrl/Cmd+S`, undo/redo, and a draft that survives tab switches.
- Writes are atomic and guarded: a file changed on disk stops autosave and asks
  to **Reload** or **Overwrite** instead of clobbering it.
- BOM and CRLF are preserved; files over 2 MB or non-UTF-8 are refused.
- Markdown preview rendered by the app's own renderer, with a Source toggle.
- CSV/TSV table view with row numbers and zebra rows.
- Line-number gutter, word wrap, and auto-save toggles (wrap-aware numbers).
- Clickable breadcrumb and a folder browser to find files without leaving the
  panel; files and folders are colour-coded.
- Recent files on the **Open file** tab.
- `Reveal in file manager` and `Copy relative path`.
- Opens file links from chat in a new tab instead of the read-only preview.
