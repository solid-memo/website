import { describe, expect, it, vi } from "vitest";
import { turtleFetch } from "./testing/turtle";
import { createShapeLoader } from "./shapeLoader";
import { CARD_V2, DECK_V2 } from "@solid-memo/vocab/descriptors.generated";
import { PROFILES, REFERENCE_DATA } from "./profiles";

const BASES = {
  shapesBaseUrl: "https://shapes.example/",
  vocabBaseUrl: "https://vocab.example/",
  vendorBaseUrl: "https://app.example/solid-memo/vendor/",
};

describe("createShapeLoader", () => {
  it("fetches a shape document from the shapes' pod, once per document", async () => {
    const fetch = vi.fn(turtleFetch(`<#shape> a <http://www.w3.org/ns/shacl#NodeShape> .`));
    const loader = createShapeLoader({ fetch, ...BASES });
    const first = await loader.load(CARD_V2);
    expect(first.size).toBe(1);
    expect(await loader.load(CARD_V2)).toBe(first);
    await loader.load(DECK_V2);
    expect(fetch.mock.calls.map((call) => String(call[0]))).toEqual([
      "https://shapes.example/card/v2",
      "https://shapes.example/deck/v2",
    ]);
  });

  it("fetches a profile's files from the site and the reference data from the vocabulary's pod", async () => {
    const fetch = vi.fn(turtleFetch(`<#x> a <http://www.w3.org/ns/shacl#NodeShape> .`));
    const loader = createShapeLoader({ fetch, ...BASES });
    expect(await loader.loadProfile("skos")).toHaveLength(PROFILES.skos.length);
    expect(await loader.loadReferenceData()).toHaveLength(REFERENCE_DATA.length);
    expect(fetch.mock.calls.map((call) => String(call[0]))).toEqual([
      ...PROFILES.skos.map((path) => `https://app.example/solid-memo/vendor/${path}`),
      ...REFERENCE_DATA.map((path) => `https://vocab.example/${path}`),
    ]);
  });
});
