import { describe, expect, it } from "vitest";
import { AppError } from "./appError";
import {
  catalogFromRecord,
  catalogToRecord,
  defaultCatalogDescription,
  describedCatalog,
  publisherToRecord,
  renamedCatalog,
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
        "https://solid-memo.com/ns/vocab/topics.ttl",
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

describe("a catalogue's licence and last change", () => {
  it("are written and read back when stated", () => {
    const stated: Catalog = { ...catalog, license: CC0, modified: "2026-10-01T10:00:00.000Z" };
    const record = catalogToRecord(stated, []);
    expect(record).toMatchObject({ license: CC0, modified: "2026-10-01T10:00:00.000Z" });
    expect(catalogFromRecord(record, "Alice")).toEqual(stated);
  });
});

const CC0 = "https://creativecommons.org/publicdomain/zero/1.0/";
const OWN = "https://example.org/my-terms";

describe("describedCatalog", () => {
  it("replaces the description, trimmed, and the licence", () => {
    expect(describedCatalog(catalog, { description: " Decks I share. ", license: CC0 })).toEqual({
      ...catalog,
      description: "Decks I share.",
      license: CC0,
    });
  });

  it("removes the licence, and keeps one another app wrote", () => {
    expect(describedCatalog({ ...catalog, license: CC0 }, { description: "My decks." })).toEqual(catalog);
    expect(describedCatalog({ ...catalog, license: OWN }, { description: "My decks.", license: OWN })).toEqual({ ...catalog, license: OWN });
  });

  it("refuses an empty description, and a licence it does not offer", () => {
    expect(() => describedCatalog(catalog, { description: "  " })).toThrow(new AppError("catalogNeedsDescription"));
    expect(() => describedCatalog(catalog, { description: "x", license: OWN })).toThrow(new AppError("licenseUnknown", { url: OWN }));
  });
});

describe("renamedCatalog", () => {
  it("takes the new name, and the description that goes with it when it had the old name's", () => {
    const named = { ...catalog, description: defaultCatalogDescription("Main") };
    expect(renamedCatalog(named, "Languages")).toEqual({ ...catalog, title: "Languages", description: defaultCatalogDescription("Languages") });
  });

  it("keeps a description of the user's own", () => {
    expect(renamedCatalog(catalog, "Languages")).toEqual({ ...catalog, title: "Languages" });
  });
});
