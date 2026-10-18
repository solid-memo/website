// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { createHash } from "node:crypto";
import { basename } from "node:path";

/**
 * The docs' Mermaid diagrams, as the build draws them (docs/markdown.md,
 * Diagrams): which blocks a page holds and what each must have, the
 * settings Mermaid draws them with, the cache keys of the drawings, and
 * the check every drawing passes before it is used. Nothing here touches
 * a browser or the disk: drawDiagrams.ts does.
 */

/** The two drawings of each diagram: for a light page and for a dark one. */
export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

/** The diagram types the docs may use, as a block's first word names them. */
export const DIAGRAM_TYPES = ["flowchart", "graph", "sequenceDiagram", "stateDiagram-v2"];

/** The font the diagrams are set in, embedded in each drawing: Fredoka, the app's own. */
export const FONT_FAMILY = "Fredoka";

/**
 * The characters a diagram may draw: those Fredoka's Latin file
 * (`fredoka-latin-wght-normal.woff2`) has a glyph for. Printable ASCII,
 * Latin-1 but the soft hyphen, and `– — ‘ ’ “ ” … −`. A character
 * outside would be drawn in some other font, measured with it, and come
 * out differently on each machine. Written out here, not read from the
 * font package's `unicode-range`, which declares code points the file
 * lacks (↑ and ↓ among them); a test holds it to the file's own table.
 */
export const FONT_CHARS: ReadonlySet<number> = new Set([
  ...range(0x20, 0x7e),
  ...range(0xa0, 0xff).filter((code) => code !== 0xad),
  0x2013, // – en dash
  0x2014, // — em dash
  0x2018, // ‘
  0x2019, // ’
  0x201c, // “
  0x201d, // ”
  0x2026, // …
  0x2212, // − minus sign
]);

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

/** What the drawings depend on besides their source; a change to any draws them again. */
export type DrawInputs = {
  /** Mermaid's version. */
  mermaid: string;
  /** The `playwright` package's version, which fixes the Chromium build. */
  playwright: string;
  /** The font file embedded in each drawing. */
  font: Uint8Array;
  /** The font package's LICENSE, whose first line each drawing's notice quotes. */
  license: string;
  /** rendererHash of the code that draws. */
  renderer: string;
};

/** A Mermaid block of a page. */
export type Diagram = {
  /** The page, as its path reads in messages (`docs/srs.md`). */
  file: string;
  /** The line of the opening fence, from 1; Mermaid's line 1 is the next. */
  line: number;
  /** The block's text, between its fences. */
  source: string;
  /** Its `accTitle`: the drawing's alternative text. */
  title: string;
  /** Its `accDescr`: the sentence that says what it shows. */
  description: string;
  /** The drawings' file name, without `.svg` or `.dark.svg`: the page's name and the hash's first 8 digits. */
  name: string;
  /** diagramHash: of the source and the inputs, whichever the theme. */
  hash: string;
  /** cacheKey for each theme. */
  keys: Record<Theme, string>;
};

/** A problem with a page's diagram, at a line of the page. */
export type DiagramProblem = { file: string; line: number; what: string };

/** Problems with diagrams, each with its page and line. */
export class DiagramError extends Error {
  override name = "DiagramError";
  readonly problems: readonly DiagramProblem[];

  constructor(problems: readonly DiagramProblem[]) {
    super(problems.map(({ file, line, what }) => `${file}:${line}: ${what}`).join("\n"));
    this.problems = problems;
  }
}

/**
 * The Mermaid settings for each theme, which are part of every cache
 * key. Labels are SVG text, not HTML (`htmlLabels: false`), so a drawing
 * holds no `<foreignObject>`; every text is set in Fredoka; and the
 * wrapping width is wide enough that no word in the docs' labels is
 * split.
 */
export function diagramTheme(theme: Theme): Record<string, unknown> {
  const family = `"${FONT_FAMILY}"`;
  return {
    startOnLoad: false,
    securityLevel: "strict",
    deterministicIds: true,
    htmlLabels: false,
    theme: theme === "dark" ? "dark" : "default",
    fontFamily: family,
    themeVariables: { fontFamily: family },
    flowchart: { wrappingWidth: 400 },
    sequence: { actorFontFamily: family, noteFontFamily: family, messageFontFamily: family },
  };
}

const sha256 = (...parts: (string | Uint8Array)[]) => {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(part).update("\0");
  return hash.digest("hex");
};

/** A hash of the code that draws (the sources of this module and drawDiagrams.ts): an edit to it draws every diagram again. */
export function rendererHash(sources: readonly string[]): string {
  return sha256(...sources);
}

/** A diagram's hash, whichever the theme: of its source and everything else a drawing depends on. */
export function diagramHash(inputs: DrawInputs, source: string): string {
  return sha256(
    inputs.mermaid,
    inputs.playwright,
    inputs.font,
    inputs.license,
    inputs.renderer,
    source,
  );
}

/** The cache key of a diagram's drawing in one theme: its hash and the theme's settings. */
export function cacheKey(hash: string, theme: Theme): string {
  return sha256(hash, theme, JSON.stringify(diagramTheme(theme)));
}

const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const ACC_TITLE = /^\s*accTitle\s*:(.*)$/;
const ACC_DESCR = /^\s*accDescr\s*:(.*)$/;
const ACC_DESCR_BLOCK = /^\s*accDescr\s*\{(.*)$/;

/**
 * The Mermaid blocks of a page (fenced, info string `mermaid`, at the
 * top level), each checked: of a type the docs use, with an `accTitle`
 * and an `accDescr`, no directive (`%%{…}%%`, which would change how it
 * is drawn), and only characters in FONT_CHARS where it draws text (all
 * but its `accTitle` and `accDescr`, which are not drawn). Throws a
 * DiagramError that lists every problem of the page.
 */
export function diagramsOf(file: string, text: string, inputs: DrawInputs): Diagram[] {
  const page = basename(file).replace(/\.md$/i, "");
  const problems: DiagramProblem[] = [];
  const diagrams: Diagram[] = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const open = FENCE.exec(lines[index]!);
    if (open === null) continue;
    const [, fence, info] = open;
    if (fence![0] === "`" && info!.includes("`")) continue;
    const start = index;
    const body: string[] = [];
    for (index++; index < lines.length; index++) {
      const close = FENCE.exec(lines[index]!);
      if (
        close !== null &&
        close[1]![0] === fence![0] &&
        close[1]!.length >= fence!.length &&
        close[2]!.trim() === ""
      )
        break;
      body.push(lines[index]!);
    }
    if (info!.trim().split(/\s+/)[0]!.toLowerCase() !== "mermaid") continue;
    const block = checkBlock(file, start + 1, body, problems);
    if (block === null) continue;
    const source = body.join("\n");
    const hash = diagramHash(inputs, source);
    diagrams.push({
      file,
      line: start + 1,
      source,
      ...block,
      name: `${page}-${hash.slice(0, 8)}`,
      hash,
      keys: { light: cacheKey(hash, "light"), dark: cacheKey(hash, "dark") },
    });
  }
  if (problems.length > 0) throw new DiagramError(problems);
  return diagrams;
}

/** A block's title and description, or null after adding its problems. */
function checkBlock(
  file: string,
  fenceLine: number,
  body: readonly string[],
  problems: DiagramProblem[],
): { title: string; description: string } | null {
  const before = problems.length;
  const at = (index: number, what: string) =>
    problems.push({ file, line: fenceLine + 1 + index, what });
  let title = "";
  let description = "";
  let type: string | undefined;
  let inDescription = false;
  for (const [index, line] of body.entries()) {
    if (inDescription) {
      const end = line.indexOf("}");
      description += ` ${(end < 0 ? line : line.slice(0, end)).trim()}`;
      inDescription = end < 0;
      continue;
    }
    const titled = ACC_TITLE.exec(line);
    const described = ACC_DESCR.exec(line);
    const opened = ACC_DESCR_BLOCK.exec(line);
    if (titled !== null) title = titled[1]!.trim();
    else if (described !== null) description = described[1]!.trim();
    else if (opened !== null) {
      const end = opened[1]!.indexOf("}");
      description = (end < 0 ? opened[1]! : opened[1]!.slice(0, end)).trim();
      inDescription = end < 0;
    } else {
      const trimmed = line.trim();
      if (trimmed.startsWith("%%{")) {
        at(index, "a directive (%%{…}%%), which would change how the diagram is drawn");
      } else if (type === undefined && trimmed !== "" && !trimmed.startsWith("%%")) {
        type = trimmed.split(/\s+/)[0]!;
        if (!DIAGRAM_TYPES.includes(type))
          at(index, `a "${type}" diagram: the docs draw only ${DIAGRAM_TYPES.join(", ")}`);
      }
      for (const char of new Set(line)) {
        if (!FONT_CHARS.has(char.codePointAt(0)!))
          at(index, `${describe(char)} is not in the diagrams' font`);
      }
    }
  }
  description = description.trim();
  if (type === undefined) at(-1, "an empty diagram");
  if (title === "") at(-1, "no accTitle: the drawing's alternative text");
  if (description === "") at(-1, "no accDescr: the sentence that says what the diagram shows");
  return problems.length === before ? { title, description } : null;
}

/** A character as a message names it: itself and its code point. */
function describe(char: string): string {
  const code = char.codePointAt(0)!;
  const shown = code < 0x20 || code === 0x7f ? "" : `"${char}" `;
  return `${shown}(U+${code.toString(16).toUpperCase().padStart(4, "0")})`;
}

/**
 * Mermaid's message for a block it refused, at the page's line: "Parse
 * error on line 4" of a block whose fence is at line 55 is line 59.
 * The context lines Mermaid adds (the text near the error, a caret under
 * it, what it expected) are kept.
 */
export function mermaidError(message: string, diagram: Diagram): DiagramProblem {
  const at = / on line (\d+)/.exec(message);
  return {
    file: diagram.file,
    line: diagram.line + (at === null ? 0 : Number(at[1])),
    what: at === null ? message : message.replace(at[0], ""),
  };
}

/**
 * The comment each drawing carries after its opening tag, for the
 * embedded font (docs/markdown.md, The diagrams' font): its copyright
 * line, the first of the font package's LICENSE, and its license.
 */
export function fontNotice(license: string): string {
  const copyright = license.split("\n")[0]!.trim();
  if (!copyright.startsWith("Copyright ") || copyright.includes("--"))
    throw new Error(`The font's LICENSE does not start with a copyright line: "${copyright}"`);
  return `<!-- Font: ${FONT_FAMILY}, embedded below. ${copyright} Licensed under the SIL Open Font License, Version 1.1; the full text is in OFL-${FONT_FAMILY}.txt next to this file. The font stays under that license; the drawing does not. -->`;
}

/** The rule that loads the font from its bytes, in the drawing page and in each drawing. */
export function fontFace(font: Uint8Array): string {
  return `@font-face{font-family:"${FONT_FAMILY}";src:url(data:font/woff2;base64,${Buffer.from(font).toString("base64")});font-weight:100 900;}`;
}

const FONT_FACE = new RegExp(
  `@font-face\\{font-family:"${FONT_FAMILY}";src:url\\(data:font/woff2;base64,[A-Za-z0-9+/]+={0,2}\\);font-weight:100 900;\\}`,
);
const NOTICE = new RegExp(
  `^<!-- Font: ${FONT_FAMILY}, embedded below\\. Copyright [^\\n]*? Licensed under the SIL Open Font License, Version 1\\.1; [^\\n]*?-->`,
);

/** A drawing with the font embedded: its notice after the opening tag, its rule first in the drawing's style. */
export function embedFont(svg: string, font: Uint8Array, notice: string): string {
  const open = /^<svg\b[^>]*>/.exec(svg);
  const style = svg.indexOf("<style>");
  if (open === null || style < 0)
    throw new Error("Mermaid's drawing has no <svg> root or no <style>");
  const head = `${open[0]}${notice}`;
  const rest = svg.slice(open[0].length);
  return `${head}${rest.replace("<style>", `<style>${fontFace(font)}`)}`;
}

/** The elements a drawing may have: those Mermaid draws the docs' diagram types with, unprefixed. */
const SVG_ELEMENTS = new Set(
  [
    "svg g defs symbol use marker style title desc",
    "path rect circle ellipse line polyline polygon text tspan",
    "filter feDropShadow linearGradient stop",
  ]
    .join(" ")
    .split(" "),
);

/** The attributes a drawing's elements may have, besides `data-…` and `aria-…`: no `on…`. */
const SVG_ATTRIBUTES = new Set(
  [
    "id class style role name transform viewBox width height x y dx dy",
    "x1 x2 y1 y2 cx cy r rx ry d points offset href xlink:href",
    "fill fill-opacity fill-rule clip-rule stroke stroke-width stroke-dasharray",
    "stroke-linecap stroke-linejoin stroke-opacity opacity filter",
    "marker-start marker-mid marker-end markerWidth markerHeight markerUnits refX refY orient",
    "font-family font-size font-style font-weight text-anchor dominant-baseline alignment-baseline",
    "gradientUnits stop-color stop-opacity flood-color flood-opacity stdDeviation",
  ]
    .join(" ")
    .split(" "),
);

/** The namespaces a drawing may declare, each with the one address it stands for. */
const SVG_NAMESPACES: Record<string, string> = {
  xmlns: "http://www.w3.org/2000/svg",
  "xmlns:xlink": "http://www.w3.org/1999/xlink",
};

/** The character references XML has without a document type, and what each stands for. */
const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

/** Text with its character references read, or null when it has another (`&#…;`, a name XML lacks, a bare `&`). */
function decodeXml(text: string): string | null {
  if (/&(?!(?:amp|lt|gt|quot|apos);)/.test(text)) return null;
  return text.replace(/&(?:amp|lt|gt|quot|apos);/g, (entity) => XML_ENTITIES[entity]!);
}

/** A tag of a drawing, read strictly: a plain name, each attribute `name="…"` or `name='…'` with no `<` inside. */
const SVG_TAG =
  /<(\/?)([A-Za-z_][^\s/>]*)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"<]*"|'[^'<]*'))*)\s*(\/?)>/y;
const SVG_ATTRIBUTE = /\s+([^\s=/>]+)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/g;

/**
 * Why CSS, a drawing's or a stylesheet's, could load something; null
 * when it cannot: no `@import`, no `url(` (in a drawing, one to `#…`:
 * `local`), no `image-set(`, no backslash, which could spell any of
 * them, and no string with `:` or `/`, an address some other function
 * could load. Strings are read as CSS reads them: not inside a comment,
 * and a comment not inside a string.
 */
export function cssProblem(css: string, local: boolean): string | null {
  if (/@import/i.test(css)) return "has an @import";
  for (const [, value] of css.matchAll(/url\(\s*["']?([^)"']*)/gi)) {
    if (!local) return "loads a file (url())";
    if (!value!.startsWith("#")) return `loads "${value}"`;
  }
  if (/image-set\(/i.test(css)) return "loads a file (image-set())";
  if (css.includes("\\")) return "has a backslash";
  for (const [token, quote] of css.matchAll(/\/\*[\s\S]*?(?:\*\/|$)|(["'])[^\n]*?(?:\1|\n|$)/g)) {
    if (quote !== undefined && /[:/]/.test(token)) return `has an address in a string (${token})`;
  }
  return null;
}

/**
 * Why a drawing may not be served, or null when it may. It is only
 * ever shown through `<img>`, where nothing in it runs, but its address
 * can be opened on its own, on the app's origin. So it is read strictly,
 * not as leniently as a browser would: it starts with `<svg`, and every
 * `<` opens a plain tag of an element Mermaid draws with (SVG_ELEMENTS,
 * no prefix), each attribute one it writes (SVG_ATTRIBUTES, `data-…`,
 * `aria-…`, and the SVG and XLink namespaces at their own addresses),
 * tags closed in order, and nothing after the root. So there is no
 * script, no event handler, no HTML inside, no animation, no document
 * type, no comment, no CDATA. Character references are the five XML
 * has; the text is checked as the browser reads it. Nothing is loaded
 * from elsewhere: a link only to `#…`, and every style and attribute
 * passes cssProblem. The one exception is the embedded font: one
 * `@font-face` from a `data:` WOFF2 in a `<style>`, and only with its
 * notice (fontNotice), the one comment, right after the opening tag.
 */
export function checkSvg(svg: string): string | null {
  if (!/^<svg[\s>]/.test(svg)) return "does not start with <svg>";
  const open: string[] = [];
  const css: string[] = [];
  let notice = false;
  let rootEnd = -1;
  let at = 0;
  while (at < svg.length) {
    const lt = svg.indexOf("<", at);
    const text = svg.slice(at, lt < 0 ? svg.length : lt);
    if (text !== "") {
      if (open.length === 0 && text.trim() !== "") return "has text outside its root";
      const decoded = decodeXml(text);
      if (decoded === null) return "has a character reference other than XML's own five";
      if (open.at(-1) === "style") css.push(decoded);
    }
    if (lt < 0) break;
    if (lt === rootEnd) {
      const comment = NOTICE.exec(svg.slice(lt));
      if (comment !== null) {
        notice = true;
        at = lt + comment[0].length;
        continue;
      }
    }
    SVG_TAG.lastIndex = lt;
    const tag = SVG_TAG.exec(svg);
    if (tag === null) return `has markup that is not a plain tag ("${svg.slice(lt, lt + 20)}")`;
    at = SVG_TAG.lastIndex;
    const [, closing, name, attributes, empty] = tag;
    if (!SVG_ELEMENTS.has(name!)) return `has a <${name}> element`;
    if (closing === "/") {
      if (attributes !== "" || empty === "/")
        return `has a closing tag that is not plain (</${name}>)`;
      if (open.pop() !== name) return `closes <${name}> out of order`;
      continue;
    }
    if (open.at(-1) === "style") return "has a style that holds markup";
    if (open.length === 0) {
      if (lt !== 0) return "has more than one root";
      rootEnd = at;
    }
    const refused = attributesProblem(name!, attributes!, css);
    if (refused !== null) return refused;
    if (empty !== "/") open.push(name!);
  }
  if (open.length > 0) return `leaves <${open.at(-1)}> open`;
  return stylesProblem(css, notice);
}

/**
 * Why a tag's attributes may not be served, or null when they may (checkSvg):
 * no event handler, none twice, only SVG_ATTRIBUTES, `data-…`, `aria-…` and
 * the namespaces at their own addresses, and links only to `#…`. Each value
 * but a namespace's is added to `css`, to pass cssProblem.
 */
function attributesProblem(name: string, attributes: string, css: string[]): string | null {
  const seen = new Set<string>();
  for (const [, attribute, double, single] of attributes.matchAll(SVG_ATTRIBUTE)) {
    if (/^on/i.test(attribute!)) return `has an event handler (${attribute})`;
    if (seen.has(attribute!)) return `has the attribute ${attribute} twice on <${name}>`;
    seen.add(attribute!);
    const value = decodeXml(double ?? single!);
    if (value === null) return "has a character reference other than XML's own five";
    if (attribute! in SVG_NAMESPACES) {
      if (value !== SVG_NAMESPACES[attribute!]) return `declares ${attribute}="${value}"`;
      continue;
    }
    if (!SVG_ATTRIBUTES.has(attribute!) && !/^(?:data|aria)-[a-z-]+$/.test(attribute!))
      return `has an attribute ${attribute} on <${name}>`;
    if ((attribute === "href" || attribute === "xlink:href") && !value.startsWith("#"))
      return `links to "${value}"`;
    css.push(value);
  }
  return null;
}

/**
 * Why a drawing's styles and attribute values may not be served, or null
 * when they may (checkSvg): at most one `@font-face`, the embedded font's,
 * and only with its notice; the rest passes cssProblem.
 */
function stylesProblem(css: readonly string[], notice: boolean): string | null {
  const styles: string[] = [];
  let fonts = 0;
  for (const each of css) {
    const faces = each.match(/@font-face/gi)?.length ?? 0;
    fonts += faces;
    if (fonts > 1) return "has more than one @font-face";
    if (faces === 0) {
      styles.push(each);
      continue;
    }
    if (!FONT_FACE.test(each)) return "has an @font-face other than the embedded font";
    if (!notice) return "embeds the font without its notice";
    styles.push(each.replace(FONT_FACE, ""));
  }
  for (const style of styles) {
    const refused = cssProblem(style, true);
    if (refused !== null) return refused;
  }
  return null;
}
