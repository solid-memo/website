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

  it("keeps what a release named as its own series states of itself", () => {
    const kept = link(RELEASE, "https://other.example/keep", RELEASE);
    const itself = withOwnSeries(inSeries({ inSeries: RELEASE }, [kept]));
    expect(itself.root.inSeries).toBe(`${RELEASE}#series`);
    expect(itself.triples).toContainEqual(kept);
  });
});
