import { liveLink } from "./links.ts";
import { MAX_CHARS, hiddenControls, inspectMarkdown } from "./parse.ts";

/**
 * What a field of Markdown text may hold (docs/markdown.md, "Rules for
 * a release"): whether it may link, and whether it must be one
 * paragraph, as a multiple-choice option is.
 */
export interface FieldRule {
  /**
   * False where a link would be in the way: a card's sides, whose
   * keys reveal and grade, and an option or a label, which sit in a
   * `<label>` or a link of their own.
   */
  links: boolean;
  /** True for an option, which must look like the others: one paragraph. */
  inline: boolean;
}

/** A card's side or label: no links. */
export const SIDE: FieldRule = { links: false, inline: false };
/** A multiple-choice option, the right one or a wrong one: no links, one paragraph. */
export const OPTION: FieldRule = { links: false, inline: true };
/** A note, a step's theory or a chapter's description: links that are followed. */
export const PROSE: FieldRule = { links: true, inline: false };

/**
 * What is wrong with a Markdown text as data, for a check of a library
 * (`npm run library:check`) or a hint in an editor. Each holds the
 * Markdown it is about, as written. None of these is a safety rule:
 * the app shows any text safely whatever it holds; these name what it
 * would not show as its author meant.
 */
export type MarkdownProblem =
  /** Longer than MAX_CHARS: shown as plain text. */
  | { code: "tooLong"; length: number }
  /** Past the parser's other limits (docs/markdown.md, Limits): shown as plain text. */
  | { code: "tooComplex" }
  /** Nested past MAX_DEPTH: that part is shown as its source. */
  | { code: "tooDeep"; source: string }
  /** A table past MAX_TABLE_COLUMNS or MAX_TABLE_CELLS: shown as its source. */
  | { code: "largeTable"; source: string }
  /** Raw HTML: shown as its source. */
  | { code: "html"; source: string }
  /** A picture: never shown, only its alt text. */
  | { code: "image"; source: string }
  /** A link in a field that takes none (FieldRule.links), an autolink `<…>` among them. */
  | { code: "link"; source: string; autolink: boolean }
  /** A link that is not followed: not https, or with a user name or password. */
  | { code: "linkNotFollowed"; url: string }
  /** Link text that reads as a host name, or an address, other than the one it leads to, `host`. */
  | { code: "linkHost"; text: string; host: string }
  /** Bidi controls, zero-width or other hidden characters in code or a link: shown as markers. */
  | { code: "hiddenControl"; controls: string[]; in: "code" | "link" }
  /** A character reference outside code, which CommonMark decodes: `&aring;` shows as "å". */
  | { code: "characterReference"; source: string }
  /** An option of more than one paragraph (FieldRule.inline). */
  | { code: "notOneParagraph" }
  /**
   * A line of text with `---` right under it: a heading, not the text
   * and a thematic break, which a blank line between them would make.
   */
  | { code: "dashHeading"; source: string };

/**
 * The problems of a text written in Markdown, in a field held to `rule`,
 * in the order they come. A text past the parser's limits has only that
 * problem, since it is shown as plain text.
 */
export function markdownProblems(text: string, rule: FieldRule): MarkdownProblem[] {
  const inspected = inspectMarkdown(text);
  if (inspected === null)
    return [text.length > MAX_CHARS ? { code: "tooLong", length: text.length } : { code: "tooComplex" }];
  const problems: MarkdownProblem[] = [];
  for (const note of inspected.notes) {
    switch (note.type) {
      case "html":
      case "image":
      case "tooDeep":
      case "largeTable":
      case "characterReference":
      case "dashHeading":
        problems.push({ code: note.type, source: note.source });
        break;
      case "code": {
        const controls = hiddenControls(note.value);
        if (controls.length > 0) problems.push({ code: "hiddenControl", controls, in: "code" });
        break;
      }
      case "link": {
        const live = liveLink(note.url);
        if (!rule.links) problems.push({ code: "link", source: note.source, autolink: note.autolink });
        else if (live === null) problems.push({ code: "linkNotFollowed", url: note.url });
        else if (!leadsTo(note.text, live.href)) problems.push({ code: "linkHost", text: note.text, host: live.host });
        const controls = hiddenControls(note.text + note.url);
        if (controls.length > 0) problems.push({ code: "hiddenControl", controls, in: "link" });
        break;
      }
    }
  }
  if (rule.inline && !inspected.oneParagraph) problems.push({ code: "notOneParagraph" });
  return problems;
}

/** An address with a scheme, `https://…`. */
const ADDRESS = /^[a-z][a-z0-9+.-]*:\/\/\S+$/i;
/** A host name, `example.org` or `www.example.org/path`, by its labels and a top-level one of letters. */
const HOST = /^(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?\.)+\p{L}{2,}(?:[:/?#]\S*)?$/u;

/**
 * Whether link text is no lie about where the link leads: text that
 * reads as an address or a host name names the link's host, give or
 * take a `www.` (`example.org` for `www.example.org`). A domain the host
 * is in is not enough: `github.io` says nothing of who runs
 * `evil.github.io`. Any other text, "the specification", may lead
 * anywhere, as may text taken for a host name that is none, a file's
 * name such as `package.json`, which this flags too: the app shows the
 * host beside every link, the defence against a link that misleads.
 */
function leadsTo(text: string, href: string): boolean {
  const trimmed = text.trim();
  const named = ADDRESS.test(trimmed) ? trimmed : HOST.test(trimmed) ? `https://${trimmed}` : null;
  if (named === null || !URL.canParse(named)) return true;
  const bare = (url: string) => new URL(url).hostname.replace(/^www\./, "");
  return bare(named) === bare(href);
}
