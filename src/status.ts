// What a failed save means, in words a user can act on.
//
// The code comes from `codes.ts`, so a failure this plugin named is explained,
// and one it did not is shown as its first line rather than a stack trace. The
// full text is still in the app log and in Copy diagnostics.

import { fsCode, type FsCode } from "./codes";

const ADVICE: Record<FsCode, string> = {
  EXTERNAL_CHANGE: "The file changed on disk.",
  TOO_LARGE: "File is over 2 MB — use an external editor.",
  INVALID_UTF8: "Not UTF-8 text — open it through the normal preview.",
  BINARY: "That file looks binary — open it through the normal preview.",
  NOT_FILE: "That path is not a file.",
};

/** Whether a save failed because the file moved on underneath the editor. */
export function isExternalChange(error: unknown) {
  return fsCode(error) === "EXTERNAL_CHANGE";
}

/** The message an unknown failure carries, without the stack around it. */
function describe(error: unknown) {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" ? message : "";
}

/** One line for the status bar: either advice, or the failure itself. */
export function explain(error: unknown) {
  const code = fsCode(error);
  if (code) return ADVICE[code];

  // An unexpected failure. Its first line is usually the useful part
  // ("EACCES: permission denied, open ..."); the rest is a stack the status bar
  // cannot show, and Copy diagnostics already carries it.
  const first = describe(error)
    .replace(/^[A-Za-z]*Error:\s*/, "")
    .split("\n")[0]
    ?.trim();
  return first ? first.slice(0, 300) : "Something went wrong.";
}
