// Presentation helpers for the panel: the breadcrumb in the header and the
// table renderer for delimited files. No Node builtins, no app APIs.

/** Splits a path into the segments a breadcrumb shows. */
export function breadcrumbs(path: string) {
  return path
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part.length > 0);
}

/** Breadcrumb segments paired with the directory each one opens. */
export function crumbTrail(path: string) {
  const normalized = path.replace(/\\/g, "/");
  // A POSIX path's first segment must keep the root, or a click on it resolves
  // against the home directory instead of the filesystem. "C:" already carries
  // its own root.
  const rooted = normalized.startsWith("/");
  const trail: { name: string; path: string }[] = [];
  let acc = "";
  for (const part of breadcrumbs(normalized)) {
    acc = acc ? `${acc}/${part}` : rooted ? `/${part}` : part;
    trail.push({ name: part, path: acc });
  }
  return trail;
}

/**
 * Gutter text: one number per logical line, plus a blank row for each wrapped
 * continuation, so the numbers stay beside the first row of their line.
 */
export function gutterText(lines: number, rows: readonly number[]) {
  const out: string[] = [];
  for (let index = 0; index < lines; index += 1) {
    out.push(String(index + 1));
    const extra = Math.max(0, (rows[index] ?? 1) - 1);
    for (let blank = 0; blank < extra; blank += 1) out.push("");
  }
  return out.join("\n");
}

export function isTablePath(path: string) {
  return /\.(csv|tsv)$/i.test(path);
}

export function delimiterFor(path: string) {
  return /\.tsv$/i.test(path) ? "\t" : ",";
}

export type Table = {
  header: string[];
  rows: string[][];
  truncated: boolean;
};

/**
 * A small RFC 4180 reader: quoted fields may hold the delimiter, newlines and
 * doubled quotes. `limit` caps the rows kept so a huge export cannot freeze the
 * panel; `truncated` says the file had more.
 */
export function parseTable(
  text: string,
  delimiter: string,
  limit = 500,
): Table {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let index = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (index < text.length) {
    const char = text[index]!;

    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        quoted = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    // A quote opens a field only at its start. In an unquoted field it is
    // literal text: `He said "hi",x` is two fields, and the quotes belong to
    // the first one. Treating any quote as an opener used to delete it.
    if (char === '"' && field === "") {
      quoted = true;
      index += 1;
      continue;
    }
    if (char === delimiter) {
      endField();
      index += 1;
      continue;
    }
    if (char === "\n") {
      endRow();
      index += 1;
      // `rows` includes the header, so this is "more data rows than kept".
      // Comparing against `limit` alone reported truncation for a file that
      // had exactly `limit` rows.
      if (rows.length > limit + 1) break;
      continue;
    }
    if (char === "\r") {
      index += 1;
      continue;
    }

    field += char;
    index += 1;
  }

  // A final row without a trailing newline still counts, and still has to be
  // measured against the limit; the early break only runs on a completed row.
  if (field.length > 0 || row.length > 0) endRow();

  const [header = [], ...body] = rows;
  // `body` holds at most `limit + 1` completed rows because of the break.
  return {
    header,
    rows: body.slice(0, limit),
    truncated: body.length > limit,
  };
}
