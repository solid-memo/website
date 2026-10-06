import { describe, expect, it } from "vitest";
import { libraryPublisherUrlOf, librarySeriesUrlOf } from "./libraryLayout";

const DECKS = "https://solid-memo.com/decks/";

describe("librarySeriesUrlOf and libraryPublisherUrlOf", () => {
  it("point into the index for a release", () => {
    for (const url of [`${DECKS}capitals/v1.ttl`, `${DECKS}capitals/v12.ttl`]) {
      expect(librarySeriesUrlOf(url)).toBe(`${DECKS}index.ttl#capitals`);
      expect(libraryPublisherUrlOf(url)).toBe(`${DECKS}index.ttl#solid-memo`);
    }
  });

  it("stay beside a URL that is not a release", () => {
    for (const url of ["https://example.com/x.ttl", `${DECKS}capitals/v0.ttl`, `${DECKS}capitals/v1`, `${DECKS}index.ttl`]) {
      expect(librarySeriesUrlOf(url)).toBe(`${url}#series`);
      expect(libraryPublisherUrlOf(url)).toBe(`${url}#publisher`);
    }
  });
});
