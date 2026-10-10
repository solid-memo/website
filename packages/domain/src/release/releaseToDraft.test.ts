import { describe, expect, it } from "vitest";
import { courseDraft, DRAFT, link } from "../testing/releaseDraft.ts";
import { moved, rebaseDraft, releaseToDraft } from "./releaseToDraft.ts";

const RELEASE = "https://pod.example/solid-memo/main/releases/solid/v1.ttl";

/** The course fixture as a release at RELEASE, released and with a series of its own. */
function release() {
  const draft = rebaseDraft(courseDraft({ ids: { x: "card" }, activities: ["y"] }), RELEASE);
  return {
    ...draft,
    root: { ...draft.root, releasedAs: "https://pod.example/never", issued: "2026-10-10T00:00:00Z" },
    triples: [...draft.triples, { subject: "_:b0", predicate: "https://other.example/p", object: { kind: "blank" as const, value: "b1" } }],
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
    expect(draft.steps[0]!.data).toMatchObject({ chapter: `${DRAFT}#ch-a`, checkedBy: [`${DRAFT}#q-a-1a`] });
    expect(draft.cards[0]!.data.distractor).toEqual([`${DRAFT}#q-a-1a-d1`, `${DRAFT}#q-a-1a-d2`]);
    expect(draft.distributions[0]!.data).toMatchObject({ accessUrl: DRAFT, downloadUrl: DRAFT });
    expect(draft.triples[0]).toEqual(link(DRAFT, "http://www.w3.org/ns/prov#wasGeneratedBy", `${DRAFT}#compilation`));
    expect(draft.triples.at(-1)).toEqual({ subject: "_:b0", predicate: "https://other.example/p", object: { kind: "blank", value: "b1" } });
    expect(draft.published).toEqual({ ids: {}, activities: [] });
  });

  it("gives back the release at its own address", () => {
    const { releasedAs: _released, ...root } = release().root;
    expect(releaseToDraft(releaseToDraft(release(), DRAFT), RELEASE)).toEqual({ ...release(), root, published: { ids: {}, activities: [] } });
  });
});
