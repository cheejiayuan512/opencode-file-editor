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
