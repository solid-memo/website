// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { SM } from "@solid-memo/vocab/vocab.generated";
import { DCAT_NS, DCTERMS_NS, type ReleaseText } from "./releaseModel.ts";
import { publishedIdsOf, RDF_TYPE, type DraftTriple, type ReleaseDraft } from "./releaseDraft.ts";
import { isEarlierVersionBeside } from "./releasePlace.ts";
import { moved, rebaseDraft, VERSION_LINKS, withVersionsOnly } from "./releaseToDraft.ts";

const LANG_STRING = "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString";
const XSD_STRING = "http://www.w3.org/2001/XMLSchema#string";

/**
 * The draft of the version after a release (docs/deck-library.md,
 * Publishing a new version), at `url`: the release whole, its subjects
 * moved to the draft's address as an import moves them (releaseToDraft),
 * as version N + 1, its previous version (`dcat:prev`,
 * `dcat:previousVersion`) the release, with no release time or version
 * notes yet. It stays in the release's series, which keeps its IRI:
 * every version names it the same. A series the release describes itself
 * (a release published in a pod) goes on being described, with the
 * release as one of its earlier versions. So does a series described
 * elsewhere (a library's index, `linked` the statements of the documents
 * it and the publisher are in): the next version describes it, and its
 * publisher, as they are described there (linkedDescription), so the
 * release it makes is whole on its own.
 *
 * What the release published is carried (`published`): its every card,
 * chapter, step and distractor, which the draft may retire but never
 * drop or give to another, and how it was made, its activities, which
 * the draft keeps as they are.
 *
 * Its series lists only the release's own versions (withOwnVersions).
 */
export function nextVersionDraft(
  read: ReleaseDraft,
  url: string,
  linked: readonly DraftTriple[] = [],
): ReleaseDraft {
  const release = withOwnVersions({
    ...read,
    triples: [...read.triples, ...linkedDescription(read, linked)],
  });
  const series = new Set(
    [release.root.inSeries, release.root.isVersionOf].filter(
      (iri): iri is string => iri !== undefined,
    ),
  );
  const draft = rebaseDraft(release, url, (iri) =>
    series.has(iri) ? iri : moved(iri, release.url, url),
  );
  // What the series says stays as it is: the versions it lists are the releases before, as they are.
  const triples = draft.triples.map((triple, at) =>
    series.has(release.triples[at]!.subject) ? release.triples[at]! : triple,
  );
  const described = release.triples.some((triple) => series.has(triple.subject));
  const {
    issued: _issued,
    versionNotes: _notes,
    modified: _modified,
    releasedAs: _released,
    ...root
  } = draft.root;
  const version = Number(release.root.version ?? "1");
  return {
    ...draft,
    root: {
      ...root,
      version: String(version + 1),
      prev: release.url,
      previousVersion: release.url,
    },
    triples: described ? [...triples, ...earlierVersion(release)] : triples,
    published: publishedIdsOf(read),
  };
}

/**
 * The release with only its own versions in its series: a link of the
 * series to a version (withVersionsOnly) names the release, the version
 * it follows (`dcat:prev`, `dcat:previousVersion`) or an earlier version
 * in its folder or that version's (ownVersionOf). A release made from a
 * file could otherwise list other addresses, with notes of its choosing,
 * as its series' versions, which learners read as the creator's, and
 * carry them into every next version (GHSA-jp29-vf56-5g4g). So could a
 * draft another app writes to, published (assemble, in the repository,
 * holds it to the same rule: GHSA-8frq-fhj8-9226). What it states of
 * where its draft is published is the application's to drop
 * (inItsPlace).
 */
export function withOwnVersions(release: ReleaseDraft): ReleaseDraft {
  return withVersionsOnly(release, ownVersionOf(release));
}

/**
 * Whether an address is one of the own versions of the release at
 * `url`, as withOwnVersions says: the release, the version it follows
 * (`dcat:prev`, `dcat:previousVersion`), or an earlier version in the
 * folder of either, as a next version published in another folder
 * still lists the versions before it. It takes the version followed as
 * the release states it, as only a release is read here: a published
 * one, or one read to be the next version's (nextVersionDraft). A pod
 * draft's is one the release check holds to be the instance's or the
 * library's, and the version before (previousElsewhere, previousUnread,
 * versionNotNext): a release published from it lists only what that one
 * does of versions lower than its own (earlierVersionsOf).
 */
function ownVersionOf({ url, root }: ReleaseDraft): (iri: string) => boolean {
  const followed = [root.prev, root.previousVersion].filter(
    (iri): iri is string => iri !== undefined,
  );
  return (iri) =>
    iri === url ||
    followed.includes(iri) ||
    [url, ...followed].some((version) => isEarlierVersionBeside(version, iri));
}

/**
 * What the next version of `release`, at `url`, states of each version
 * of its series before it (nextVersionDraft), by version: of the release
 * itself, and of each earlier one its series lists that is its own
 * (withOwnVersions) and that it states to be one version, lower than its
 * own (`dcat:version`), with what the release, or the documents it links
 * to (`linked`), say of it; a blank node it names is left out. A draft's
 * documents are anyone's to write and no editor shows what they state of
 * the earlier versions: a release published from one states what the
 * release it follows says of them, and nothing else (GHSA-8frq-fhj8-9226).
 * The release followed may be one the draft names in place of the one it
 * was made from: what it lists is then no later version than itself.
 */
export function earlierVersionsOf(
  release: ReleaseDraft,
  url: string,
  linked: readonly DraftTriple[] = [],
): Map<string, DraftTriple[]> {
  const next = nextVersionDraft(release, url, linked);
  const series = new Set([next.root.inSeries, next.root.isVersionOf]);
  const versions = new Map<string, DraftTriple[]>([[release.url, []]]);
  // A link to anything but an own version is gone already (withOwnVersions).
  for (const { subject, predicate, object } of next.triples)
    if (series.has(subject) && VERSION_LINKS.has(predicate)) versions.set(object.value, []);
  versions.delete(url);
  for (const triple of next.triples)
    if (triple.object.kind !== "blank") versions.get(triple.subject)?.push(triple);
  // Only a version stated once, as a number lower than the release's: no later version than the one followed.
  const own = Number(release.root.version ?? "1");
  for (const [version, triples] of versions) {
    const [stated, ...more] = triples.filter(({ predicate }) => predicate === `${DCAT_NS}version`);
    const number =
      more.length === 0 &&
      stated?.object.kind === "literal" &&
      /^[1-9][0-9]*$/.test(stated.object.value)
        ? Number(stated.object.value)
        : undefined;
    if (version !== release.url && !(number !== undefined && number < own))
      versions.delete(version);
  }
  return versions;
}

/** What an earlier version is described by: its class, title, description and version. */
const EARLIER_VERSION = new Set([
  RDF_TYPE,
  `${DCTERMS_NS}title`,
  `${DCTERMS_NS}description`,
  `${DCAT_NS}version`,
]);

/** What a series is described by: what a library's index says of one (LibraryDeckSeriesV3), and what withSeries writes. */
const SERIES = new Set([
  RDF_TYPE,
  SM.formatVersion,
  `${DCTERMS_NS}title`,
  `${DCTERMS_NS}description`,
  `${DCTERMS_NS}publisher`,
  `${DCAT_NS}theme`,
  `${DCAT_NS}keyword`,
  `${DCAT_NS}first`,
  `${DCAT_NS}last`,
  `${DCAT_NS}hasVersion`,
  `${DCAT_NS}hasCurrentVersion`,
]);

/** What a publisher is described by: its class and name, what DCAT-AP asks of an agent. */
const AGENT = new Set([RDF_TYPE, "http://xmlns.com/foaf/0.1/name"]);

/**
 * What the documents a release links to (`linked`: a library's index)
 * say of its series and publisher, when the release does not describe
 * them itself (docs/deck-library.md, A release outside the library), as
 * far as a release needs: the series by what an index says of one
 * (SERIES); each publisher, the release's and the series', by its class
 * and name, nothing more of what a profile may say of its person; each
 * version the series lists but the release, as a dcat:Dataset with its
 * title, description and version, when it is one of the release's own
 * (withOwnVersions).
 */
export function linkedDescription(
  release: ReleaseDraft,
  linked: readonly DraftTriple[],
): DraftTriple[] {
  const own = new Set(release.triples.map((triple) => triple.subject));
  const series = new Set(
    [release.root.inSeries, release.root.isVersionOf].filter(
      (iri): iri is string => iri !== undefined && !own.has(iri),
    ),
  );
  const of = (subjects: ReadonlySet<string>, predicate: string) =>
    linked
      .filter(
        (triple) =>
          subjects.has(triple.subject) &&
          triple.predicate === predicate &&
          triple.object.kind === "iri",
      )
      .map((triple) => triple.object.value);
  const agents = new Set(
    [release.root.publisher, ...of(series, `${DCTERMS_NS}publisher`)].filter(
      (iri): iri is string => iri !== undefined && !own.has(iri),
    ),
  );
  const ownVersion = ownVersionOf(release);
  const versions = new Set(
    of(series, `${DCAT_NS}hasVersion`).filter(
      (iri) => iri !== release.url && !own.has(iri) && ownVersion(iri),
    ),
  );
  return linked.filter(
    (triple) =>
      (series.has(triple.subject) && SERIES.has(triple.predicate)) ||
      (agents.has(triple.subject) && AGENT.has(triple.predicate)) ||
      (versions.has(triple.subject) &&
        EARLIER_VERSION.has(triple.predicate) &&
        (triple.predicate !== RDF_TYPE || triple.object.value === `${DCAT_NS}Dataset`)),
  );
}

/** The statements that describe a release as an earlier version of its series: a dcat:Dataset with its title, description and version. */
function earlierVersion(release: ReleaseDraft): DraftTriple[] {
  const text = (language: string, value: string): ReleaseText => ({
    kind: "literal",
    value,
    language,
    datatype: LANG_STRING,
  });
  const texts = (predicate: string, values: Readonly<Record<string, string>> = {}) =>
    Object.entries(values).map(
      ([language, value]): DraftTriple => ({
        subject: release.url,
        predicate,
        object: text(language, value),
      }),
    );
  return [
    {
      subject: release.url,
      predicate: RDF_TYPE,
      object: { kind: "iri", value: `${DCAT_NS}Dataset` },
    },
    ...texts(`${DCTERMS_NS}title`, release.root.title),
    ...texts(`${DCTERMS_NS}description`, release.root.description),
    {
      subject: release.url,
      predicate: `${DCAT_NS}version`,
      object: {
        kind: "literal",
        value: release.root.version ?? "1",
        language: "",
        datatype: XSD_STRING,
      },
    },
  ];
}
