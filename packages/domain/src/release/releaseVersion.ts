import { SM } from "@solid-memo/vocab/vocab.generated";
import { DCAT_NS, DCTERMS_NS, type ReleaseText } from "./releaseModel.ts";
import { publishedIdsOf, RDF_TYPE, type DraftTriple, type ReleaseDraft } from "./releaseDraft.ts";
import { moved, rebaseDraft } from "./releaseToDraft.ts";

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
 */
export function nextVersionDraft(read: ReleaseDraft, url: string, linked: readonly DraftTriple[] = []): ReleaseDraft {
  const release = { ...read, triples: [...read.triples, ...linkedDescription(read, linked)] };
  const series = new Set([release.root.inSeries, release.root.isVersionOf].filter((iri): iri is string => iri !== undefined));
  const draft = rebaseDraft(release, url, (iri) => (series.has(iri) ? iri : moved(iri, release.url, url)));
  // What the series says stays as it is: the versions it lists are the releases before, as they are.
  const triples = draft.triples.map((triple, at) => (series.has(release.triples[at]!.subject) ? release.triples[at]! : triple));
  const described = release.triples.some((triple) => series.has(triple.subject));
  const { issued: _issued, versionNotes: _notes, modified: _modified, releasedAs: _released, ...root } = draft.root;
  const version = Number(release.root.version ?? "1");
  return {
    ...draft,
    root: { ...root, version: String(version + 1), prev: release.url, previousVersion: release.url },
    triples: described ? [...triples, ...earlierVersion(release)] : triples,
    published: publishedIdsOf(read),
  };
}

/** What an earlier version is described by: its class, title, description and version. */
const EARLIER_VERSION = new Set([RDF_TYPE, `${DCTERMS_NS}title`, `${DCTERMS_NS}description`, `${DCAT_NS}version`]);

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
 * title, description and version.
 */
export function linkedDescription(release: ReleaseDraft, linked: readonly DraftTriple[]): DraftTriple[] {
  const own = new Set(release.triples.map((triple) => triple.subject));
  const series = new Set([release.root.inSeries, release.root.isVersionOf].filter((iri): iri is string => iri !== undefined && !own.has(iri)));
  const of = (subjects: ReadonlySet<string>, predicate: string) =>
    linked.filter((triple) => subjects.has(triple.subject) && triple.predicate === predicate && triple.object.kind === "iri").map((triple) => triple.object.value);
  const agents = new Set([release.root.publisher, ...of(series, `${DCTERMS_NS}publisher`)].filter((iri): iri is string => iri !== undefined && !own.has(iri)));
  const versions = new Set(of(series, `${DCAT_NS}hasVersion`).filter((iri) => iri !== release.url && !own.has(iri)));
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
  const text = (language: string, value: string): ReleaseText => ({ kind: "literal", value, language, datatype: LANG_STRING });
  const texts = (predicate: string, values: Readonly<Record<string, string>> = {}) =>
    Object.entries(values).map(([language, value]): DraftTriple => ({ subject: release.url, predicate, object: text(language, value) }));
  return [
    { subject: release.url, predicate: RDF_TYPE, object: { kind: "iri", value: `${DCAT_NS}Dataset` } },
    ...texts(`${DCTERMS_NS}title`, release.root.title),
    ...texts(`${DCTERMS_NS}description`, release.root.description),
    {
      subject: release.url,
      predicate: `${DCAT_NS}version`,
      object: { kind: "literal", value: release.root.version ?? "1", language: "", datatype: XSD_STRING },
    },
  ];
}
