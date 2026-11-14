// Syntax highlighting for the source view.
//
// This is a highlighter, not a parser: it knows the shapes that make code
// readable — comments, strings, numbers, keywords — and nothing about scope or
// grammar. Tokenising the whole text at once (rather than line by line) is what
// lets a block comment or a template string cross a newline.
//
// Pure, so the tests can assert the one thing that must never break: the
// concatenated tokens reproduce the input exactly, byte for byte.

export type TokenKind = "plain" | "comment" | "string" | "number" | "keyword" | "literal";

export type Token = { text: string; kind: TokenKind };

export type Language =
  | "js"
  | "ts"
  | "json"
  | "css"
  | "py"
  | "sh"
  | "rb"
  | "sql"
  | "yaml"
  | "toml"
  | "c"
  | "go"
  | "rust"
  | "lua"
  | "plain";

type Spec = {
  line?: string;
  block?: readonly [string, string];
  quotes: readonly string[];
  escapes: boolean;
  /** Triple-quoted strings, as Python's docstrings. */
  triple?: boolean;
  /** Compare a word lowercased: SQL is case-insensitive, C is not. */
  fold?: boolean;
  keywords: ReadonlySet<string>;
  literals?: ReadonlySet<string>;
};

const set = (words: string) => new Set(words.split(/\s+/).filter(Boolean));

const C_LIKE = set(`
  if else for while do switch case default break continue return function fn func
  class struct impl interface enum trait const let var static public private
  protected internal final new delete this self super null nil true false void int
  float double char bool boolean string byte long short unsigned signed try catch
  finally throw throws async await yield import export from package namespace
  using type typedef match loop where pub mut mod use crate dyn ref in is as and
  or not extends implements abstract override virtual inline extern goto sizeof
  defer range select chan map go fallthrough unsafe
`);

const JS = set(`
  const let var function return if else for while do switch case default break
  continue new delete typeof instanceof in of class extends super this null
  undefined true false async await yield try catch finally throw import export
  from as void static get set debugger with
`);

const TS = new Set([
  ...JS,
  ...set(`
    interface type enum namespace declare readonly public private protected
    abstract implements keyof infer satisfies unknown any never string number
    boolean object symbol bigint is asserts
  `),
]);

const PY = set(`
  def class return if elif else for while break continue pass import from as
  with try except finally raise lambda yield global nonlocal assert del in is
  not and or None True False async await self
`);

const SH = set(`
  if then else elif fi for while do done case esac function in return exit export
  local readonly set unset shift source alias echo cd test true false
`);

const RB = set(`
  def end class module if elsif else unless while until for do begin rescue
  ensure raise return yield self nil true false and or not in then case when
  require attr_accessor puts
`);

const SQL = set(`
  select from where insert into values update set delete create table alter drop
  index join left right inner outer on group by order having limit offset union
  all distinct as and or not null is like in between exists case when then else
  end primary key foreign references default asc desc count sum avg min max
`);

const LUA = set(`
  function end if then else elseif for while do repeat until return break local
  in nil true false and or not goto
`);

const BOOLS = set("true false null");
const YAML_BOOLS = set("true false null yes no on off");

const C_SPEC: Omit<Spec, "keywords"> = {
  line: "//",
  block: ["/*", "*/"],
  quotes: ['"', "'"],
  escapes: true,
};

const SPECS: Record<Language, Spec> = {
  js: { ...C_SPEC, quotes: ['"', "'", "`"], keywords: JS, literals: BOOLS },
  ts: { ...C_SPEC, quotes: ['"', "'", "`"], keywords: TS, literals: BOOLS },
  json: { quotes: ['"'], escapes: true, keywords: new Set(), literals: BOOLS },
  css: { ...C_SPEC, keywords: new Set(), literals: BOOLS },
  c: { ...C_SPEC, keywords: C_LIKE, literals: BOOLS },
  go: { ...C_SPEC, keywords: C_LIKE, literals: BOOLS },
  rust: { ...C_SPEC, keywords: C_LIKE, literals: BOOLS },
  py: {
    line: "#",
    quotes: ['"', "'"],
    escapes: true,
    triple: true,
    keywords: PY,
    literals: set("None True False"),
  },
  sh: { line: "#", quotes: ['"', "'"], escapes: true, keywords: SH, literals: BOOLS },
  rb: { line: "#", quotes: ['"', "'"], escapes: true, keywords: RB, literals: BOOLS },
  sql: {
    line: "--",
    block: ["/*", "*/"],
    quotes: ["'", '"'],
    escapes: true,
    fold: true,
    keywords: SQL,
    literals: BOOLS,
  },
  yaml: {
    line: "#",
    quotes: ['"', "'"],
    escapes: false,
    keywords: new Set(),
    literals: YAML_BOOLS,
  },
  toml: {
    line: "#",
    quotes: ['"', "'"],
    escapes: true,
    keywords: new Set(),
    literals: YAML_BOOLS,
  },
  lua: { line: "--", quotes: ['"', "'"], escapes: true, keywords: LUA, literals: BOOLS },
  plain: { quotes: [], escapes: false, keywords: new Set() },
};

const EXTENSIONS: Record<string, Language> = {
  js: "js", jsx: "js", mjs: "js", cjs: "js",
  ts: "ts", tsx: "ts", mts: "ts", cts: "ts",
  json: "json", jsonc: "json",
  css: "css", scss: "css", less: "css",
  py: "py", pyi: "py",
  sh: "sh", bash: "sh", zsh: "sh", env: "sh",
  rb: "rb", rake: "rb",
  sql: "sql",
  yml: "yaml", yaml: "yaml",
  toml: "toml", ini: "toml", cfg: "toml", conf: "toml",
  c: "c", h: "c", cpp: "c", hpp: "c", cc: "c", cs: "c", java: "c", kt: "c",
  kts: "c", swift: "c", dart: "c", php: "c", scala: "c", proto: "c",
  go: "go",
  rs: "rust",
  lua: "lua",
};

/** The language for a path, or "plain" for a format without a tokenizer. */
export function detectLanguage(path: string): Language {
  const extension = /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase() ?? "";
  return EXTENSIONS[extension] ?? "plain";
}

const isWordStart = (char: string) => /[A-Za-z_$]/.test(char);
const isWord = (char: string) => /[A-Za-z0-9_$]/.test(char);
const isDigit = (char: string) => char >= "0" && char <= "9";

/**
 * Split one text into coloured runs. Every character appears exactly once and
 * in order; `plain` is the gap between the shapes that were recognised.
 */
export function tokenize(text: string, language: Language): Token[] {
  const spec = SPECS[language] ?? SPECS.plain;
  const tokens: Token[] = [];
  let plain = 0;
  let index = 0;

  const emit = (end: number, kind: TokenKind) => {
    if (end <= plain) return;
    if (plain < index) tokens.push({ text: text.slice(plain, index), kind: "plain" });
    tokens.push({ text: text.slice(index, end), kind });
    plain = end;
    index = end;
  };

  while (index < text.length) {
    const char = text[index];

    if (spec.line && text.startsWith(spec.line, index)) {
      // A "#" starts a comment only at a line start or after space, so a URL
      // fragment or an issue number in YAML stays text.
      const hashLike = spec.line === "#";
      const before = index === 0 ? "" : text[index - 1];
      if (!hashLike || before === "" || /\s/.test(before)) {
        const end = text.indexOf("\n", index);
        emit(end === -1 ? text.length : end, "comment");
        continue;
      }
    }

    if (spec.block && text.startsWith(spec.block[0], index)) {
      const end = text.indexOf(spec.block[1], index + spec.block[0].length);
      emit(
        end === -1 ? text.length : end + spec.block[1].length,
        "comment",
      );
      continue;
    }

    if (spec.quotes.includes(char)) {
      const triple = spec.triple === true && text.startsWith(char.repeat(3), index);
      const open = triple ? char.repeat(3) : char;
      // Backticks and triple quotes may cross lines; the rest stop at the
      // newline, and an unterminated one is left plain — a stray apostrophe in
      // prose (JSX text, a comment already handled) is not a string.
      const multiline = triple || char === "`";
      let cursor = index + open.length;
      let closed = false;
      while (cursor < text.length) {
        if (!triple && spec.escapes && text[cursor] === "\\") {
          cursor += 2;
          continue;
        }
        if (text.startsWith(open, cursor)) {
          cursor += open.length;
          closed = true;
          break;
        }
        if (text[cursor] === "\n" && !multiline) break;
        cursor += 1;
      }
      if (!closed && !multiline) {
        index += 1;
        continue;
      }
      emit(Math.min(cursor, text.length), "string");
      continue;
    }

    if (isDigit(char)) {
      let cursor = index;
      while (cursor < text.length && /[0-9_]/.test(text[cursor])) cursor += 1;
      if (text[cursor] === "." && isDigit(text[cursor + 1] ?? "")) {
        cursor += 1;
        while (cursor < text.length && /[0-9_]/.test(text[cursor])) cursor += 1;
      }
      if (/[eE]/.test(text[cursor] ?? "") ) {
        let exponent = cursor + 1;
        if (/[+-]/.test(text[exponent] ?? "")) exponent += 1;
        if (isDigit(text[exponent] ?? "")) {
          cursor = exponent;
          while (cursor < text.length && isDigit(text[cursor])) cursor += 1;
        }
      }
      emit(cursor, "number");
      continue;
    }

    if (isWordStart(char)) {
      let cursor = index + 1;
      while (cursor < text.length && isWord(text[cursor])) cursor += 1;
      const word = text.slice(index, cursor);
      const probe = spec.fold ? word.toLowerCase() : word;
      // Literals first: `true` and `null` are words in most keyword lists too,
      // and they read better in the literal colour.
      if (spec.literals?.has(probe)) emit(cursor, "literal");
      else if (spec.keywords.has(probe)) emit(cursor, "keyword");
      else index = cursor;
      continue;
    }

    index += 1;
  }

  if (plain < text.length)
    tokens.push({ text: text.slice(plain), kind: "plain" });
  return tokens;
}

/** Above this the overlay is skipped and the textarea shows plain text. */
export const MAX_HIGHLIGHT_CHARS = 80_000;
export const MAX_TOKENS = 12_000;

/** Tokens for display, or undefined when the text is too big to highlight. */
export function highlight(
  text: string,
  language: Language,
): Token[] | undefined {
  if (language === "plain" || text.length > MAX_HIGHLIGHT_CHARS) return undefined;
  const tokens = tokenize(text, language);
  return tokens.length > MAX_TOKENS ? undefined : tokens;
}
