// Opens the file manager at a file. Pure command construction so the platform
// differences are testable; the main process spawns it.

export function revealCommand(
  platform: NodeJS.Platform,
  path: string,
): [string, string[]] {
  if (platform === "win32") {
    // Explorer wants the switch and the path in one argument.
    return ["explorer.exe", [`/select,${path}`]];
  }
  if (platform === "darwin") {
    return ["open", ["-R", path]];
  }
  const normalized = path.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  const folder = index <= 0 ? "/" : normalized.slice(0, index);
  return ["xdg-open", [folder]];
}
