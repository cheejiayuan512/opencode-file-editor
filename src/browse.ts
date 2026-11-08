// Directory browsing helpers: pure sorting and parent math, no app APIs.

export type Entry = { name: string; dir: boolean };

/** A folder with more entries than this is truncated before it reaches the UI. */
export const MAX_ENTRIES = 2000;

/** Folders first, then files, both in human order (2 before 10). */
export function sortEntries(entries: readonly Entry[]) {
  return [...entries].sort((a, b) => {
    if (a.dir !== b.dir) return a.dir ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
}

/** Caps a listing so a directory with 50k entries cannot freeze the panel. */
export function limitEntries(
  entries: readonly Entry[],
  max = MAX_ENTRIES,
): { entries: Entry[]; total: number } {
  return { entries: entries.slice(0, max), total: entries.length };
}

/** The directory above `path`, or "" at a drive or filesystem root. */
export function parentOf(path: string) {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  const index = normalized.lastIndexOf("/");
  if (index === -1) return "";
  if (index === 0) return "/";
  const parent = normalized.slice(0, index);
  // "C:" alone is a drive, not a folder: keep the slash so it resolves.
  return /^[a-zA-Z]:$/.test(parent) ? `${parent}/` : parent;
}
