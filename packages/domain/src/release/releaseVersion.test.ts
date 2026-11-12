// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { courseDraft, DRAFT, link } from "../testing/releaseDraft.ts";
import { rebaseDraft } from "./releaseToDraft.ts";
import {
  earlierVersionsOf,
  linkedDescription,
  nextVersionDraft,
  withOwnVersions,
} from "./releaseVersion.ts";

const V1 = "https://pod.example/solid-memo/main/releases/solid/v1.ttl";
const DCAT = "http://www.w3.org/ns/dcat#";
const DCTERMS = "http://purl.org/dc/terms/";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

/** The course fixture as release 1 at V1: released, with notes, its series `<v1.ttl#series>` described in it. */
function v1() {
  const draft = rebaseDraft(courseDraft(), V1);
  return {
    ...draft,
    root: {
      ...draft.root,
      issued: "2026-10-10T00:00:00Z",
      modified: "2026-10-09T00:00:00Z",
      versionNotes: "First release.",
      releasedAs: "x",
    },
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
    expect(draft.root).toMatchObject({
      version: "2",
      prev: V1,
      previousVersion: V1,
      created: v1().root.created,
    });
    for (const field of ["issued", "modified", "versionNotes", "releasedAs"])
      expect(draft.root).not.toHaveProperty(field);
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
    const release = {
      ...v1(),
      root: {
        ...v1().root,
        inSeries: "https://solid-memo.com/decks/index.ttl#solid",
        isVersionOf: undefined,
        version: undefined,
      },
    };
    const draft = nextVersionDraft({ ...release, triples: v1().triples.slice(0, 4) }, DRAFT);
    expect(draft.root.version).toBe("2");
    expect(draft.root.inSeries).toBe("https://solid-memo.com/decks/index.ttl#solid");
    expect(draft.triples.some((triple) => triple.subject === V1)).toBe(false);
  });

  it("describes a series and publisher described elsewhere as their document does, so the release it makes is whole", () => {
    const INDEX = "https://solid-memo.com/decks/index.ttl";
    const release = {
      ...v1(),
      root: {
        ...v1().root,
        inSeries: `${INDEX}#solid`,
        isVersionOf: `${INDEX}#solid`,
        publisher: `${INDEX}#pub`,
      },
    };
    // Released in the library, beside the version before it.
    const LIB = "https://solid-memo.com/decks/solid/v2.ttl";
    const library = rebaseDraft({ ...release, triples: v1().triples.slice(0, 4) }, LIB);
    const OLD = "https://solid-memo.com/decks/solid/v1.ttl";
    const text = (subject: string, predicate: string, value: string) => ({
      subject,
      predicate,
      object: { kind: "literal" as const, value, language: "en", datatype: "" },
    });
    const series = [
      link(`${INDEX}#solid`, RDF_TYPE, `${DCAT}DatasetSeries`),
      link(`${INDEX}#solid`, `${DCTERMS}publisher`, `${INDEX}#lib`),
      link(`${INDEX}#solid`, `${DCAT}hasVersion`, OLD),
      link(`${INDEX}#solid`, `${DCAT}hasVersion`, LIB),
    ];
    const agents = [
      link(`${INDEX}#pub`, RDF_TYPE, "http://xmlns.com/foaf/0.1/Agent"),
      text(`${INDEX}#lib`, "http://xmlns.com/foaf/0.1/name", "Library"),
    ];
    const older = [link(OLD, RDF_TYPE, `${DCAT}Dataset`), text(OLD, `${DCTERMS}title`, "Solid")];
    const elsewhere = [
      link(`${INDEX}#other`, RDF_TYPE, `${DCAT}DatasetSeries`),
      link(OLD, RDF_TYPE, "https://solid-memo.com/ns/vocab/v1.ttl#Deck"),
      link(OLD, `${DCTERMS}creator`, `${INDEX}#someone`),
      link(LIB, `${DCTERMS}creator`, `${INDEX}#someone`),
      // Of the series, what an index says of one; of a publisher, its class and name, nothing more a profile says of its person.
      link(`${INDEX}#solid`, "http://www.w3.org/ns/prov#wasAttributedTo", `${INDEX}#someone`),
      link(`${INDEX}#pub`, "http://xmlns.com/foaf/0.1/mbox", "mailto:pub@example.org"),
      link(`${INDEX}#lib`, "http://xmlns.com/foaf/0.1/knows", `${INDEX}#someone`),
    ];
    const index = [...series, ...agents, ...older, ...elsewhere];
    expect(linkedDescription(library, index)).toEqual([...series, ...agents, ...older]);
    const draft = nextVersionDraft(library, DRAFT, index);
    expect(draft.triples).toEqual(
      expect.arrayContaining([
        ...series,
        ...agents,
        ...older,
        link(LIB, RDF_TYPE, `${DCAT}Dataset`),
      ]),
    );
    expect(draft.triples).not.toContainEqual(elsewhere[0]);
    // What the release describes itself is not described again.
    expect(linkedDescription(v1(), index)).toEqual([]);
  });

  it("carries what the release published: its every subject, retired ones too, and its activities", () => {
    const draft = nextVersionDraft(v1(), DRAFT);
    expect(draft.published.ids).toMatchObject({
      "ch-a": "chapter",
      "q-a-1a": "card",
      "q-a-1a-d1": "distractor",
      "ch-a-1": "step",
    });
    expect(draft.published.activities).toEqual(["compilation"]);
  });

  it("describes a release's description in each of its languages", () => {
    const release = { ...v1(), root: { ...v1().root, description: { en: "About", sv: "Om" } } };
    const draft = nextVersionDraft(release, DRAFT);
    expect(
      draft.triples
        .filter(
          (triple) =>
            triple.subject === V1 && triple.predicate === "http://purl.org/dc/terms/description",
        )
        .map((triple) => triple.object),
    ).toEqual([
      {
        kind: "literal",
        value: "About",
        language: "en",
        datatype: "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString",
      },
      {
        kind: "literal",
        value: "Om",
        language: "sv",
        datatype: "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString",
      },
    ]);
  });

  it("names version 1 the release before when it states none", () => {
    const release = { ...v1(), root: { ...v1().root, version: undefined } };
    const draft = nextVersionDraft(release, DRAFT);
    expect(draft.root.version).toBe("2");
    expect(
      draft.triples.find(
        (triple) => triple.subject === V1 && triple.predicate === `${DCAT}version`,
      )!.object.value,
    ).toBe("1");
  });
});

describe("withOwnVersions", () => {
  const at = (version: number) => V1.replace("v1.ttl", `v${version}.ttl`);
  const V3 = at(3);
  const SERIES = `${V3}#series`;
  const ELSEWHERE = "https://elsewhere.example/x/v2.ttl";
  const notes = (subject: string) => ({
    subject,
    predicate: "http://www.w3.org/ns/adms#versionNotes",
    object: { kind: "literal" as const, value: "Notes", language: "", datatype: "" },
  });
  const version = (subject: string, value: string) => ({
    subject,
    predicate: `${DCAT}version`,
    object: { kind: "literal" as const, value, language: "", datatype: "" },
  });
  /** Release 3 at V3, after version 2, its series listing versions 1 to 3, and what `more` adds. */
  const v3 = (more: ReturnType<typeof v1>["triples"] = []) => {
    const release = rebaseDraft(courseDraft(), V3);
    return {
      ...release,
      root: { ...release.root, version: "3", prev: at(2), previousVersion: at(2) },
      triples: [
        ...release.triples,
        link(SERIES, `${DCAT}first`, at(1)),
        link(SERIES, `${DCAT}hasVersion`, at(1)),
        link(SERIES, `${DCAT}hasVersion`, at(2)),
        link(SERIES, `${DCAT}hasVersion`, V3),
        notes(at(1)),
        ...more,
      ],
    };
  };

  it("keeps the release's own versions: itself, the one it follows and the earlier ones beside it", () => {
    const own = v3();
    expect(withOwnVersions(own)).toBe(own);
    const away = { ...v3(), root: { ...v3().root, prev: ELSEWHERE, previousVersion: undefined } };
    const followed = {
      ...away,
      triples: [...away.triples, link(SERIES, `${DCAT}hasVersion`, ELSEWHERE)],
    };
    expect(withOwnVersions(followed)).toBe(followed);
  });

  it("keeps the earlier versions beside the one it follows, when it is in another folder", () => {
    const moved = rebaseDraft(v3(), "https://pod.example/elsewhere/solid/v3.ttl");
    expect(withOwnVersions(moved)).toBe(moved);
    const alone = {
      ...moved,
      root: { ...moved.root, prev: undefined, previousVersion: undefined },
    };
    expect(
      withOwnVersions(alone)
        .triples.filter((triple) => triple.predicate === `${DCAT}hasVersion`)
        .map((triple) => triple.object.value),
    ).toEqual([moved.url]);
  });

  it("lists no other version in its series (GHSA-jp29-vf56-5g4g)", () => {
    const planted = [
      link(SERIES, `${DCAT}hasVersion`, ELSEWHERE),
      link(SERIES, `${DCAT}hasVersion`, at(4)),
      link(SERIES, `${DCAT}hasVersion`, V1.replace("v1.ttl", "v0.ttl")),
      link(SERIES, `${DCAT}first`, ELSEWHERE),
      {
        subject: SERIES,
        predicate: `${DCAT}last`,
        object: { kind: "blank" as const, value: "b0" },
      },
      notes(ELSEWHERE),
    ];
    // What only a dropped link led to is the application's to drop (ownStatements).
    expect(withOwnVersions(v3(planted)).triples).toEqual([...v3().triples, notes(ELSEWHERE)]);
    const next = nextVersionDraft(v3(planted), DRAFT);
    expect(next.triples.filter((triple) => triple.object.value === ELSEWHERE)).toEqual([]);
    expect(next.triples.filter((triple) => triple.object.value === at(4))).toEqual([]);
  });

  it("says what a next version states of each earlier version, the release among them (GHSA-8frq-fhj8-9226)", () => {
    const blank = {
      subject: at(1),
      predicate: "https://p.example/more",
      object: { kind: "blank" as const, value: "b1" },
    };
    const release = v3([
      link(SERIES, `${DCAT}hasVersion`, ELSEWHERE),
      blank,
      version(at(1), "1"),
      version(at(2), "2"),
    ]);
    const earlier = earlierVersionsOf(release, at(4));
    expect([...earlier.keys()].sort()).toEqual([at(1), at(2), V3]);
    expect(earlier.get(at(1))).toEqual([notes(at(1)), version(at(1), "1")]);
    expect(earlier.get(at(2))).toEqual([version(at(2), "2")]);
    expect(earlier.get(V3)).toContainEqual(link(V3, RDF_TYPE, `${DCAT}Dataset`));
    expect(earlier.get(V3)).toContainEqual(
      expect.objectContaining({ subject: V3, predicate: `${DCAT}version` }),
    );
    // Its series described nowhere, the release is the one earlier version, described by no one.
    const alone = {
      ...release,
      root: { ...release.root, inSeries: undefined, isVersionOf: undefined },
    };
    expect([...earlierVersionsOf(alone, at(4))]).toEqual([[V3, []]]);
  });

  it("says nothing of a version it lists that it states to be none lower than its own (GHSA-8frq-fhj8-9226)", () => {
    // A release a draft may name as the one it follows, in place of the one it was made from.
    const release = v3([
      link(SERIES, `${DCAT}hasVersion`, at(5)),
      version(at(5), "5"),
      version(at(1), "1"),
      version(at(1), "2"),
      version(at(2), "4"),
    ]);
    expect([...earlierVersionsOf(release, at(4)).keys()]).toEqual([V3]);
    const fixed = v3([version(at(1), "1"), version(at(2), "2")]);
    expect([...earlierVersionsOf(fixed, at(4)).keys()].sort()).toEqual([at(1), at(2), V3]);
    const unnumbered = { ...fixed, root: { ...fixed.root, version: undefined } };
    expect([...earlierVersionsOf(unnumbered, at(4)).keys()]).toEqual([V3]);
    const unread = { ...fixed, root: { ...fixed.root, version: "three" } };
    expect([...earlierVersionsOf(unread, at(4)).keys()]).toEqual([V3]);
  });

  it("describes no version a series described elsewhere lists that isn't the release's own", () => {
    const INDEX = "https://index.example/decks/index.ttl";
    const release = {
      ...v3(),
      root: { ...v3().root, inSeries: `${INDEX}#s`, isVersionOf: undefined },
    };
    const index = [
      link(`${INDEX}#s`, `${DCAT}hasVersion`, at(1)),
      link(`${INDEX}#s`, `${DCAT}hasVersion`, ELSEWHERE),
      link(at(1), RDF_TYPE, `${DCAT}Dataset`),
      link(ELSEWHERE, RDF_TYPE, `${DCAT}Dataset`),
    ];
    // Version 1 the release describes itself; the other is described by no one.
    expect(linkedDescription(release, index)).toEqual(index.slice(0, 2));
    const next = nextVersionDraft(release, DRAFT, index);
    expect(next.triples).toContainEqual(index[0]);
    expect(next.triples).not.toContainEqual(index[1]);
    expect(next.triples).not.toContainEqual(index[3]);
  });
});
