import { subjectsOf, type ReleaseModel, type ReleaseTerm, type ReleaseText } from "./releaseModel.ts";

/**
 * What a library's index says of one deck (docs/deck-library.md): a
 * series of its releases, which are its versions too, stating the
 * current release's title, description, themes and keywords; every
 * older release summarised (its title, description, version, issue time
 * and notes); the current one described in full but for its cards, a
 * course's chapters, steps and distractors, and the record of how it
 * was made, plus the cards it has in use. The node tooling writes it as
 * Turtle (packages/shacl/node/deckLibrary.ts, buildIndex).
 */
export interface SeriesEntry {
  series: string;
  title: ReleaseText[];
  description: ReleaseText[];
  themes: ReleaseTerm[];
  keywords: ReleaseTerm[];
  first: string;
  /** The current release: the last one. */
  last: string;
  versions: string[];
  older: OlderRelease[];
  /** The current release's cards in use, retired ones not counted. */
  cardCount: number;
}

/** A release before the current one, as the index summarises it. */
export interface OlderRelease {
  url: string;
  title: ReleaseText[];
  description: ReleaseText[];
  /** Its first version, issue time and notes, when it states them: none or one each. */
  version: ReleaseText[];
  issued: ReleaseText[];
  versionNotes: ReleaseText[];
}

const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const RDFS_COMMENT = "http://www.w3.org/2000/01/rdf-schema#comment";

/** The entry of a series of releases, sorted by version, the last one current. There is at least one. */
export function seriesEntry(series: string, releases: readonly ReleaseModel[]): SeriesEntry {
  const latest = releases[releases.length - 1];
  return {
    series,
    title: latest.title,
    description: latest.description,
    themes: latest.themes,
    keywords: latest.keywords,
    first: releases[0].url,
    last: latest.url,
    versions: releases.map((release) => release.url),
    older: releases.slice(0, -1).map((release) => ({
      url: release.url,
      title: release.title,
      description: release.description,
      version: release.version.filter((term): term is ReleaseText => term.kind === "literal").slice(0, 1),
      issued: release.issued.slice(0, 1),
      versionNotes: release.versionNotes.slice(0, 1),
    })),
    cardCount: latest.cards.filter((card) => !card.retired).length,
  };
}

/**
 * Whether the index keeps a statement of the current release: not of a
 * card, chapter, step or distractor, no rdfs:comment, and of its
 * activities only the type of the one that generated it, which DCAT-AP
 * asks for (the release itself carries the rest).
 */
export function keptInIndex(model: ReleaseModel): (subject: string, predicate: string) => boolean {
  const left = new Set(
    (["card", "chapter", "step", "distractor"] as const).flatMap((kind) => subjectsOf(model, kind).map((subject) => subject.iri)),
  );
  const activities = new Map(model.activities.map((activity) => [activity.iri, activity.generating]));
  return (subject, predicate) =>
    !left.has(subject) &&
    predicate !== RDFS_COMMENT &&
    (!activities.has(subject) || (activities.get(subject) === true && predicate === RDF_TYPE));
}

/** When the latest of the releases was issued, the index's modification time; undefined when none says. */
export function lastIssued(releases: readonly ReleaseModel[]): string | undefined {
  return releases
    .flatMap((release) => release.issued.slice(0, 1).map((issued) => issued.value))
    .sort()
    .at(-1);
}
