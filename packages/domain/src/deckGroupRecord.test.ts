import { describe, expect, it } from "vitest";
import { deckGroupFromRecord, deckGroupToRecord } from "./deckGroupRecord";

const URL = "https://pod.example/solid-memo/main/catalog.ttl#group-1";
const PUBLISHER = "https://alice.example/profile/card#me";

describe("deck group records", () => {
  it("round-trip the name, members and position, the description the default for its name", () => {
    const stored = {
      group: { url: URL, title: { en: "Languages" } },
      decks: ["#deck-a"],
      groups: ["#group-2"],
      position: 2,
    };
    const record = deckGroupToRecord(stored, PUBLISHER);
    expect(record).toEqual({
      title: { en: "Languages" },
      description: { en: "Deck group: Languages.", sv: "Kortleksgrupp: Languages." },
      publisher: PUBLISHER,
      dataset: ["#deck-a"],
      catalog: ["#group-2"],
      position: 2,
    });
    expect(deckGroupFromRecord(URL, record)).toEqual(stored);
  });

  it("leave out a position the group has not got", () => {
    const stored = { group: { url: URL, title: { sv: "Språk" } }, decks: [], groups: [] };
    const record = deckGroupToRecord(stored, PUBLISHER);
    expect(record).not.toHaveProperty("position");
    expect(deckGroupFromRecord(URL, record)).toEqual(stored);
  });

  it("read a negative position as none", () => {
    const stored = { group: { url: URL, title: { en: "Languages" } }, decks: [], groups: [] };
    const record = deckGroupToRecord({ ...stored, position: -1 }, PUBLISHER);
    expect(deckGroupFromRecord(URL, record)).toEqual(stored);
  });

  it("keep a description the user wrote, and renew the default one on a rename", () => {
    const renamed = { group: { url: URL, title: { en: "Words" } }, decks: [], groups: [] };
    const previous = deckGroupToRecord({ ...renamed, group: { url: URL, title: { en: "Languages" } } }, PUBLISHER);
    expect(deckGroupToRecord(renamed, PUBLISHER, previous).description).toEqual({
      en: "Deck group: Words.",
      sv: "Kortleksgrupp: Words.",
    });
    const written = { ...previous, description: { en: "Every language I study." } };
    expect(deckGroupToRecord(renamed, PUBLISHER, written).description).toEqual({ en: "Every language I study." });
  });
});
