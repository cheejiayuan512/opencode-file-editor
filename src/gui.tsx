import { readdir, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import {
  ErrorBoundary,
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  on,
  type JSX,
} from "solid-js";
import { Schema } from "effect";
import {
  Command,
  Ipc,
  LinkHandler,
  MenuItem,
  Panel,
  Plugin,
  usePanel,
  type Files,
  type PanelFrame,
  type PanelTab,
  type SessionRef,
  type Ui,
  type UiMenuEntry,
} from "@opencode/plugin/gui";
import {
  isTextFile,
  readTextFile,
  resolvePath,
  writeTextFile,
  type ReadResult,
  type WriteResult,
} from "./fs-core";
import { canonicalPath, relativeTo } from "./paths";
import {
  basenameOf,
  folderOf,
  hrefPath,
  isFileLink,
  isMarkdown,
  isTextPath,
  linkBase,
} from "./links";
import {
  LAUNCHER,
  BROWSER,
  keyFor,
  pathFromId,
  pickShown,
  tabId,
  tabKey,
} from "./tabs";
import { explain, isExternalChange } from "./status";
import {
  crumbTrail,
  delimiterFor,
  gutterText,
  isTablePath,
  parseTable,
} from "./view";
import { parseRecent, pushRecent, serializeRecent } from "./recent";
import { limitEntries, parentOf, sortEntries, type Entry } from "./browse";
import {
  flattenTree,
  folderOfTreePath,
  nextItem,
  sameTreePath,
  type TreeRow,
} from "./tree";
import { revealCommand } from "./reveal";

// The window cannot touch the filesystem, so every read and write crosses IPC.
// `write` takes the content the panel believes is on disk and refuses when it
// no longer matches: the agent edits these same files while the panel is open.
const Fs = Ipc.define({
  // Bumped when methods are added: the host keeps the contract registered under
  // an id across plugin reloads, so an old id would answer with the old methods.
  id: "file-editor.fs.v3",
  methods: {
    read: {
      input: Schema.Struct({ path: Schema.String, base: Schema.String }),
      output: Schema.Struct({
        text: Schema.String,
        eol: Schema.String,
        bom: Schema.Boolean,
        mtimeMs: Schema.Number,
        size: Schema.Number,
      }),
    },
    write: {
      input: Schema.Struct({
        path: Schema.String,
        base: Schema.String,
        text: Schema.String,
        expected: Schema.String,
      }),
      output: Schema.Struct({
        message: Schema.String,
        mtimeMs: Schema.Number,
        size: Schema.Number,
      }),
    },
    forceWrite: {
      input: Schema.Struct({
        path: Schema.String,
        base: Schema.String,
        text: Schema.String,
      }),
      output: Schema.Struct({
        message: Schema.String,
        mtimeMs: Schema.Number,
        size: Schema.Number,
      }),
    },
    resolve: {
      input: Schema.Struct({ path: Schema.String, base: Schema.String }),
      output: Schema.String,
    },
    reveal: {
      input: Schema.Struct({ path: Schema.String, base: Schema.String }),
      output: Schema.Boolean,
    },
    list: {
      input: Schema.Struct({ path: Schema.String, base: Schema.String }),
      output: Schema.Struct({
        entries: Schema.Array(
          Schema.Struct({ name: Schema.String, dir: Schema.Boolean }),
        ),
        total: Schema.Number,
      }),
    },
    exists: {
      input: Schema.Struct({ path: Schema.String, base: Schema.String }),
      output: Schema.Boolean,
    },
    isText: {
      input: Schema.Struct({ path: Schema.String, base: Schema.String }),
      output: Schema.Boolean,
    },
  },
});

type FsClient = {
  read(input: { path: string; base: string }): Promise<ReadResult>;
  write(input: {
    path: string;
    base: string;
    text: string;
    expected: string;
  }): Promise<WriteResult>;
  forceWrite(input: {
    path: string;
    base: string;
    text: string;
  }): Promise<WriteResult>;
  resolve(input: { path: string; base: string }): Promise<string>;
  reveal(input: { path: string; base: string }): Promise<boolean>;
  list(input: {
    path: string;
    base: string;
  }): Promise<{ entries: readonly Entry[]; total: number }>;
  exists(input: { path: string; base: string }): Promise<boolean>;
  isText(input: { path: string; base: string }): Promise<boolean>;
};

// One buffer per path, so switching tabs does not throw away unsaved text.
// The host owns which tabs exist and their order; this only caches their state.
type Buffer = { text: string; baseline: string; dirty: boolean };

const buffers = new Map<string, Buffer>();
const [tick, setTick] = createSignal(0);

// Panel-wide preferences: every tab and the settings dialog read the same ones.
const [lineNumbers, setLineNumbers] = createSignal(true);
const [wordWrap, setWordWrap] = createSignal(false);
const [autoSave, setAutoSave] = createSignal(true);

// The launcher's recent list. Stored in the window so it survives restarts.
const RECENT_KEY = "file-editor:recent";

function readRecent() {
  try {
    return parseRecent(localStorage.getItem(RECENT_KEY));
  } catch {
    return [];
  }
}

const [recent, setRecent] = createSignal<string[]>(readRecent());

function rememberRecent(path: string) {
  const next = pushRecent(recent(), path);
  setRecent(next);
  try {
    localStorage.setItem(RECENT_KEY, serializeRecent(next));
  } catch {
    // A blocked or full storage keeps the list for this session only.
  }
}

function forgetRecent() {
  setRecent([]);
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {
    // Nothing to clear.
  }
}

// The folder the single Browse tab shows; navigating inside it does not add tabs.
const [browsePath, setBrowsePath] = createSignal("");

// The rail's filter is shared by every tab, so switching files does not clear it.
// Expansion lives in the host file model and survives on its own.
const [railQuery, setRailQuery] = createSignal("");
// Fallbacks for a host that predates the shared panel sidebar.
const [railFallbackOpen, setRailFallbackOpen] = createSignal(true);
const [railFallbackWidth, setRailFallbackWidth] = createSignal(240);

function bump() {
  setTick((value) => value + 1);
}

function Browser(props: {
  fs: FsClient;
  ui: Ui;
  start: () => string;
  open: (path: string) => void;
}) {
  const [cwd, setCwd] = createSignal(props.start());
  const [entries, setEntries] = createSignal<readonly Entry[]>([]);
  const [total, setTotal] = createSignal(0);
  const [status, setStatus] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  let seq = 0;

  async function read(dir: string) {
    const run = ++seq;
    setBusy(true);
    try {
      const result = await props.fs.list({ path: dir, base: "" });
      if (run !== seq) return;
      setEntries(result.entries);
      setTotal(result.total);
      setCwd(dir);
      setStatus("");
    } catch (error) {
      if (run !== seq) return;
      setEntries([]);
      setTotal(0);
      setStatus(explain(error));
    } finally {
      if (run === seq) setBusy(false);
    }
  }

  function go(dir: string) {
    if (!dir) return;
    setBrowsePath(dir);
    void read(dir);
  }

  onMount(() => void read(props.start()));

  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        height: "100%",
        "box-sizing": "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: "4px",
          "align-items": "center",
          padding: "4px 8px",
          "border-bottom":
            "1px solid color-mix(in srgb, currentColor 12%, transparent)",
          overflow: "hidden",
          "white-space": "nowrap",
        }}
      >
        <props.ui.IconButton
          icon="arrow-up"
          label="Parent folder"
          size="small"
          disabled={!parentOf(cwd())}
          onClick={() => go(parentOf(cwd()))}
        />
        <For each={crumbTrail(cwd())}>
          {(crumb, index) => (
            <>
              <Show when={index() > 0}>
                <span style={{ opacity: "0.3" }}>›</span>
              </Show>
              <props.ui.Button
                size="small"
                variant="ghost-muted"
                onClick={() => go(crumb.path)}
              >
                {crumb.name}
              </props.ui.Button>
            </>
          )}
        </For>
        <span style={{ flex: "1" }} />
        <Show when={busy()}>
          <props.ui.Loader size="small" />
        </Show>
      </div>

      <div
        style={{
          flex: "1",
          "min-height": "0",
          "overflow-y": "auto",
          padding: "4px",
        }}
      >
        <For each={entries()}>
          {(entry) => {
            const target = () => canonicalPath(entry.name, cwd());
            return (
              <props.ui.Button
                variant="ghost"
                size="small"
                class="w-full"
                onClick={() =>
                  entry.dir ? go(target()) : props.open(target())
                }
              >
                <span
                  style={{
                    display: "flex",
                    gap: "8px",
                    width: "100%",
                    "min-width": "0",
                    "align-items": "center",
                    "text-align": "left",
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      // Folders read as amber, files stay neutral: the usual
                      // file-tree colour code, without inventing a palette.
                      color: entry.dir
                        ? "var(--color-folder, #d9a441)"
                        : undefined,
                      opacity: entry.dir ? undefined : "0.65",
                    }}
                  >
                    <props.ui.Icon
                      name={entry.dir ? "folder" : "file-document"}
                      size="small"
                    />
                  </span>
                  <span
                    style={{
                      overflow: "hidden",
                      "text-overflow": "ellipsis",
                      "white-space": "nowrap",
                      "font-weight": entry.dir ? "600" : undefined,
                    }}
                  >
                    {entry.name}
                  </span>
                </span>
              </props.ui.Button>
            );
          }}
        </For>
        <Show when={entries().length > 0 && entries().length < total()}>
          <div
            style={{
              padding: "6px 10px",
              "font-size": "11.5px",
              opacity: "0.6",
            }}
          >
            Showing the first {entries().length} of {total()} entries.
          </div>
        </Show>
        <Show when={entries().length === 0}>
          <div style={{ padding: "10px", "font-size": "12px", opacity: "0.6" }}>
            {busy()
              ? "Loading…"
              : status()
                ? `Could not read this folder: ${status()}`
                : "This folder is empty."}
          </div>
        </Show>
      </div>

      <Show when={status()}>
        <div
          style={{
            padding: "4px 10px",
            "font-size": "11.5px",
            opacity: "0.6",
            "border-top":
              "1px solid color-mix(in srgb, currentColor 10%, transparent)",
          }}
        >
          {status()}
        </div>
      </Show>
    </div>
  );
}

function Editor(props: {
  fs: FsClient;
  base: () => string;
  path: string;
  open: (path: string) => void;
  browseFolder: (path: string) => void;
  openSettings: () => void;
  ui: Ui;
}) {
  const launcher = !props.path;

  const [pathInput, setPathInput] = createSignal(props.path);
  const [text, setText] = createSignal("");
  const [status, setStatus] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [dirty, setDirty] = createSignal(false);
  const [conflict, setConflict] = createSignal(false);
  const [canUndo, setCanUndo] = createSignal(false);
  const [canRedo, setCanRedo] = createSignal(false);
  const [view, setView] = createSignal<"source" | "preview" | "table">(
    isTablePath(props.path)
      ? "table"
      : isMarkdown(props.path)
        ? "preview"
        : "source",
  );

  const autosaveMs = 900;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let saving = false;
  let queued = false;
  let version = 0;
  let fileSeq = 0;
  let baseline = "";
  let history: string[] = [""];
  let historyIndex = 0;
  let lastChangeAt = 0;

  const stamp = () =>
    new Date().toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

  function cancelAutosave() {
    clearTimeout(timer);
    timer = undefined;
  }

  function scheduleAutosave() {
    cancelAutosave();
    // A conflict is a decision for the user, not something to retry on a timer.
    if (!dirty() || conflict()) return;
    if (!autoSave()) return;
    timer = setTimeout(() => void save(true), autosaveMs);
  }

  // Keep the shared buffer in step so a tab switch does not lose the draft.
  function persist() {
    if (!props.path) return;
    const next = text();
    const nextDirty = next !== baseline;
    const previous = buffers.get(props.path);
    buffers.set(props.path, { text: next, baseline, dirty: nextDirty });
    if (!previous || previous.dirty !== nextDirty) bump();
  }

  function syncHistory() {
    setCanUndo(historyIndex > 0);
    setCanRedo(historyIndex < history.length - 1);
  }

  function resetHistory(value: string) {
    history = [value];
    historyIndex = 0;
    lastChangeAt = 0;
    syncHistory();
  }

  function recordHistory(value: string, big: boolean) {
    const now = Date.now();
    const coalesce =
      !big && now - lastChangeAt < 500 && historyIndex === history.length - 1;

    if (coalesce) {
      history[historyIndex] = value;
    } else {
      history = history.slice(0, historyIndex + 1);
      history.push(value);
      historyIndex = history.length - 1;
      if (history.length > 100) {
        history.shift();
        historyIndex -= 1;
      }
    }

    lastChangeAt = now;
    syncHistory();
  }

  function applyHistory(value: string) {
    version += 1;
    setText(value);
    lastChangeAt = 0;
    const changed = value !== baseline;
    setDirty(changed);
    setStatus(changed ? "Unsaved changes…" : "Saved state");
    persist();
    if (changed) scheduleAutosave();
    syncHistory();
  }

  function undo() {
    if (historyIndex <= 0) return;
    historyIndex -= 1;
    applyHistory(history[historyIndex] ?? "");
  }

  function redo() {
    if (historyIndex >= history.length - 1) return;
    historyIndex += 1;
    applyHistory(history[historyIndex] ?? "");
  }

  function edit(value: string) {
    if (value === text()) return;
    const big = Math.abs(value.length - text().length) > 20;
    version += 1;
    setText(value);
    recordHistory(value, big);
    setDirty(true);
    setStatus("Unsaved changes…");
    persist();
    scheduleAutosave();
  }

  // Best effort: keep the file being left before switching to another one.
  async function flushCurrent() {
    const target = props.path;
    const content = text();
    if (!target || !dirty()) return;
    // Never flush an empty buffer over a file that had content.
    if (content.length === 0 && baseline.length > 0) return;
    // An unresolved conflict stays unresolved; the user decides.
    if (conflict()) return;

    cancelAutosave();
    try {
      await props.fs.write({
        path: target,
        base: props.base(),
        text: content,
        expected: baseline,
      });
      baseline = content;
      if (text() === content) setDirty(false);
      persist();
    } catch (error) {
      if (isExternalChange(error)) {
        setConflict(true);
        setStatus("The file changed on disk. Reload or Overwrite.");
        return;
      }
      // A failed flush must not block opening another file.
    }
  }

  async function load(target = props.path, base = props.base(), force = false) {
    if (!target) {
      setStatus("Enter a file path first.");
      return;
    }

    // Opening a different file would discard the edits the conflict is about.
    if (conflict() && !force) {
      setStatus("Resolve the change to this file first — Reload or Overwrite.");
      return;
    }

    await flushCurrent();

    // Abandon any pending autosave and stop reporting results for the previous file.
    cancelAutosave();
    const seq = ++fileSeq;
    setBusy(true);
    try {
      if (
        !isTextPath(target) ||
        !(await props.fs.isText({ path: target, base }))
      ) {
        if (seq === fileSeq)
          setStatus("Not a text file — open it through the normal preview.");
        return;
      }
      const result = await props.fs.read({ path: target, base });
      if (seq !== fileSeq) return;
      setText(result.text);
      setPathInput(target);
      baseline = result.text;
      resetHistory(result.text);
      setDirty(false);
      setConflict(false);
      version = 0;
      persist();
      rememberRecent(target);
      const shape = result.eol === "crlf" ? "CRLF" : "LF";
      setStatus(`Loaded ${target} — ${shape}${result.bom ? " + BOM" : ""}`);
    } catch (error) {
      if (seq === fileSeq) setStatus(`Load failed: ${explain(error)}`);
    } finally {
      if (seq === fileSeq) setBusy(false);
    }
  }

  async function save(auto = false, force = false) {
    if (auto && (!dirty() || conflict())) return;

    const target = props.path;
    if (!target) {
      if (!auto) setStatus("Enter a file path first.");
      return;
    }

    if (saving) {
      queued = true;
      return;
    }

    const seq = fileSeq;
    const content = text();
    const changed = version;

    // A paste that inserted nothing, then a save, must not erase the file.
    if (auto && content.length === 0 && baseline.length > 0) {
      setStatus("Autosave paused: the file is empty. Ctrl+S saves anyway.");
      return;
    }

    saving = true;
    setBusy(true);
    try {
      const result = force
        ? await props.fs.forceWrite({
            path: target,
            base: props.base(),
            text: content,
          })
        : await props.fs.write({
            path: target,
            base: props.base(),
            text: content,
            expected: baseline,
          });
      if (seq !== fileSeq) return;

      baseline = content;
      setConflict(false);
      persist();
      if (version === changed) {
        setDirty(false);
        cancelAutosave();
        setStatus(auto ? `Autosaved ${stamp()}` : result.message);
      } else {
        setStatus("Unsaved changes…");
        scheduleAutosave();
      }
    } catch (error) {
      if (seq === fileSeq) {
        if (!force && isExternalChange(error)) {
          setConflict(true);
          cancelAutosave();
          setStatus("The file changed on disk. Reload or Overwrite.");
        } else {
          setStatus(`${auto ? "Autosave" : "Save"} failed: ${explain(error)}`);
        }
      }
    } finally {
      saving = false;
      if (seq === fileSeq) setBusy(false);
      if (queued) {
        queued = false;
        scheduleAutosave();
      }
    }
  }

  async function submitPath() {
    const target = pathInput().trim();
    if (!target) return;
    setBusy(true);
    try {
      // `~` and Windows drive rules need the main process; the window has no
      // path module of its own.
      const absolute = await props.fs.resolve({
        path: target,
        base: props.base(),
      });
      props.open(absolute);
    } catch (error) {
      setStatus(`Cannot resolve path: ${explain(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function revealFile() {
    try {
      const opened = await props.fs.reveal({
        path: props.path,
        base: props.base(),
      });
      setStatus(
        opened
          ? "Opened the file manager."
          : "Could not open the file manager.",
      );
    } catch (error) {
      setStatus(`Could not open the file manager: ${explain(error)}`);
    }
  }

  // A clean buffer is re-read so changes made while the tab was closed show up;
  // a dirty one is restored so switching tabs never costs typing.
  onMount(() => {
    if (launcher) return;
    const cached = buffers.get(props.path);
    if (cached?.dirty) {
      setText(cached.text);
      baseline = cached.baseline;
      resetHistory(cached.text);
      setDirty(true);
      setStatus("Restored unsaved changes.");
      return;
    }
    void load(props.path, props.base(), true);
  });

  // Closing the panel between a keystroke and the autosave timer must not drop it.
  onCleanup(() => {
    cancelAutosave();
    void flushCurrent();
  });

  const primaryView = () => (isTablePath(props.path) ? "table" : "preview");
  const table = createMemo(() =>
    isTablePath(props.path)
      ? parseTable(text(), delimiterFor(props.path))
      : undefined,
  );
  const trail = () => {
    const all = crumbTrail(props.path);
    if (all.length <= 4) return all;
    return [
      all[0]!,
      all[1]!,
      { name: "…", path: "" },
      all[all.length - 2]!,
      all[all.length - 1]!,
    ];
  };
  const [wrappedRows, setWrappedRows] = createSignal<number[]>([]);
  const [area, setArea] = createSignal<HTMLTextAreaElement>();
  const [mirror, setMirror] = createSignal<HTMLDivElement>();
  const numbers = () => {
    const lines = Math.max(1, text().split("\n").length);
    return gutterText(lines, wordWrap() ? wrappedRows() : []);
  };
  let gutter: HTMLDivElement | undefined;
  let measureTimer: ReturnType<typeof setTimeout> | undefined;

  // A wrapped line spans several rows. Measure each logical line in a hidden box
  // with the textarea's own styles so the gutter can leave a blank row for every
  // continuation, keeping the numbers beside the first row of their line.
  function scheduleMeasure() {
    clearTimeout(measureTimer);
    measureTimer = setTimeout(measure, 120);
  }

  function measure() {
    const box = mirror();
    const field = area();
    if (!wordWrap() || !lineNumbers() || !box || !field) {
      setWrappedRows([]);
      return;
    }

    const style = getComputedStyle(field);
    const lineHeight = parseFloat(style.lineHeight) || 20;
    const width =
      field.clientWidth -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight) -
      1;
    if (width <= 0) return;

    box.style.width = `${width}px`;
    const rows = text()
      .split("\n")
      .map((line) => {
        box.textContent = line.length > 0 ? line : "\u00a0";
        const height = box.getBoundingClientRect().height;
        return Math.max(1, Math.round(height / lineHeight));
      });

    setWrappedRows(rows);
    if (gutter) gutter.scrollTop = field.scrollTop;
  }

  createEffect(() => {
    view();
    text();
    wordWrap();
    lineNumbers();
    scheduleMeasure();
  });

  createEffect(() => {
    const field = area();
    if (!field) return;
    const observer = new ResizeObserver(() => scheduleMeasure());
    observer.observe(field);
    onCleanup(() => observer.disconnect());
    scheduleMeasure();
  });

  onCleanup(() => clearTimeout(measureTimer));

  const menuItems = (): UiMenuEntry[] => [
    { label: "Save file", onSelect: () => void save() },
    {
      label: "Discard changes",
      disabled: !dirty(),
      onSelect: () => void load(props.path, props.base(), true),
    },
    {
      label: "Reload from disk",
      disabled: busy(),
      onSelect: () => void load(props.path, props.base(), true),
    },
    { type: "separator" },
    {
      label: "Copy relative path",
      onSelect: () => {
        void navigator.clipboard.writeText(
          relativeTo(props.base(), props.path),
        );
        setStatus("Copied path.");
      },
    },
    {
      label: "Browse this folder",
      onSelect: () => props.browseFolder(folderOf(props.path)),
    },
    {
      label: "Reveal in file manager",
      onSelect: () => void revealFile(),
    },
    { type: "separator" },
    { label: "Settings…", onSelect: props.openSettings },
  ];

  const cell = {
    padding: "4px 10px",
    "border-bottom":
      "1px solid color-mix(in srgb, currentColor 10%, transparent)",
    "white-space": "nowrap" as const,
  };
  const head = {
    ...cell,
    "text-align": "left" as const,
    "font-weight": "600" as const,
    "font-size": "11.5px",
    "letter-spacing": "0.02em",
    "border-bottom":
      "1px solid color-mix(in srgb, currentColor 20%, transparent)",
  };
  const num = {
    ...cell,
    width: "1%",
    "text-align": "right" as const,
    opacity: "0.45",
    "font-variant-numeric": "tabular-nums" as const,
  };

  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        height: "100%",
        "box-sizing": "border-box",
      }}
    >
      <Show
        when={!launcher}
        fallback={
          <div
            style={{
              display: "flex",
              "flex-direction": "column",
              gap: "10px",
              padding: "10px",
            }}
          >
            <div
              style={{ display: "flex", gap: "6px", "align-items": "center" }}
            >
              <div style={{ flex: "1", "min-width": "0" }}>
                <props.ui.TextInput
                  value={pathInput()}
                  onInput={(value) => setPathInput(value)}
                  label="File path"
                  placeholder="Path, ~/…, or relative to this session"
                  onSubmit={submitPath}
                  class="w-full"
                />
              </div>
              <props.ui.IconButton
                icon="open-file"
                label="Open file"
                onClick={submitPath}
                disabled={busy()}
              />
            </div>
            <div style={{ display: "flex", "align-items": "center" }}>
              <props.ui.Button
                size="small"
                variant="ghost-muted"
                icon="folder"
                onClick={() => props.browseFolder(props.base())}
              >
                Browse files
              </props.ui.Button>
            </div>
            <Show
              when={recent().length > 0}
              fallback={
                <div
                  style={{
                    flex: "1",
                    display: "flex",
                    "flex-direction": "column",
                    "align-items": "center",
                    "justify-content": "center",
                    gap: "10px",
                    "text-align": "center",
                    opacity: "0.7",
                  }}
                >
                  <props.ui.Icon name="open-file" size="large" />
                  <div style={{ "font-size": "13px" }}>
                    Open a file to start editing
                  </div>
                  <div
                    style={{
                      "font-size": "12px",
                      "max-width": "34ch",
                      "line-height": "1.6",
                    }}
                  >
                    Click a file path in chat, or paste one above. Each file
                    opens in its own tab.
                  </div>
                </div>
              }
            >
              <div
                style={{
                  flex: "1",
                  "min-height": "0",
                  display: "flex",
                  "flex-direction": "column",
                  gap: "2px",
                  "overflow-y": "auto",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    "align-items": "center",
                    "font-size": "11px",
                    "text-transform": "uppercase",
                    "letter-spacing": "0.06em",
                    opacity: "0.5",
                    padding: "2px 4px",
                  }}
                >
                  <span style={{ flex: "1" }}>Recent</span>
                  <props.ui.Button
                    size="small"
                    variant="ghost-muted"
                    onClick={forgetRecent}
                  >
                    Clear
                  </props.ui.Button>
                </div>
                <For each={recent()}>
                  {(path) => (
                    <props.ui.Button
                      variant="ghost"
                      size="small"
                      class="w-full"
                      onClick={() => props.open(path)}
                    >
                      <span
                        style={{
                          display: "flex",
                          gap: "10px",
                          width: "100%",
                          "min-width": "0",
                          "text-align": "left",
                          "align-items": "baseline",
                        }}
                      >
                        <span
                          style={{
                            overflow: "hidden",
                            "text-overflow": "ellipsis",
                            "white-space": "nowrap",
                          }}
                        >
                          {basenameOf(path)}
                        </span>
                        <span
                          style={{
                            flex: "1",
                            "min-width": "0",
                            opacity: "0.45",
                            "font-size": "11px",
                            "text-align": "right",
                            overflow: "hidden",
                            "text-overflow": "ellipsis",
                            "white-space": "nowrap",
                          }}
                        >
                          {folderOf(path)}
                        </span>
                      </span>
                    </props.ui.Button>
                  )}
                </For>
              </div>
            </Show>
          </div>
        }
      >
        <div
          style={{
            display: "flex",
            gap: "8px",
            "align-items": "center",
            padding: "6px 10px",
            "border-bottom":
              "1px solid color-mix(in srgb, currentColor 12%, transparent)",
          }}
        >
          <div
            style={{
              flex: "1",
              "min-width": "0",
              display: "flex",
              "align-items": "center",
              gap: "4px",
              "font-size": "12px",
              "white-space": "nowrap",
              overflow: "hidden",
            }}
          >
            <For each={trail()}>
              {(crumb, index) => (
                <>
                  <Show when={index() > 0}>
                    <span style={{ opacity: "0.3" }}>›</span>
                  </Show>
                  <Show
                    when={crumb.path !== "" && crumb.path !== props.path}
                    fallback={
                      <span
                        style={{
                          opacity:
                            index() === trail().length - 1 ? "1" : "0.55",
                          overflow: "hidden",
                          "text-overflow": "ellipsis",
                        }}
                      >
                        {crumb.name}
                      </span>
                    }
                  >
                    <props.ui.Button
                      size="small"
                      variant="ghost-muted"
                      onClick={() => props.browseFolder(crumb.path)}
                    >
                      {crumb.name}
                    </props.ui.Button>
                  </Show>
                </>
              )}
            </For>
          </div>

          <Show when={isMarkdown(props.path) || isTablePath(props.path)}>
            <div style={{ display: "flex", gap: "2px" }}>
              <props.ui.Button
                size="small"
                variant={view() === primaryView() ? "neutral" : "ghost"}
                onClick={() => setView(primaryView())}
              >
                {primaryView() === "table" ? "Table" : "Preview"}
              </props.ui.Button>
              <props.ui.Button
                size="small"
                variant={view() === "source" ? "neutral" : "ghost"}
                onClick={() => setView("source")}
              >
                Source
              </props.ui.Button>
            </div>
          </Show>

          <Show when={busy()}>
            <props.ui.Loader size="small" />
          </Show>

          <props.ui.Menu label="File actions" items={menuItems()} />
        </div>

        <Show when={conflict()}>
          <div
            style={{
              display: "flex",
              gap: "8px",
              "align-items": "center",
              padding: "8px 10px",
              "border-bottom":
                "1px solid color-mix(in srgb, currentColor 20%, transparent)",
              background: "color-mix(in srgb, currentColor 6%, transparent)",
              "font-size": "12px",
            }}
          >
            <props.ui.Icon name="warning" size="small" />
            <span style={{ flex: "1" }}>
              Changed on disk since you opened it.
            </span>
            <props.ui.Button
              size="small"
              variant="ghost"
              onClick={() => void load(props.path, props.base(), true)}
            >
              Reload
            </props.ui.Button>
            <props.ui.Button
              size="small"
              variant="danger"
              onClick={() => void save(false, true)}
            >
              Overwrite
            </props.ui.Button>
          </div>
        </Show>

        <div
          style={{
            flex: "1",
            display: "flex",
            "min-height": "0",
            position: "relative",
          }}
        >
          <Show when={view() === "source"}>
            <Show when={lineNumbers()}>
              <div
                ref={(element) => (gutter = element)}
                aria-hidden="true"
                style={{
                  "flex-shrink": "0",
                  "overflow-y": "hidden",
                  padding: "10px 6px 10px 10px",
                  "text-align": "right",
                  // Newlines in the numbers string must stay newlines.
                  "white-space": "pre",
                  "border-right":
                    "1px solid color-mix(in srgb, currentColor 8%, transparent)",
                  "font-family":
                    "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)",
                  "font-size": "12.5px",
                  "line-height": "1.65",
                  opacity: "0.35",
                  "user-select": "none",
                  "font-variant-numeric": "tabular-nums",
                }}
              >
                {numbers()}
              </div>
            </Show>
            <textarea
              ref={setArea}
              value={text()}
              onInput={(event) => edit(event.currentTarget.value)}
              onScroll={(event) => {
                if (gutter) gutter.scrollTop = event.currentTarget.scrollTop;
              }}
              onPaste={(event) => {
                const pasted = event.clipboardData?.getData("text/plain");
                // An empty paste must never delete a selection (or the whole file).
                event.preventDefault();
                if (!pasted) {
                  setStatus("Clipboard has no text to paste.");
                  return;
                }

                const area = event.currentTarget;
                const start = area.selectionStart ?? text().length;
                const end = area.selectionEnd ?? start;
                edit(text().slice(0, start) + pasted + text().slice(end));
                requestAnimationFrame(() => {
                  area.selectionStart = area.selectionEnd =
                    start + pasted.length;
                });
              }}
              onKeyDown={(event) => {
                const mod = event.ctrlKey || event.metaKey;
                if (!mod) return;

                const key = event.key.toLowerCase();
                if (key === "s") {
                  event.preventDefault();
                  void save();
                  return;
                }
                if (key === "z") {
                  event.preventDefault();
                  if (event.shiftKey) redo();
                  else undo();
                  return;
                }
                if (key === "y") {
                  event.preventDefault();
                  redo();
                }
              }}
              spellcheck={false}
              placeholder="Changes autosave after a pause; Ctrl+S saves now."
              style={{
                flex: "1",
                "min-width": "0",
                "min-height": "0",
                resize: "none",
                padding: "10px 12px",
                border: "none",
                outline: "none",
                background: "transparent",
                color: "inherit",
                "font-family":
                  "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)",
                "font-size": "12.5px",
                "line-height": "1.65",
                "tab-size": "2",
                "white-space": wordWrap() ? "pre-wrap" : "pre",
                "overflow-x": wordWrap() ? "hidden" : "auto",
              }}
            />
            <div
              ref={setMirror}
              aria-hidden="true"
              style={{
                position: "absolute",
                top: "0",
                left: "0",
                visibility: "hidden",
                "pointer-events": "none",
                "box-sizing": "content-box",
                margin: "0",
                padding: "0",
                border: "0",
                "white-space": "pre-wrap",
                "overflow-wrap": "break-word",
                "font-family":
                  "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)",
                "font-size": "12.5px",
                "line-height": "1.65",
                "tab-size": "2",
              }}
            />
          </Show>

          <Show when={view() === "preview"}>
            <div
              style={{
                flex: "1",
                "min-height": "0",
                "overflow-y": "auto",
                padding: "10px 12px",
              }}
            >
              {props.ui.Markdown({ text: text() })}
            </div>
          </Show>

          <Show when={view() === "table" && table()}>
            <div style={{ flex: "1", "min-height": "0", overflow: "auto" }}>
              <table
                style={{
                  "border-collapse": "collapse",
                  width: "100%",
                  "font-size": "12.5px",
                }}
              >
                <thead>
                  <tr>
                    <th style={num}>#</th>
                    <For each={table()!.header}>
                      {(value) => <th style={head}>{value}</th>}
                    </For>
                  </tr>
                </thead>
                <tbody>
                  <For each={table()!.rows}>
                    {(row, index) => (
                      <tr
                        style={{
                          background:
                            index() % 2 === 0
                              ? undefined
                              : "color-mix(in srgb, currentColor 3%, transparent)",
                        }}
                      >
                        <td style={num}>{index() + 1}</td>
                        <For each={row}>
                          {(value) => <td style={cell}>{value}</td>}
                        </For>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
              <Show when={table()!.truncated}>
                <div
                  style={{
                    padding: "8px 10px",
                    "font-size": "11.5px",
                    opacity: "0.6",
                  }}
                >
                  Showing the first {table()!.rows.length} rows.
                </div>
              </Show>
            </div>
          </Show>
        </div>

        <Show when={status()}>
          <div
            style={{
              display: "flex",
              gap: "6px",
              "align-items": "center",
              padding: "4px 10px",
              "border-top":
                "1px solid color-mix(in srgb, currentColor 10%, transparent)",
              "font-size": "11.5px",
              opacity: "0.6",
            }}
          >
            <Show when={dirty()}>
              <span style={{ color: "var(--color-warning, #d19a3f)" }}>●</span>
            </Show>
            <span
              style={{
                overflow: "hidden",
                "text-overflow": "ellipsis",
                "white-space": "nowrap",
              }}
            >
              {status()}
            </span>
          </div>
        </Show>
      </Show>
    </div>
  );
}

const RAIL_MIN = 160;
const RAIL_MAX = 520;

function clampRailWidth(width: number) {
  return Math.max(RAIL_MIN, Math.min(RAIL_MAX, Math.round(width)));
}

/**
 * The workspace rail sits beside every tab, so the tree stays while files switch.
 * The width and open state are the host's shared inner sidebar, which every side
 * panel uses; the fallbacks keep a build that predates it working.
 */
function Workspace(props: {
  ui: Ui;
  panel: PanelFrame;
  file: Files;
  active: string;
  open: (path: string) => void;
  children: JSX.Element;
}) {
  const sidebar = () => (props.panel as Partial<PanelFrame>).sidebar;
  const opened = () => sidebar()?.opened?.() ?? railFallbackOpen();
  const width = () =>
    clampRailWidth(sidebar()?.width?.() ?? railFallbackWidth());
  const resize = (value: number) => {
    const next = clampRailWidth(value);
    const shared = sidebar();
    if (shared?.resize) shared.resize(next);
    else setRailFallbackWidth(next);
  };
  const toggle = () => {
    const shared = sidebar();
    if (shared?.toggle) shared.toggle();
    else setRailFallbackOpen((value) => !value);
  };

  let drag: { x: number; width: number } | undefined;

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        "min-height": "0",
        "box-sizing": "border-box",
      }}
    >
      <Show when={props.panel.placement?.() !== "mobile"}>
        <Show
          when={opened()}
          fallback={
            <div
              style={{
                display: "flex",
                "flex-direction": "column",
                "align-items": "center",
                gap: "6px",
                padding: "4px 3px",
                "flex-shrink": "0",
                "border-right":
                  "1px solid color-mix(in srgb, currentColor 10%, transparent)",
              }}
            >
              <props.ui.IconButton
                icon="file-tree"
                label="Show files"
                size="small"
                onClick={toggle}
              />
            </div>
          }
        >
          <div
            style={{
              width: `${width()}px`,
              "flex-shrink": "0",
              display: "flex",
              "flex-direction": "column",
              "min-height": "0",
              "border-right":
                "1px solid color-mix(in srgb, currentColor 10%, transparent)",
            }}
          >
            <TreeRail
              ui={props.ui}
              file={props.file}
              active={props.active}
              open={props.open}
              toggle={toggle}
              visible={() => props.panel.visible()}
            />
          </div>
          <div
            role="separator"
            aria-orientation="vertical"
            title="Resize file tree"
            style={{
              width: "5px",
              "flex-shrink": "0",
              cursor: "col-resize",
              "user-select": "none",
              "touch-action": "none",
            }}
            onPointerDown={(event) => {
              drag = { x: event.clientX, width: width() };
              event.currentTarget.setPointerCapture(event.pointerId);
              event.preventDefault();
            }}
            onPointerMove={(event) => {
              if (!drag) return;
              resize(drag.width + event.clientX - drag.x);
            }}
            onPointerUp={(event) => {
              drag = undefined;
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={() => {
              drag = undefined;
            }}
          />
        </Show>
      </Show>

      <div
        style={{
          flex: "1",
          "min-width": "0",
          "min-height": "0",
          display: "flex",
          "flex-direction": "column",
        }}
      >
        {props.children}
      </div>
    </div>
  );
}

function TreeRail(props: {
  ui: Ui;
  file: Files;
  active: string;
  open: (relative: string) => void;
  toggle: () => void;
  /** False while another tab is selected; only the visible rail searches. */
  visible: () => boolean;
}) {
  const [results, setResults] = createSignal<readonly string[]>([]);
  const [searching, setSearching] = createSignal(false);
  const [searchError, setSearchError] = createSignal("");
  const [rootError, setRootError] = createSignal("");
  const [rootBusy, setRootBusy] = createSignal(false);
  const [rootLoaded, setRootLoaded] = createSignal(false);
  const [highlight, setHighlight] = createSignal<string>();

  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let seq = 0;
  // The query this rail last asked the server about. Hidden tabs keep their
  // results; a tab that becomes visible catches up on the shared filter.
  let built = "";

  const activeRelative = () =>
    props.active ? relativeTo(props.file.root, props.active) : "";
  const searchingNow = () => railQuery().trim().length > 0;
  // The first result is ready to open before the pointer moves.
  const picked = () => {
    const value = highlight();
    return value && results().includes(value) ? value : results()[0];
  };

  // Read the host's loaded folders and their expansion on every render, so a
  // toggle, a finished load or a filesystem change updates the rows.
  const tree = createMemo(() =>
    flattenTree(
      (path) =>
        (props.file.tree.list(path) ?? []).map((node) => ({
          name: node.name,
          path: node.path,
          dir: node.type === "directory",
          ignored: node.ignored,
        })),
      (path) => props.file.tree.state(path)?.expanded === true,
      (path) => props.file.tree.state(path),
    ),
  );

  async function loadRoot(force = false) {
    setRootBusy(true);
    try {
      await props.file.tree.sync("", force ? { force: true } : undefined);
      setRootError("");
      setRootLoaded(true);
    } catch (error) {
      setRootError(explain(error));
    } finally {
      setRootBusy(false);
    }
  }

  function searchFor(text: string) {
    clearTimeout(timer);
    controller?.abort();
    seq += 1;
    setHighlight(undefined);
    setSearchError("");
    setResults([]);
    if (!text) {
      setSearching(false);
      return;
    }

    setSearching(true);
    const run = seq;
    timer = setTimeout(() => {
      const request = new AbortController();
      controller = request;
      void props.file
        .search(text, { kind: "file", limit: 200, signal: request.signal })
        .then((paths) => {
          if (run !== seq) return;
          setResults(paths);
          setSearching(false);
        })
        .catch((error) => {
          if (run !== seq || request.signal.aborted) return;
          setResults([]);
          setSearching(false);
          setSearchError(explain(error));
        });
    }, 120);
  }

  function changeQuery(value: string) {
    setRailQuery(value);
  }

  // Every open tab keeps its render mounted; only the selected one searches.
  createEffect(() => {
    const key = `${props.file.root}\n${railQuery().trim()}`;
    if (!props.visible()) return;
    if (key === built) return;
    built = key;
    searchFor(railQuery().trim());
  });

  function toggleFolder(row: TreeRow) {
    if (row.expanded) {
      props.file.tree.collapse(row.path);
      return;
    }

    // Expanding loads the folder's entries by default, as the app's own tree does.
    props.file.tree.expand(row.path);
  }

  function choose(path: string | undefined) {
    if (path) props.open(path);
  }

  function onFilterKeyDown(event: KeyboardEvent) {
    if (!searchingNow()) return;
    if (event.key === "Escape") {
      event.preventDefault();
      changeQuery("");
      return;
    }
    const files = results();
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight(
        nextItem(
          files,
          highlight(),
          event.key === "ArrowDown" ? 1 : -1,
        ),
      );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      choose(picked());
    }
  }

  // The workspace root changes when a session moves; reload its first level.
  createEffect(
    on(
      () => props.file.root,
      () => void loadRoot(),
    ),
  );

  onCleanup(() => {
    clearTimeout(timer);
    controller?.abort();
  });

  const note = (text: string, error = false) => (
    <div
      role={error ? "alert" : "status"}
      style={{
        padding: "8px 10px",
        "font-size": "11.5px",
        opacity: error ? "0.9" : "0.6",
      }}
    >
      {text}
    </div>
  );

  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        "min-height": "0",
        height: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: "4px",
          "align-items": "center",
          padding: "4px 6px",
          "border-bottom":
            "1px solid color-mix(in srgb, currentColor 10%, transparent)",
        }}
      >
        <span
          title={props.file.root}
          style={{
            flex: "1",
            "min-width": "0",
            overflow: "hidden",
            "text-overflow": "ellipsis",
            "white-space": "nowrap",
            "font-size": "12px",
            "font-weight": "600",
          }}
        >
          {basenameOf(props.file.root) || props.file.root}
        </span>
        <props.ui.IconButton
          icon="outline-rotate-clockwise"
          label="Refresh files"
          size="small"
          busy={rootBusy()}
          onClick={() => void loadRoot(true)}
        />
        <props.ui.IconButton
          icon="chevron-left"
          label="Hide file tree"
          size="small"
          onClick={props.toggle}
        />
      </div>

      <div style={{ padding: "6px" }} onKeyDown={onFilterKeyDown}>
        <props.ui.TextInput
          value={railQuery()}
          onInput={changeQuery}
          onSubmit={() => choose(picked())}
          label="Filter files in this workspace"
          placeholder="Filter files"
          type="search"
          class="w-full"
        />
      </div>

      <div
        style={{
          flex: "1",
          "min-height": "0",
          "overflow-y": "auto",
          padding: "2px 4px 8px",
        }}
      >
        <Show
          when={searchingNow()}
          fallback={
            <>
              <Show when={rootBusy() && tree().rows.length === 0}>
                {note("Loading…")}
              </Show>
              <Show when={rootError()}>
                {note(`Could not read this workspace: ${rootError()}`, true)}
              </Show>
              <Show
                when={rootLoaded() && !rootError() && tree().rows.length === 0}
              >
                {note("This workspace has no files.")}
              </Show>
              <For each={tree().rows}>
                {(row) => {
                  const selected = () =>
                    !row.dir && sameTreePath(row.path, activeRelative());
                  return (
                    <div
                      style={{
                        background: selected()
                          ? "color-mix(in srgb, currentColor 9%, transparent)"
                          : undefined,
                        "border-radius": "6px",
                      }}
                    >
                      <props.ui.Button
                        variant="ghost"
                        size="small"
                        class="w-full"
                        onClick={() =>
                          row.dir ? toggleFolder(row) : choose(row.path)
                        }
                      >
                        <span
                          style={{
                            display: "flex",
                            gap: "6px",
                            width: "100%",
                            "min-width": "0",
                            "align-items": "center",
                            "text-align": "left",
                            "padding-left": `${row.depth * 12}px`,
                            opacity: row.ignored ? "0.45" : undefined,
                          }}
                        >
                          <span
                            style={{
                              display: "flex",
                              width: "14px",
                              "flex-shrink": "0",
                              opacity: "0.6",
                            }}
                          >
                            <Show when={row.dir}>
                              <props.ui.Icon
                                name={
                                  row.expanded
                                    ? "chevron-down"
                                    : "chevron-right"
                                }
                                size="small"
                              />
                            </Show>
                          </span>
                          <span
                            style={{
                              display: "flex",
                              "flex-shrink": "0",
                              // Folders read as amber, files stay neutral.
                              color: row.dir
                                ? "var(--color-folder, #d9a441)"
                                : undefined,
                            }}
                          >
                            <props.ui.Icon
                              name={row.dir ? "folder" : "file-document"}
                              size="small"
                            />
                          </span>
                          <span
                            style={{
                              overflow: "hidden",
                              "text-overflow": "ellipsis",
                              "white-space": "nowrap",
                              "font-weight": row.dir ? "600" : undefined,
                            }}
                          >
                            {row.name}
                          </span>
                          <Show when={row.loading}>
                            <span style={{ "font-size": "11px", opacity: "0.5" }}>
                              …
                            </span>
                          </Show>
                        </span>
                      </props.ui.Button>
                    </div>
                  );
                }}
              </For>
              <Show when={tree().truncated}>
                {note(`Showing the first ${tree().rows.length} entries.`)}
              </Show>
            </>
          }
        >
          <Show when={searching()}>{note("Searching…")}</Show>
          <Show when={searchError()}>
            {note(`Search failed: ${searchError()}`, true)}
          </Show>
          <Show when={!searching() && !searchError() && results().length === 0}>
            {note(`No files match “${railQuery().trim()}”.`)}
          </Show>
          <For each={results()}>
            {(path) => {
              const selected = () => picked() === path;
              return (
                <div
                  style={{
                    background: selected()
                      ? "color-mix(in srgb, currentColor 10%, transparent)"
                      : undefined,
                    "border-radius": "6px",
                  }}
                  onMouseEnter={() => setHighlight(path)}
                >
                  <props.ui.Button
                    variant="ghost"
                    size="small"
                    class="w-full"
                    onClick={() => choose(path)}
                  >
                    <span
                      style={{
                        display: "flex",
                        gap: "8px",
                        width: "100%",
                        "min-width": "0",
                        "align-items": "baseline",
                        "text-align": "left",
                      }}
                    >
                      <span
                        style={{
                          overflow: "hidden",
                          "text-overflow": "ellipsis",
                          "white-space": "nowrap",
                        }}
                      >
                        {basenameOf(path)}
                      </span>
                      <span
                        style={{
                          flex: "1",
                          "min-width": "0",
                          opacity: "0.45",
                          "font-size": "11px",
                          "text-align": "right",
                          overflow: "hidden",
                          "text-overflow": "ellipsis",
                          "white-space": "nowrap",
                        }}
                      >
                        {folderOfTreePath(path)}
                      </span>
                    </span>
                  </props.ui.Button>
                </div>
              );
            }}
          </For>
        </Show>
      </div>
    </div>
  );
}

export default Plugin.define({
  i18n: {
    en: {
      title: "File editor",
      command: "Open file editor",
      menu: "File editor",
    },
  },
  setup(ctx) {
    console.log("[file-editor] gui v33");
    const fs = ctx.main(Fs);

    ctx.add(Panel, {
      id: "editor",
      region: "side",
      // `wide` is the supported ask for the wider session minimum; `width` was
      // never part of Panel and was silently ignored.
      wide: true,
      // Relative and absolute ids are the same file; rewrite them to one form.
      normalize: ({ id, session }) => {
        if (!id.startsWith("file:")) return id;
        return tabId(
          canonicalPath(id.slice("file:".length), session.directory),
        );
      },
      list: (input) => {
        // Subscribed so a dirty dot appears without reopening the panel.
        tick();

        const tabs: PanelTab[] = [
          {
            id: LAUNCHER,
            title: "Open file",
            closable: false,
            transient: true,
            pinned: true,
          },
        ];

        try {
          for (const id of input.open) {
            if (!id.startsWith("file:")) continue;
            const path = pathFromId(id, input.session.directory);
            const dirty = buffers.get(path)?.dirty ?? false;
            tabs.push({
              id,
              title: dirty ? `${basenameOf(path)} ●` : basenameOf(path),
              file: relativeTo(input.session.directory, path),
              closable: "compact",
            });
          }

          if (input.open.includes(BROWSER)) {
            tabs.push({
              id: BROWSER,
              title: basenameOf(browsePath()) || "Browse",
              closable: "compact",
            });
          }
        } catch (error) {
          // One unreadable id from stored state must not take the strip with it;
          // the panel would stop rendering and the app would look hung.
          console.error("[file-editor] could not list tabs", error);
          return [tabs[0]!];
        }

        return tabs;
      },
      render: (props) => {
        const panel = usePanel();
        const active = props.tab.id.startsWith("file:")
          ? pathFromId(props.tab.id, props.session.directory)
          : "";
        const openFile = (target: string) => {
          // The rail names workspace-relative paths; a tab is keyed by the
          // absolute file so the same file is one tab from every entry point.
          const absolute = canonicalPath(target, props.screen.file.root);
          rememberRecent(absolute);
          ctx.layout.open(tabKey(absolute), props.session, { tab: "select" });
        };

        // A render error must stay inside the panel. Without a boundary it
        // reaches the host and takes the window with it, which is what a crash
        // report looks like from the outside: no message, nothing to send.
        return (
          <ErrorBoundary
            fallback={(error, reset) => (
              <div
                role="alert"
                style={{
                  display: "flex",
                  "flex-direction": "column",
                  gap: "8px",
                  padding: "14px",
                  "font-size": "12px",
                  "overflow-wrap": "anywhere",
                }}
              >
                <span style={{ "font-weight": "600" }}>
                  The file editor hit an error.
                </span>
                <span style={{ opacity: "0.7", "white-space": "pre-wrap" }}>
                  {String(error)}
                </span>
                <ctx.ui.Button size="small" onClick={() => reset()}>
                  Try again
                </ctx.ui.Button>
              </div>
            )}
          >
            <Workspace
              ui={ctx.ui}
              panel={panel}
              file={props.screen.file}
              active={active}
              open={openFile}
            >
              {props.tab.id === BROWSER ? (
                <Browser
                  fs={fs}
                  ui={ctx.ui}
                  start={() => browsePath() || props.session.directory}
                  open={openFile}
                />
              ) : (
                <Editor
                  fs={fs}
                  base={() => props.session.directory}
                  path={pathFromId(props.tab.id, props.session.directory)}
                  open={openFile}
                  browseFolder={(target) => {
                    setBrowsePath(target);
                    ctx.layout.open(keyFor(BROWSER), props.session, {
                      tab: "select",
                    });
                  }}
                  openSettings={() =>
                    ctx.dialogs.open((dialog) => (
                      <ctx.ui.Dialog
                        title="Editor settings"
                        description="Applies to every open file."
                        footer={
                          <ctx.ui.Button onClick={() => dialog.close()}>
                            Done
                          </ctx.ui.Button>
                        }
                      >
                        <div
                          style={{
                            display: "flex",
                            "flex-direction": "column",
                            gap: "14px",
                          }}
                        >
                          <ctx.ui.Switch
                            label="Line numbers"
                            checked={lineNumbers()}
                            onChange={setLineNumbers}
                          />
                          <ctx.ui.Switch
                            label="Word wrap"
                            checked={wordWrap()}
                            onChange={setWordWrap}
                          />
                          <ctx.ui.Switch
                            label="Auto save"
                            description="Saves after a pause. Ctrl+S always saves."
                            checked={autoSave()}
                            onChange={setAutoSave}
                          />
                        </div>
                      </ctx.ui.Dialog>
                    ))
                  }
                  ui={ctx.ui}
                />
              )}
            </Workspace>
          </ErrorBoundary>
        );
      },
    });

    // `side.toggle` flips the region, and the + menu lives inside the region, so
    // toggling from there closed the pane instead of showing the panel. Both
    // entries now select a tab; only the keybind still closes what it shows.
    const stateOf = (session: SessionRef, id: string) =>
      ctx.layout.state(keyFor(id), session);

    const editorVisible = (session: SessionRef) =>
      ctx.layout.stored(session).some((id) => stateOf(session, id) === "visible");

    const showEditor = (session: SessionRef) => {
      const stored = ctx.layout.stored(session);
      if (stored.length === 0) {
        // Nothing stored yet: the launcher tab is transient, so it is never
        // stored itself and must be opened explicitly.
        ctx.layout.open(keyFor(LAUNCHER), session, { tab: "select" });
        return;
      }
      const shown = pickShown(stored, (id) => stateOf(session, id));
      if (!shown) return;
      ctx.layout.open(keyFor(shown), session, { tab: "select" });
    };

    ctx.add(MenuItem, (): MenuItem => {
      const session = ctx.sessions.current();

      return {
        menu: "session.panel",
        id: "editor",
        title: ctx.t("menu"),
        icon: "file-tree",
        opened:
          !!session &&
          ctx.layout
            .stored(session)
            .some((id) => ctx.layout.state(keyFor(id), session) !== "closed"),
        run: () => {
          const current = ctx.sessions.current();
          // The menu asks for the panel; closing it here is what the click
          // appeared to do. Leave it on screen once it is there.
          if (!current || editorVisible(current)) return;
          showEditor(current);
        },
      };
    });

    ctx.add(Command, (): Command => ({
      id: "open",
      title: ctx.t("command"),
      bind: "mod+shift+e",
      slash: { name: "editor" },
      run: () => {
        const session = ctx.sessions.current();
        if (!session) return;
        // A keybind is a toggle, so it may close the panel. It must not close a
        // region that is showing another panel, which is what it did before.
        if (editorVisible(session)) {
          ctx.layout.side.toggle(session);
          return;
        }
        showEditor(session);
      },
    }));

    // Clicking a file path in chat opens it in its own tab.
    ctx.add(LinkHandler, {
      priority: 1000,
      match: (link) => isFileLink(link) && isTextPath(link.href),
      exists: async (link) => {
        try {
          return await fs.exists({
            path: hrefPath(link.href),
            base: linkBase(link, ctx.sessions.current()?.directory ?? ""),
          });
        } catch {
          // An older main process may not provide `exists`; still offer the link.
          return true;
        }
      },
      open: (link) => {
        const session = ctx.sessions.current();
        if (!session) return;
        const path = canonicalPath(
          hrefPath(link.href),
          linkBase(link, session.directory),
        );
        ctx.layout.open(tabKey(path), session, { tab: "select" });
      },
    });
  },
  main(ctx) {
    ctx.log.write("info", "file-editor main process ready");

    ctx.provide(Fs, {
      read: async ({ path, base }) => readTextFile(resolvePath(path, base)),
      write: async ({ path, base, text, expected }) =>
        writeTextFile(resolvePath(path, base), text, expected),
      forceWrite: async ({ path, base, text }) =>
        writeTextFile(resolvePath(path, base), text, null),
      resolve: async ({ path, base }) => resolvePath(path, base),
      reveal: async ({ path, base }) => {
        const target = resolvePath(path, base);
        try {
          const [command, args] = revealCommand(process.platform, target);
          const child = spawn(command, args, {
            detached: true,
            stdio: "ignore",
          });
          child.unref();
          return true;
        } catch {
          return false;
        }
      },
      list: async ({ path, base }) => {
        const folder = resolvePath(path, base);
        const entries = await readdir(folder, { withFileTypes: true });
        return limitEntries(
          sortEntries(
            entries.map((entry) => ({
              name: entry.name,
              dir: entry.isDirectory(),
            })),
          ),
        );
      },
      exists: async ({ path, base }) => {
        try {
          await stat(resolvePath(path, base));
          return true;
        } catch {
          return false;
        }
      },
      isText: async ({ path, base }) =>
        isTextFile(resolvePath(path, base)),
    });
  },
});
