// Editing operations the textarea does not provide: indent, outdent and comment
// a line. All three work on a selection and return the new selection, because
// the caller has to put the caret back after replacing the whole text.

export type EditResult = { text: string; start: number; end: number };

/** Two spaces, matching the editor's `tab-size: 2`. */
export const INDENT = "  ";

/**
 * The block of whole lines a selection covers, as a half-open range ending at
 * the next newline. A selection that ends exactly at a line start does not own
 * that line — the guard against indenting the line below the one you meant.
 */
export function lineBlock(text: string, start: number, end: number) {
  const from = Math.max(0, Math.min(start, end));
  const to = Math.max(0, Math.max(start, end));

  const first = text.lastIndexOf("\n", from - 1) + 1;
  const scan = to > from && to > 0 && text[to - 1] === "\n" ? to - 1 : to;
  const next = text.indexOf("\n", scan);
  const last = next === -1 ? text.length : next;

  return { first, last };
}

function applyLines(
  text: string,
  start: number,
  end: number,
  change: (line: string) => string,
): EditResult {
  const { first, last } = lineBlock(text, start, end);
  const block = text.slice(first, last);
  const changed = block
    .split("\n")
    .map((line) => (line.trim() === "" ? line : change(line)))
    .join("\n");

  return {
    text: text.slice(0, first) + changed + text.slice(last),
    start: first,
    end: first + changed.length,
  };
}

/** Adds a unit of indentation to every touched line. */
export function indentLines(
  text: string,
  start: number,
  end: number,
  unit: string = INDENT,
): EditResult {
  // A bare caret gets one unit and keeps its place after it.
  if (start === end) {
    const at = Math.max(0, Math.min(start, text.length));
    const next = text.slice(0, at) + unit + text.slice(at);
    return { text: next, start: at + unit.length, end: at + unit.length };
  }
  return applyLines(text, start, end, (line) => unit + line);
}

/**
 * Removes up to one unit of indentation from every touched line, so outdent
 * undoes indent even when the line was indented by hand.
 */
export function outdentLines(
  text: string,
  start: number,
  end: number,
  unit: string = INDENT,
): EditResult {
  // A bare caret outdents the line it is on, wherever in the indentation it
  // sits. Removing only what is to the left of the caret left 3 of 4 spaces
  // behind at column 1, and did nothing at all at column 0.
  if (start === end) {
    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    const lead = /^[ \t]*/.exec(text.slice(lineStart))?.[0] ?? "";
    const remove = Math.min(lead.length, unit === "\t" ? 1 : unit.length);
    if (remove === 0) return { text, start, end };
    return {
      text: text.slice(0, lineStart) + text.slice(lineStart + remove),
      start: Math.max(lineStart, start - remove),
      end: Math.max(lineStart, start - remove),
    };
  }

  return applyLines(text, start, end, (line) => {
    if (line.startsWith(unit)) return line.slice(unit.length);
    if (line.startsWith("\t")) return line.slice(1);
    // A partial unit: take back as many spaces as the line actually has.
    const spaces = /^ +/.exec(line)?.[0].length ?? 0;
    return line.slice(Math.min(spaces, unit.length));
  });
}

/**
 * Adds a line-comment token to every touched line, or removes it when every
 * non-blank line already has one. Blank lines stay blank: a comment token on an
 * empty line is noise, and in YAML it is a syntax error.
 */
export function toggleComment(
  text: string,
  start: number,
  end: number,
  token: string,
): EditResult {
  const { first, last } = lineBlock(text, start, end);
  const lines = text.slice(first, last).split("\n");
  const meaningful = lines.filter((line) => line.trim() !== "");
  const commented =
    meaningful.length > 0 &&
    meaningful.every((line) => line.trimStart().startsWith(token));

  const changed = lines
    .map((line) => {
      if (line.trim() === "") return line;
      if (!commented) {
        const lead = /^\s*/.exec(line)?.[0].length ?? 0;
        return `${line.slice(0, lead)}${token} ${line.slice(lead)}`;
      }
      const index = line.indexOf(token);
      let rest = line.slice(index + token.length);
      // Take back the single space the comment was written with.
      if (rest.startsWith(" ")) rest = rest.slice(1);
      return line.slice(0, index) + rest;
    })
    .join("\n");

  return {
    text: text.slice(0, first) + changed + text.slice(last),
    start: first,
    end: first + changed.length,
  };
}

/**
 * The line-comment token for a path, or undefined when the format has none.
 * Inventing one would write invalid files: a `//` in JSON or CSS is an error,
 * not a comment.
 */
export function commentToken(path: string): string | undefined {
  const name = path.toLowerCase();
  const extension = /\.([a-z0-9]+)$/.exec(name)?.[1] ?? "";
  const base = name.split(/[\\/]/).pop() ?? "";

  if (base === "dockerfile" || base === "makefile" || base === ".gitignore")
    return "#";

  if (
    ["js", "jsx", "mjs", "cjs", "ts", "tsx", "mts", "cts", "java", "c", "h",
      "cpp", "hpp", "cc", "cs", "go", "rs", "swift", "kt", "kts", "scala",
      "dart", "php", "proto", "gradle"].includes(extension)
  )
    return "//";

  if (
    ["py", "pyi", "sh", "bash", "zsh", "rb", "yml", "yaml", "toml", "pl",
      "r", "ini", "cfg", "conf", "env", "tf"].includes(extension)
  )
    return "#";

  if (["sql", "lua", "hs"].includes(extension)) return "--";
  if (extension === "jsonc") return "//";

  return undefined;
}
