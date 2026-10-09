import { execFile } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import { DataFactory, Writer, type Quad, type Quad_Object } from "n3";
import type { ShapeEngine } from "../src/engine.ts";
import { inspectChunks } from "@solid-memo/markdown/chunks";
import { markdownProblems as textProblems, OPTION, PROSE, SIDE, type FieldRule } from "@solid-memo/markdown/problems";
import { continuityProblems } from "@solid-memo/domain/release/continuityRules";
import { courseProblems as releaseCourseProblems } from "@solid-memo/domain/release/courseRules";
import {
  metadataProblems as releaseMetadataProblems,
  pathProblems,
  releasePathOf,
  versionGapProblems,
} from "@solid-memo/domain/release/libraryRules";
import { markdownProblems as releaseMarkdownProblems, type FieldRuleName } from "@solid-memo/domain/release/markdownFields";
import type { ReleaseProblem } from "@solid-memo/domain/release/problems";
import { SCHEMA_NS, type ReleaseModel, type ReleaseTerm } from "@solid-memo/domain/release/releaseModel";
import { keptInIndex, lastIssued, seriesEntry } from "@solid-memo/domain/release/seriesEntry";
import { formatTurtle } from "@solid-memo/turtle/formatTurtle";
import { objectsOf, parseTurtle, RDF_TYPE } from "@solid-memo/turtle/rdf";
import { SITE, VOCAB_BASE } from "@solid-memo/vocab/tooling/sources";
import { SM_NS } from "@solid-memo/vocab/tooling/vocab";
import { DECKS_ROOT, VOCAB_ROOT } from "@solid-memo/vocab/tooling/root";
import { quadsToReleaseModel } from "./quadsToReleaseModel.ts";
import { releaseMessage, type WordedProblem } from "./releaseMessages.ts";
import {
  loadEngine,
  loadProfileEngine,
  loadReferenceData,
  validateProfile,
  validateTurtleDocument,
} from "./shacl.ts";

/**
 * The deck library (see docs/deck-library.md), published with the site
 * from this repository's decks/ folder: every version of every deck,
 * decks/<name>/v<N>.ttl, frozen once published, and decks/index.ttl, a
 * DCAT catalogue generated from them that the app browses.
 *
 * `npm run library` writes the index; `npm run library:check` fails when
 * it is out of date. Both check the library: the layout (nothing but the
 * index and the releases, each deck's versions numbered 1, 2, …), each
 * release's metadata against its path, Solid Memo's shapes, DCAT-AP and
 * SKOS with the reference data, a course's outline (courseProblems), its
 * text written in Markdown (markdownProblems), every literal in Unicode
 * NFC (normalizationProblems), and that no version drops
 * a card, chapter, step or distractor of the one before it. With
 * `--base <git ref>`, a version published at that ref must be there
 * still, byte for byte: a published version is never edited or removed,
 * only followed by the next. The rules that read a release's data are
 * the domain's (@solid-memo/domain/release), which the Studio runs too:
 * this file reads the files, builds each release's model
 * (quadsToReleaseModel.ts), words the problems in English
 * (releaseMessages.ts), and checks what only the text or the shapes can.
 */

const DCAT = "http://www.w3.org/ns/dcat#";
const DCTERMS = "http://purl.org/dc/terms/";
const ADMS = "http://www.w3.org/ns/adms#";
const FOAF = "http://xmlns.com/foaf/0.1/";
const XSD = "http://www.w3.org/2001/XMLSchema#";
const DATA_THEMES = "http://publications.europa.eu/resource/authority/data-theme";
const TOPICS = `${VOCAB_BASE}topics.ttl`;
const PROV = "http://www.w3.org/ns/prov#";

/** Where the site publishes the library. Every IRI of it is under this: the index, its series and publisher, and every release. */
export const DECKS_BASE = `${SITE}decks/`;
export const INDEX_FILE = "index.ttl";
export const INDEX_URL = `${DECKS_BASE}${INDEX_FILE}`;
export const PUBLISHER_URL = `${INDEX_URL}#solid-memo`;

/** The deck whose series the index names the course for newcomers (solid-memo:newcomerCourse); undefined names none. See docs/deck-library.md. */
export const NEWCOMER_COURSE: string | undefined = "getting-started";

/**
 * The format of the series the index describes (the app's
 * deck-series/v3.ttl, LibraryDeckSeriesV3): what buildIndex writes.
 */
export const LIBRARY_DECK_SERIES_FORMAT = 3;

export function releaseUrlOf(deck: string, version: number): string {
  return `${DECKS_BASE}${deck}/v${version}.ttl`;
}

export function seriesUrlOf(deck: string): string {
  return `${INDEX_URL}#${deck}`;
}

/** Where a release is kept in this repository, as problems name it: decks/<name>/v<N>.ttl. */
function labelOf(deck: string, version: number): string {
  return `decks/${deck}/v${version}.ttl`;
}

/** One published version of a deck, parsed at its own address. */
export interface DeckRelease {
  deck: string;
  version: number;
  turtle: string;
  quads: Quad[];
}

/** The library's files: path under decks/ (`index.ttl`, `<name>/v<N>.ttl`) → content. */
export type LibraryFiles = ReadonlyMap<string, string>;

/** A layout problem in English: it names its path, not a release. */
function layoutMessage(problem: ReleaseProblem): string {
  return releaseMessage(problem as WordedProblem, "", "");
}

/**
 * The releases among the library's files, sorted by deck then version,
 * and every problem with the layout (libraryRules): a file that is
 * neither the index nor a release, a deck whose versions do not run 1,
 * 2, … , or a release that is not Turtle (left out of the releases).
 */
export function releasesOf(files: LibraryFiles): { releases: DeckRelease[]; problems: string[] } {
  const problems: string[] = [];
  const releases: DeckRelease[] = [];
  for (const [path, turtle] of files) {
    if (path === INDEX_FILE) continue;
    const at = releasePathOf(path);
    if (at === undefined) {
      problems.push(...pathProblems(path).map(layoutMessage));
      continue;
    }
    const { deck, version } = at;
    try {
      releases.push({ deck, version, turtle, quads: parseTurtle(turtle, releaseUrlOf(deck, version)) });
    } catch (error) {
      problems.push(`decks/${path}: ${(error as Error).message}`);
    }
  }
  problems.push(...versionGapProblems(files.keys()).map(layoutMessage));
  return { releases: sortReleases(releases), problems };
}

function sortReleases(releases: readonly DeckRelease[]): DeckRelease[] {
  return [...releases].sort((a, b) => a.deck.localeCompare(b.deck) || a.version - b.version);
}

/** Each release's model, by its quads and address: the rules read a release several times. */
const models = new WeakMap<readonly Quad[], Map<string, ReleaseModel>>();

/** The release as the release rules read it (@solid-memo/domain/release), at its path's address. */
function modelOf(release: DeckRelease): ReleaseModel {
  const url = releaseUrlOf(release.deck, release.version);
  const byUrl = models.get(release.quads) ?? new Map<string, ReleaseModel>();
  models.set(release.quads, byUrl);
  const model = byUrl.get(url) ?? quadsToReleaseModel(release.quads, url);
  byUrl.set(url, model);
  return model;
}

/** A term of a release back as n3's. */
function n3Term(term: ReleaseTerm): Quad_Object {
  const { namedNode, literal, blankNode } = DataFactory;
  switch (term.kind) {
    case "literal":
      return literal(term.value, term.language === "" ? namedNode(term.datatype) : term.language);
    case "blank":
      return blankNode(term.value);
    case "iri":
      return namedNode(term.value);
  }
}

/**
 * The index: a dcat:Catalog of the library's decks, each a
 * dcat:DatasetSeries (and dcat:Dataset) whose members are its releases,
 * as seriesEntry (@solid-memo/domain/release/seriesEntry) describes it:
 * the current release's title, description, themes and keywords, every
 * older release summarised, the current one described in full but for
 * its cards, a course's chapters, steps and distractors and the record
 * of how it was made (its schema:Course type stays, which tells a
 * course), plus sm:cardCount, the cards it has in use — so the library
 * can be listed from the index alone. The releases must be sorted by
 * deck then version.
 * The catalogue names `newcomerCourse`'s series the course for newcomers
 * (solid-memo:newcomerCourse), even when there is no such deck, which
 * newcomerProblems then reports.
 */
export function buildIndex(releases: readonly DeckRelease[], newcomerCourse?: string): string {
  const { namedNode, literal, quad } = DataFactory;
  const out: Quad[] = [];
  const add = (s: string, p: string, o: Quad_Object) => out.push(quad(namedNode(s), namedNode(p), o));
  const addAll = (s: string, p: string, terms: readonly ReleaseTerm[]) => {
    for (const term of terms) add(s, p, n3Term(term));
  };
  const iri = (value: string) => namedNode(value);
  const decks = [...new Set(releases.map((r) => r.deck))];
  const modified = lastIssued(releases.map(modelOf));

  add(INDEX_URL, RDF_TYPE, iri(`${DCAT}Catalog`));
  add(INDEX_URL, `${DCTERMS}title`, literal("Solid Memo deck library"));
  add(INDEX_URL, `${DCTERMS}description`, literal("Ready-made flashcard decks to import into your own Solid pod."));
  add(INDEX_URL, `${DCTERMS}publisher`, iri(PUBLISHER_URL));
  if (modified !== undefined) add(INDEX_URL, `${DCTERMS}modified`, literal(modified, iri(`${XSD}dateTime`)));
  add(INDEX_URL, `${DCAT}themeTaxonomy`, iri(DATA_THEMES));
  add(INDEX_URL, `${DCAT}themeTaxonomy`, iri(TOPICS));
  for (const deck of decks) add(INDEX_URL, `${DCAT}dataset`, iri(seriesUrlOf(deck)));
  if (newcomerCourse !== undefined) add(INDEX_URL, `${SM_NS}newcomerCourse`, iri(seriesUrlOf(newcomerCourse)));
  add(PUBLISHER_URL, RDF_TYPE, iri(`${FOAF}Agent`));
  add(PUBLISHER_URL, `${FOAF}name`, literal("Solid Memo"));

  for (const deck of decks) {
    const ofDeck = releases.filter((r) => r.deck === deck);
    const latest = ofDeck[ofDeck.length - 1];
    const entry = seriesEntry(seriesUrlOf(deck), ofDeck.map(modelOf));
    const { series } = entry;
    add(series, RDF_TYPE, iri(`${DCAT}DatasetSeries`));
    add(series, RDF_TYPE, iri(`${DCAT}Dataset`));
    add(series, `${SM_NS}formatVersion`, literal(String(LIBRARY_DECK_SERIES_FORMAT), iri(`${XSD}integer`)));
    // A release without a title or description fails validation, which says so.
    addAll(series, `${DCTERMS}title`, entry.title);
    addAll(series, `${DCTERMS}description`, entry.description);
    add(series, `${DCTERMS}publisher`, iri(PUBLISHER_URL));
    addAll(series, `${DCAT}theme`, entry.themes);
    addAll(series, `${DCAT}keyword`, entry.keywords);
    add(series, `${DCAT}first`, iri(entry.first));
    add(series, `${DCAT}last`, iri(entry.last));
    for (const version of entry.versions) add(series, `${DCAT}hasVersion`, iri(version));
    add(series, `${DCAT}hasCurrentVersion`, iri(entry.last));

    for (const older of entry.older) {
      add(older.url, RDF_TYPE, iri(`${DCAT}Dataset`));
      addAll(older.url, `${DCTERMS}title`, older.title);
      addAll(older.url, `${DCTERMS}description`, older.description);
      addAll(older.url, `${DCAT}version`, older.version);
      addAll(older.url, `${DCTERMS}issued`, older.issued);
      addAll(older.url, `${ADMS}versionNotes`, older.versionNotes);
    }

    const kept = keptInIndex(modelOf(latest));
    out.push(...latest.quads.filter((q) => kept(q.subject.value, q.predicate.value)));
    add(entry.last, `${SM_NS}cardCount`, literal(String(entry.cardCount), iri(`${XSD}integer`)));
  }
  return writeIndex(distinct(out));
}
/**
 * Each triple once: decks share nodes (a licence, a source, an agent),
 * which every deck's release describes, and a graph is a set.
 */
function distinct(quads: readonly Quad[]): Quad[] {
  const seen = new Set<string>();
  return quads.filter((q) => {
    const o = q.object;
    const key = JSON.stringify([
      q.subject.value,
      q.predicate.value,
      o.termType,
      o.value,
      o.termType === "Literal" ? o.language : "",
      o.termType === "Literal" ? o.datatype.value : "",
    ]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The index in the house style (@solid-memo/turtle/formatTurtle), its own address as its @base. */
function writeIndex(quads: readonly Quad[]): string {
  const writer = new Writer({
    prefixes: {
      "solid-memo": SM_NS,
      dcat: DCAT,
      dcterms: DCTERMS,
      adms: ADMS,
      foaf: FOAF,
      prov: PROV,
      topic: `${TOPICS}#`,
      xsd: XSD,
    },
  });
  writer.addQuads([...quads]);
  let output = "";
  writer.end((_error, result) => {
    output = result;
  });
  return formatTurtle(`@base <${INDEX_URL}> .\n\n${output}`, INDEX_URL);
}

/** What the library is checked with: Solid Memo's shapes, the profiles and the reference data. */
export interface LibraryValidators {
  shapes: ShapeEngine;
  dcatAp: ShapeEngine;
  skos: ShapeEngine;
  reference: Quad[];
}

/** The validators, read from this repository: the shapes and the vocabulary from ns/, the profiles from the vocab package's vendor/. */
export async function loadValidators(): Promise<LibraryValidators> {
  const [shapes, dcatAp, skos, reference] = await Promise.all([
    loadEngine(),
    loadProfileEngine(VOCAB_ROOT, "dcat-ap"),
    loadProfileEngine(VOCAB_ROOT, "skos"),
    loadReferenceData(),
  ]);
  return { shapes, dcatAp, skos, reference };
}

/** The rules' problems of a release in English, after its path. */
function messagesOf(release: DeckRelease, problems: readonly ReleaseProblem[]): string[] {
  const label = labelOf(release.deck, release.version);
  const url = releaseUrlOf(release.deck, release.version);
  return problems.map((problem) => releaseMessage(problem as WordedProblem, label, url));
}

/**
 * What the shapes cannot say about a release, against its path: its
 * @base is its own address (a check of its text, so here), and by the
 * library rules (metadataProblems in @solid-memo/domain/release/libraryRules)
 * it is exactly one deck, the document itself, of the version its path
 * says, in its deck's series, published by Solid Memo, and following
 * the version before it (version 1 follows none).
 */
export function metadataProblems(release: DeckRelease): string[] {
  const { deck, version } = release;
  const url = releaseUrlOf(deck, version);
  const problems: string[] = [];
  const base = /^@base\s+<([^>]*)>/m.exec(release.turtle)?.[1];
  if (base !== url) {
    problems.push(`${labelOf(deck, version)}: states ${base === undefined ? "no @base" : `@base <${base}>`}; its path says @base <${url}>.`);
  }
  const place = {
    version,
    series: seriesUrlOf(deck),
    publisher: PUBLISHER_URL,
    ...(version > 1 ? { previous: releaseUrlOf(deck, version - 1) } : {}),
  };
  return [...problems, ...messagesOf(release, releaseMetadataProblems(modelOf(release), place))];
}

/** A course's outline, by the course rules (@solid-memo/domain/release/courseRules). */
export function courseProblems(release: DeckRelease): string[] {
  return messagesOf(release, releaseCourseProblems(modelOf(release)));
}

const RULES: Record<FieldRuleName, FieldRule> = { side: SIDE, option: OPTION, prose: PROSE };

/**
 * The text of a release written in Markdown, by the rules for a release
 * (docs/markdown.md, docs/deck-library.md): which fields are Markdown and
 * by which rule is @solid-memo/domain/release/markdownFields', what is
 * wrong with each text @solid-memo/markdown's.
 */
export function markdownProblems(release: DeckRelease): string[] {
  return messagesOf(
    release,
    releaseMarkdownProblems(modelOf(release), { problems: (text, rule) => textProblems(text, RULES[rule]), chunks: inspectChunks }),
  );
}

/** A code point as Unicode writes it: U+00E9. */
function codePoints(text: string): string {
  return [...text].map((c) => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`).join(" ");
}

/**
 * Every literal of a document (`label`, at `url`) that is not in Unicode
 * normalization form C, composed: "é" written as "e" and a combining
 * accent, or "사람" as five jamo, as text copied from a macOS file name
 * or a PDF may be. It looks the same, but is not the same text: written
 * composed, as keyboards type it, it compares, sorts and counts as what
 * a reader types does. Each names the first character (grapheme) that
 * composes differently.
 */
export function normalizationProblems(label: string, url: string, quads: readonly Quad[]): string[] {
  const shown = (subject: Quad["subject"]) =>
    subject.termType === "BlankNode" ? "a blank node's" : subject.value.startsWith(`${url}#`) ? `<${subject.value.slice(url.length)}>` : `<${subject.value}>`;
  const graphemes = new Intl.Segmenter("und", { granularity: "grapheme" });
  const problems: string[] = [];
  for (const q of quads) {
    if (q.object.termType !== "Literal") continue;
    const characters = [...graphemes.segment(q.object.value)].map((s) => s.segment);
    const at = characters.findIndex((c) => c !== c.normalize("NFC"));
    if (at === -1) continue;
    const c = characters[at];
    const field = `<${q.predicate.value}>${q.object.language === "" ? "" : `@${q.object.language}`}`;
    problems.push(
      `${label}: ${shown(q.subject)} ${field} is not in Unicode NFC: its character ${at + 1}, ${codePoints(c)}, is ${codePoints(c.normalize("NFC"))} composed. Write text composed, as keyboards type it.`,
    );
  }
  return problems;
}

/**
 * What the shapes cannot say about the course the index offers to
 * newcomers (solid-memo:newcomerCourse on its catalogue, which no shape
 * owns): at most one, a deck of the library whose current release is a
 * schema:Course.
 */
export function newcomerProblems(indexQuads: readonly Quad[]): string[] {
  const label = `decks/${INDEX_FILE}`;
  const problems: string[] = [];
  const named = objectsOf(indexQuads, INDEX_URL, `${SM_NS}newcomerCourse`);
  if (named.length > 1) {
    problems.push(`${label}: names ${named.length} courses for newcomers by solid-memo:newcomerCourse: at most one.`);
  }
  const decks = new Set(objectsOf(indexQuads, INDEX_URL, `${DCAT}dataset`).map((o) => o.value));
  const isCourse = (release: Quad_Object) => objectsOf(indexQuads, release.value, RDF_TYPE).some((o) => o.value === `${SCHEMA_NS}Course`);
  for (const course of named) {
    const value = course.termType === "Literal" ? JSON.stringify(course.value) : `<${course.value}>`;
    const shown = `${label}: names ${value} by solid-memo:newcomerCourse`;
    if (course.termType !== "NamedNode") problems.push(`${shown}, which is no IRI.`);
    else if (!decks.has(course.value)) problems.push(`${shown}, which is no deck of the library.`);
    else if (!objectsOf(indexQuads, course.value, `${DCAT}hasCurrentVersion`).some(isCourse)) {
      problems.push(`${shown}, which is not a course: its current release is no schema:Course.`);
    }
  }
  return problems;
}

/** The problems a check that throws one Error per document reports, or none. */
async function problemsOf(check: Promise<void>): Promise<string[]> {
  try {
    await check;
    return [];
  } catch (error) {
    return [(error as Error).message];
  }
}

/**
 * Every problem with the releases and their index: each release's
 * metadata against its path, against the version before it
 * (continuityRules: a card, chapter, step or distractor the deck no
 * longer uses is retired, owl:deprecated true, never removed, so the
 * copies that have it keep it and its review history, and its id is
 * never another kind of subject's), its course outline (courseProblems),
 * its text written in Markdown (markdownProblems), its literals in
 * Unicode NFC (normalizationProblems), and Solid Memo's shapes, DCAT-AP
 * (a release with the index beside it, where its series and publisher
 * are described) and SKOS, with the reference data; then the index's
 * course for newcomers (newcomerProblems), its literals in NFC, and the
 * index to the shapes and the profiles too.
 */
export async function validateLibrary(
  releases: readonly DeckRelease[],
  index: string,
  validators: LibraryValidators,
): Promise<string[]> {
  const indexQuads = parseTurtle(index, INDEX_URL);
  const problems: string[] = [];
  for (const release of releases) {
    const label = labelOf(release.deck, release.version);
    problems.push(...metadataProblems(release));
    const before = releases.find((r) => r.deck === release.deck && r.version === release.version - 1);
    if (before !== undefined) {
      // Its path fixes each version, so metadataProblems names one that is not the one before it plus one.
      const continuity = continuityProblems(modelOf(before), modelOf(release)).filter((p) => p.code !== "versionNotNext");
      problems.push(...messagesOf(release, continuity));
    }
    problems.push(...courseProblems(release), ...markdownProblems(release));
    problems.push(...normalizationProblems(label, releaseUrlOf(release.deck, release.version), release.quads));
    problems.push(
      ...(await problemsOf(validateTurtleDocument(label, release.quads, validators.shapes, "library"))),
      ...(await problemsOf(validateProfile(label, release.quads, validators.dcatAp, [...validators.reference, ...indexQuads]))),
      ...(await problemsOf(validateProfile(label, release.quads, validators.skos, validators.reference))),
    );
  }
  const label = `decks/${INDEX_FILE}`;
  problems.push(...newcomerProblems(indexQuads), ...normalizationProblems(label, INDEX_URL, indexQuads));
  problems.push(
    ...(await problemsOf(validateTurtleDocument(label, indexQuads, validators.shapes, "library"))),
    ...(await problemsOf(validateProfile(label, indexQuads, validators.dcatAp, validators.reference))),
    ...(await problemsOf(validateProfile(label, indexQuads, validators.skos, validators.reference))),
  );
  return problems;
}

/**
 * Every published version that `published` (the library's files at a
 * git ref) has and `files` has not, or has changed: a published version
 * is never edited or removed. Versions new since then, and the index,
 * may differ.
 */
export function baseProblems(files: LibraryFiles, published: LibraryFiles, ref: string): string[] {
  const problems: string[] = [];
  for (const [path, turtle] of published) {
    if (path === INDEX_FILE) continue;
    const now = files.get(path);
    if (now === undefined) {
      problems.push(`decks/${path} was published at ${ref} and is gone: a published version is never removed.`);
    } else if (now !== turtle) {
      problems.push(`decks/${path} has changed since ${ref}: a published version is never edited; publish the next version instead.`);
    }
  }
  return problems;
}

/** What the library's command reads and writes. */
export interface LibraryIo {
  /** The library's files, decks/ in the working tree. */
  readFiles(): Promise<LibraryFiles>;
  /** The library's files at a git ref; none when decks/ did not exist there. */
  readFilesAt(ref: string): Promise<LibraryFiles>;
  writeIndex(text: string): Promise<void>;
  loadValidators(): Promise<LibraryValidators>;
  /** The deck the index names the course for newcomers; none when undefined. */
  newcomerCourse?: string;
  log(message: string): void;
}

const USAGE = "Usage: npm run library [-- --base <git ref>], or npm run library:check [-- --base <git ref>]";

/**
 * `npm run library` writes decks/index.ttl from the releases;
 * `npm run library:check` (`--check`) fails if it is not what they make.
 * Both validate the library, and with `--base <git ref>` check that no
 * version published at that ref was edited or removed. Exit code 0 when
 * the library is valid (and, in check mode, its index up to date).
 */
export async function main(argv: readonly string[], io: LibraryIo): Promise<number> {
  // `node -e` puts the node binary first and drops the `--`.
  const args = argv.slice(1);
  const check = args.includes("--check");
  const baseAt = args.indexOf("--base");
  const ref = baseAt === -1 ? undefined : args[baseAt + 1];
  const known = args.every((arg, i) => arg === "--check" || arg === "--base" || (baseAt !== -1 && i === baseAt + 1));
  if (!known || (baseAt !== -1 && (ref === undefined || ref.startsWith("-")))) {
    io.log(USAGE);
    return 1;
  }
  try {
    const files = await io.readFiles();
    const { releases, problems } = releasesOf(files);
    const index = buildIndex(releases, io.newcomerCourse);
    if (ref !== undefined) problems.push(...baseProblems(files, await io.readFilesAt(ref), ref));
    if (check) {
      const stated = files.get(INDEX_FILE);
      if (stated === undefined) problems.push(`decks/${INDEX_FILE} is missing: run \`npm run library\`.`);
      else if (stated !== index) problems.push(`decks/${INDEX_FILE} is out of date: run \`npm run library\`.`);
    } else if (problems.length === 0) {
      await io.writeIndex(index);
      io.log(`wrote decks/${INDEX_FILE}`);
    }
    problems.push(...(await validateLibrary(releases, index, await io.loadValidators())));
    for (const problem of problems) io.log(problem);
    if (problems.length > 0) return 1;
    io.log(`decks/: ${releases.length} versions of ${new Set(releases.map((r) => r.deck)).size} decks, valid.`);
    return 0;
  } catch (error) {
    io.log((error as Error).message);
    return 1;
  }
}

const run_ = promisify(execFile);

/** git in `repo`, its output as text; large enough for any release. */
async function git(repo: string, args: readonly string[]): Promise<string> {
  const { stdout } = await run_("git", ["-C", repo, ...args], { maxBuffer: 1 << 30, encoding: "utf8" });
  return stdout;
}

/** The io of the repository at `repo`, whose library is its decks/ folder. */
export function defaultIo(repo: string): LibraryIo {
  const dir = join(repo, "decks");
  return {
    readFiles: async () => {
      const entries = await readdir(dir, { recursive: true, withFileTypes: true }).catch(() => []);
      const pathOf = (entry: (typeof entries)[number]) => relative(dir, join(entry.parentPath, entry.name)).replaceAll("\\", "/");
      const other = entries.find((entry) => !entry.isFile() && !entry.isDirectory());
      if (other !== undefined) {
        throw new Error(`decks/${pathOf(other)} is neither a file nor a folder: decks/ holds only index.ttl and <name>/v<N>.ttl, as plain files.`);
      }
      const paths = entries.filter((entry) => entry.isFile()).map(pathOf).sort();
      return new Map(await Promise.all(paths.map(async (path) => [path, await readFile(join(dir, path), "utf8")] as const)));
    },
    readFilesAt: async (ref) => {
      const commit = (await git(repo, ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`])).trim();
      const paths = (await git(repo, ["ls-tree", "-r", "--name-only", "-z", commit, "--", "decks/"]))
        .split("\0")
        .filter((path) => path !== "");
      return new Map(
        await Promise.all(
          paths.map(async (path) => [path.slice("decks/".length), await git(repo, ["show", `${commit}:${path}`])] as const),
        ),
      );
    },
    writeIndex: (text) => writeFile(join(dir, INDEX_FILE), text),
    loadValidators,
    log: (message) => console.log(message),
    newcomerCourse: NEWCOMER_COURSE,
  };
}

/** The script entry: `node -e "import('@solid-memo/shacl/node/deckLibrary').then((m) => m.run(process))" -- [--check] [--base <ref>]`. */
export async function run(
  process: { argv: readonly string[]; exitCode?: number },
): Promise<void> {
  process.exitCode = await main(process.argv, defaultIo(join(DECKS_ROOT, "..")));
}
