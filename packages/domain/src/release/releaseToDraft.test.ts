// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { courseDraft, DRAFT, link } from "../testing/releaseDraft.ts";
import { moved, rebaseDraft, releaseToDraft, withOwnSeries } from "./releaseToDraft.ts";

const RELEASE = "https://pod.example/solid-memo/main/releases/solid/v1.ttl";

/** The course fixture as a release at RELEASE, released and with a series of its own. */
function release() {
  const draft = rebaseDraft(courseDraft({ ids: { x: "card" }, activities: ["y"] }), RELEASE);
  return {
    ...draft,
    root: {
      ...draft.root,
      releasedAs: "https://pod.example/never",
      issued: "2026-10-10T00:00:00Z",
    },
    triples: [
      ...draft.triples,
      {
        subject: "_:b0",
        predicate: "https://other.example/p",
        object: { kind: "blank" as const, value: "b1" },
      },
    ],
  };
}

describe("moved", () => {
  it("moves the release and its fragments, nothing else", () => {
    expect(moved(RELEASE, RELEASE, DRAFT)).toBe(DRAFT);
    expect(moved(`${RELEASE}#q`, RELEASE, DRAFT)).toBe(`${DRAFT}#q`);
    expect(moved(`${RELEASE}x#q`, RELEASE, DRAFT)).toBe(`${RELEASE}x#q`);
  });
});

describe("releaseToDraft", () => {
  it("moves every subject of the release to the draft, in records and statements alike, keeping everything else", () => {
    const draft = releaseToDraft(release(), DRAFT);
    expect(draft.url).toBe(DRAFT);
    expect(draft.root.inSeries).toBe(`${DRAFT}#series`);
    expect(draft.root.issued).toBe("2026-10-10T00:00:00Z");
    expect(draft.root.releasedAs).toBeUndefined();
    expect(draft.root.wasDerivedFrom).toEqual(["https://source.example/"]);
    expect(draft.chapters[0]!.data.course).toBe(DRAFT);
    expect(draft.steps[0]!.data).toMatchObject({
      chapter: `${DRAFT}#ch-a`,
      checkedBy: [`${DRAFT}#q-a-1a`],
    });
    expect(draft.cards[0]!.data.distractor).toEqual([`${DRAFT}#q-a-1a-d1`, `${DRAFT}#q-a-1a-d2`]);
    expect(draft.distributions[0]!.data).toMatchObject({ accessUrl: DRAFT, downloadUrl: DRAFT });
    expect(draft.triples[0]).toEqual(
      link(DRAFT, "http://www.w3.org/ns/prov#wasGeneratedBy", `${DRAFT}#compilation`),
    );
    expect(draft.triples.at(-1)).toEqual({
      subject: "_:b0",
      predicate: "https://other.example/p",
      object: { kind: "blank", value: "b1" },
    });
    expect(draft.published).toEqual({ ids: {}, activities: [] });
  });

  it("gives back the release at its own address", () => {
    const { releasedAs: _released, ...root } = release().root;
    expect(releaseToDraft(releaseToDraft(release(), DRAFT), RELEASE)).toEqual({
      ...release(),
      root,
      published: { ids: {}, activities: [] },
    });
  });
});

describe("withOwnSeries", () => {
  const OTHER = "https://creator.example/memo/releases/capitals/v1.ttl";
  const SERIES = `${OTHER}#series`;
  const DCAT = "http://www.w3.org/ns/dcat#";
  /** The release in `inSeries` and `isVersionOf`, and stating of SERIES what an index says of one. */
  const inSeries = (
    root: { inSeries?: string; isVersionOf?: string },
    more: ReturnType<typeof release>["triples"] = [],
  ) => {
    const { inSeries: _series, isVersionOf: _version, ...rest } = release().root;
    return {
      ...release(),
      root: { ...rest, ...root },
      triples: [
        ...release().triples,
        link(SERIES, "http://www.w3.org/1999/02/22-rdf-syntax-ns#type", `${DCAT}DatasetSeries`),
        link(SERIES, `${DCAT}last`, RELEASE),
        ...more,
      ],
    };
  };

  it("keeps a series that is one of the release's own subjects", () => {
    const own = release();
    expect(withOwnSeries(own)).toBe(own);
    const none = inSeries({});
    expect(withOwnSeries(none)).toBe(none);
  });

  it("gives a release in another's series one of its own, dropping what it states of that one (GHSA-38m7-8r5j-q79f)", () => {
    const foreign = withOwnSeries(inSeries({ inSeries: SERIES, isVersionOf: SERIES }));
    expect(foreign.root.inSeries).toBe(`${RELEASE}#series`);
    expect(foreign.root.isVersionOf).toBe(`${RELEASE}#series`);
    expect(foreign.triples).toEqual(release().triples);
    expect(releaseToDraft(foreign, DRAFT).root.inSeries).toBe(`${DRAFT}#series`);
  });

  it("names its own series `#series-2`, … when a subject of it has that id", () => {
    const taken = inSeries({ inSeries: SERIES }, [
      link(`${RELEASE}#series`, "https://other.example/p", RELEASE),
    ]);
    expect(withOwnSeries(taken).root.inSeries).toBe(`${RELEASE}#series-2`);
    expect(withOwnSeries(taken).root.isVersionOf).toBeUndefined();
  });

  it("makes a release a version of its own series, not another's", () => {
    const own = `${RELEASE}#series`;
    expect(withOwnSeries(inSeries({ inSeries: own, isVersionOf: SERIES })).root).toMatchObject({
      inSeries: own,
      isVersionOf: own,
    });
    const versionOnly = withOwnSeries(inSeries({ isVersionOf: SERIES })).root;
    expect(versionOnly.inSeries).toBeUndefined();
    expect(versionOnly.isVersionOf).toBeUndefined();
  });

  it("gives the release's own series no version but the release (GHSA-jp29-vf56-5g4g)", () => {
    const own = `${RELEASE}#series`;
    const PLANTED = "https://attacker.example/x/v2.ttl";
    const kept = link(own, `${DCAT}hasVersion`, RELEASE);
    const planted = [
      link(own, `${DCAT}hasVersion`, PLANTED),
      link(own, `${DCAT}first`, PLANTED),
      { subject: own, predicate: `${DCAT}last`, object: { kind: "blank" as const, value: "b9" } },
    ];
    const versions = withOwnSeries(
      inSeries({ inSeries: own, isVersionOf: own }, [kept, ...planted]),
    );
    expect(versions.triples).toContainEqual(kept);
    for (const triple of planted) expect(versions.triples).not.toContainEqual(triple);
    // A series the file describes keeps a first version: the release, as one the file names would be.
    expect(versions.triples).toContainEqual(link(own, `${DCAT}first`, RELEASE));
    const named = inSeries({ inSeries: own }, [link(own, `${DCAT}first`, RELEASE)]);
    expect(withOwnSeries(named)).toBe(named);
    // A series elsewhere gives way to the release's own, which lists nothing of the file's either.
    const foreign = withOwnSeries(
      inSeries({ inSeries: SERIES, isVersionOf: own }, [link(own, `${DCAT}hasVersion`, PLANTED)]),
    );
    expect(foreign.triples).toEqual(release().triples);
  });

  it("makes the release follow no version, nor its series list that one (GHSA-jp29-vf56-5g4g)", () => {
    const own = `${RELEASE}#series`;
    const BEFORE = "https://pod.example/solid-memo/main/releases/solid/v0.ttl";
    const listed = link(own, `${DCAT}hasVersion`, BEFORE);
    const { root, triples } = withOwnSeries({
      ...inSeries({ inSeries: own }, [listed]),
      root: { ...inSeries({ inSeries: own }).root, prev: BEFORE, previousVersion: BEFORE },
    });
    expect(root.prev).toBeUndefined();
    expect(root.previousVersion).toBeUndefined();
    expect(root.inSeries).toBe(own);
    expect(triples).not.toContainEqual(listed);
  });

  it("keeps what a release named as its own series states of itself", () => {
    const kept = link(RELEASE, "https://other.example/keep", RELEASE);
    const itself = withOwnSeries(inSeries({ inSeries: RELEASE }, [kept]));
    expect(itself.root.inSeries).toBe(`${RELEASE}#series`);
    expect(itself.triples).toContainEqual(kept);
  });
});
