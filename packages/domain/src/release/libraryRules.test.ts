import { describe, expect, it } from "vitest";
import { iri, model, RELEASE, text } from "../testing/releaseModel";
import { metadataProblems, pathProblems, releasePathOf, versionGapProblems, type ReleasePlace } from "./libraryRules";

const DCAT = "http://www.w3.org/ns/dcat#";
const SERIES = "https://solid-memo.com/decks/index.ttl#solid";
const PUBLISHER = "https://solid-memo.com/decks/index.ttl#solid-memo";
const V0 = "https://solid-memo.com/decks/solid/v0.ttl";

describe("the layout", () => {
  it("reads the deck and version of a release's path", () => {
    expect(releasePathOf("capitals/v12.ttl")).toEqual({ deck: "capitals", version: 12 });
    for (const path of ["README.md", "Bad_Name/v1.ttl", "capitals/v01.ttl", "capitals/nested/v1.ttl", "-x/v1.ttl"]) {
      expect(releasePathOf(path), path).toBeUndefined();
    }
  });

  it("names a path that is no release", () => {
    expect(pathProblems("capitals/v1.ttl")).toEqual([]);
    expect(pathProblems("README.md")).toEqual([{ severity: "error", subject: "README.md", code: "notARelease", params: { path: "README.md" } }]);
  });

  it("names each deck whose versions do not run 1, 2, … without gaps", () => {
    const paths = ["rivers/v2.ttl", "capitals/v3.ttl", "index.ttl", "capitals/v1.ttl", "lakes/v2.ttl", "lakes/v1.ttl"];
    expect(versionGapProblems(paths).map(({ subject, params }) => [subject, params])).toEqual([
      ["rivers", { deck: "rivers", versions: [2] }],
      ["capitals", { deck: "capitals", versions: [1, 3] }],
    ]);
  });
});

describe("metadataProblems", () => {
  const first: ReleasePlace = { version: 1, series: SERIES, publisher: PUBLISHER };
  const fine = model({
    decks: [RELEASE],
    version: [text("1", "")],
    inSeries: [iri(SERIES)],
    isVersionOf: [iri(SERIES)],
    publisher: [iri(PUBLISHER)],
  });

  it("accepts a release whose metadata is what its place says", () => {
    expect(metadataProblems(fine, first)).toEqual([]);
    const second = { ...fine, version: [text("2", "")], prev: [iri(V0)], previousVersion: [iri(V0)] };
    expect(metadataProblems(second, { ...first, version: 2, previous: V0 })).toEqual([]);
  });

  it("names a release that is not one deck, the document itself", () => {
    for (const decks of [[], [`${RELEASE}#other`], [RELEASE, `${RELEASE}#other`]]) {
      expect(metadataProblems({ ...fine, decks }, first)).toEqual([{ severity: "error", subject: RELEASE, code: "notOneDeck", params: { decks } }]);
    }
  });

  it("names a version, series, publisher or previous version other than its place says", () => {
    const wrong = {
      ...fine,
      version: [iri("https://example.com/1")],
      publisher: [iri("https://example.com/someone")],
      isVersionOf: [iri(SERIES), iri(SERIES)],
      previousVersion: [iri(V0)],
    };
    expect(metadataProblems(wrong, first).map(({ code, field, params }) => ({ code, field, params }))).toEqual([
      { code: "versionMismatch", field: `${DCAT}version`, params: { stated: wrong.version, expected: 1 } },
      { code: "linkMismatch", field: `${DCAT}isVersionOf`, params: { stated: wrong.isVersionOf, expected: [SERIES] } },
      { code: "linkMismatch", field: "http://purl.org/dc/terms/publisher", params: { stated: wrong.publisher, expected: [PUBLISHER] } },
      { code: "linkMismatch", field: `${DCAT}previousVersion`, params: { stated: [iri(V0)], expected: [] } },
    ]);
    expect(metadataProblems({ ...fine, version: [text("2", "")] }, first)[0].code).toBe("versionMismatch");
    expect(metadataProblems({ ...fine, version: [text("1", ""), text("1", "en")] }, first)[0].code).toBe("versionMismatch");
  });
});
