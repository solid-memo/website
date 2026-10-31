// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { growth } from "../testing/growth";
import { courseDraft, deckDraft, DRAFT, link, NOW, of } from "../testing/releaseDraft";
import {
  applyDraftChanges,
  attributionOf,
  authorNames,
  isRefusal,
  type CheckActivity,
  type DraftChange,
  type ReleaseDraft,
} from "./releaseDraft";
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
const plain = (value: string) => ({
  kind: "literal" as const,
  value,
  language: "",
  datatype: "http://www.w3.org/2001/XMLSchema#string",
});

function made(draft: ReleaseDraft, changes: readonly DraftChange[]): ReleaseDraft {
  const result = applyDraftChanges(draft, changes);
  if (isRefusal(result)) throw new Error(`Refused: ${JSON.stringify(result)}`);
  return result;
}

const check: CheckActivity = {
  check: "machine",
  label: "Checks",
  scope: "all",
  outcome: "none",
  endedAt: NOW,
  language: "en",
};

describe("authors", () => {
  it("are added as agents of the draft, under an id of their name, last among the authors", () => {
    const draft = courseDraft();
    expect(agentIdFor(draft, "Åsa Öberg")).toBe("asa-oberg");
    expect(agentIdFor(draft, "ch-a")).toBe("ch-a-3");
    expect(agentIdFor(draft, "!!!")).toBe("author");
    const ann = made(draft, addAuthorChanges(draft, "ann", { name: "Ann" }));
    const both = made(
      ann,
      addAuthorChanges(ann, "bo", { name: "Bo", mbox: "mailto:bo@example.org" }),
    );
    expect(authorsOf(both)).toEqual([
      { id: "ann", data: { name: "Ann" } },
      { id: "bo", data: { name: "Bo", mbox: "mailto:bo@example.org" } },
    ]);
    const foreign = {
      ...both,
      root: { ...both.root, creator: [...both.root.creator, "https://elsewhere.example/#me"] },
    };
    expect(otherAuthorsOf(foreign)).toEqual(["https://elsewhere.example/#me"]);
    expect(made(both, editAuthorChanges(both, "bo", { name: "Bob" })).agents[1]!.data.name).toBe(
      "Bob",
    );
  });

  it("are removed with their agent, unless it publishes the release or a statement names it", () => {
    const draft = made(courseDraft(), [...addAuthorChanges(courseDraft(), "ann", { name: "Ann" })]);
    const removed = made(draft, removeAuthorChanges(draft, "ann"));
    expect(removed.root.creator).toEqual([]);
    expect(removed.agents).toEqual([]);
    const publishing = made(draft, [{ kind: "setMeta", meta: { publisher: of("ann") } }]);
    expect(made(publishing, removeAuthorChanges(publishing, "ann")).agents).toHaveLength(1);
    const named = {
      ...draft,
      triples: [...draft.triples, link(of("compilation"), `${PROV}wasAssociatedWith`, of("ann"))],
    };
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
    expect(addAuthorChanges(one, "ch-a", { name: "Cy" }).at(-1)).toEqual({
      kind: "setAttribution",
      attribution: { ai: true },
    });
  });

  it("are found in time that grows with how many a release names", () => {
    const draft = made(courseDraft(), addAuthorChanges(courseDraft(), "first", { name: "First" }));
    const naming = (count: number): ReleaseDraft => {
      const ids = Array.from({ length: count }, (_, n) => `author-${n}`);
      return made(
        {
          ...draft,
          root: { ...draft.root, creator: [...draft.root.creator, ...ids.map(of)] },
          agents: [...draft.agents, ...ids.map((id) => ({ id, data: { name: id } }))],
        },
        [{ kind: "setAttribution", attribution: { ai: true } }],
      );
    };
    const many = naming(100);
    expect(authorsOf(many)).toHaveLength(101);
    expect(authorsOf(many).at(-1)).toEqual({ id: "author-99", data: { name: "author-99" } });
    expect(otherAuthorsOf(many)).toEqual([]);
    expect(authorNames(many).at(-1)).toBe("author-99");
    expect(editAuthorChanges(many, "first", { name: "One" }).at(-1)).toEqual({
      kind: "setAttribution",
      attribution: { ai: true },
    });
    // Eight times the authors take about as long as an eighth of them
    // eight times over; going over every agent for each author would
    // take eight times as long. Each run indexes its agents afresh.
    const ratio = growth(
      (count) => {
        const named = naming(count);
        return () => {
          const fresh = { ...named, agents: [...named.agents] };
          return [
            authorsOf(fresh),
            otherAuthorsOf(fresh),
            attributionOf(fresh),
            editAuthorChanges(fresh, "first", { name: "One" }),
          ];
        };
      },
      1_000,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });
});

describe("sources", () => {
  it("are those the release is drawn from, then those its making used, then an earlier version's, with what the draft states of each", () => {
    const draft = courseDraft();
    const more = {
      ...draft,
      root: {
        ...draft.root,
        wasDerivedFrom: [...draft.root.wasDerivedFrom, "https://derived.example/"],
      },
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
    expect(sources[0]).toMatchObject({
      title: "Source",
      creator: "",
      license: "",
      evidence: "",
      others: [],
    });
    expect(sources[2]).toMatchObject({
      title: "",
      creator: "Bo",
      license: "https://cc0.example/",
      evidence: "Footer: CC0.",
      others: [{ predicate: COMMENT, object: plain("Used for facts.") }],
    });
  });

  it("change by their form, their other statements kept, an empty text left out", () => {
    const draft = courseDraft();
    const [source] = sourcesOf(draft);
    const others = [{ predicate: COMMENT, object: plain("Kept.") }];
    const change = sourceChange(
      "https://source.example/",
      {
        title: " Source 2 ",
        creator: "Ann",
        license: "https://cc0.example/",
        evidence: "Footer.",
        derivedFrom: true,
        used: false,
      },
      others,
    );
    const changed = made(draft, [change]);
    expect(sourcesOf(changed)[0]).toMatchObject({
      title: "Source 2",
      creator: "Ann",
      license: "https://cc0.example/",
      evidence: "Footer.",
      used: false,
      others,
    });
    const cleared = made(draft, [
      sourceChange(source!.iri, { ...source!, title: "", derivedFrom: true, used: true }),
    ]);
    expect(cleared.triples.filter((triple) => triple.subject === source!.iri)).toEqual([]);
  });

  it("have a license that is an address, or one they state already", () => {
    expect(sourceLicenseValid("")).toBe(true);
    expect(sourceLicenseValid(" https://creativecommons.org/licenses/by/4.0/ ")).toBe(true);
    expect(sourceLicenseValid("CC BY 4.0")).toBe(false);
    expect(sourceLicenseValid("urn:license:own", "urn:license:own")).toBe(true);
    const draft = courseDraft();
    const form = {
      title: "Source",
      creator: "",
      license: " https://cc0.example ",
      evidence: "",
      derivedFrom: true,
      used: true,
    };
    expect(
      sourcesOf(made(draft, [sourceChange("https://source.example/", form)]))[0]!.license,
    ).toBe("https://cc0.example/");
    expect(
      sourcesOf(
        made(draft, [
          sourceChange("https://source.example/", { ...form, license: "urn:license:own" }),
        ]),
      )[0]!.license,
    ).toBe("urn:license:own");
  });

  it("removed, keep what they state while an earlier version's making uses them", () => {
    const V1 = "https://pod.example/solid-memo/main/releases/solid/v1.ttl";
    const next = nextVersionDraft(rebaseDraft(courseDraft(), V1), DRAFT);
    const [source] = sourcesOf(next);
    expect(source).toMatchObject({
      derivedFrom: true,
      used: false,
      usedEarlier: true,
      title: "Source",
    });
    const removed = made(next, [{ kind: "setSource", iri: source!.iri, source: null }]);
    expect(sourcesOf(removed)).toEqual([{ ...source, derivedFrom: false }]);
    expect(
      applyDraftChanges(removed, [{ kind: "setSource", iri: source!.iri, source: null }]),
    ).toEqual({ refused: "missing", id: source!.iri });
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

  it("are gathered in time that grows with how many a release names", () => {
    const draft = courseDraft();
    const naming = (count: number) => {
      const iris = Array.from({ length: count }, (_, n) => `https://many.example/${n}`);
      return {
        ...draft,
        root: { ...draft.root, wasDerivedFrom: [...draft.root.wasDerivedFrom, ...iris] },
        triples: [
          ...draft.triples,
          ...iris.map((iri, n) => ({
            subject: iri,
            predicate: `${DCTERMS}title`,
            object: plain(`Source ${n}`),
          })),
        ],
      };
    };
    const sources = sourcesOf(naming(100));
    expect(sources).toHaveLength(101);
    expect(sources.at(-1)).toMatchObject({
      iri: "https://many.example/99",
      title: "Source 99",
      derivedFrom: true,
    });
    // Eight times the sources take about as long as an eighth of them
    // eight times over; going over every statement for each source would
    // take eight times as long.
    const ratio = growth(
      (count) => {
        const many = naming(count);
        return () => sourcesOf(many);
      },
      1_000,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });

  it("change in time that grows with how many activities an earlier release carries", () => {
    const draft = courseDraft();
    const carrying = (count: number) => {
      const ids = Array.from({ length: count }, (_, n) => `earlier-${n}`);
      return {
        ...draft,
        triples: [
          ...draft.triples,
          ...ids.flatMap((id) => [
            link(of(id), "http://www.w3.org/1999/02/22-rdf-syntax-ns#type", `${PROV}Activity`),
            { subject: of(id), predicate: COMMENT, object: plain(id) },
          ]),
        ],
        published: { ids: {}, activities: ids },
      };
    };
    const form = {
      title: "New",
      creator: "",
      license: "",
      evidence: "",
      derivedFrom: true,
      used: false,
    };
    const change = sourceChange("https://new.example/", form);
    const carried = carrying(100);
    expect(made(carried, [change]).triples).toHaveLength(carried.triples.length + 1);
    // Eight times the activities take about as long as an eighth of them
    // eight times over; going over every statement for each activity would
    // take eight times as long.
    const ratio = growth(
      (count) => {
        const many = carrying(count);
        return () => made(many, [change]);
      },
      1_000,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });
});

describe("checks", () => {
  it("are the activities beside the release's own making: its checks, editable when recorded as a check, then those carried, never edited", () => {
    const V1 = "https://pod.example/solid-memo/main/releases/solid/v1.ttl";
    const release = rebaseDraft(
      made(courseDraft(), [{ kind: "addCheckActivity", id: "review-1", activity: check }]),
      V1,
    );
    const next = made(nextVersionDraft(release, DRAFT), [
      { kind: "addCheckActivity", id: "review-2", activity: check },
    ]);
    const odd = {
      ...next,
      triples: [
        ...next.triples,
        link(of("odd"), "http://www.w3.org/1999/02/22-rdf-syntax-ns#type", `${PROV}Activity`),
      ],
    };
    const views = checksOf(odd);
    expect(views.map((view) => [view.id, view.carried, view.activity !== null])).toEqual([
      ["review-2", false, true],
      ["odd", false, false],
      ["compilation", true, false],
      ["review-1", true, false],
    ]);
    expect(views[0]).toMatchObject({ label: [{ value: "Checks" }], endedAt: NOW, activity: check });
    expect(views[0]!.comments.map((one) => one.value)).toEqual([
      "Scope: all; a machine check, not a human review.",
      "Outcome: none",
    ]);
    expect(views[1]).toMatchObject({ label: [], comments: [], endedAt: "" });
    expect(checksOf(courseDraft())).toEqual([]);
    expect(checkIdFor(deckDraft())).toBe("check-1");
    expect(
      checkIdFor(made(deckDraft(), [{ kind: "addCheckActivity", id: "check-1", activity: check }])),
    ).toBe("check-2");
  });

  it("are read in time that grows with how many activities a release states", () => {
    const draft = courseDraft();
    const stating = (count: number) => {
      const ids = Array.from({ length: count }, (_, n) => `activity-${n}`);
      return {
        ...draft,
        triples: [
          ...draft.triples,
          ...ids.flatMap((id) => [
            link(of(id), "http://www.w3.org/1999/02/22-rdf-syntax-ns#type", `${PROV}Activity`),
            { subject: of(id), predicate: COMMENT, object: plain(id) },
          ]),
        ],
        // Every other one carried from an earlier release.
        published: { ids: {}, activities: ids.filter((_, n) => n % 2 === 1) },
      };
    };
    expect(checksOf(stating(4)).map((view) => [view.id, view.carried])).toEqual([
      ["activity-0", false],
      ["activity-2", false],
      ["activity-1", true],
      ["activity-3", true],
    ]);
    // Eight times the activities take about as long as an eighth of them
    // eight times over; going over every statement for each activity would
    // take eight times as long.
    const ratio = growth(
      (count) => {
        const many = stating(count);
        return () => checksOf(many);
      },
      1_000,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });
});
