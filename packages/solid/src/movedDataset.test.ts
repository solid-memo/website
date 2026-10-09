import { describe, expect, it } from "vitest";
import { movedIri } from "./movedDataset";

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
