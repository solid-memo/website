import { describe, expect, it } from "vitest";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { courseDraft, deckDraft, DRAFT, NOW, of } from "../testing/releaseDraft";
import { draftLibraryDeck } from "./draftListing";

const DCTERMS = "http://purl.org/dc/terms/";

describe("draftLibraryDeck", () => {
  it("lists a course as the library would: one release, its cards in use, its sources", () => {
    const draft = courseDraft();
    const retired = { ...draft, cards: draft.cards.map((card, at) => (at === 0 ? { ...card, data: { ...card.data, deprecated: true } } : card)) };
    expect(draftLibraryDeck(retired)).toEqual({
      url: DRAFT,
      seriesUrl: of("series"),
      version: "1",
      releases: [{ url: DRAFT, version: "1" }],
      themes: [],
      keywords: {},
      title: { en: "Solid" },
      cardCount: 3,
      authors: [],
      direction: "front-to-back",
      createdAt: NOW,
      sources: [{ url: "https://source.example/", title: "Source", authors: [] }],
      isCourse: true,
    });
  });

  it("says what the draft says of itself, its authors by name, and of its sources", () => {
    const deck = deckDraft();
    const draft = {
      ...deck,
      root: {
        ...deck.root,
        version: undefined,
        inSeries: undefined,
        versionNotes: "First",
        issued: NOW,
        modified: NOW,
        license: "https://creativecommons.org/publicdomain/zero/1.0/",
        description: { en: "About" },
        creator: [of("anna"), "https://someone.example/#me"],
        theme: ["https://theme.example/"],
        keyword: { en: ["word"] },
        wasDerivedFrom: ["https://source.example/"],
      },
      agents: [{ id: "anna", data: { name: "Anna" } }],
      triples: [
        { subject: "https://source.example/", predicate: `${DCTERMS}creator`, object: { kind: "literal" as const, value: "Ben", language: "", datatype: "" } },
        { subject: "https://source.example/", predicate: `${DCTERMS}creator`, object: { kind: "iri" as const, value: "https://ben.example/" } },
        { subject: "https://source.example/", predicate: `${DCTERMS}license`, object: { kind: "iri" as const, value: "https://licence.example/" } },
        { subject: "https://source.example/", predicate: `${DCTERMS}title`, object: { kind: "iri" as const, value: "https://not-a-title.example/" } },
      ],
    };
    const listed = draftLibraryDeck(draft);
    expect(listed).toMatchObject({
      seriesUrl: DRAFT,
      version: "1",
      versionNotes: "First",
      releases: [{ url: DRAFT, version: "1", issued: NOW, notes: "First" }],
      themes: ["https://theme.example/"],
      keywords: { en: ["word"] },
      authors: ["Anna", "https://someone.example/#me"],
      license: "https://creativecommons.org/publicdomain/zero/1.0/",
      description: { en: "About" },
      direction: "bidirectional",
      modifiedAt: NOW,
      sources: [{ url: "https://source.example/", authors: ["Ben"], license: "https://licence.example/" }],
    });
    expect(listed.isCourse).toBeUndefined();
    expect(listed.sources[0]!.title).toBeUndefined();
    expect(SM.bidirectional).toBe(draft.root.studyDirection);
  });

  it("lists a draft without a title or a time it was made with none", () => {
    const deck = deckDraft();
    const listed = draftLibraryDeck({ ...deck, root: { ...deck.root, title: undefined, created: undefined } });
    expect(listed.title).toEqual({});
    expect(listed.createdAt).toBeUndefined();
  });
});
