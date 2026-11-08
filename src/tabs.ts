import { canonicalPath } from "./paths";

// Tab identity: the host stores these ids and hands them back in `list`.
export const PLUGIN = "file-editor";
export const LAUNCHER = "open";
export const BROWSER = "browse";

export function tabId(path: string) {
  return `file:${path}`;
}

export function tabKey(path: string) {
  return `${PLUGIN}:${tabId(path)}`;
}

export function keyFor(id: string) {
  return `${PLUGIN}:${id}`;
}

// Tab ids are built with the pure helpers in ./paths; the main process still
// resolves every path with node:path before touching the disk.
export function pathFromId(id: string, base: string) {
  return id.startsWith("file:")
    ? canonicalPath(id.slice("file:".length), base)
    : "";
}

// Which stored tab a launcher click should show: the one its pane already
// stands on, else the last one added. Returns undefined when nothing is stored,
// where the caller opens the transient launcher tab instead.
export function pickShown(
  stored: readonly string[],
  state: (id: string) => string,
): string | undefined {
  for (const id of stored) {
    const value = state(id);
    if (value === "visible" || value === "active") return id;
  }
  return stored.length > 0 ? stored[stored.length - 1] : undefined;
}
