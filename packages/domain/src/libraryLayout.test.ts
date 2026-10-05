import { describe, expect, it } from "vitest";
import {
  libraryPublisherUrlOf,
  librarySeriesUrlOf,
  releaseUrlOfLegacySource,
} from "./libraryLayout";

const DECKS = "https://pod.solid-memo.com/library/decks/";

describe("releaseUrlOfLegacySource", () => {
  it("maps a deck document from before releases to its first release", () => {
    expect(releaseUrlOfLegacySource(`${DECKS}capitals.ttl`)).toBe(`${DECKS}capitals/v1`);
    expect(releaseUrlOfLegacySource(`${DECKS}capitals`)).toBe(`${DECKS}capitals/v1`);
  });

  it("leaves a release, the index and any other URL as they are", () => {
    expect(releaseUrlOfLegacySource(`${DECKS}capitals/v2`)).toBe(`${DECKS}capitals/v2`);
    expect(releaseUrlOfLegacySource(`${DECKS}capitals/2.ttl`)).toBe(`${DECKS}capitals/2.ttl`);
    expect(releaseUrlOfLegacySource(`${DECKS}index`)).toBe(`${DECKS}index`);
    expect(releaseUrlOfLegacySource(`${DECKS}index.ttl`)).toBe(`${DECKS}index.ttl`);
    expect(releaseUrlOfLegacySource("https://example.com/capitals.ttl")).toBe(
      "https://example.com/capitals.ttl",
    );
  });
});

describe("librarySeriesUrlOf and libraryPublisherUrlOf", () => {
  it("point into the index for releases and legacy documents", () => {
    for (const url of [`${DECKS}capitals/v3`, `${DECKS}capitals/3.ttl`, `${DECKS}capitals.ttl`, `${DECKS}capitals`]) {
      expect(librarySeriesUrlOf(url)).toBe(`${DECKS}index#capitals`);
      expect(libraryPublisherUrlOf(url)).toBe(`${DECKS}index#solid-memo`);
    }
  });

  it("stay beside a URL outside the library", () => {
    expect(librarySeriesUrlOf("https://example.com/x.ttl")).toBe("https://example.com/x.ttl#series");
    expect(libraryPublisherUrlOf("https://example.com/x.ttl")).toBe(
      "https://example.com/x.ttl#publisher",
    );
  });
});
