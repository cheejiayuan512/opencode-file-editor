// What a failed save means, in words a user can act on.

export function isExternalChange(error: unknown) {
  return String(error).includes("EXTERNAL_CHANGE");
}

export function explain(error: unknown) {
  const raw = String(error);
  if (raw.includes("EXTERNAL_CHANGE")) return "The file changed on disk.";
  if (raw.includes("TOO_LARGE"))
    return "File is over 2 MB — use an external editor.";
  if (raw.includes("INVALID_UTF8"))
    return "Not UTF-8 text — open it through the normal preview.";
  if (raw.includes("NOT_FILE")) return "That path is not a file.";
  return raw;
}
