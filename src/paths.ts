// Path math for the window half of the plugin. No node:path here: the browser
// bundle swaps Node builtins for an inert stub, so any call would produce a
// placeholder string instead of a path. The main process still resolves the
// final path with node:path before touching the disk.

export function isAbsolutePath(path: string) {
  return (
    /^[a-zA-Z]:[\\/]/.test(path) ||
    path.startsWith("/") ||
    path.startsWith("\\") ||
    path.startsWith("~")
  );
}

/** Joins `path` onto `base` and normalizes separators; keeps absolute input. */
export function canonicalPath(path: string, base: string) {
  const value = path.trim().replace(/\\/g, "/");
  if (!value) return "";
  if (isAbsolutePath(value)) return value;

  const raw = (base || "").replace(/\\/g, "/");
  // A root of "/" survives the trailing-slash trim, or it would read as no base.
  const root = raw.replace(/\/+$/, "") || (raw.startsWith("/") ? "/" : "");
  // A stubbed Node builtin renders as "[inert module …]"; never treat it as a
  // folder. Falling back to the relative value keeps main's resolver in charge.
  if (!root || root.includes("[inert module")) return value;

  // A POSIX root starts with "/", and splitting drops that empty segment. Without
  // this flag "/Users/me/app" + "a.ts" came back as the relative "Users/me/app/a.ts",
  // which the main process then resolved against the base a second time.
  const rooted = root.startsWith("/");
  const parts: string[] = [];
  for (const part of `${root}/${value}`.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      // Do not walk above the drive or the filesystem root.
      if (parts.length > 0 && !/^[a-zA-Z]:$/.test(parts[parts.length - 1]))
        parts.pop();
      continue;
    }
    parts.push(part);
  }
  return `${rooted ? "/" : ""}${parts.join("/")}`;
}

/** The workspace-relative form the host expects for a tab's `file`. */
export function relativeTo(base: string, path: string) {
  if (!base) return path;
  const norm = (value: string) => value.replace(/\\/g, "/").replace(/\/+$/, "");
  const root = norm(base);
  const target = norm(path);
  const prefix = `${root}/`;
  if (target.toLowerCase().startsWith(prefix.toLowerCase()))
    return target.slice(prefix.length);
  return path;
}
