import { execFile } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import { DataFactory, Writer, type Literal, type Quad, type Quad_Object } from "n3";
import type { ShapeEngine } from "../src/engine.ts";
import {
  markdownProblems as textProblems,
  OPTION,
  PROSE,
  SIDE,
  type FieldRule,
  type MarkdownProblem,
} from "@solid-memo/markdown/problems";
import { MAX_CHARS, MAX_DEPTH, MAX_TABLE_CELLS, MAX_TABLE_COLUMNS } from "@solid-memo/markdown/parse";
import { inspectChunks } from "@solid-memo/markdown/chunks";
import { formatTurtle } from "@solid-memo/turtle/formatTurtle";
import { objectsOf, parseTurtle, RDF_TYPE, subjectsOfType } from "@solid-memo/turtle/rdf";
import { SITE, VOCAB_BASE } from "@solid-memo/vocab/tooling/sources";
import { SM_NS } from "@solid-memo/vocab/tooling/vocab";
import { DECKS_ROOT, VOCAB_ROOT } from "@solid-memo/vocab/tooling/root";
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
 * only followed by the next.
 */

const DCAT = "http://www.w3.org/ns/dcat#";
const DCTERMS = "http://purl.org/dc/terms/";
const ADMS = "http://www.w3.org/ns/adms#";
const FOAF = "http://xmlns.com/foaf/0.1/";
const XSD = "http://www.w3.org/2001/XMLSchema#";
const DATA_THEMES = "http://publications.europa.eu/resource/authority/data-theme";
const TOPICS = `${VOCAB_BASE}topics.ttl`;
const OWL_DEPRECATED = "http://www.w3.org/2002/07/owl#deprecated";
const PROV = "http://www.w3.org/ns/prov#";
const RDFS_COMMENT = "http://www.w3.org/2000/01/rdf-schema#comment";
const SCHEMA = "https://schema.org/";

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

/** Deck names are plain: lower-case letters, digits and dashes. */
const DECK_NAME = /^[a-z0-9][a-z0-9-]*$/;
const RELEASE_PATH = /^([^/]+)\/v([1-9][0-9]*)\.ttl$/;

/**
 * The releases among the library's files, sorted by deck then version,
 * and every problem with the layout: a file that is neither the index
 * nor a release, a deck whose versions do not run 1, 2, … , or a release
 * that is not Turtle (left out of the releases).
 */
export function releasesOf(files: LibraryFiles): { releases: DeckRelease[]; problems: string[] } {
  const problems: string[] = [];
  const releases: DeckRelease[] = [];
  for (const [path, turtle] of files) {
    if (path === INDEX_FILE) continue;
    const match = RELEASE_PATH.exec(path);
    if (match === null || !DECK_NAME.test(match[1])) {
      problems.push(
        `decks/${path} is neither the index nor a release: decks/ holds only index.ttl and <name>/v<N>.ttl, the name lower-case letters, digits and dashes.`,
      );
      continue;
    }
    const [, deck, version] = match;
    try {
      releases.push({ deck, version: Number(version), turtle, quads: parseTurtle(turtle, releaseUrlOf(deck, Number(version))) });
    } catch (error) {
      problems.push(`decks/${path}: ${(error as Error).message}`);
    }
  }
  const versionsOf = new Map<string, number[]>();
  for (const path of files.keys()) {
    const match = RELEASE_PATH.exec(path);
    if (match === null || !DECK_NAME.test(match[1])) continue;
    versionsOf.set(match[1], [...(versionsOf.get(match[1]) ?? []), Number(match[2])]);
  }
  for (const [deck, versions] of versionsOf) {
    const sorted = versions.sort((a, b) => a - b);
    if (sorted.some((version, i) => version !== i + 1)) {
      problems.push(`decks/${deck}/: versions must run 1, 2, … without gaps; found ${sorted.map((v) => `v${v}.ttl`).join(", ")}.`);
    }
  }
  return { releases: sortReleases(releases), problems };
}

function sortReleases(releases: readonly DeckRelease[]): DeckRelease[] {
  return [...releases].sort((a, b) => a.deck.localeCompare(b.deck) || a.version - b.version);
}

/** The subjects of a release that state owl:deprecated true: retired. */
function retiredOf(quads: readonly Quad[]): Set<string> {
  return new Set(
    quads
      .filter((q) => q.predicate.value === OWL_DEPRECATED && q.object.termType === "Literal" && q.object.value === "true")
      .map((q) => q.subject.value),
  );
}

/** A release's cards by subject, each with whether it is retired (owl:deprecated true). */
function cardsOf(quads: readonly Quad[]): Map<string, boolean> {
  const retired = retiredOf(quads);
  return new Map(subjectsOfType(quads, `${SM_NS}Card`).map((subject) => [subject, retired.has(subject)]));
}

/** The fragment ids of a release's subjects of a class: a card's, chapter's, step's or distractor's identity from one version to the next. */
function idsOf(quads: readonly Quad[], type: string): string[] {
  return subjectsOfType(quads, type).map((subject) => subject.slice(subject.indexOf("#") + 1));
}

/** What a course's outline and wrong options are: subjects the index leaves out, and a later version never drops. */
const OUTLINE_TYPES = [`${SM_NS}Chapter`, `${SM_NS}Step`, `${SM_NS}Distractor`];

function literalsOf(quads: readonly Quad[], subject: string, predicate: string): Quad_Object[] {
  return objectsOf(quads, subject, predicate).filter((o) => o.termType === "Literal");
}

/**
 * The index: a dcat:Catalog of the library's decks. Each deck is a
 * dcat:DatasetSeries (and dcat:Dataset) whose members are its releases,
 * which are its versions too, stating the current release's title,
 * description, themes and keywords as the release has them; every older
 * release is summarised (a dcat:Dataset with its title, description,
 * version, issue time and notes), the current one described in full —
 * everything but its cards, a course's chapters, steps and distractors
 * (its schema:Course type stays, which tells a course) and the record of how it was made (every
 * rdfs:comment, and of its prov:Activity nodes all but the type of the
 * one that generated it; the release itself carries them), plus sm:cardCount, the cards it has in use (retired
 * ones not counted) — so the library can be listed from the index alone. The releases must be sorted by deck then version.
 * The catalogue names `newcomerCourse`'s series the course for newcomers
 * (solid-memo:newcomerCourse), even when there is no such deck, which
 * newcomerProblems then reports.
 */
export function buildIndex(releases: readonly DeckRelease[], newcomerCourse?: string): string {
  const { namedNode, literal, quad } = DataFactory;
  const out: Quad[] = [];
  const add = (s: string, p: string, o: Quad_Object) => out.push(quad(namedNode(s), namedNode(p), o));
  const iri = (value: string) => namedNode(value);
  const decks = [...new Set(releases.map((r) => r.deck))];
  const issued = releases
    .map((r) => literalsOf(r.quads, releaseUrlOf(r.deck, r.version), `${DCTERMS}issued`)[0]?.value)
    .filter((value): value is string => value !== undefined)
    .sort();

  add(INDEX_URL, RDF_TYPE, iri(`${DCAT}Catalog`));
  add(INDEX_URL, `${DCTERMS}title`, literal("Solid Memo deck library"));
  add(INDEX_URL, `${DCTERMS}description`, literal("Ready-made flashcard decks to import into your own Solid pod."));
  add(INDEX_URL, `${DCTERMS}publisher`, iri(PUBLISHER_URL));
  if (issued.length > 0) {
    add(INDEX_URL, `${DCTERMS}modified`, literal(issued[issued.length - 1], iri(`${XSD}dateTime`)));
  }
  add(INDEX_URL, `${DCAT}themeTaxonomy`, iri(DATA_THEMES));
  add(INDEX_URL, `${DCAT}themeTaxonomy`, iri(TOPICS));
  for (const deck of decks) add(INDEX_URL, `${DCAT}dataset`, iri(seriesUrlOf(deck)));
  if (newcomerCourse !== undefined) add(INDEX_URL, `${SM_NS}newcomerCourse`, iri(seriesUrlOf(newcomerCourse)));
  add(PUBLISHER_URL, RDF_TYPE, iri(`${FOAF}Agent`));
  add(PUBLISHER_URL, `${FOAF}name`, literal("Solid Memo"));

  for (const deck of decks) {
    const ofDeck = releases.filter((r) => r.deck === deck);
    const latest = ofDeck[ofDeck.length - 1];
    const latestUrl = releaseUrlOf(deck, latest.version);
    const series = seriesUrlOf(deck);
    add(series, RDF_TYPE, iri(`${DCAT}DatasetSeries`));
    add(series, RDF_TYPE, iri(`${DCAT}Dataset`));
    add(series, `${SM_NS}formatVersion`, literal(String(LIBRARY_DECK_SERIES_FORMAT), iri(`${XSD}integer`)));
    for (const predicate of [`${DCTERMS}title`, `${DCTERMS}description`]) {
      // A release without one fails validation, which says so.
      for (const object of literalsOf(latest.quads, latestUrl, predicate)) add(series, predicate, object);
    }
    add(series, `${DCTERMS}publisher`, iri(PUBLISHER_URL));
    for (const predicate of [`${DCAT}theme`, `${DCAT}keyword`]) {
      for (const object of objectsOf(latest.quads, latestUrl, predicate)) add(series, predicate, object);
    }
    add(series, `${DCAT}first`, iri(releaseUrlOf(deck, ofDeck[0].version)));
    add(series, `${DCAT}last`, iri(latestUrl));
    for (const release of ofDeck) add(series, `${DCAT}hasVersion`, iri(releaseUrlOf(deck, release.version)));
    add(series, `${DCAT}hasCurrentVersion`, iri(latestUrl));

    for (const release of ofDeck.slice(0, -1)) {
      const url = releaseUrlOf(deck, release.version);
      add(url, RDF_TYPE, iri(`${DCAT}Dataset`));
      for (const predicate of [`${DCTERMS}title`, `${DCTERMS}description`]) {
        for (const object of literalsOf(release.quads, url, predicate)) add(url, predicate, object);
      }
      for (const predicate of [`${DCAT}version`, `${DCTERMS}issued`, `${ADMS}versionNotes`]) {
        const object = literalsOf(release.quads, url, predicate)[0];
        if (object !== undefined) add(url, predicate, object);
      }
    }

    const cards = cardsOf(latest.quads);
    const activities = new Set(
      latest.quads.filter((q) => q.predicate.value === RDF_TYPE && q.object.value === `${PROV}Activity`).map((q) => q.subject.value),
    );
    // DCAT-AP wants the activity that generated the release typed as one: its type stays.
    const generating = new Set(objectsOf(latest.quads, latestUrl, `${PROV}wasGeneratedBy`).map((o) => o.value));
    const outline = new Set(OUTLINE_TYPES.flatMap((type) => subjectsOfType(latest.quads, type)));
    const keep = (q: Quad) =>
      !cards.has(q.subject.value) &&
      !outline.has(q.subject.value) &&
      q.predicate.value !== RDFS_COMMENT &&
      (!activities.has(q.subject.value) || (generating.has(q.subject.value) && q.predicate.value === RDF_TYPE));
    out.push(...latest.quads.filter(keep));
    const inUse = [...cards.values()].filter((retired) => !retired).length;
    add(latestUrl, `${SM_NS}cardCount`, literal(String(inUse), iri(`${XSD}integer`)));
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

/** The values of a predicate on a release as `<iri>`s, for a problem to quote. */
function shownValues(objects: readonly Quad_Object[]): string {
  return objects.length === 0 ? "nothing" : objects.map((o) => (o.termType === "Literal" ? JSON.stringify(o.value) : `<${o.value}>`)).join(", ");
}

/**
 * What the shapes cannot say about a release, against its path: its
 * @base is its own address, it is exactly one deck, the document
 * itself, of the version its path says, in its deck's series, published
 * by Solid Memo, and following the version before it (version 1 follows
 * none).
 */
export function metadataProblems(release: DeckRelease): string[] {
  const { deck, version, quads } = release;
  const label = labelOf(deck, version);
  const url = releaseUrlOf(deck, version);
  const problems: string[] = [];
  const base = /^@base\s+<([^>]*)>/m.exec(release.turtle)?.[1];
  if (base !== url) {
    problems.push(`${label}: states ${base === undefined ? "no @base" : `@base <${base}>`}; its path says @base <${url}>.`);
  }
  const decks = [
    ...new Set(
      quads
        .filter((q) => q.predicate.value === RDF_TYPE && q.object.value === `${SM_NS}Deck`)
        .map((q) => q.subject.value),
    ),
  ];
  if (decks.length !== 1 || decks[0] !== url) {
    problems.push(`${label}: expected the document itself to be its one solid-memo:Deck, found ${decks.map((d) => `<${d}>`).join(", ") || "none"}.`);
  }
  const expect = (predicate: string, name: string, expected: readonly string[], shown: string) => {
    const objects = objectsOf(quads, url, predicate);
    if (objects.length !== expected.length || objects.some((o, i) => o.value !== expected[i])) {
      problems.push(`${label}: states ${name} ${shownValues(objects)}; its path says ${shown}.`);
    }
  };
  const stated = literalsOf(quads, url, `${DCAT}version`);
  if (stated.length !== 1 || stated[0].value !== String(version)) {
    problems.push(`${label}: states dcat:version ${shownValues(objectsOf(quads, url, `${DCAT}version`))}; its path says "${version}".`);
  }
  const series = seriesUrlOf(deck);
  expect(`${DCAT}inSeries`, "dcat:inSeries", [series], `<${series}>`);
  expect(`${DCAT}isVersionOf`, "dcat:isVersionOf", [series], `<${series}>`);
  expect(`${DCTERMS}publisher`, "dcterms:publisher", [PUBLISHER_URL], `<${PUBLISHER_URL}>`);
  const previous = version > 1 ? [releaseUrlOf(deck, version - 1)] : [];
  const shownPrevious = version > 1 ? `<${previous[0]}>` : "nothing, being the first version";
  expect(`${DCAT}prev`, "dcat:prev", previous, shownPrevious);
  expect(`${DCAT}previousVersion`, "dcat:previousVersion", previous, shownPrevious);
  return problems;
}

/**
 * What the shapes cannot say about a course: a release with chapters or
 * steps is a schema:Course, with at least one chapter, studied front to
 * back; its chapters are part of it and its steps part of its chapters,
 * each at its own position; what a step in use checks and a chapter in
 * use reviews is a card of the release in use, asked once, with text on
 * its back and at least two distractors that have text in each of its
 * back's languages (retired ones not counted); and a chapter in use has
 * a step in use. Every card's
 * distractors, in a course or not, are distractors of the release, each
 * named by that card alone.
 * Retired chapters and steps keep what they named.
 */
export function courseProblems(release: DeckRelease): string[] {
  const { deck, version, quads } = release;
  const label = labelOf(deck, version);
  const url = releaseUrlOf(deck, version);
  const problems: string[] = [];
  const retired = retiredOf(quads);
  const inUse = (subject: string) => !retired.has(subject);
  const cards = cardsOf(quads);
  const chapters = subjectsOfType(quads, `${SM_NS}Chapter`);
  const steps = subjectsOfType(quads, `${SM_NS}Step`);
  const distractors = new Set(subjectsOfType(quads, `${SM_NS}Distractor`));
  const shown = (iri: string) => (iri.startsWith(`${url}#`) ? `<${iri.slice(url.length)}>` : `<${iri}>`);
  const named = (subject: string, predicate: string) =>
    objectsOf(quads, subject, predicate).filter((o) => o.termType === "NamedNode").map((o) => o.value);
  const partOf = (subject: string) => named(subject, `${SCHEMA}isPartOf`);

  const course = objectsOf(quads, url, RDF_TYPE).some((o) => o.value === `${SCHEMA}Course`);
  if (!course && chapters.length + steps.length > 0) {
    problems.push(`${label}: has chapters or steps but is no schema:Course: type the release itself schema:Course.`);
  }
  if (course && chapters.length === 0) {
    problems.push(`${label}: is a schema:Course without a chapter: a course has at least one solid-memo:Chapter.`);
  }
  const direction = objectsOf(quads, url, `${SM_NS}studyDirection`);
  if (course && (direction.length !== 1 || direction[0].value !== `${SM_NS}frontToBack`)) {
    problems.push(`${label}: states solid-memo:studyDirection ${shownValues(direction)}; a course studies solid-memo:frontToBack.`);
  }

  for (const chapter of chapters) {
    const parts = partOf(chapter);
    if (parts.some((part) => part !== url)) {
      problems.push(
        `${label}: chapter ${shown(chapter)} is part of ${parts.map(shown).join(", ")}; a chapter is part of the release it is in (schema:isPartOf <>).`,
      );
    }
  }
  for (const step of steps) {
    for (const part of partOf(step).filter((part) => !chapters.includes(part))) {
      problems.push(`${label}: step ${shown(step)} is part of ${shown(part)}, which is no chapter of this release.`);
    }
  }

  // The cards the steps and chapters in use ask, each with the steps that check it and the chapters that review it.
  const asked = new Map<string, { checkedBy: string[]; reviewedBy: string[] }>();
  const ask = (asker: string, term: "checkedBy" | "reviewQuestion") => {
    for (const card of named(asker, `${SM_NS}${term}`)) {
      if (!cards.has(card)) {
        problems.push(`${label}: ${shown(asker)} names ${shown(card)} by solid-memo:${term}, which is no card of this release.`);
      } else if (cards.get(card) === true) {
        problems.push(`${label}: ${shown(asker)} names ${shown(card)} by solid-memo:${term}, which is retired: name a card in use, or retire ${shown(asker)} too.`);
      } else {
        const entry = asked.get(card) ?? { checkedBy: [], reviewedBy: [] };
        entry[term === "checkedBy" ? "checkedBy" : "reviewedBy"].push(asker);
        asked.set(card, entry);
      }
    }
  };
  for (const step of steps.filter(inUse)) ask(step, "checkedBy");
  for (const chapter of chapters.filter(inUse)) ask(chapter, "reviewQuestion");
  for (const q of quads.filter((q) => q.predicate.value === `${SM_NS}distractor` && !distractors.has(q.object.value))) {
    problems.push(
      `${label}: ${shown(q.subject.value)} names ${shown(q.object.value)} by solid-memo:distractor, which is no solid-memo:Distractor of this release.`,
    );
  }
  // A card's distractors are its own: a copy writes and removes them with it, so one two cards share would go with either.
  const namers = new Map<string, Set<string>>();
  for (const q of quads.filter((q) => q.predicate.value === `${SM_NS}distractor`)) {
    namers.set(q.object.value, (namers.get(q.object.value) ?? new Set()).add(q.subject.value));
  }
  for (const [distractor, by] of namers) {
    if (by.size > 1) {
      problems.push(
        `${label}: distractor ${shown(distractor)} is named by ${[...by].map(shown).join(", ")}; a distractor is one card's: give each card its own.`,
      );
    }
  }

  // Languages of text, "" for untagged.
  const languagesOf = (subject: string, predicate: string) =>
    new Set(
      objectsOf(quads, subject, predicate)
        .filter((o): o is Literal => o.termType === "Literal")
        .map((o) => o.language),
    );
  for (const [card, { checkedBy, reviewedBy }] of asked) {
    if (checkedBy.length > 1) {
      problems.push(`${label}: ${shown(card)} is checked by ${checkedBy.map(shown).join(", ")}; a card is checked by one step at most.`);
    }
    if (checkedBy.length > 0 && reviewedBy.length > 0) {
      problems.push(
        `${label}: ${shown(card)} is checked by ${checkedBy.map(shown).join(", ")} and a review question of ${reviewedBy.map(shown).join(", ")}; a card is the one or the other.`,
      );
    }
    const back = languagesOf(card, `${SM_NS}back`);
    if (back.size === 0) {
      problems.push(`${label}: ${shown(card)} has no text on its back (solid-memo:back), the right one among the options a course offers.`);
    }
    const options = named(card, `${SM_NS}distractor`).filter((d) => distractors.has(d) && inUse(d));
    if (options.length < 2) {
      problems.push(`${label}: ${shown(card)} has too few distractors (${options.length}); a card a course asks has at least 2.`);
    }
    for (const option of options) {
      const text = languagesOf(option, `${SM_NS}distractorText`);
      const missing = [...back].filter((language) => !text.has(language));
      if (missing.length > 0) {
        problems.push(
          `${label}: distractor ${shown(option)} has no text ${missing.map((l) => (l === "" ? "untagged" : `@${l}`)).join(", ")}, which the back of ${shown(card)} has.`,
        );
      }
    }
  }

  // Members of the same list that share a schema:position.
  const clashes = (members: readonly string[]) => {
    const at = new Map<string, string[]>();
    for (const member of members) {
      for (const position of literalsOf(quads, member, `${SCHEMA}position`)) {
        at.set(position.value, [...(at.get(position.value) ?? []), member]);
      }
    }
    return [...at].filter(([, sharing]) => sharing.length > 1);
  };
  for (const [position, sharing] of clashes(chapters.filter(inUse))) {
    problems.push(`${label}: chapters ${sharing.map(shown).join(", ")} share schema:position ${position}; a course's chapters each have their own.`);
  }
  for (const chapter of chapters) {
    const ofChapter = steps.filter((step) => inUse(step) && partOf(step).includes(chapter));
    for (const [position, sharing] of clashes(ofChapter)) {
      problems.push(
        `${label}: steps ${sharing.map(shown).join(", ")} of ${shown(chapter)} share schema:position ${position}; a chapter's steps each have their own.`,
      );
    }
    if (inUse(chapter) && ofChapter.length === 0) {
      problems.push(`${label}: chapter ${shown(chapter)} has no step in use; a chapter in use has at least one step that is not retired.`);
    }
  }
  return problems;
}

const TEXT_FORMAT = `${SM_NS}textFormat`;
const MARKDOWN = `${SM_NS}markdown`;
/** The concepts of solid-memo:TextFormats. */
const TEXT_FORMATS = new Set([`${SM_NS}plainText`, MARKDOWN]);

/** What a Markdown problem means for a release's author, after the subject and field it is in. */
function problemText(problem: MarkdownProblem): string {
  const code = (source: string) => JSON.stringify(source);
  switch (problem.code) {
    case "tooLong":
      return `is ${problem.length} characters, more than the ${MAX_CHARS} the app reads as Markdown: it would be shown as plain text. Make it shorter.`;
    case "tooComplex":
      return "nests or marks up more than the app reads as Markdown (docs/markdown.md, Limits): it would be shown as plain text.";
    case "tooDeep":
      return `nests ${code(problem.source)} past the ${MAX_DEPTH} levels of blocks and markup the app reads (each quote, list item, paragraph, emphasis and link is one): it would be shown as its source.`;
    case "largeTable":
      return `has a table of more than ${MAX_TABLE_COLUMNS} columns or ${MAX_TABLE_CELLS} cells: it would be shown as its source.`;
    case "html":
      return `has raw HTML, ${code(problem.source)}, which is shown as its source: write it as code, or escape its "<" (\\<).`;
    case "image":
      return `has a picture, ${code(problem.source)}, which is never shown, only its description: a card shows a picture by solid-memo:frontImage or backImage.`;
    case "link":
      return `has a link, ${code(problem.source)}, where none may be (a card's sides, its label and its options): ${problem.autolink ? "an autolink loses its angle brackets; " : ""}write it as code to show it as written.`;
    case "linkNotFollowed":
      return `links to ${code(problem.url)}, which the app does not follow: only an https: address without a user name or password is.`;
    case "linkHost":
      return `has link text that reads as the host name or address ${code(problem.text)}, but the link leads to ${problem.host}: name that host, or word the text otherwise (a file's name, such as package.json, reads as a host name too).`;
    case "hiddenControl":
      return `has ${problem.controls.join(", ")} in ${problem.in === "code" ? "code" : "a link"}, which would show as markers: such controls make text read other than it is.`;
    case "characterReference":
      return `has the character reference ${problem.source}, which Markdown shows decoded: write it as code, or escape its "&" (\\${problem.source}).`;
    case "notOneParagraph":
      return "is an option but not one paragraph: the right option and the wrong ones must look alike.";
    case "dashHeading":
      return `underlines a line with dashes, ${code(problem.source)}, which makes it a heading, not a line of text and a thematic break: put a blank line before the break (in a step's theory, it ends a chunk), or write the heading with "##".`;
  }
}

/**
 * The text of a release written in Markdown, by the rules for a release
 * (docs/markdown.md, docs/deck-library.md): raw HTML, pictures, links
 * where none may be or that the app does not follow or that name another
 * host, hidden controls, character references and what the app would not
 * read as Markdown, field by field, of each card, step and chapter that
 * states solid-memo:textFormat solid-memo:markdown; on a card, its
 * distractors' text too, its back and every distractor's text one
 * paragraph when it has distractors, as options are; a step's theory
 * with no empty chunk, and in as many chunks in each language (chunks
 * are split at its top-level thematic breaks). Only those subjects
 * state a text format, and only a concept of solid-memo:TextFormats.
 * None of this keeps the app safe, which shows any text safely: it is
 * that the text shows as its author meant.
 */
export function markdownProblems(release: DeckRelease): string[] {
  const { deck, version, quads } = release;
  const label = labelOf(deck, version);
  const url = releaseUrlOf(deck, version);
  const problems: string[] = [];
  const shown = (iri: string) => (iri.startsWith(`${url}#`) ? `<${iri.slice(url.length)}>` : `<${iri}>`);
  const cards = subjectsOfType(quads, `${SM_NS}Card`);
  const steps = subjectsOfType(quads, `${SM_NS}Step`);
  const chapters = subjectsOfType(quads, `${SM_NS}Chapter`);
  const formatted = new Set([...cards, ...steps, ...chapters]);

  const distractors = new Set(subjectsOfType(quads, `${SM_NS}Distractor`));
  for (const q of quads.filter((q) => q.predicate.value === TEXT_FORMAT)) {
    if (!formatted.has(q.subject.value)) {
      const why = distractors.has(q.subject.value) ? "a distractor's text is written as its card's" : "its text is plain text";
      problems.push(
        `${label}: ${shown(q.subject.value)} states solid-memo:textFormat, which only a card, a step or a chapter does: ${why}.`,
      );
    } else if (!TEXT_FORMATS.has(q.object.value)) {
      problems.push(
        `${label}: ${shown(q.subject.value)} states solid-memo:textFormat ${shownValues([q.object])}, no concept of solid-memo:TextFormats: the app shows its text as plain text.`,
      );
    }
  }

  const marked = (subject: string) => objectsOf(quads, subject, TEXT_FORMAT).some((o) => o.value === MARKDOWN);
  const fieldOf = (name: string, text: Literal) => `${name}${text.language === "" ? "" : `@${text.language}`}`;
  const check = (subject: string, predicate: string, name: string, rule: FieldRule) => {
    for (const text of literalsOf(quads, subject, predicate) as Literal[]) {
      const field = fieldOf(name, text);
      for (const problem of textProblems(text.value, rule)) problems.push(`${label}: ${shown(subject)} ${field} ${problemText(problem)}`);
    }
  };
  for (const card of cards.filter(marked)) {
    const options = objectsOf(quads, card, `${SM_NS}distractor`).map((o) => o.value);
    check(card, `${SM_NS}front`, "solid-memo:front", SIDE);
    check(card, `${SM_NS}back`, "solid-memo:back", options.length > 0 ? OPTION : SIDE);
    check(card, `${SM_NS}backLabel`, "solid-memo:backLabel", SIDE);
    check(card, `${SM_NS}frontNote`, "solid-memo:frontNote", PROSE);
    check(card, `${SM_NS}backNote`, "solid-memo:backNote", PROSE);
    for (const option of options) {
      check(option, `${SM_NS}distractorText`, "solid-memo:distractorText", OPTION);
      check(option, `${SM_NS}distractorNote`, "solid-memo:distractorNote", PROSE);
    }
  }
  for (const step of steps.filter(marked)) {
    check(step, `${SM_NS}theory`, "solid-memo:theory", PROSE);
    // A step's theory is shown a chunk at a time, split at its top-level thematic breaks.
    const chunked = (literalsOf(quads, step, `${SM_NS}theory`) as Literal[]).map((text) => ({
      field: fieldOf("solid-memo:theory", text),
      ...inspectChunks(text.value),
    }));
    for (const { field } of chunked.filter(({ empty }) => empty > 0)) {
      problems.push(
        `${label}: ${shown(step)} ${field} has a thematic break first, last or right after another, which makes an empty chunk the app drops: a step's theory is shown a chunk at a time, split at its top-level thematic breaks, with text between each two.`,
      );
    }
    if (new Set(chunked.map(({ chunks }) => chunks)).size > 1) {
      const counts = chunked.map(({ field, chunks }) => `${chunks} ${chunks === 1 ? "chunk" : "chunks"} in ${field}`);
      problems.push(
        `${label}: ${shown(step)} has its theory in ${counts.join(", ")}: a step's theory is in as many chunks in each language, so a learner who switches language keeps their place.`,
      );
    }
  }
  for (const chapter of chapters.filter(marked)) check(chapter, `${DCTERMS}description`, "dcterms:description", PROSE);
  return problems;
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
  const isCourse = (release: Quad_Object) => objectsOf(indexQuads, release.value, RDF_TYPE).some((o) => o.value === `${SCHEMA}Course`);
  for (const course of named) {
    const shown = `${label}: names ${shownValues([course])} by solid-memo:newcomerCourse`;
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
 * metadata against its path, its cards, chapters, steps and distractors
 * against the version before it (one the deck no longer uses is retired,
 * owl:deprecated true, never removed, so the copies that have it keep it
 * and its review history), its course outline (courseProblems), its
 * text written in Markdown (markdownProblems), its literals in Unicode
 * NFC (normalizationProblems), and Solid Memo's shapes,
 * DCAT-AP (a release with the index beside it, where its series and
 * publisher are described) and SKOS, with the reference data; then the
 * index's course for newcomers (newcomerProblems), its literals in NFC,
 * and the index to the shapes and the profiles too.
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
      const droppedOf = (types: readonly string[]) => {
        const now = new Set(types.flatMap((type) => idsOf(release.quads, type)));
        return types.flatMap((type) => idsOf(before.quads, type)).filter((id) => !now.has(id));
      };
      const cards = droppedOf([`${SM_NS}Card`]);
      if (cards.length > 0) {
        problems.push(
          `${label}: drops ${cards.map((id) => `<#${id}>`).join(", ")}, which v${before.version}.ttl has. A card is never removed: retire it (owl:deprecated true), so the copies that have it keep it and its review history.`,
        );
      }
      const outline = droppedOf(OUTLINE_TYPES);
      if (outline.length > 0) {
        problems.push(
          `${label}: drops ${outline.map((id) => `<#${id}>`).join(", ")}, which v${before.version}.ttl has. A chapter, step or distractor is never removed: retire it (owl:deprecated true), so the copies that follow the course keep their place in it.`,
        );
      }
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
