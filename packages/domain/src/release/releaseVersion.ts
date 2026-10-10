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
 * release as one of its earlier versions.
 *
 * What the release published is carried (`published`): its every card,
 * chapter, step and distractor, which the draft may retire but never
 * drop or give to another, and how it was made, its activities, which
 * the draft keeps as they are.
 */
export function nextVersionDraft(release: ReleaseDraft, url: string): ReleaseDraft {
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
    published: publishedIdsOf(release),
  };
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
