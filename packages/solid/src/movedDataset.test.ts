import { buildThing, createSolidDataset, createThing, getThingAll, getUrl, setThing } from "@inrupt/solid-client";
import { describe, expect, it } from "vitest";
import { movedDataset, movedIri } from "./movedDataset";

const FROM = "https://pod.example/a/decks/deck-1.ttl";
const TO = "https://pod.example/a/decks/deck-1-u1.ttl";

describe("movedIri", () => {
  it("moves the document and its fragments, nothing else", () => {
    expect(movedIri(FROM, FROM, TO)).toBe(TO);
    expect(movedIri(`${FROM}#se`, FROM, TO)).toBe(`${TO}#se`);
    expect(movedIri(`${FROM}x`, FROM, TO)).toBe(`${FROM}x`);
    expect(movedIri("https://example.org/#x", FROM, TO)).toBe("https://example.org/#x");
  });
});

describe("movedDataset", () => {
  it("moves subjects and objects of the document, keeping other IRIs", async () => {
    const thing = buildThing(createThing({ url: `${FROM}#se` }))
      .addUrl("https://example.org/next", `${FROM}#no`)
      .addUrl("https://example.org/see", "https://example.org/sweden")
      .build();
    const moved = await movedDataset(setThing(createSolidDataset(), thing), [{ from: FROM, to: TO }]);
    const [only] = getThingAll(moved);
    expect(only.url).toBe(`${TO}#se`);
    expect(getUrl(only, "https://example.org/next")).toBe(`${TO}#no`);
    expect(getUrl(only, "https://example.org/see")).toBe("https://example.org/sweden");
  });

  it("moves each document to its own new one", async () => {
    const REVIEWS = "https://pod.example/a/reviews/deck-1.ttl";
    const REVIEWS_TO = "https://pod.example/a/reviews/deck-1-u1.ttl";
    const thing = buildThing(createThing({ url: `${REVIEWS}#se` }))
      .addUrl("https://example.org/of", `${FROM}#se`)
      .build();
    const moved = await movedDataset(setThing(createSolidDataset(), thing), [
      { from: REVIEWS, to: REVIEWS_TO },
      { from: FROM, to: TO },
    ]);
    const [only] = getThingAll(moved);
    expect(only.url).toBe(`${REVIEWS_TO}#se`);
    expect(getUrl(only, "https://example.org/of")).toBe(`${TO}#se`);
  });
});
