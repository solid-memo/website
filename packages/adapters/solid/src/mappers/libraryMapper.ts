// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Quad_Object } from "@rdfjs/types";
import {
  type Dataset,
  type Subject,
  asUrl,
  getThing,
  getThingAll,
} from "@solid-memo/solid-client/rdf";
import { directionOfConcept } from "@solid-memo/domain/concepts";
import { copyKeywords } from "@solid-memo/domain/keywords";
import { libraryCardFromRecord, libraryDeckFromRecord } from "@solid-memo/domain/deckRecord";
import {
  boundedSources,
  listedAuthors,
  withBoundedListing,
  type LibraryCard,
  type LibraryDeck,
  type LibraryRelease,
  type LibrarySource,
} from "@solid-memo/domain/library";
import { LATEST_VERSION, type ChapterV1, type StepV1 } from "@solid-memo/vocab/types.generated";
import {
  CATALOG_TERMS,
  CATALOG_V1,
  CONTACT_TERMS,
  LIBRARY_DECK_TERMS,
  LIBRARY_RELEASE_TERMS,
  LIBRARY_SOURCE_TERMS,
  SHAPES,
} from "@solid-memo/vocab/descriptors.generated";
import type { ShapeDescriptor } from "@solid-memo/vocab/shapeDescriptor";
import { migrate } from "@solid-memo/domain/shapes/migrations";
import {
  countOf,
  everyIri,
  hasClass,
  migrateWithinBound,
  onlyValueOf,
  readFieldOf,
  readTerms,
  readVersioned,
  storedVersionOf,
} from "../records";
import { agentNamesOf, authorOfAgents, distractorsOf, readCard } from "./deckMapper";
import { DCAT, SCHEMA, SM, VCARD } from "../vocab";
import { isHttpUrl } from "@solid-memo/domain/webId";
import {
  courseOutlineFromRecords,
  outlineOfCards,
  type CourseOutline,
} from "@solid-memo/domain/course";
import { AppError } from "@solid-memo/domain/appError";
import { documentUrlOf } from "@solid-memo/domain/subjectUrl";
import { isGuestPodIri, linksGuestPod } from "@solid-memo/domain/guest";
import { isPublishedReleaseUrl } from "@solid-memo/domain/release/releasePlace";
import type { LibraryIndexView } from "@solid-memo/domain/release/releaseCheck";

/**
 * Every deck the library's index lists (see docs/deck-library.md): the
 * catalog's datasets are the decks' series, each described by its
 * current release, which the index carries in full but for its cards.
 * A series or release that does not fit its shape is left out. The
 * course the catalog offers to newcomers (sm:newcomerCourse) is
 * flagged forNewcomers, if it is listed and is a course. The index is a
 * document of relative IRIs, so every URL here is where it can be
 * fetched from.
 */
export function toLibraryDecks(index: Dataset): LibraryDeck[] {
  const catalog = getThingAll(index).find((thing) => hasClass(thing, DCAT.Catalog));
  if (catalog === undefined) return [];
  const names = agentNamesOf(index);
  const { newcomerCourse } = readTerms(catalog, CATALOG_TERMS);
  return readFieldOf(catalog, CATALOG_V1, "dataset")!
    .map((seriesUrl) => toLibraryDeck(index, seriesUrl, names))
    .filter((deck): deck is LibraryDeck => deck !== null)
    .map((deck) =>
      deck.seriesUrl === newcomerCourse && deck.isCourse === true
        ? { ...deck, forNewcomers: true as const }
        : deck,
    );
}

/**
 * What the index says that places a release in the library (the
 * Studio's release check, domain/release/releaseCheck.ts): its address,
 * its catalog's publisher, and every release of every deck it lists.
 */
export function toLibraryIndexView(indexUrl: string, index: Dataset): LibraryIndexView {
  const catalog = getThingAll(index).find((thing) => hasClass(thing, DCAT.Catalog));
  return {
    url: indexUrl,
    publisher:
      (catalog === undefined ? null : readFieldOf(catalog, CATALOG_V1, "publisher")) ?? null,
    releases: toLibraryDecks(index).flatMap((deck) => deck.releases.map((release) => release.url)),
  };
}

function toLibraryDeck(
  index: Dataset,
  seriesUrl: string,
  names: ReadonlyMap<string, string>,
): LibraryDeck | null {
  const seriesThing = getThing(index, seriesUrl);
  const series = seriesThing === null ? null : readVersioned(seriesThing, "libraryDeckSeries");
  if (series === null) return null;
  const { hasCurrentVersion, hasVersion } = migrate("libraryDeckSeries", series.record, {
    subject: seriesUrl,
  });
  const currentThing = getThing(index, hasCurrentVersion);
  const current = currentThing === null ? null : readVersioned(currentThing, "libraryDeck");
  if (current === null) return null;
  const release = migrateWithinBound("libraryDeck", current.record, {
    subject: hasCurrentVersion,
  });
  if (release === null) return null;
  const createdAt = release.created;
  const modifiedAt = release.modified;
  // No more of its metadata than a release added by link keeps (toStandaloneLibraryDeck).
  const listing = withBoundedListing({
    url: hasCurrentVersion,
    seriesUrl,
    version: release.version,
    ...(release.versionNotes === undefined ? {} : { versionNotes: release.versionNotes }),
    releases: hasVersion
      .map((url) => toLibraryRelease(index, url))
      .sort((a, b) => Number(a.version) - Number(b.version)),
    title: release.title,
    cardCount: readTerms(currentThing!, LIBRARY_DECK_TERMS).cardCount ?? 0,
    languages: [...release.language],
    authors: release.creator.map((agent) => names.get(agent) ?? agent),
    ...(release.license === undefined ? {} : { license: release.license }),
    description: release.description,
    direction: directionOfConcept(release.studyDirection)!,
    ...(createdAt === undefined ? {} : { createdAt }),
    ...(modifiedAt === undefined ? {} : { modifiedAt }),
    themes: [...release.theme],
    keywords: copyKeywords(release.keyword),
    ...boundedSources(
      release.wasDerivedFrom,
      (sourceUrl) => toLibrarySource(sourceUrl, getThing(index, sourceUrl)),
      sourceCountOf(currentThing!, current.record.version),
    ),
    ...courseOf(currentThing!),
  });
  const total = authorCountOf(currentThing!, current.record.version);
  return { ...listing, ...listedAuthors(listing.authors, total) };
}

/** The fields of several values of a release that a listing counts past their bounds (countOf). */
type CountedFields = {
  creator: readonly string[];
  source: readonly string[];
  wasDerivedFrom: readonly string[];
};

/** The descriptor a release of `version` is read with, for the fields a listing counts. */
function releaseDescriptor(version: number): ShapeDescriptor<CountedFields> {
  return (SHAPES.libraryDeck as unknown as Record<number, ShapeDescriptor<CountedFields>>)[
    version
  ]!;
}

/**
 * How many authors a release names. Only the first MAX_DECK_METADATA
 * are read (ns/bounds/library-deck.ttl), and one from before format 3
 * names them as text, so they are counted where it stores them, with
 * no agent named for any.
 */
function authorCountOf(thing: Subject, version: number): number {
  return countOf(thing, releaseDescriptor(version), "creator");
}

/** How many sources a release names, past the first it reads: dcterms:source before format 3. */
function sourceCountOf(thing: Subject, version: number): number {
  return countOf(thing, releaseDescriptor(version), version < 3 ? "source" : "wasDerivedFrom");
}

/** `isCourse` for a release that is also typed schema:Course. */
function courseOf(release: Subject): { isCourse?: true } {
  return hasClass(release, SCHEMA.Course) ? { isCourse: true } : {};
}

/**
 * The web page a release's contact names (docs/deck-library.md,
 * Contact): the vcard:hasURL of its one dcat:contactPoint, named or
 * blank, read from the release's own document. None when it names no
 * contact, a contact with no web page, such as the email the library's
 * older versions name, or more than one contact point, or a point with
 * more than one vcard:hasURL of any scheme (GHSA-9475-qxm2-3xgp): the
 * Studio reads it the same way (`contactOf` in the domain's
 * releaseDraft.ts), so "Report a mistake" never leads elsewhere than
 * the contact the release's creator saw.
 */
function contactOf(release: Subject, dataset: Dataset): { contact?: string } {
  const point = onlyValueOf(release, DCAT.contactPoint);
  if (point === null) return {};
  const thing = subjectAt(dataset, point);
  if (thing === null) return {};
  // Counted as the Studio counts them, every IRI of any scheme: one that
  // isn't a web page, such as a mailto:, beside one that is, names none.
  const urls = readTerms(thing, CONTACT_TERMS).hasURL;
  return urls.length === 1 && everyIri(thing, VCARD.hasURL, isHttpUrl) ? { contact: urls[0]! } : {};
}

/** The subject a term names in the dataset: an IRI's or a blank node's; null for a literal. */
function subjectAt(dataset: Dataset, term: Quad_Object): Subject | null {
  if (term.termType === "BlankNode") return getThing(dataset, `_:${term.value}`);
  return term.termType === "NamedNode" ? getThing(dataset, term.value) : null;
}

/** A release by URL, with what the index says about it (maybe nothing). */
function toLibraryRelease(index: Dataset, url: string): LibraryRelease {
  const thing = getThing(index, url);
  if (thing === null) return { url, version: "?" };
  const { version, issued, versionNotes } = readTerms(thing, LIBRARY_RELEASE_TERMS);
  return {
    url,
    version: version ?? "?",
    ...(issued === undefined ? {} : { issued }),
    ...(versionNotes === undefined ? {} : { notes: versionNotes }),
  };
}

/** A source by URL, plus whatever the index says about it (maybe nothing). */
function toLibrarySource(url: string, thing: Subject | null): LibrarySource {
  if (thing === null) return { url, authors: [] };
  const { title, license, creator } = readTerms(thing, LIBRARY_SOURCE_TERMS);
  // Only its first authors are read: how many it names, when more.
  const authorCount = countOf(thing, LIBRARY_SOURCE_TERMS, "creator");
  return {
    url,
    ...(title === undefined ? {} : { title }),
    authors: [...creator],
    ...(authorCount > creator.length ? { authorCount } : {}),
    ...(license === undefined ? {} : { license }),
  };
}

/**
 * Map a fetched deck document to its content. The deck is found by
 * type, not by URL: a document's own subject may be its canonical URL
 * (declared with @base) rather than the URL it was fetched from. A deck
 * or card in a newer format than this app writes is refused: importing
 * it would silently drop whatever the newer format added. Older formats
 * are brought up to the current one in memory; one that comes out of it
 * with a term longer than a term may be is not a deck either
 * (migrateWithinBound), as no copy of it could be written. A release
 * that gives two of its cards and distractors one id is refused
 * (libraryIdsRepeat): a copy keeps them all as subjects of one cards
 * document, by their ids (refuseRepeatedIds). So is one at the guest's pod, or that links to it
 * by an address a copy would keep, such as a card's picture or subject
 * (releaseLinksGuestPod): a guest could not keep a copy of it
 * (GHSA-hc3p-fpwj-fvjp).
 */
export function toLibraryDeckContent(url: string, dataset: Dataset): LibraryDeckContentOf {
  const deck = releaseDeckOf(url, dataset);
  const formatVersion = deck === undefined ? 1 : storedVersionOf(deck);
  if (formatVersion > LATEST_VERSION.libraryDeck) {
    throw new AppError("libraryDeckTooNew", {
      url,
      version: formatVersion,
      latest: LATEST_VERSION.libraryDeck,
    });
  }
  const read = deck === undefined ? null : readVersioned(deck, "libraryDeck");
  if (read === null) {
    throw new AppError("notADeck", { url });
  }
  const subject = asUrl(deck!);
  const release = migrateWithinBound("libraryDeck", read.record, { subject });
  if (release === null) {
    throw new AppError("notADeck", { url });
  }
  const cards = refuseRepeatedIds(url, toLibraryCards(url, dataset));
  const own = read.record.version < 3 ? read.record.data.creator : [];
  const content = {
    ...libraryDeckFromRecord(
      url,
      read.storedVersion,
      release,
      cards,
      authorOfAgents(subject, own, agentNamesOf(dataset)),
    ),
    ...courseOf(deck!),
    ...contactOf(deck!, dataset),
  };
  if (isGuestPodIri(url) || isGuestPodIri(subject) || linksGuestPod(content))
    throw new AppError("releaseLinksGuestPod", { url });
  return content;
}

/**
 * A release as its one document describes it, with no index (a release
 * added from a link, docs/deck-library.md): its content as an import
 * reads it (toLibraryDeckContent) with how many authors it names, its
 * sources (as many as a listing keeps, boundedSources) and creation
 * time, its
 * live cards counted, and every version of its series the document
 * describes (library deck format 6 describes its series in it) at an
 * address a release may have (isPublishedReleaseUrl), else the release
 * alone, as the release says of itself.
 */
export function toStandaloneLibraryDeck(url: string, dataset: Dataset): LibraryDeck {
  // Where a mistake in it is reported is read with its content when asked (UseCases.reportPlace).
  const {
    cards,
    formatVersion: _formatVersion,
    contact: _contact,
    ...content
  } = toLibraryDeckContent(url, dataset);
  const deck = releaseDeckOf(url, dataset)!;
  const subject = asUrl(deck);
  const read = readVersioned(deck, "libraryDeck")!;
  const release = migrate("libraryDeck", read.record, { subject });
  const seriesThing = getThing(dataset, release.inSeries);
  const series = seriesThing === null ? null : readVersioned(seriesThing, "libraryDeckSeries");
  // The series is data the release's creator wrote: of the other versions it lists, only those at an address a
  // release may have are read, and may become a copy's source (isPublishedReleaseUrl), as a catalog's are.
  const versions =
    series === null
      ? [subject]
      : migrate("libraryDeckSeries", series.record, {
          subject: release.inSeries,
        }).hasVersion.filter((version) => version === subject || isPublishedReleaseUrl(version));
  return {
    ...content,
    releases: versions
      .map((version) => toLibraryRelease(dataset, version))
      .map((one) => (one.url === subject ? { ...one, url } : one))
      .sort((a, b) => Number(a.version) - Number(b.version)),
    cardCount: cards.filter((card) => card.retired !== true).length,
    languages: [...release.language],
    ...(release.created === undefined ? {} : { createdAt: release.created }),
    // Its content keeps its first authors (libraryDeckFromRecord): how many it names, when more.
    ...listedAuthors(content.authors, authorCountOf(deck, read.record.version)),
    ...boundedSources(
      release.wasDerivedFrom,
      (sourceUrl) => toLibrarySource(sourceUrl, getThing(dataset, sourceUrl)),
      sourceCountOf(deck, read.record.version),
    ),
  };
}

/**
 * A fetched release's course outline (see domain/course.ts): its
 * chapter and step subjects (releaseSubjectsOf), each read with its
 * format's shape (one that does not fit is left out) and brought up to
 * the current format, asking only cards of the release that fit their
 * shape (outlineOfCards). A release with none — no course — has an
 * empty outline. The outline is frozen, its chapters and steps too: the
 * course decks that name one release share it, as the library keeps it,
 * and what is worked out of it alone is then worked out once
 * (domain/course.ts outlineIndexOf).
 */
export function toCourseOutline(releaseUrl: string, dataset: Dataset): CourseOutline {
  const chapters: { url: string; data: ChapterV1 }[] = [];
  const steps: { url: string; data: StepV1 }[] = [];
  for (const thing of releaseSubjectsOf(releaseUrl, dataset)) {
    const url = asUrl(thing);
    const chapter = readVersioned(thing, "chapter");
    if (chapter !== null)
      chapters.push({ url, data: migrate("chapter", chapter.record, { subject: url }) });
    const step = readVersioned(thing, "step");
    if (step !== null) steps.push({ url, data: migrate("step", step.record, { subject: url }) });
  }
  // A question asks one of the release's cards, as the player looks it up among them.
  const cardIds = new Set(toLibraryCards(releaseUrl, dataset).map((card) => card.id));
  return frozenOutline(
    outlineOfCards(courseOutlineFromRecords(releaseUrl, chapters, steps), cardIds),
  );
}

/** The outline frozen through: its chapters, their steps, and the questions of each. */
function frozenOutline(outline: CourseOutline): CourseOutline {
  for (const chapter of outline.chapters) {
    for (const step of chapter.steps) {
      Object.freeze(step.questionIds);
      Object.freeze(step);
    }
    Object.freeze(chapter.steps);
    Object.freeze(chapter.reviewQuestionIds);
    Object.freeze(chapter);
  }
  Object.freeze(outline.chapters);
  return Object.freeze(outline);
}

/**
 * The cards, unless a card and a distractor have one id, or two cards
 * name one distractor; else refused (libraryIdsRepeat). A copy
 * of the release keeps cards and distractors in one cards document,
 * each at its id, so a repeated id would make two of them one subject.
 */
export function refuseRepeatedIds(url: string, cards: LibraryCard[]): LibraryCard[] {
  const seen = new Set<string>();
  for (const id of cards.flatMap((card) => [
    card.id,
    ...(card.distractors ?? []).map((distractor) => distractor.id),
  ])) {
    if (seen.has(id)) throw new AppError("libraryIdsRepeat", { url, id });
    seen.add(id);
  }
  return cards;
}

type LibraryDeckContentOf = ReturnType<typeof libraryDeckFromRecord>;

/**
 * The deck a fetched release document states: the one at `url`, else
 * the first it holds, at its canonical URL (declared with @base) rather
 * than the URL it was fetched from; undefined when it holds none.
 */
function releaseDeckOf(url: string, dataset: Dataset): Subject | undefined {
  const isDeck = (thing: Subject | null) => thing !== null && hasClass(thing, SM.Deck);
  const at = getThing(dataset, url);
  return isDeck(at) ? at! : getThingAll(dataset).find(isDeck);
}

/**
 * The subjects of a fetched release that may be its cards, chapters,
 * steps and distractors: those of its own document, its deck's
 * (releaseDeckOf; `url` when it has none), each a fragment of it with an
 * id of its own, as the Studio reads a release. A subject anywhere else
 * is none of its parts, whatever it is typed (GHSA-67w8-qjpm-jhwp).
 */
function releaseSubjectsOf(url: string, dataset: Dataset): Subject[] {
  const deck = releaseDeckOf(url, dataset);
  const document = deck === undefined ? url : documentUrlOf(asUrl(deck));
  return getThingAll(dataset).filter((thing) => asUrl(thing).startsWith(`${document}#`));
}

/** The cards of the release at `url` (releaseSubjectsOf), each with its distractors of the release; a card that does not fit its shape is left out. */
export function toLibraryCards(url: string, dataset: Dataset): LibraryCard[] {
  const subjects = releaseSubjectsOf(url, dataset);
  const own = new Set(subjects.map(asUrl));
  return subjects
    .map((thing) => toLibraryCard(url, thing, dataset, own))
    .filter((card): card is LibraryCard => card !== null);
}

function toLibraryCard(
  url: string,
  thing: Subject,
  dataset: Dataset,
  own: ReadonlySet<string>,
): LibraryCard | null {
  if (!hasClass(thing, SM.Card)) return null;
  const formatVersion = storedVersionOf(thing);
  if (formatVersion > LATEST_VERSION.card) {
    throw new AppError("libraryCardTooNew", {
      card: asUrl(thing),
      url,
      version: formatVersion,
      latest: LATEST_VERSION.card,
    });
  }
  const read = readCard(thing);
  if (read === null) return null;
  return libraryCardFromRecord(
    asUrl(thing),
    formatVersion,
    read.data,
    distractorsOf(
      dataset,
      read.data.distractor.filter((distractor) => own.has(distractor)),
    ),
  );
}
