// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { parseTurtle } from "@solid-memo/turtle/rdf";
import { type DocBlock, type DocumentError, type MdInline, parseDocument } from "../src/parse.ts";

/**
 * The docs' index (docs/markdown.md, The docs' index): `docs/docs.ttl`,
 * written by hand, says which pages the docs have, in which group, in
 * which order, and what each covers. It is read here, checked, and
 * handed to the site's build (docsSite.ts) and to `npm run check:docs`
 * as plain data. It is build input, not a published format, so it has
 * no shape: everything it may say is checked here.
 */

/** The index's path from the repository's root. */
export const DOCS_INDEX = "docs/docs.ttl";

/** The address the index's names are read against: its `@base`. */
export const DOCS_BASE = "https://solid-memo.com/docs/";

/** A problem of the docs, at a file and, when one says it, a line (from 1). */
export type DocsProblem = { file: string; line: number | null; what: string };

/** A page as the index lists it. */
export type IndexedPage = {
  /** Its file in docs/, such as `srs.md`. */
  name: string;
  /** What it covers: one line of Markdown phrasing, without links. */
  summary: MdInline[];
  /** Its place in its group. */
  position: number;
  /** The index's line that names it; null when it is not written as `<name.md>`. */
  line: number | null;
};

/** A group of pages, its pages in order. */
export type DocsGroup = {
  /** Its fragment (`the-code` for `<#the-code>`), which is its heading's id on the site. */
  id: string;
  title: string;
  pages: IndexedPage[];
  line: number | null;
};

/** The docs as the index has them: their title, then the groups in order. */
export type DocsIndex = {
  title: string;
  /** The line that names the docs themselves (`<>`); null when it is not written so. */
  line: number | null;
  groups: DocsGroup[];
  /** Every page the index names, in a group or not (its problems are listed already). */
  named: { name: string; line: number | null }[];
};

const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const XSD_INTEGER = "http://www.w3.org/2001/XMLSchema#integer";
const DCTERMS = "http://purl.org/dc/terms/";
const SCHEMA = "https://schema.org/";
const TITLE = `${DCTERMS}title`;
const ABSTRACT = `${DCTERMS}abstract`;
const IS_PART_OF = `${SCHEMA}isPartOf`;
const POSITION = `${SCHEMA}position`;
const COLLECTION = `${SCHEMA}Collection`;
const ARTICLE = `${SCHEMA}TechArticle`;

/** How the index writes a term, for its messages. */
const SHORT: Record<string, string> = {
  [RDF_TYPE]: "a",
  [TITLE]: "dcterms:title",
  [ABSTRACT]: "dcterms:abstract",
  [IS_PART_OF]: "schema:isPartOf",
  [POSITION]: "schema:position",
  [COLLECTION]: "schema:Collection",
  [ARTICLE]: "schema:TechArticle",
};

/** What each kind of subject is typed, and the properties it has. */
const KINDS = {
  docs: { type: COLLECTION, properties: [RDF_TYPE, TITLE] },
  group: { type: COLLECTION, properties: [RDF_TYPE, TITLE, IS_PART_OF, POSITION] },
  page: { type: ARTICLE, properties: [RDF_TYPE, IS_PART_OF, POSITION, ABSTRACT] },
};

/** A group's fragment, which becomes a heading's id: lowercase words and hyphens. */
const GROUP_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** A page's name, relative to the base: a Markdown file in docs/ itself. */
const PAGE_NAME = /^[^/#?]+\.md$/;

type Term = ReturnType<typeof parseTurtle>[number]["object"];

/** The line (from 1) a subject, written as `token`, opens a block on; null when it is not written so. */
function subjectLine(text: string, token: string): number | null {
  const lines = text.split("\n");
  const at = lines.findIndex((line) => line === token || line.startsWith(`${token} `));
  return at < 0 ? null : at + 1;
}

/** How the index writes a subject, relative to its base. */
function written(subject: string): string {
  return subject.startsWith(DOCS_BASE) ? `<${subject.slice(DOCS_BASE.length)}>` : `<${subject}>`;
}

/** Lists a problem of the index at a line. */
type Report = (line: number | null, what: string) => void;

/** Each subject's values, by property. */
type Subjects = Map<string, Map<string, Term[]>>;

/** What a reading of the index works from: the subjects, and where problems go. */
type Reading = { subjects: Subjects; at: Report };

type Read = { position: number | null; line: number | null };
type ReadPage = Omit<IndexedPage, "position"> & Read & { group: string | null };
type ReadGroup = Omit<DocsGroup, "pages"> & Read & { pages: ReadPage[] };

/** The quads' values by subject and property; a named graph or a blank node is a problem. */
function subjectsOf(quads: ReturnType<typeof parseTurtle>, at: Report): Subjects {
  const subjects: Subjects = new Map();
  for (const quad of quads) {
    // N3 also reads TriG, whose named graphs (`<g> { … }`) Turtle does not have.
    if (quad.graph.termType !== "DefaultGraph") {
      at(null, "a named graph (`<g> { … }`), which Turtle does not have");
      continue;
    }
    if (quad.subject.termType !== "NamedNode") {
      at(null, "a blank node: name every subject (`<>`, `<#group>` or `<page.md>`)");
      continue;
    }
    const properties = subjects.get(quad.subject.value) ?? new Map<string, Term[]>();
    subjects.set(quad.subject.value, properties);
    properties.set(quad.predicate.value, [
      ...(properties.get(quad.predicate.value) ?? []),
      quad.object,
    ]);
  }
  return subjects;
}

/** A subject's one value of a property; null, with a problem, when it has none or several. */
function oneValue(
  { subjects, at }: Reading,
  subject: string,
  line: number | null,
  predicate: string,
): Term | null {
  const values = subjects.get(subject)!.get(predicate) ?? [];
  if (values.length === 1) return values[0]!;
  at(
    line,
    `${written(subject)} has ${values.length === 0 ? "no" : "more than one"} ${SHORT[predicate]}: it needs exactly one`,
  );
  return null;
}

/** A text in English; null, with a problem, for anything else. */
function englishOf(
  reading: Reading,
  subject: string,
  line: number | null,
  predicate: string,
): string | null {
  const value = oneValue(reading, subject, line, predicate);
  if (value === null) return null;
  if (value.termType === "Literal" && value.language === "en") return value.value;
  reading.at(line, `${written(subject)}'s ${SHORT[predicate]} is not text in English ("…"@en)`);
  return null;
}

/** A position, a whole number from 0; null, with a problem, for anything else. */
function positionOf(reading: Reading, subject: string, line: number | null): number | null {
  const value = oneValue(reading, subject, line, POSITION);
  if (value === null) return null;
  if (
    value.termType === "Literal" &&
    value.datatype.value === XSD_INTEGER &&
    /^\d+$/.test(value.value)
  )
    return Number(value.value);
  reading.at(line, `${written(subject)}'s schema:position is not a whole number from 0`);
  return null;
}

/** Whether a subject is typed as its kind and has only that kind's properties, each problem listed. */
function checkShape(
  { subjects, at }: Reading,
  subject: string,
  line: number | null,
  kind: keyof typeof KINDS,
) {
  const { type, properties } = KINDS[kind];
  const values = subjects.get(subject)!;
  for (const predicate of values.keys()) {
    if (!properties.includes(predicate))
      at(line, `${written(subject)} has <${predicate}>, which a ${kind} of the docs does not have`);
  }
  const types = values.get(RDF_TYPE) ?? [];
  if (types.length !== 1 || types[0]!.value !== type)
    at(line, `${written(subject)} is not typed ${SHORT[type]} alone`);
}

/** A group (`<#id>`) as read, its pages still to be added. */
function readGroup(reading: Reading, text: string, subject: string, id: string): ReadGroup {
  const line = subjectLine(text, `<#${id}>`);
  checkShape(reading, subject, line, "group");
  if (!GROUP_ID.test(id))
    reading.at(line, `<#${id}>: a group's id is lowercase words and hyphens, as a heading's is`);
  const part = oneValue(reading, subject, line, IS_PART_OF);
  if (part !== null && (part.termType !== "NamedNode" || part.value !== DOCS_BASE))
    reading.at(line, `<#${id}> is not part of the docs themselves (schema:isPartOf <>)`);
  return {
    id,
    title: englishOf(reading, subject, line, TITLE) ?? "",
    pages: [],
    line,
    position: positionOf(reading, subject, line),
  };
}

/** A page (`<relative>`) as read, with the group it says it is part of. */
function readPage(reading: Reading, text: string, subject: string, relative: string): ReadPage {
  const line = subjectLine(text, `<${relative}>`);
  checkShape(reading, subject, line, "page");
  const part = oneValue(reading, subject, line, IS_PART_OF);
  if (part !== null && part.termType !== "NamedNode")
    reading.at(line, `<${relative}>'s schema:isPartOf is not a group (\`<#group>\`)`);
  const abstract = englishOf(reading, subject, line, ABSTRACT);
  return {
    name: relative,
    summary: abstract === null ? [] : summaryOf(abstract, `<${relative}>`, line, reading.at),
    line,
    group: part?.termType === "NamedNode" ? part.value : null,
    position: positionOf(reading, subject, line),
  };
}

/** Items by position, a shared position a problem. */
function ordered<T extends Read>(items: T[], name: (item: T) => string, at: Report): T[] {
  // One without a position, a problem already, goes last, so it is still listed.
  const sorted = items
    .filter((item) => item.position !== null)
    .sort((a, b) => a.position! - b.position!);
  sorted.forEach((item, index) => {
    const before = sorted[index - 1];
    if (before !== undefined && before.position === item.position)
      at(item.line, `${name(item)} has the position of ${name(before)}, ${item.position}`);
  });
  return [...sorted, ...items.filter((item) => item.position === null)];
}

/**
 * The index read from its Turtle, and what is wrong with it. The index is
 * null when the Turtle does not parse; otherwise it holds what could be
 * read, in order (groups and their pages by position), so the build can
 * still list every other problem.
 */
export function readDocsIndex(text: string): {
  index: DocsIndex | null;
  problems: DocsProblem[];
} {
  const problems: DocsProblem[] = [];
  const at = (line: number | null, what: string) => problems.push({ file: DOCS_INDEX, line, what });
  let quads: ReturnType<typeof parseTurtle>;
  try {
    quads = parseTurtle(text, DOCS_BASE);
  } catch (error) {
    // N3's errors say the line they are on.
    at(
      (error as { context: { line: number } }).context.line,
      `not Turtle: ${(error as Error).message}`,
    );
    return { index: null, problems };
  }

  const subjects = subjectsOf(quads, at);
  const reading: Reading = { subjects, at };

  const docs = subjects.has(DOCS_BASE) ? DOCS_BASE : null;
  const docsLine = subjectLine(text, "<>");
  let title = "";
  if (docs === null) at(null, "the docs themselves (`<>`) are missing, with their title");
  else {
    checkShape(reading, docs, docsLine, "docs");
    title = englishOf(reading, docs, docsLine, TITLE) ?? "";
  }

  const groups = new Map<string, ReadGroup>();
  const pages: ReadPage[] = [];
  for (const subject of subjects.keys()) {
    if (subject === DOCS_BASE) continue;
    const relative = subject.startsWith(DOCS_BASE) ? subject.slice(DOCS_BASE.length) : null;
    if (relative?.startsWith("#")) {
      groups.set(subject, readGroup(reading, text, subject, relative.slice(1)));
      continue;
    }
    if (relative !== null && PAGE_NAME.test(relative)) {
      pages.push(readPage(reading, text, subject, relative));
      continue;
    }
    at(
      null,
      `${written(subject)} is neither the docs (\`<>\`), a group (\`<#group>\`) nor a page in docs/ (\`<page.md>\`)`,
    );
  }

  for (const page of pages) {
    if (page.group === null) continue;
    const group = groups.get(page.group);
    if (group === undefined)
      at(page.line, `<${page.name}> is part of ${written(page.group)}, which is not a group`);
    else group.pages.push(page);
  }
  const index: DocsIndex = {
    title,
    line: docsLine,
    named: pages.map(({ name, line }) => ({ name, line })),
    groups: ordered([...groups.values()], (group) => `<#${group.id}>`, at).map((group) => {
      if (group.pages.length === 0) at(group.line, `<#${group.id}> has no pages`);
      return {
        id: group.id,
        title: group.title,
        line: group.line,
        pages: ordered(group.pages, (page) => `<${page.name}>`, at).map(
          ({ name, summary, position, line }) => ({ name, summary, position: position ?? 0, line }),
        ),
      };
    }),
  };
  return { index, problems };
}

/** A summary read as the docs' Markdown: one line of phrasing, with no link and no break. */
function summaryOf(text: string, subject: string, line: number | null, at: Report): MdInline[] {
  let blocks: DocBlock[];
  try {
    blocks = parseDocument(text);
  } catch (error) {
    at(line, `${subject}'s summary: ${(error as DocumentError).what}`);
    return [];
  }
  const [block] = blocks;
  if (blocks.length !== 1 || block!.type !== "paragraph") {
    at(line, `${subject}'s summary is not one line of text`);
    return [];
  }
  const loose = (inlines: readonly MdInline[]): boolean =>
    inlines.some(
      (node) =>
        node.type === "link" ||
        node.type === "break" ||
        ((node.type === "emphasis" || node.type === "strong") && loose(node.children)),
    );
  if (loose(block.children)) {
    at(line, `${subject}'s summary has a link or a line break: a summary has neither`);
    return [];
  }
  return block.children;
}

/**
 * What is wrong with the index against the pages in docs/ (their names,
 * the README among them): a page it does not list, and one it lists that
 * is not there. The README is the docs' own page, so it is not listed.
 */
export function listingProblems(index: DocsIndex, names: readonly string[]): DocsProblem[] {
  const listed = new Set(index.named.map((page) => page.name));
  const present = new Set(names);
  return [
    ...names
      .filter((name) => name !== "README.md" && !listed.has(name))
      .map((name) => ({
        file: `docs/${name}`,
        line: null,
        what: `${DOCS_INDEX} does not list the page`,
      })),
    ...index.named
      .filter((page) => page.name === "README.md" || !present.has(page.name))
      .map((page) => ({
        file: DOCS_INDEX,
        line: page.line,
        what:
          page.name === "README.md"
            ? "lists README.md, which is the docs' own page, not one of them"
            : `lists ${page.name}, which is not in docs/`,
      })),
  ];
}

/**
 * The block that lists a page, to paste into the index: in its last
 * group, after its pages, with a summary to write.
 */
export function pageBlock(index: DocsIndex, name: string): string {
  const group = index.groups.at(-1);
  // The index's positions keep gaps of 10, so a page can go between two.
  const last = group?.pages.at(-1)?.position ?? 0;
  return [
    `<${name}>`,
    "    a schema:TechArticle ;",
    `    schema:isPartOf <#${group?.id ?? "group"}> ;`,
    `    schema:position ${last + 10} ;`,
    '    dcterms:abstract "what the page covers, in one line."@en .',
  ].join("\n");
}
