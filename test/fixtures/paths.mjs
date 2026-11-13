// Shared path fixtures. Every path helper is checked against all three families,
// not just the developer's machine: 0.2.1 shipped a dropped leading "/" because
// every base in the suite was "C:/…", so the POSIX branch was never exercised.

export const BASES = [
  { label: "posix root", base: "/" },
  { label: "macOS with a space", base: "/Users/tim/My Project" },
  { label: "linux", base: "/home/tim/repo" },
  { label: "windows", base: "C:/Users/tim/Rep" },
  { label: "windows backslashes", base: "C:\\Users\\tim\\Rep" },
  { label: "home", base: "~/repo" },
];

export const WINDOWS_BASE = "C:\\Users\\JIAYUAN\\CursorProjects\\Rep";
export const POSIX_BASE = "/Users/tim/Rep";

/**
 * `[input, the workspace-relative form it must round-trip to]`. Expectations are
 * written out rather than computed, so a helper cannot agree with itself.
 */
export const RELATIVES = [
  ["a.ts", "a.ts"],
  ["src/a.ts", "src/a.ts"],
  ["./a.ts", "a.ts"],
  ["src\\a.ts", "src/a.ts"],
  ["src//a.ts", "src/a.ts"],
  ["a/../b.ts", "b.ts"],
  ["src/../src/b.ts", "src/b.ts"],
];
