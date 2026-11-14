# Changelog

## 0.5.1

- **Fixed:** opening **Find in file…** from the menu while a diff was on screen
  left the find bar hidden behind it. Find closes the diff now.
- **Fixed:** the colour layer could break a long word where the textarea does
  not, so a minified line or a long URL wrapped in two different places. It now
  wraps exactly as the plain control does.

## 0.5.0

- **Syntax highlighting** in the source view for the formats that make up most
  of a workspace: JavaScript and TypeScript, JSON, CSS, Python, shell, Ruby, SQL,
  YAML, TOML, C-family (C, C++, C#, Java, Kotlin, Swift, Dart, PHP), Go, Rust and
  Lua. Comments, strings, numbers, keywords and literals get colour; everything
  else stays the theme's text colour. The host's syntax variables are used when
  it defines them.
- The colour layer is painted under the textarea rather than replacing it, so
  undo, autosave, IME composition, selection and the keyboard all still come
  from the native control. The layer is sized to the textarea's client box, so
  the scrollbar cannot make the two wrap at different places.
- **Highlighting turns itself off** instead of guessing: a format with no
  tokenizer, a file over 80 KB or 12,000 tokens, and while an input method is
  composing text. The textarea then shows plain text exactly as before.
- The tokenizer is pure (`src/highlight.ts`) and its test asserts the one thing
  that must never break: the tokens rejoin to the original text byte for byte,
  across every supported language.

## 0.4.2

- **The panel can create files.** Opening a path that does not exist no longer
  ends in "Load failed": it offers **Create file**, and the file browser has a
  **New file** button that creates one in the folder you are looking at. Creating
  over an existing file is refused rather than truncating it.
- **Save as…** writes the buffer to another path and moves the tab with it. An
  existing target asks for a second click before it is replaced, and naming the
  current path is just a save. The old tab no longer keeps a pending autosave
  that would rewrite the file you saved away from.
- Opening a path now distinguishes "does not exist" from "not text", which is
  why the old message was wrong in both cases.

## 0.4.1

- **Find and replace** — `Ctrl/Cmd+F`, or **Find in file…** in the menu. Literal
  matching (a query is text, never a pattern), case toggle, `3 of 17`, previous
  and next with wraparound, replace one or all. Matches are recomputed from the
  buffer on every keystroke, so a stale span can never be replaced.
- **Tab indents and Shift+Tab outdents.** Tab used to move focus out of the
  textarea, which is broken for code. A selection indents every line it touches
  and skips blank lines; a selection ending at a line start does not take the
  line below with it.
- **`Ctrl/Cmd+/` comments or uncomments the selected lines**, with the token the
  format actually uses (`//`, `#`, `--`). Files without line comments — JSON,
  CSS, Markdown — say so rather than writing something invalid.

## 0.4.0

- **Compare with disk.** When the agent changes a file that is open here, the
  panel offered Reload or Overwrite with nothing to look at: Reload drops the
  buffer, Overwrite drops the disk, and either can be the wrong click. The
  conflict bar now has **Compare**, and the menu has **Compare with disk** at any
  time. Lines only on disk are red, lines only in the buffer are green, with
  both line numbers, three lines of context and long unchanged runs collapsed.
- The diff is a pure module (`src/diff.ts`) with tests for insertion, deletion,
  replacement, empty files, blank lines, trailing newlines, numbering on both
  sides, and a rewrite too large to diff line-by-line — which degrades to
  "these lines changed" instead of hanging.
- The comparison is never truncated silently: past 4,000 rows the view says so.

## 0.3.0

- **Report a problem** in the editor menu opens a GitHub issue with the
  diagnostics already filled in: build marker, contract id, platform, file,
  view, size and the last status line, above two questions. Copy diagnostics
  still copies the same block, and is the fallback when there is no browser.
- **Failures are named instead of guessed.** Main throws `FILE_EDITOR:<CODE>`,
  and the window reads the marker rather than searching the message for a word.
  `EACCES` on `notes/TOO_LARGE.md` was reported as "File is over 2 MB"; it now
  says what happened. An unnamed failure shows its first line instead of a
  stack, and `BINARY` has advice for the first time.
- **`verify:live` retries** a 404 or a missing plugin three times before failing,
  and prints the plugins the app did list. It reported two false failures while
  the app was reloading.
- Clipboard writes go through the host's `ctx.system.copy`, not
  `navigator.clipboard`.

## 0.2.6

- **Fixed: one file under two spellings was two buffers.** Tabs and drafts were
  keyed by the path's exact text, so on a case-insensitive volume (macOS APFS,
  Windows NTFS) `Foo.ts` and `foo.ts` opened two tabs over one file, and
  whichever autosaved last silently overwrote the other's edits. Opening a file
  now asks the filesystem whether it is one the panel already holds
  (`sameFile`, device plus inode) and reuses that tab. The Ipc contract moves to
  `file-editor.fs.v4`.
- **A failed read or write is logged**, with the method and the error, in the
  app log where a report can quote it.
- **Copy diagnostics** in the editor menu puts the build marker, contract id,
  platform, file, view, size and last status line on the clipboard.
- **Coverage is measured** (`npm run test:coverage`, reported on CI for Linux).
  It covers the pure helpers and `fs-core` only; the panel cannot run outside
  the host. Report-only: no threshold yet.

## 0.2.5

- **A panel error now stays in the panel.** An error boundary shows what
  happened and a "Try again" button, instead of the error reaching the host.
  A tab list that fails to build falls back to the launcher rather than leaving
  the strip blank. A crash report can now say something.
- **Releases refuse a tag that disagrees with `package.json`.** Tagging `v0.3.0`
  on a `0.2.5` package published nothing — that version already existed — and
  still created the release, so the mismatch was invisible. The tag must now
  match the version and have a CHANGELOG heading.
- **Dependabot watches the host and the actions**, and a nightly job runs the
  suite against the newest published `@opencode/plugin`, which is the one
  dependency that can break the plugin without a commit here.

## 0.2.4

- **Fixed: a `~` base could lose its meaning.** Walking up far enough through
  `..` popped the home marker, leaving a relative path that the main process then
  resolved somewhere else. `..` now stops at the drive, the filesystem root and
  the home folder.
- **Tests run against Windows, macOS and Linux path fixtures**, instead of one
  hand-written Windows base. `test/architecture.test.mjs` fails a test that
  hardcodes a base.
- **CI runs the suite on Ubuntu, Windows and macOS**, and the publish job now
  waits for that matrix, so a one-platform regression cannot reach npm.

## 0.2.3

- **Fixed: breadcrumb clicks on macOS and Linux opened the wrong folder.** The
  segments came back without the leading `/`, so clicking one in the Browse tab
  or the editor header resolved against the home directory. "C:" already carries
  its own root, which is why Windows was unaffected.
- **Fixed: a workspace-relative check ignored case on Linux.** `relativeTo`
  lowercased both sides, so `/home/me/Rep` matched `/home/me/rep/a.ts` and a file
  outside the workspace was presented as if it were inside. Only a Windows drive
  letter is now compared case-insensitively.

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
