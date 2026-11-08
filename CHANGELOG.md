# Changelog

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
