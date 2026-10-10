import { describe, expect, it } from "vitest";
import { courseDraft, DRAFT, link } from "../testing/releaseDraft.ts";
import { rebaseDraft } from "./releaseToDraft.ts";
import { linkedDescription, nextVersionDraft } from "./releaseVersion.ts";

const V1 = "https://pod.example/solid-memo/main/releases/solid/v1.ttl";
const DCAT = "http://www.w3.org/ns/dcat#";
const DCTERMS = "http://purl.org/dc/terms/";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

/** The course fixture as release 1 at V1: released, with notes, its series `<v1.ttl#series>` described in it. */
function v1() {
  const draft = rebaseDraft(courseDraft(), V1);
  return {
    ...draft,
    root: { ...draft.root, issued: "2026-10-10T00:00:00Z", modified: "2026-10-09T00:00:00Z", versionNotes: "First release.", releasedAs: "x" },
    triples: [
      ...draft.triples,
      link(`${V1}#series`, `${DCAT}hasVersion`, V1),
      link(`${V1}#series`, `${DCAT}first`, V1),
    ],
  };
}

describe("nextVersionDraft", () => {
  it("is the release as version N + 1 after it, its subjects the draft's, nothing released yet", () => {
    const draft = nextVersionDraft(v1(), DRAFT);
    expect(draft.url).toBe(DRAFT);
    expect(draft.root).toMatchObject({ version: "2", prev: V1, previousVersion: V1, created: v1().root.created });
    for (const field of ["issued", "modified", "versionNotes", "releasedAs"]) expect(draft.root).not.toHaveProperty(field);
    expect(draft.cards[0]!.data.distractor).toEqual([`${DRAFT}#q-a-1a-d1`, `${DRAFT}#q-a-1a-d2`]);
    expect(draft.distributions[0]!.data.accessUrl).toBe(DRAFT);
  });

  it("stays in the release's series, whose description keeps naming the releases before as they are", () => {
    const draft = nextVersionDraft(v1(), DRAFT);
    expect(draft.root.inSeries).toBe(`${V1}#series`);
    expect(draft.root.isVersionOf).toBe(`${V1}#series`);
    expect(draft.triples).toContainEqual(link(`${V1}#series`, `${DCAT}hasVersion`, V1));
    expect(draft.triples).toContainEqual(link(`${V1}#series`, `${DCAT}first`, V1));
  });

  it("describes the release before as an earlier version of a series it describes", () => {
    const draft = nextVersionDraft(v1(), DRAFT);
    const of = draft.triples.filter((triple) => triple.subject === V1);
    expect(of.map((triple) => [triple.predicate, triple.object.value])).toEqual([
      ["http://www.w3.org/1999/02/22-rdf-syntax-ns#type", `${DCAT}Dataset`],
      ["http://purl.org/dc/terms/title", "Solid"],
      [`${DCAT}version`, "1"],
    ]);
  });

  it("describes no earlier version of a series described elsewhere, as the library's index describes it", () => {
    const release = { ...v1(), root: { ...v1().root, inSeries: "https://solid-memo.com/decks/index.ttl#solid", isVersionOf: undefined, version: undefined } };
    const draft = nextVersionDraft({ ...release, triples: v1().triples.slice(0, 4) }, DRAFT);
    expect(draft.root.version).toBe("2");
    expect(draft.root.inSeries).toBe("https://solid-memo.com/decks/index.ttl#solid");
    expect(draft.triples.some((triple) => triple.subject === V1)).toBe(false);
  });

  it("describes a series and publisher described elsewhere as their document does, so the release it makes is whole", () => {
    const INDEX = "https://solid-memo.com/decks/index.ttl";
    const release = { ...v1(), root: { ...v1().root, inSeries: `${INDEX}#solid`, isVersionOf: `${INDEX}#solid`, publisher: `${INDEX}#pub` } };
    const library = { ...release, triples: v1().triples.slice(0, 4) };
    const OLD = "https://solid-memo.com/decks/solid/v0.ttl";
    const text = (subject: string, predicate: string, value: string) => ({ subject, predicate, object: { kind: "literal" as const, value, language: "en", datatype: "" } });
    const series = [
      link(`${INDEX}#solid`, RDF_TYPE, `${DCAT}DatasetSeries`),
      link(`${INDEX}#solid`, `${DCTERMS}publisher`, `${INDEX}#lib`),
      link(`${INDEX}#solid`, `${DCAT}hasVersion`, OLD),
      link(`${INDEX}#solid`, `${DCAT}hasVersion`, V1),
    ];
    const agents = [link(`${INDEX}#pub`, RDF_TYPE, "http://xmlns.com/foaf/0.1/Agent"), text(`${INDEX}#lib`, "http://xmlns.com/foaf/0.1/name", "Library")];
    const older = [link(OLD, RDF_TYPE, `${DCAT}Dataset`), text(OLD, `${DCTERMS}title`, "Solid")];
    const elsewhere = [
      link(`${INDEX}#other`, RDF_TYPE, `${DCAT}DatasetSeries`),
      link(OLD, RDF_TYPE, "https://solid-memo.com/ns/vocab/v1.ttl#Deck"),
      link(OLD, `${DCTERMS}creator`, `${INDEX}#someone`),
      link(V1, `${DCTERMS}creator`, `${INDEX}#someone`),
      // Of the series, what an index says of one; of a publisher, its class and name, nothing more a profile says of its person.
      link(`${INDEX}#solid`, "http://www.w3.org/ns/prov#wasAttributedTo", `${INDEX}#someone`),
      link(`${INDEX}#pub`, "http://xmlns.com/foaf/0.1/mbox", "mailto:pub@example.org"),
      link(`${INDEX}#lib`, "http://xmlns.com/foaf/0.1/knows", `${INDEX}#someone`),
    ];
    const index = [...series, ...agents, ...older, ...elsewhere];
    expect(linkedDescription(library, index)).toEqual([...series, ...agents, ...older]);
    const draft = nextVersionDraft(library, DRAFT, index);
    expect(draft.triples).toEqual(expect.arrayContaining([...series, ...agents, ...older, link(V1, RDF_TYPE, `${DCAT}Dataset`)]));
    expect(draft.triples).not.toContainEqual(elsewhere[0]);
    // What the release describes itself is not described again.
    expect(linkedDescription(v1(), index)).toEqual([]);
  });

  it("carries what the release published: its every subject, retired ones too, and its activities", () => {
    const draft = nextVersionDraft(v1(), DRAFT);
    expect(draft.published.ids).toMatchObject({ "ch-a": "chapter", "q-a-1a": "card", "q-a-1a-d1": "distractor", "ch-a-1": "step" });
    expect(draft.published.activities).toEqual(["compilation"]);
  });

  it("describes a release's description in each of its languages", () => {
    const release = { ...v1(), root: { ...v1().root, description: { en: "About", sv: "Om" } } };
    const draft = nextVersionDraft(release, DRAFT);
    expect(draft.triples.filter((triple) => triple.subject === V1 && triple.predicate === "http://purl.org/dc/terms/description").map((triple) => triple.object)).toEqual([
      { kind: "literal", value: "About", language: "en", datatype: "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString" },
      { kind: "literal", value: "Om", language: "sv", datatype: "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString" },
    ]);
  });

  it("names version 1 the release before when it states none", () => {
    const release = { ...v1(), root: { ...v1().root, version: undefined } };
    const draft = nextVersionDraft(release, DRAFT);
    expect(draft.root.version).toBe("2");
    expect(draft.triples.find((triple) => triple.subject === V1 && triple.predicate === `${DCAT}version`)!.object.value).toBe("1");
  });
});
