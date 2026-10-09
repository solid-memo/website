import { describe, expect, it } from "vitest";
import type { Card, Deck } from "./deck";
import type { LibraryCard, LibraryDeckContent } from "./library";
import { applyLibraryUpgrade, planLibraryUpgrade, sameContent, upgradedCards, withReleaseLanguages } from "./libraryUpgrade";

const DECKS = "https://solid-memo.com/decks/";
const CARDS = "https://pod.example/solid-memo/a/decks/deck-1.ttl";

const libraryCard = (id: string, back: string, formatVersion = 1): LibraryCard => ({ id, front: { "": id }, back: { "": back }, formatVersion });
const podCard = (id: string, back: string): Card => ({ id, url: `${CARDS}#${id}`, front: { "": id }, back: { "": back }, createdAt: "", formatVersion: 2 });

function release(version: number, cards: LibraryCard[], direction: Deck["direction"] = "front-to-back"): LibraryDeckContent {
  return {
    url: `${DECKS}capitals/v${version}.ttl`,
    title: { en: "Capitals" },
    formatVersion: 3,
    authors: [],
    direction,
    version: String(version),
    seriesUrl: `${DECKS}index.ttl#capitals`,
    themes: [],
    keywords: {},
    cards,
  };
}

const deck: Deck = {
  id: "deck-1",
  url: "https://pod.example/solid-memo/a/catalog.ttl#deck-1",
  title: { en: "Capitals" },
  cardsDocumentUrl: CARDS,
  reviewsDocumentUrl: "https://pod.example/solid-memo/a/reviews/deck-1.ttl",
  createdAt: "",
  formatVersion: 3,
  direction: "front-to-back",
  authors: [],
  sourceUrl: `${DECKS}capitals/v1.ttl`,
};

const releases = [
  { url: `${DECKS}capitals/v1.ttl`, version: "1", notes: "First." },
  { url: `${DECKS}capitals/v2.ttl`, version: "2" },
  { url: `${DECKS}capitals/v3.ttl`, version: "3", notes: "Norway, and Sweden fixed." },
];

describe("planLibraryUpgrade", () => {
  const from = release(1, [
    libraryCard("se", "Stockholm?"),
    libraryCard("dk", "Copenhagen"),
    libraryCard("fi", "Helsinki"),
    libraryCard("is", "Reykjavik"),
    libraryCard("ee", "Tallinn"),
    libraryCard("lv", "Riga"),
  ]);
  const to = release(3, [
    libraryCard("se", "Stockholm"),
    libraryCard("dk", "Copenhagen"),
    libraryCard("fi", "Helsingfors"),
    libraryCard("ee", "Tallinn!"),
    libraryCard("no", "Oslo"),
    libraryCard("mine", "Mine"),
  ]);
  const cards = [
    podCard("se", "Stockholm?"),
    podCard("dk", "Copenhagen"),
    podCard("fi", "Helsinki, my note"),
    podCard("is", "Reykjavik"),
    podCard("mine", "Mine"),
    podCard("lv", "Riga, mine"),
  ];

  it("applies the library's changes to the cards the user left alone, keeping the others, with every release's notes", () => {
    expect(planLibraryUpgrade({ deck, cards, from, to, releases })).toEqual({
      fromVersion: "1",
      toVersion: "3",
      releaseUrl: `${DECKS}capitals/v3.ttl`,
      notes: [{ version: "3", notes: "Norway, and Sweden fixed." }],
      add: [libraryCard("no", "Oslo")],
      change: [libraryCard("se", "Stockholm")],
      retire: [],
      restore: [],
      remove: [podCard("is", "Reykjavik")],
      kept: [podCard("fi", "Helsinki, my note"), podCard("lv", "Riga, mine")],
      // A card the copy already has as the release adds it.
      applied: [podCard("mine", "Mine")],
    });
  });

  it("offers to move a copy whose cards are already as the newer release has them, as an upgrade cut off before its entry leaves it", () => {
    const now = release(2, [
      libraryCard("se", "Stockholm"),
      { ...libraryCard("dk", "Copenhagen"), retired: true },
      ...from.cards.filter((card) => card.id !== "se" && card.id !== "dk"),
      libraryCard("no", "Oslo"),
    ]);
    const written = [
      podCard("se", "Stockholm"),
      { ...podCard("dk", "Copenhagen"), retired: true as const },
      ...cards.filter((card) => card.id !== "se" && card.id !== "dk"),
      podCard("no", "Oslo"),
    ];
    expect(planLibraryUpgrade({ deck, cards: written, from, to: now, releases })).toMatchObject({
      releaseUrl: `${DECKS}capitals/v2.ttl`,
      add: [],
      change: [],
      retire: [],
      remove: [],
      applied: [podCard("se", "Stockholm"), { ...podCard("dk", "Copenhagen"), retired: true }, podCard("no", "Oslo")],
    });
    // A card the library changes is changed, though it is already retired as the release has it.
    const retiredAndFixed = release(2, from.cards.map((card) => (card.id === "se" ? { ...libraryCard("se", "Stockholm"), retired: true as const } : card)));
    const retiredMine = cards.map((card) => (card.id === "se" ? { ...card, retired: true as const } : card));
    expect(planLibraryUpgrade({ deck, cards: retiredMine, from, to: retiredAndFixed, releases })).toMatchObject({
      change: [{ ...libraryCard("se", "Stockholm"), retired: true }],
      applied: [],
    });
    // A card the user changed, then the library changed alike, is the release's too.
    const fixed = release(2, from.cards.map((card) => (card.id === "fi" ? libraryCard("fi", "Helsinki, my note") : card)));
    expect(planLibraryUpgrade({ deck, cards, from, to: fixed, releases })).toMatchObject({
      change: [],
      kept: [],
      applied: [podCard("fi", "Helsinki, my note")],
    });
  });

  it("takes up the library's new direction while the copy is still studied the old way", () => {
    const both = release(2, from.cards, "bidirectional");
    expect(planLibraryUpgrade({ deck, cards, from, to: both, releases })).toMatchObject({
      direction: "bidirectional",
      add: [],
      change: [],
      remove: [],
    });
    expect(planLibraryUpgrade({ deck: { ...deck, direction: "back-to-front" }, cards, from, to: both, releases })).toBeNull();
  });

  it("offers nothing for a release that is not newer, uses an unknown card format, or changes nothing", () => {
    expect(planLibraryUpgrade({ deck, cards, from: to, to: from, releases })).toBeNull();
    expect(planLibraryUpgrade({ deck, cards, from, to: release(3, [libraryCard("x", "y", 9)]), releases })).toBeNull();
    expect(planLibraryUpgrade({ deck, cards, from, to: release(2, from.cards), releases })).toBeNull();
  });

  it("retires and brings back cards whatever the user did to them, keeping them and their review state", () => {
    const retired = (card: LibraryCard): LibraryCard => ({ ...card, retired: true });
    const was = release(1, [libraryCard("se", "Stockholm"), libraryCard("dk", "Copenhagen"), retired(libraryCard("yu", "Belgrade"))]);
    const now = release(2, [retired(libraryCard("se", "Stockholm")), libraryCard("dk", "Copenhagen"), libraryCard("yu", "Belgrade")]);
    const mine = [podCard("se", "Stockholm, my note"), podCard("dk", "Copenhagen"), { ...podCard("yu", "Belgrade"), retired: true as const }];
    expect(planLibraryUpgrade({ deck, cards: mine, from: was, to: now, releases })).toMatchObject({
      add: [],
      change: [],
      retire: [podCard("se", "Stockholm, my note")],
      restore: [{ ...podCard("yu", "Belgrade"), retired: true }],
      remove: [],
      kept: [],
    });
  });

  it("adds a card the release has retired already, retired, so a later release can bring it back", () => {
    const now = release(2, [...from.cards, { ...libraryCard("yu", "Belgrade"), retired: true }]);
    expect(planLibraryUpgrade({ deck, cards, from, to: now, releases })?.add).toEqual([
      { ...libraryCard("yu", "Belgrade"), retired: true },
    ]);
  });

  it("takes a changed label, note or picture description for a changed card", () => {
    const now = release(2, from.cards.map((card) => (card.id === "dk" ? { ...card, backNote: { en: "Since 1443." } } : card)));
    expect(planLibraryUpgrade({ deck, cards, from, to: now, releases })?.change).toEqual([
      { ...libraryCard("dk", "Copenhagen"), backNote: { en: "Since 1443." } },
    ]);
    const labelled = release(2, from.cards.map((card) => (card.id === "dk" ? { ...card, backLabel: { en: "Capital" } } : card)));
    expect(planLibraryUpgrade({ deck, cards, from, to: labelled, releases })?.change).toEqual([
      { ...libraryCard("dk", "Copenhagen"), backLabel: { en: "Capital" } },
    ]);
    const frontNoted = release(2, from.cards.map((card) => (card.id === "dk" ? { ...card, frontNote: { en: "A kingdom." } } : card)));
    expect(planLibraryUpgrade({ deck, cards, from, to: frontNoted, releases })?.change).toHaveLength(1);
    const described = release(2, from.cards.map((card) => (card.id === "dk" ? { ...card, frontImageDescription: { en: "A red flag" } } : card)));
    expect(planLibraryUpgrade({ deck, cards, from, to: described, releases })?.change).toHaveLength(1);
    const backDescribed = release(2, from.cards.map((card) => (card.id === "dk" ? { ...card, backImageDescription: { en: "A harbour" } } : card)));
    expect(planLibraryUpgrade({ deck, cards, from, to: backDescribed, releases })?.change).toHaveLength(1);
  });

  it("takes changed wrong options (distractors) for a changed card: their text, note, number or ids, but not their order", () => {
    const options = [
      { id: "dk-d1", text: { en: "Aarhus" } },
      { id: "dk-d2", text: { en: "Odense" }, note: { en: "The third city." } },
    ];
    const was = release(1, from.cards.map((card) => (card.id === "dk" ? { ...card, distractors: options } : card)));
    const mine = cards.map((card) => (card.id === "dk" ? { ...card, distractors: options } : card));
    const changed = (distractors: typeof options) =>
      planLibraryUpgrade({ deck, cards: mine, from: was, to: release(2, was.cards.map((card) => (card.id === "dk" ? { ...card, distractors } : card))), releases })?.change;
    expect(changed(options)).toBeUndefined();
    expect(changed([options[0]!, { ...options[1]!, text: { en: "Aalborg" } }])).toHaveLength(1);
    expect(changed([options[0]!, { ...options[1]!, note: { en: "An island city." } }])).toHaveLength(1);
    // RDF keeps no order among a card's sm:distractor: the same ones listed otherwise are no change.
    expect(changed([options[1]!, options[0]!])).toBeUndefined();
    expect(changed([options[0]!, { ...options[1]!, id: "dk-d3" }])).toHaveLength(1);
    expect(changed([options[0]!])).toHaveLength(1);
  });

  describe("text formats", () => {
    const MARKDOWN = "https://solid-memo.com/ns/vocab/v1.ttl#markdown";
    const PLAIN = "https://solid-memo.com/ns/vocab/v1.ttl#plainText";
    const marked = (card: LibraryCard): LibraryCard => (card.id === "dk" ? { ...card, textFormat: MARKDOWN } : card);
    const was = release(1, from.cards.map(marked));
    const withFormat = (textFormat?: string) =>
      cards.map((card) => (card.id === "dk" && textFormat !== undefined ? { ...card, textFormat } : card));

    it("takes a release that only marks a card's text as Markdown as a change", () => {
      const now = release(2, from.cards.map(marked));
      expect(planLibraryUpgrade({ deck, cards, from, to: now, releases })?.change).toEqual([
        { ...libraryCard("dk", "Copenhagen"), textFormat: MARKDOWN },
      ]);
    });

    it("brings a text format the copy lost back with the newer release, and its fixes, but keeps a copy switched to plain text", () => {
      // The newer release fixes the card's text: a copy that only lost the marker takes it, marker and all.
      const fixed = release(2, was.cards.map((card) => (card.id === "dk" ? { ...card, back: { "": "**Copenhagen**" } } : card)));
      expect(planLibraryUpgrade({ deck, cards: withFormat(), from: was, to: fixed, releases })?.change).toEqual([
        { ...libraryCard("dk", "**Copenhagen**"), textFormat: MARKDOWN },
      ]);
      // A copy the user switched to plain text was changed on purpose: it is kept, which alone is no offer.
      expect(planLibraryUpgrade({ deck, cards: withFormat(PLAIN), from: was, to: fixed, releases })).toBeNull();
      // The newer release leaves the card as it was: a copy that lost the marker still gets it back.
      const same = release(2, was.cards);
      expect(planLibraryUpgrade({ deck, cards: withFormat(), from: was, to: same, releases })?.change).toEqual([
        { ...libraryCard("dk", "Copenhagen"), textFormat: MARKDOWN },
      ]);
      expect(planLibraryUpgrade({ deck, cards: withFormat(PLAIN), from: was, to: same, releases })).toBeNull();
      expect(planLibraryUpgrade({ deck, cards: withFormat(MARKDOWN), from: was, to: same, releases })).toBeNull();
    });

    it("takes a copy that states plain text as the same as a release with no text format", () => {
      // The user switched the card to Markdown and back: it says what the release says.
      const fixed = release(2, from.cards.map((card) => (card.id === "dk" ? { ...card, back: { "": "København" } } : card)));
      expect(planLibraryUpgrade({ deck, cards: withFormat(PLAIN), from, to: fixed, releases })?.change).toEqual([
        libraryCard("dk", "København"),
      ]);
      expect(sameContent({ front: {}, back: {}, textFormat: PLAIN }, { front: {}, back: {} })).toBe(true);
      expect(sameContent({ front: {}, back: {}, textFormat: PLAIN }, { front: {}, back: {}, textFormat: MARKDOWN })).toBe(
        false,
      );
    });

    it("removes a card the release drops when its copy only lost the text format, and keeps one switched to plain text", () => {
      const dropped = release(2, was.cards.filter((card) => card.id !== "dk"));
      expect(planLibraryUpgrade({ deck, cards: withFormat(), from: was, to: dropped, releases })).toMatchObject({
        remove: [podCard("dk", "Copenhagen")],
        kept: [],
      });
      expect(planLibraryUpgrade({ deck, cards: withFormat(PLAIN), from: was, to: dropped, releases })).toBeNull();
    });
  });

  it("adds no card to a course's deck, which holds only those the learner reached, but changes and retires those it holds", () => {
    const now = release(2, [
      libraryCard("se", "Stockholm"),
      { ...libraryCard("dk", "Copenhagen"), retired: true },
      ...from.cards.filter((card) => card.id !== "se" && card.id !== "dk"),
      libraryCard("no", "Oslo"),
    ]);
    const reached = [podCard("se", "Stockholm?"), podCard("dk", "Copenhagen")];
    expect(planLibraryUpgrade({ deck, cards: reached, from, to: now, releases, course: true })).toMatchObject({
      add: [],
      change: [libraryCard("se", "Stockholm")],
      retire: [podCard("dk", "Copenhagen")],
    });
    // A release that only adds cards offers a course's deck nothing.
    const added = release(2, [...from.cards, libraryCard("no", "Oslo")]);
    expect(planLibraryUpgrade({ deck, cards: reached, from, to: added, releases, course: true })).toBeNull();
  });

  it("takes a retirement the copy already has as done, and only moves the deck to the release", () => {
    const now = release(2, from.cards.map((card) => (card.id === "dk" ? { ...card, retired: true as const } : card)));
    const mine = cards.map((card) => (card.id === "dk" ? { ...card, retired: true as const } : card));
    expect(planLibraryUpgrade({ deck, cards: mine, from, to: now, releases })).toMatchObject({
      retire: [],
      applied: [{ ...podCard("dk", "Copenhagen"), retired: true }],
    });
  });
});

describe("upgradedCards", () => {
  it("writes the added and changed cards as released, and the retired and restored ones as the copy has them", () => {
    const plan = planLibraryUpgrade({
      deck,
      cards: [podCard("se", "Stockholm?"), podCard("dk", "Copenhagen, mine"), { ...podCard("yu", "Belgrade"), retired: true }],
      from: release(1, [libraryCard("se", "Stockholm?"), libraryCard("dk", "Copenhagen"), { ...libraryCard("yu", "Belgrade"), retired: true }]),
      to: release(2, [
        { ...libraryCard("se", "Stockholm"), retired: true },
        { ...libraryCard("dk", "Copenhagen"), retired: true },
        libraryCard("yu", "Belgrade"),
        libraryCard("no", "Oslo"),
      ]),
      releases,
    })!;
    expect(upgradedCards(plan)).toEqual([
      libraryCard("no", "Oslo"),
      { ...libraryCard("se", "Stockholm"), retired: true },
      { ...podCard("dk", "Copenhagen, mine"), retired: true },
      podCard("yu", "Belgrade"),
    ]);
  });
});

describe("applyLibraryUpgrade", () => {
  it("moves the copy to the newer release, and to its direction when that changes", () => {
    const plan = { fromVersion: "1", toVersion: "3", releaseUrl: `${DECKS}capitals/v3.ttl`, notes: [], add: [], change: [], retire: [], restore: [], remove: [], kept: [], applied: [] };
    expect(applyLibraryUpgrade(deck, plan)).toEqual({ ...deck, sourceUrl: `${DECKS}capitals/v3.ttl` });
    expect(applyLibraryUpgrade(deck, { ...plan, direction: "bidirectional" })).toEqual({
      ...deck,
      sourceUrl: `${DECKS}capitals/v3.ttl`,
      direction: "bidirectional",
    });
  });
});

describe("the deck's texts in an upgrade", () => {
  const flags = (version: number, about: Partial<LibraryDeckContent>): LibraryDeckContent => ({
    ...release(version, []),
    title: { en: "World flags" },
    description: { en: "Flags." },
    ...about,
  });
  const v1 = flags(1, {});
  const v2 = flags(2, {
    title: { en: "World flags", sv: "Världens flaggor" },
    description: { en: "Flags.", sv: "Flaggor." },
    keywords: { en: ["flags"], sv: ["flaggor"] },
    themes: ["https://solid-memo.com/ns/vocab/topics.ttl#geography"],
  });
  const copy: Deck = { ...deck, title: { en: "World flags" }, description: { en: "Flags." }, themes: [] };
  const plan = (mine: Deck, to = v2) => planLibraryUpgrade({ deck: mine, cards: [], from: v1, to, releases });

  it("takes the release's title, description, keywords and themes where the user left the old ones, and offers that alone", () => {
    expect(plan(copy)).toMatchObject({
      title: { en: "World flags", sv: "Världens flaggor" },
      description: { en: "Flags.", sv: "Flaggor." },
      keywords: { en: ["flags"], sv: ["flaggor"] },
      themes: ["https://solid-memo.com/ns/vocab/topics.ttl#geography"],
    });
    expect(applyLibraryUpgrade(copy, plan(copy)!)).toMatchObject({
      title: { en: "World flags", sv: "Världens flaggor" },
      keywords: { en: ["flags"], sv: ["flaggor"] },
    });
  });

  it("keeps a title the user changed, adding the release's languages only while it says what the release says", () => {
    const renamed = plan({ ...copy, title: { en: "My flags" } })!;
    expect(renamed).not.toHaveProperty("title");
    const german = plan({ ...copy, title: { en: "World flags", de: "Weltflaggen" } })!;
    expect(german.title).toEqual({ en: "World flags", de: "Weltflaggen", sv: "Världens flaggor" });
    const already = plan({ ...copy, title: { en: "World flags", sv: "Flaggor" } })!;
    expect(already).not.toHaveProperty("title");
  });

  it("adds the release's languages to a title the user moved away from English, as long as the rest agrees", () => {
    // The Swedish name alone: the user removed the English the app once saved it under too.
    const retagged = plan({ ...copy, title: { sv: "Världens flaggor" } })!;
    expect(retagged.title).toEqual({ en: "World flags", sv: "Världens flaggor" });
    const ownLanguage = plan({ ...copy, title: { ja: "世界の国旗" } })!;
    expect(ownLanguage).not.toHaveProperty("title");
    // Tags compare exactly: British English is not the release's plain English.
    const regional = plan({ ...copy, title: { "en-gb": "World flags" } })!;
    expect(regional).not.toHaveProperty("title");
  });

  it("keeps keywords and themes the user changed, a deck without a description, and what the release leaves out", () => {
    const own = plan({ ...copy, keywords: { en: ["mine"] }, themes: undefined, description: undefined })!;
    expect(own).not.toHaveProperty("keywords");
    expect(own).not.toHaveProperty("description");
    expect(own.themes).toEqual(["https://solid-memo.com/ns/vocab/topics.ttl#geography"]);
    const silent = plan(copy, { ...v2, description: undefined })!;
    expect(silent).not.toHaveProperty("description");
    expect(plan(copy, { ...v1, version: "2" })).toBeNull();
  });

  it("compares keywords language by language: a copy with the old release's untagged keywords takes the release's tagged ones", () => {
    const old = flags(1, { keywords: { "": ["flags", "flaggor"] } });
    const tagged = flags(2, { keywords: { en: ["flags", "countries"], sv: ["flaggor"] } });
    const upgrade = (keywords: Deck["keywords"]) =>
      planLibraryUpgrade({ deck: { ...copy, keywords }, cards: [], from: old, to: tagged, releases });
    expect(upgrade({ "": ["flaggor", "flags"] })!.keywords).toEqual({ en: ["flags", "countries"], sv: ["flaggor"] });
    expect(upgrade({ en: ["flags", "flaggor"] })).toBeNull();
    expect(upgrade({ "": ["flags"] })).toBeNull();
    expect(planLibraryUpgrade({ deck: { ...copy, keywords: { sv: ["flaggor"], en: ["countries", "flags"] } }, cards: [], from: tagged, to: { ...tagged, version: "3" }, releases })).toBeNull();
  });

  it("leaves a copy without keywords when the release drops them all, and keeps the copy's when the plan has none", () => {
    const dropped = planLibraryUpgrade({
      deck: { ...copy, keywords: { en: ["flags"] } },
      cards: [],
      from: flags(1, { keywords: { en: ["flags"] } }),
      to: flags(2, {}),
      releases,
    })!;
    expect(dropped.keywords).toEqual({});
    expect(applyLibraryUpgrade({ ...copy, keywords: { en: ["flags"] } }, dropped)).not.toHaveProperty("keywords");
    expect(applyLibraryUpgrade({ ...copy, keywords: { en: ["mine"] } }, { ...dropped, keywords: undefined }).keywords).toEqual({ en: ["mine"] });
  });
});

describe("withReleaseLanguages", () => {
  const release2 = { ...release(2, []), title: { en: "Capitals", sv: "Huvudstäder" }, description: { en: "Capitals.", sv: "Huvudstäder." } };

  it("gives the copy the languages its release adds, where the English is the release's", () => {
    expect(withReleaseLanguages({ ...deck, description: { en: "Capitals." } }, release2)).toMatchObject({
      title: { en: "Capitals", sv: "Huvudstäder" },
      description: { en: "Capitals.", sv: "Huvudstäder." },
    });
    expect(withReleaseLanguages(deck, release2)).toMatchObject({ title: { en: "Capitals", sv: "Huvudstäder" } });
    expect(withReleaseLanguages(deck, release2)).not.toHaveProperty("description");
  });

  it("changes nothing the user wrote, and says so when there is nothing to add", () => {
    expect(withReleaseLanguages({ ...deck, title: { en: "My capitals" } }, release2)).toBeNull();
    expect(withReleaseLanguages({ ...deck, title: { en: "My capitals" }, description: { en: "Capitals." } }, release2)).toMatchObject({
      title: { en: "My capitals" },
      description: { en: "Capitals.", sv: "Huvudstäder." },
    });
    expect(withReleaseLanguages(deck, { ...release2, title: { en: "Capitals" }, description: undefined })).toBeNull();
  });

  it("gives a copy retagged away from English the release's English, where every language both have agrees", () => {
    expect(withReleaseLanguages({ ...deck, title: { sv: "Huvudstäder" } }, release2)).toMatchObject({
      title: { en: "Capitals", sv: "Huvudstäder" },
    });
    expect(withReleaseLanguages({ ...deck, title: { sv: "Mina huvudstäder", fi: "Pääkaupungit" } }, release2)).toBeNull();
    expect(withReleaseLanguages({ ...deck, title: { fi: "Pääkaupungit" } }, release2)).toBeNull();
  });
});

describe("the app's default description in an upgrade", () => {
  const capitals = (version: number, description: LibraryDeckContent["description"]): LibraryDeckContent => ({
    ...release(version, []),
    title: { en: "Capitals of the world", sv: "Världens huvudstäder" },
    description,
  });
  const latest = { en: "Every country and its capital city, in English and Swedish.", sv: "Varje land och dess huvudstad, på engelska och svenska." };
  const defaulted: Deck = { ...deck, title: { en: "Capitals of the world" }, description: { en: "Flashcards: Capitals of the world." } };

  it("gives way to the release's description, whether or not the release changed it", () => {
    const from = capitals(1, { en: "Every country and its capital city." });
    expect(planLibraryUpgrade({ deck: defaulted, cards: [], from, to: capitals(2, latest), releases })?.description).toEqual(latest);
    expect(planLibraryUpgrade({ deck: defaulted, cards: [], from: capitals(1, latest), to: capitals(2, latest), releases })?.description).toEqual(latest);
    const swedishToo = { ...defaulted, description: { en: "Flashcards: Capitals of the world.", sv: "Kortlek: Capitals of the world." } };
    expect(planLibraryUpgrade({ deck: swedishToo, cards: [], from, to: capitals(2, latest), releases })?.description).toEqual(latest);
    expect(planLibraryUpgrade({ deck: defaulted, cards: [], from, to: capitals(2, undefined), releases })).not.toHaveProperty("description");
  });

  it("is replaced on a copy upgraded before, by its own release's description", () => {
    expect(withReleaseLanguages(defaulted, capitals(2, latest))?.description).toEqual(latest);
    const done = { ...defaulted, title: { en: "Capitals of the world", sv: "Världens huvudstäder" }, description: latest };
    expect(withReleaseLanguages(done, capitals(2, latest))).toBeNull();
    const plain = { ...done, description: { en: "Flashcards: Capitals of the world." } };
    expect(withReleaseLanguages(plain, capitals(2, { en: "Flashcards: Capitals of the world." }))).toBeNull();
  });

  it("is told from a description the user wrote, even one like it", () => {
    const mine = { ...defaulted, description: { en: "Flashcards: Capitals of the world.", sv: "Mina huvudstäder." } };
    expect(withReleaseLanguages(mine, capitals(2, latest))).toMatchObject({ description: mine.description });
  });
});
