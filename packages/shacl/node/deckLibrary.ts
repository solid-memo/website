import { execFile } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import { DataFactory, Writer, type Quad, type Quad_Object } from "n3";
import type { ShapeEngine } from "../src/engine.ts";
import { formatTurtle } from "@solid-memo/turtle/formatTurtle";
import { objectsOf, parseTurtle, RDF_TYPE } from "@solid-memo/turtle/rdf";
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
 * SKOS with the reference data, and that no version drops a card of the
 * one before it. With `--base <git ref>`, a version published at that
 * ref must be there still, byte for byte: a published version is never
 * edited or removed, only followed by the next.
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

/** Where the site publishes the library. Every IRI of it is under this: the index, its series and publisher, and every release. */
export const DECKS_BASE = `${SITE}decks/`;
export const INDEX_FILE = "index.ttl";
export const INDEX_URL = `${DECKS_BASE}${INDEX_FILE}`;
export const PUBLISHER_URL = `${INDEX_URL}#solid-memo`;

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

/** A release's cards by subject, each with whether it is retired (owl:deprecated true). */
function cardsOf(quads: readonly Quad[]): Map<string, boolean> {
  const cards = quads
    .filter((q) => q.predicate.value === RDF_TYPE && q.object.value === `${SM_NS}Card`)
    .map((q) => q.subject.value);
  const retired = new Set(
    quads
      .filter((q) => q.predicate.value === OWL_DEPRECATED && q.object.termType === "Literal" && q.object.value === "true")
      .map((q) => q.subject.value),
  );
  return new Map(cards.map((subject) => [subject, retired.has(subject)]));
}

/** The fragment ids of a release's cards: a card's identity from one version to the next. */
function cardIdsOf(quads: readonly Quad[]): string[] {
  return [...cardsOf(quads).keys()].map((subject) => subject.slice(subject.indexOf("#") + 1));
}

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
 * everything but its cards and the record of how it was made (every
 * rdfs:comment, and of its prov:Activity nodes all but the type of the
 * one that generated it; the release itself carries them), plus sm:cardCount, the cards it has in use (retired
 * ones not counted) — so the library can be listed from the index alone. The releases must be sorted by deck then version.
 */
export function buildIndex(releases: readonly DeckRelease[]): string {
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
    const keep = (q: Quad) =>
      !cards.has(q.subject.value) &&
      q.predicate.value !== RDFS_COMMENT &&
      (!activities.has(q.subject.value) || (generating.has(q.subject.value) && q.predicate.value === RDF_TYPE));
    out.push(...latest.quads.filter(keep));
    const inUse = [...cards.values()].filter((retired) => !retired).length;
    add(latestUrl, `${SM_NS}cardCount`, literal(String(inUse), iri(`${XSD}integer`)));
  }
  return writeIndex(out);
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
 * metadata against its path, its cards against the version before it (a
 * card the deck no longer uses is retired, owl:deprecated true, never
 * removed, so the copies that have it keep it and its review history),
 * and Solid Memo's shapes, DCAT-AP (a release with the index beside it,
 * where its series and publisher are described) and SKOS, with the
 * reference data; then the index, to the shapes and the profiles too.
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
      const cards = new Set(cardIdsOf(release.quads));
      const dropped = cardIdsOf(before.quads).filter((id) => !cards.has(id));
      if (dropped.length > 0) {
        problems.push(
          `${label}: drops ${dropped.map((id) => `<#${id}>`).join(", ")}, which v${before.version}.ttl has. A card is never removed: retire it (owl:deprecated true), so the copies that have it keep it and its review history.`,
        );
      }
    }
    problems.push(
      ...(await problemsOf(validateTurtleDocument(label, release.quads, validators.shapes, "library"))),
      ...(await problemsOf(validateProfile(label, release.quads, validators.dcatAp, [...validators.reference, ...indexQuads]))),
      ...(await problemsOf(validateProfile(label, release.quads, validators.skos, validators.reference))),
    );
  }
  const label = `decks/${INDEX_FILE}`;
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
    const index = buildIndex(releases);
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
  };
}

/** The script entry: `node -e "import('@solid-memo/shacl/node/deckLibrary').then((m) => m.run(process))" -- [--check] [--base <ref>]`. */
export async function run(
  process: { argv: readonly string[]; exitCode?: number },
): Promise<void> {
  process.exitCode = await main(process.argv, defaultIo(join(DECKS_ROOT, "..")));
}
