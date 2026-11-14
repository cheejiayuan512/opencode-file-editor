// The failures the main process can name, and the marker that carries them
// across the Ipc bridge.
//
// A thrown error's properties do not survive serialization, so the only thing
// the window receives is a message. That message therefore carries the code
// itself, behind a prefix: `FILE_EDITOR:EXTERNAL_CHANGE`. The prefix is what
// makes the match a type rather than a guess — `EACCES` on `notes/TOO_LARGE.md`
// used to satisfy `includes("TOO_LARGE")` and turn a permission failure into
// "File is over 2 MB".

export const CODE_PREFIX = "FILE_EDITOR:";

export const FS_CODES = [
  "EXTERNAL_CHANGE",
  "TOO_LARGE",
  "INVALID_UTF8",
  "BINARY",
  "NOT_FILE",
] as const;

export type FsCode = (typeof FS_CODES)[number];

/** The message an {@link FsError} carries: the one form the window can read. */
export function codeMessage(code: FsCode) {
  return `${CODE_PREFIX}${code}`;
}

/**
 * The code a failure carries, or undefined for one this plugin did not name.
 * Scanning for the prefix rather than the word keeps a host that wraps the
 * message (`invoking 'file-editor.fs.v5:write' failed: FILE_EDITOR:TOO_LARGE`)
 * working, and keeps a file path out of the match.
 */
export function fsCode(error: unknown): FsCode | undefined {
  // Built from the list, so the match can only ever be a code that exists:
  // `[A-Z_]+` missed `INVALID_UTF8`, whose name has a digit in it.
  const pattern = new RegExp(`${CODE_PREFIX}(${FS_CODES.join("|")})`);
  const match = pattern.exec(String(error));
  return FS_CODES.find((code) => code === match?.[1]);
}
