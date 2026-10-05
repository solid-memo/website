import { describe, expect, it } from "vitest";
import {
  catalogFromRecord,
  catalogToRecord,
  defaultCatalogDescription,
  publisherToRecord,
  type Catalog,
} from "./catalog";

const catalog: Catalog = {
  title: "Main",
  description: "My decks.",
  publisher: { webId: "https://alice.example/profile/card#me", name: "Alice" },
};

describe("catalog records", () => {
  it("list the decks as datasets and the topics and EU themes as taxonomies, and read back", () => {
    const record = catalogToRecord(catalog, ["https://pod.example/c.ttl#deck-1"]);
    expect(record).toEqual({
      title: "Main",
      description: "My decks.",
      publisher: catalog.publisher.webId,
      themeTaxonomy: [
        "https://pod.solid-memo.com/vocab/topics",
        "http://publications.europa.eu/resource/authority/data-theme",
      ],
      dataset: ["https://pod.example/c.ttl#deck-1"],
    });
    expect(catalogFromRecord(record, "Alice")).toEqual(catalog);
  });

  it("describe the publisher as an agent with a name", () => {
    expect(publisherToRecord(catalog)).toEqual({ name: "Alice" });
  });

  it("describe a catalogue without a description of its own", () => {
    expect(defaultCatalogDescription("Main")).toBe("Flashcard decks of the Solid Memo instance Main.");
  });
});
