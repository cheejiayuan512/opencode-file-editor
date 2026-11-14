// The block of facts a bug report needs, and the link that carries it.
//
// Copy diagnostics gives the text to a user who already knows where the issue
// tracker is. Report a problem opens the form with the same facts filled in, so
// the report arrives actionable in one step instead of three questions.
//
// Pure on purpose: the window builds both and a test can check them without a
// host, a clipboard or a browser.

export const REPO = "https://github.com/cheejiayuan512/opencode-file-editor";

/** GitHub starts rejecting the request well before 8 KB; stay clear of it. */
export const MAX_URL = 7000;

export type ReportFacts = Record<string, string | number | boolean>;

export type ReportInput = {
  version: string;
  contract: string;
  platform: string;
  userAgent: string;
  facts: ReportFacts;
};

/** `key value` lines, in the order given, so a report reads like a form. */
export function formatReport(input: ReportInput): string {
  const lines = [
    `opencode-file-editor ${input.version}`,
    `contract ${input.contract}`,
    `platform ${input.platform || "unknown"}`,
  ];
  for (const [key, value] of Object.entries(input.facts)) {
    const text = String(value).trim();
    lines.push(`${key} ${text || "(empty)"}`);
  }
  lines.push(`user agent ${input.userAgent}`);
  return lines.join("\n");
}

/**
 * The issue title: the last status line, on one line. That is what the reporter
 * would have typed, and it is the field a maintainer sorts by.
 */
export function titleOf(report: string): string {
  const status = /^status (.*)$/m.exec(report)?.[1]?.trim() ?? "";
  const text = status && status !== "(empty)" ? status : "the file editor";
  // Newlines are already impossible here, but a huge error line is not.
  return `Bug: ${text.replace(/\s+/g, " ").slice(0, 90)}`;
}

function bodyOf(report: string): string {
  return [
    "### What happened",
    "",
    "<!-- What did you do, and what did it say? -->",
    "",
    "### Diagnostics",
    "",
    "```",
    report,
    "```",
    "",
  ].join("\n");
}

/**
 * A prefilled issue. The diagnostics are the part that gets shortened when the
 * URL would be too long: the questions stay, because a reporter looking at a
 * wall of machine text in their own words deletes all of it.
 */
export function composeReport(
  report: string,
  repo: string = REPO,
): { url: string; title: string; body: string } {
  const title = titleOf(report);
  const build = (text: string) =>
    `${repo}/issues/new?title=${encodeURIComponent(title)}` +
    `&body=${encodeURIComponent(bodyOf(text))}`;

  let text = report;
  let url = build(text);

  // Halve the diagnostics until the link fits. One pass covers anything
  // realistic; the loop is what makes the bound true rather than likely.
  for (let attempt = 0; url.length > MAX_URL && attempt < 8; attempt += 1) {
    text = `${text.slice(0, Math.floor(text.length / 2))}\n… (truncated - use Copy diagnostics for the rest)`;
    url = build(text);
  }

  return { url, title, body: bodyOf(text) };
}
