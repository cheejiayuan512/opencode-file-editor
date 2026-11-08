// The launcher's recent list. Pure list handling so it can be tested; the
// caller owns persistence.

export const RECENT_LIMIT = 8;

/** Newest first, no duplicates, capped. */
export function pushRecent(
  list: readonly string[],
  path: string,
  limit = RECENT_LIMIT,
) {
  if (!path) return [...list];
  return [path, ...list.filter((item) => item !== path)].slice(0, limit);
}

/** Reads a stored list, ignoring anything malformed. */
export function parseRecent(raw: string | null, limit = RECENT_LIMIT) {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (item): item is string => typeof item === "string" && item.length > 0,
      )
      .slice(0, limit);
  } catch {
    return [];
  }
}

export function serializeRecent(list: readonly string[]) {
  return JSON.stringify(list);
}
