// A line diff, for the one moment the panel can lose work: the agent changed a
// file that is open here, and the user must choose Reload (take the disk) or
// Overwrite (keep the buffer) without seeing either.
//
// Pure, so the whole feature is tested without a host. The algorithm is LCS on
// lines after trimming the common start and end, which is what keeps a one-line
// edit in a long file cheap; past the cell cap it degrades to "these lines
// changed" instead of hanging.

export type DiffKind = "same" | "added" | "removed";

export type DiffRow = {
  kind: DiffKind;
  text: string;
  /** 1-based line in the old text (disk), when this row exists there. */
  oldNo?: number;
  /** 1-based line in the new text (the buffer), when this row exists there. */
  newNo?: number;
};

/** A run of unchanged lines that is shown as a single row. */
export type DiffLine = DiffRow | { kind: "gap"; count: number };

/**
 * The largest LCS table worth building. Above this the diff is coarse rather
 * than slow: on a 2000×2000 edit the table is 4M cells.
 */
export const MAX_CELLS = 1_000_000;

/** Rows a caller should render; beyond this a diff is not read, it is scrolled. */
export const MAX_DISPLAY = 4000;

/** Lines of context kept around each change when collapsed. */
export const CONTEXT = 3;

/**
 * Split without inventing a last line: "a\n" is one line, not two. The panel
 * stores LF text, so a CR never reaches here.
 */
function split(text: string) {
  if (text === "") return [];
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * LCS over `before` and `after`, with line numbers continuing from the caller's
 * offsets. Both arrays are the unmatched middle of the two texts.
 */
function diffMiddle(
  before: readonly string[],
  after: readonly string[],
  oldStart: number,
  newStart: number,
): DiffRow[] {
  const n = before.length;
  const m = after.length;
  const rows: DiffRow[] = [];
  let oldNo = oldStart;
  let newNo = newStart;

  // Give up on a table this big: every line of the middle changed, and saying
  // so is more honest than a wait.
  if ((n + 1) * (m + 1) > MAX_CELLS) {
    for (const text of before) rows.push({ kind: "removed", text, oldNo: oldNo++ });
    for (const text of after) rows.push({ kind: "added", text, newNo: newNo++ });
    return rows;
  }

  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        before[i] === after[j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(
              table[(i + 1) * width + j],
              table[i * width + j + 1],
            );
    }
  }

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      rows.push({ kind: "same", text: before[i], oldNo: oldNo++, newNo: newNo++ });
      i += 1;
      j += 1;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      rows.push({ kind: "removed", text: before[i], oldNo: oldNo++ });
      i += 1;
    } else {
      rows.push({ kind: "added", text: after[j], newNo: newNo++ });
      j += 1;
    }
  }
  while (i < n) rows.push({ kind: "removed", text: before[i++], oldNo: oldNo++ });
  while (j < m) rows.push({ kind: "added", text: after[j++], newNo: newNo++ });
  return rows;
}

/**
 * Every line of both texts, in order, marked same/added/removed. `before` is
 * what is on disk, `after` is the buffer: an added line is one the buffer has
 * and a Reload would drop.
 */
export function diffLines(before: string, after: string): DiffRow[] {
  const old = split(before);
  const next = split(after);

  let prefix = 0;
  while (prefix < old.length && prefix < next.length && old[prefix] === next[prefix])
    prefix += 1;

  let suffix = 0;
  while (
    suffix < old.length - prefix &&
    suffix < next.length - prefix &&
    old[old.length - 1 - suffix] === next[next.length - 1 - suffix]
  )
    suffix += 1;

  const rows: DiffRow[] = [];
  for (let k = 0; k < prefix; k += 1)
    rows.push({ kind: "same", text: old[k], oldNo: k + 1, newNo: k + 1 });

  rows.push(
    ...diffMiddle(
      old.slice(prefix, old.length - suffix),
      next.slice(prefix, next.length - suffix),
      prefix + 1,
      prefix + 1,
    ),
  );

  for (let k = old.length - suffix; k < old.length; k += 1)
    rows.push({
      kind: "same",
      text: old[k],
      oldNo: k + 1,
      newNo: k + 1 - old.length + next.length,
    });

  return rows;
}

/** How many lines each side added or lost. */
export function counts(rows: readonly DiffRow[]) {
  let added = 0;
  let removed = 0;
  for (const row of rows) {
    if (row.kind === "added") added += 1;
    else if (row.kind === "removed") removed += 1;
  }
  return { added, removed };
}

/**
 * The rows worth rendering: every change with `context` lines around it, and
 * long unchanged runs collapsed into one gap row. An unchanged file yields
 * only gaps — the caller shows "no differences" rather than a wall of text.
 */
export function toDisplay(
  rows: readonly DiffRow[],
  context: number = CONTEXT,
): DiffLine[] {
  if (rows.length === 0) return [];

  const keep = new Uint8Array(rows.length);
  rows.forEach((row, index) => {
    if (row.kind === "same") return;
    const from = Math.max(0, index - context);
    const to = Math.min(rows.length - 1, index + context);
    for (let k = from; k <= to; k += 1) keep[k] = 1;
  });

  const out: DiffLine[] = [];
  let gap = 0;

  for (let index = 0; index < rows.length; index += 1) {
    if (!keep[index]) {
      gap += 1;
      continue;
    }
    if (gap > 0) {
      out.push({ kind: "gap", count: gap });
      gap = 0;
    }
    out.push(rows[index]);
  }
  if (gap > 0) out.push({ kind: "gap", count: gap });

  return out;
}
