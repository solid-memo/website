import { describe, expect, it } from "vitest";
import { courseDraft, deckDraft, DRAFT, link, NOW, of } from "../testing/releaseDraft";
import { applyDraftChanges, attributionOf, isRefusal, type CheckActivity, type DraftChange, type ReleaseDraft } from "./releaseDraft";
import {
  addAuthorChanges,
  agentIdFor,
  authorsOf,
  checkIdFor,
  checksOf,
  editAuthorChanges,
  otherAuthorsOf,
  removeAuthorChanges,
  sourceChange,
  sourceIri,
  sourceLicenseValid,
  sourcesOf,
} from "./releaseMetadata";
import { rebaseDraft } from "./releaseToDraft";
import { nextVersionDraft } from "./releaseVersion";

const PROV = "http://www.w3.org/ns/prov#";
const DCTERMS = "http://purl.org/dc/terms/";
const COMMENT = "http://www.w3.org/2000/01/rdf-schema#comment";
const plain = (value: string) => ({ kind: "literal" as const, value, language: "", datatype: "http://www.w3.org/2001/XMLSchema#string" });

function made(draft: ReleaseDraft, changes: readonly DraftChange[]): ReleaseDraft {
  const result = applyDraftChanges(draft, changes);
  if (isRefusal(result)) throw new Error(`Refused: ${JSON.stringify(result)}`);
  return result;
}

const check: CheckActivity = { check: "machine", label: "Checks", scope: "all", outcome: "none", endedAt: NOW, language: "en" };

describe("authors", () => {
  it("are added as agents of the draft, under an id of their name, last among the authors", () => {
    const draft = courseDraft();
    expect(agentIdFor(draft, "Åsa Öberg")).toBe("asa-oberg");
    expect(agentIdFor(draft, "ch-a")).toBe("ch-a-3");
    expect(agentIdFor(draft, "!!!")).toBe("author");
    const ann = made(draft, addAuthorChanges(draft, "ann", { name: "Ann" }));
    const both = made(ann, addAuthorChanges(ann, "bo", { name: "Bo", mbox: "mailto:bo@example.org" }));
    expect(authorsOf(both)).toEqual([
      { id: "ann", data: { name: "Ann" } },
      { id: "bo", data: { name: "Bo", mbox: "mailto:bo@example.org" } },
    ]);
    const foreign = { ...both, root: { ...both.root, creator: [...both.root.creator, "https://elsewhere.example/#me"] } };
    expect(otherAuthorsOf(foreign)).toEqual(["https://elsewhere.example/#me"]);
    expect(made(both, editAuthorChanges(both, "bo", { name: "Bob" })).agents[1]!.data.name).toBe("Bob");
  });

  it("are removed with their agent, unless it publishes the release or a statement names it", () => {
    const draft = made(courseDraft(), [...addAuthorChanges(courseDraft(), "ann", { name: "Ann" })]);
    const removed = made(draft, removeAuthorChanges(draft, "ann"));
    expect(removed.root.creator).toEqual([]);
    expect(removed.agents).toEqual([]);
    const publishing = made(draft, [{ kind: "setMeta", meta: { publisher: of("ann") } }]);
    expect(made(publishing, removeAuthorChanges(publishing, "ann")).agents).toHaveLength(1);
    const named = { ...draft, triples: [...draft.triples, link(of("compilation"), `${PROV}wasAssociatedWith`, of("ann"))] };
    expect(made(named, removeAuthorChanges(named, "ann")).agents).toHaveLength(1);
  });

  it("keep the attribution naming them, and clear it when none is left", () => {
    const ann = made(courseDraft(), addAuthorChanges(courseDraft(), "ann", { name: "Ann" }));
    const attributed = made(ann, [{ kind: "setAttribution", attribution: { ai: true } }]);
    const both = made(attributed, addAuthorChanges(attributed, "bo", { name: "Bo" }));
    expect(attributionOf(both)!.text).toBe("Compiled by Ann and Bo with the help of AI.");
    const renamed = made(both, editAuthorChanges(both, "bo", { name: "Bob" }));
    expect(attributionOf(renamed)!.text).toBe("Compiled by Ann and Bob with the help of AI.");
    const one = made(renamed, removeAuthorChanges(renamed, "bo"));
    expect(attributionOf(one)!.text).toBe("Compiled by Ann with the help of AI.");
    expect(attributionOf(made(one, removeAuthorChanges(one, "ann")))).toBeNull();
    // A change the draft refuses (an id taken) keeps the attribution as it is.
    expect(addAuthorChanges(one, "ch-a", { name: "Cy" }).at(-1)).toEqual({ kind: "setAttribution", attribution: { ai: true } });
  });
});

describe("sources", () => {
  it("are those the release is drawn from, then those its making used, then an earlier version's, with what the draft states of each", () => {
    const draft = courseDraft();
    const more = {
      ...draft,
      root: { ...draft.root, wasDerivedFrom: [...draft.root.wasDerivedFrom, "https://derived.example/"] },
      triples: [
        ...draft.triples,
        link(of("compilation"), `${PROV}used`, "https://used.example/"),
        link(of("old"), `${PROV}used`, "https://old.example/"),
        link("https://used.example/", `${DCTERMS}license`, "https://cc0.example/"),
        { subject: "https://used.example/", predicate: `${DCTERMS}creator`, object: plain("Bo") },
        { subject: "https://used.example/", predicate: COMMENT, object: plain("Footer: CC0.") },
        { subject: "https://used.example/", predicate: COMMENT, object: plain("Used for facts.") },
      ],
      published: { ids: {}, activities: ["old"] },
    };
    const sources = sourcesOf(more);
    expect(sources.map((one) => [one.iri, one.derivedFrom, one.used, one.usedEarlier])).toEqual([
      ["https://source.example/", true, true, false],
      ["https://derived.example/", true, false, false],
      ["https://used.example/", false, true, false],
      ["https://old.example/", false, false, true],
    ]);
    expect(sources[0]).toMatchObject({ title: "Source", creator: "", license: "", evidence: "", others: [] });
    expect(sources[2]).toMatchObject({ title: "", creator: "Bo", license: "https://cc0.example/", evidence: "Footer: CC0.", others: [{ predicate: COMMENT, object: plain("Used for facts.") }] });
  });

  it("change by their form, their other statements kept, an empty text left out", () => {
    const draft = courseDraft();
    const [source] = sourcesOf(draft);
    const others = [{ predicate: COMMENT, object: plain("Kept.") }];
    const change = sourceChange("https://source.example/", { title: " Source 2 ", creator: "Ann", license: "https://cc0.example/", evidence: "Footer.", derivedFrom: true, used: false }, others);
    const changed = made(draft, [change]);
    expect(sourcesOf(changed)[0]).toMatchObject({ title: "Source 2", creator: "Ann", license: "https://cc0.example/", evidence: "Footer.", used: false, others });
    const cleared = made(draft, [sourceChange(source!.iri, { ...source!, title: "", derivedFrom: true, used: true })]);
    expect(cleared.triples.filter((triple) => triple.subject === source!.iri)).toEqual([]);
  });

  it("have a licence that is an address, or one they state already", () => {
    expect(sourceLicenseValid("")).toBe(true);
    expect(sourceLicenseValid(" https://creativecommons.org/licenses/by/4.0/ ")).toBe(true);
    expect(sourceLicenseValid("CC BY 4.0")).toBe(false);
    expect(sourceLicenseValid("urn:licence:own", "urn:licence:own")).toBe(true);
    const draft = courseDraft();
    const form = { title: "Source", creator: "", license: " https://cc0.example ", evidence: "", derivedFrom: true, used: true };
    expect(sourcesOf(made(draft, [sourceChange("https://source.example/", form)]))[0]!.license).toBe("https://cc0.example/");
    expect(sourcesOf(made(draft, [sourceChange("https://source.example/", { ...form, license: "urn:licence:own" })]))[0]!.license).toBe("urn:licence:own");
  });

  it("removed, keep what they state while an earlier version's making uses them", () => {
    const V1 = "https://pod.example/solid-memo/main/releases/solid/v1.ttl";
    const next = nextVersionDraft(rebaseDraft(courseDraft(), V1), DRAFT);
    const [source] = sourcesOf(next);
    expect(source).toMatchObject({ derivedFrom: true, used: false, usedEarlier: true, title: "Source" });
    const removed = made(next, [{ kind: "setSource", iri: source!.iri, source: null }]);
    expect(sourcesOf(removed)).toEqual([{ ...source, derivedFrom: false }]);
    expect(applyDraftChanges(removed, [{ kind: "setSource", iri: source!.iri, source: null }])).toEqual({ refused: "missing", id: source!.iri });
    const own = made(courseDraft(), [{ kind: "setSource", iri: source!.iri, source: null }]);
    expect(sourcesOf(own)).toEqual([]);
    expect(own.triples.filter((triple) => triple.subject === source!.iri)).toEqual([]);
  });

  it("are web addresses", () => {
    expect(sourceIri(" https://example.org/a b ")).toBe("https://example.org/a%20b");
    expect(sourceIri("http://example.org")).toBe("http://example.org/");
    expect(sourceIri("javascript:alert(1)")).toBeNull();
    expect(sourceIri("not a url")).toBeNull();
  });
});

describe("checks", () => {
  it("are the activities beside the release's own making: its checks, editable when recorded as a check, then those carried, never edited", () => {
    const V1 = "https://pod.example/solid-memo/main/releases/solid/v1.ttl";
    const release = rebaseDraft(made(courseDraft(), [{ kind: "addCheckActivity", id: "review-1", activity: check }]), V1);
    const next = made(nextVersionDraft(release, DRAFT), [{ kind: "addCheckActivity", id: "review-2", activity: check }]);
    const odd = { ...next, triples: [...next.triples, link(of("odd"), "http://www.w3.org/1999/02/22-rdf-syntax-ns#type", `${PROV}Activity`)] };
    const views = checksOf(odd);
    expect(views.map((view) => [view.id, view.carried, view.activity !== null])).toEqual([
      ["review-2", false, true],
      ["odd", false, false],
      ["compilation", true, false],
      ["review-1", true, false],
    ]);
    expect(views[0]).toMatchObject({ label: [{ value: "Checks" }], endedAt: NOW, activity: check });
    expect(views[0]!.comments.map((one) => one.value)).toEqual(["Scope: all; a machine check, not a human review.", "Outcome: none"]);
    expect(views[1]).toMatchObject({ label: [], comments: [], endedAt: "" });
    expect(checksOf(courseDraft())).toEqual([]);
    expect(checkIdFor(deckDraft())).toBe("check-1");
    expect(checkIdFor(made(deckDraft(), [{ kind: "addCheckActivity", id: "check-1", activity: check }]))).toBe("check-2");
  });
});
