import { randomBytes } from "node:crypto"
import {
  chmod,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import { homedir } from "node:os"
import { basename, dirname, isAbsolute, join, resolve } from "node:path"
import { codeMessage, type FsCode } from "./codes"

// Anything above this is not something a textarea should try to hold.
export const MAX_BYTES = 2 * 1024 * 1024

/**
 * A failure this plugin named. The code is also in the message, because that is
 * the only part the Ipc bridge carries to the window; see `codes.ts`.
 */
export class FsError extends Error {
  readonly code: FsCode

  constructor(code: FsCode) {
    super(codeMessage(code))
    this.name = "FsError"
    this.code = code
  }
}

export function resolvePath(path: string, base: string) {
  let p = path.trim()
  if (p === "~") p = homedir()
  else if (p.startsWith("~/") || p.startsWith("~\\"))
    p = resolve(homedir(), p.slice(2))

  return isAbsolute(p) ? p : resolve(base || homedir(), p)
}

export type ReadResult = {
  text: string
  eol: string
  bom: boolean
  mtimeMs: number
  size: number
}

export type WriteResult = { message: string; mtimeMs: number; size: number }

// A text file has no NUL or stray control bytes in its first block.
export function looksLikeText(buffer: Buffer) {
  if (buffer.length === 0) return true
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe)
    return true
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff)
    return true
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xef &&
    buffer[1] === 0xbb &&
    buffer[2] === 0xbf
  )
    return true

  for (const byte of buffer) {
    if (byte === 0) return false
    if (byte < 0x09) return false
    // Allow tab, newline, vertical tab, form feed, carriage return and ESC.
    if (byte > 0x0d && byte < 0x20 && byte !== 0x1b) return false
  }
  return true
}

// Decode once, everywhere: strip a BOM, remember the line ending, and hand the
// panel LF text so the textarea and its history work on one shape.
export function decodeText(raw: Buffer) {
  let bom = false
  let start = 0
  if (
    raw.length >= 3 &&
    raw[0] === 0xef &&
    raw[1] === 0xbb &&
    raw[2] === 0xbf
  ) {
    bom = true
    start = 3
  }

  let decoded: string
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(
      raw.subarray(start),
    )
  } catch {
    throw new FsError("INVALID_UTF8")
  }
  if (decoded.includes("\0")) throw new FsError("BINARY")

  const eol = decoded.includes("\r\n") ? "crlf" : "lf"
  return { text: decoded.replace(/\r\n?/g, "\n"), eol, bom }
}

export async function readTextFile(path: string): Promise<ReadResult> {
  const info = await stat(path)
  if (!info.isFile()) throw new FsError("NOT_FILE")
  if (info.size > MAX_BYTES) throw new FsError("TOO_LARGE")
  const decoded = decodeText(await readFile(path))
  return {
    text: decoded.text,
    eol: decoded.eol,
    bom: decoded.bom,
    mtimeMs: info.mtimeMs,
    size: info.size,
  }
}

/**
 * Whether two paths name the same file, decided by the filesystem rather than the
 * string. A case-insensitive volume (macOS APFS, Windows NTFS) answers "Foo.ts"
 * and "foo.ts" for one file; keying a buffer by the spelling would give two tabs
 * and let the last save win.
 */
export async function samePath(a: string, b: string) {
  if (a === b) return true
  try {
    const [left, right] = await Promise.all([stat(a), stat(b)])
    // Device plus inode is the file itself; 0 means the platform did not say.
    return left.ino !== 0 && left.dev === right.dev && left.ino === right.ino
  } catch {
    return false
  }
}

/**
 * Sniffs a file's first block for text. A path that cannot be opened is not text:
 * this answer feeds a click on a file that may have been deleted, so it must never
 * throw out of the Ipc handler.
 */
export async function isTextFile(path: string): Promise<boolean> {
  let handle
  try {
    handle = await open(path, "r")
  } catch {
    return false
  }

  try {
    const buffer = Buffer.alloc(8192)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    return looksLikeText(buffer.subarray(0, bytesRead))
  } catch {
    return false
  } finally {
    await handle.close().catch(() => undefined)
  }
}

/**
 * Writes through a temporary file in the same directory, so a crash or a full
 * disk leaves the original intact instead of a half-written file.
 *
 * `expected` is the content the caller believes is on disk. A mismatch, or a
 * file that vanished, raises EXTERNAL_CHANGE; pass null to overwrite on purpose.
 */
export async function writeTextFile(
  path: string,
  text: string,
  expected: string | null,
): Promise<WriteResult> {
  if (Buffer.byteLength(text, "utf8") > MAX_BYTES) throw new FsError("TOO_LARGE")

  let existing: ReadResult | undefined
  try {
    existing = await readTextFile(path)
  } catch (error) {
    // An oversized file is replaced: the panel never opened it, so the caller
    // has no baseline to compare against. Anything else — a directory, binary
    // content, permissions — is not ours to write over.
    if (error instanceof FsError) {
      if (error.code !== "TOO_LARGE") throw error
    } else if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      if (expected !== null) throw new FsError("EXTERNAL_CHANGE")
    } else {
      throw error
    }
  }

  if (expected !== null && existing && existing.text !== expected) {
    throw new FsError("EXTERNAL_CHANGE")
  }

  // Keep the file's own convention rather than rewriting every line ending.
  const eol = existing?.eol ?? "lf"
  const bom = existing?.bom ?? false
  const body = eol === "crlf" ? text.replace(/\n/g, "\r\n") : text
  const bytes = Buffer.from(body, "utf8")
  const buffer = bom
    ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes])
    : bytes

  let mode = 0o600
  try {
    mode = (await stat(path)).mode & 0o777
  } catch {
    // New file: 600 is the safer default.
  }

  const temporary = join(
    dirname(path),
    `.${basename(path)}.file-editor-${randomBytes(6).toString("hex")}.tmp`,
  )
  await writeFile(temporary, buffer, { mode })
  try {
    await chmod(temporary, mode).catch(() => undefined)
    await rename(temporary, path)
  } catch (error) {
    // Windows refuses to replace a file another process holds open.
    const code = (error as NodeJS.ErrnoException).code
    if (
      process.platform === "win32" &&
      (code === "EPERM" || code === "EBUSY" || code === "EACCES")
    ) {
      await writeFile(path, buffer, { mode })
    } else {
      throw error
    }
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined)
  }

  const info = await stat(path)
  return { message: `Saved ${path}`, mtimeMs: info.mtimeMs, size: info.size }
}
