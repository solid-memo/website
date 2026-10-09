import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES } from "../../preferences";
import { LATEST_VERSION, type ShapeName } from "@solid-memo/vocab/types.generated";
import { MIGRATIONS, migrate, stepFor } from "./index";

const CONTEXT = { subject: "https://pod.example/x.ttl#it" };
const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";
const EDUC = "http://publications.europa.eu/resource/authority/data-theme/EDUC";
/** The concept-valued fields of migrated preferences: the policy that blocks, the browser's theme. */
const MIGRATED_CONCEPTS = { invalidDataPolicy: `${SM}blockSubject`, theme: `${SM}systemTheme` };

const SHAPES = Object.keys(LATEST_VERSION) as ShapeName[];

describe("the migration chain", () => {
  it("has exactly one step between every pair of consecutive versions, and none beyond", () => {
    for (const shape of SHAPES) {
      const steps = MIGRATIONS.filter((step) => step.shape === shape);
      expect(steps.map((step) => [step.from, step.to]), shape).toEqual(
        Array.from({ length: LATEST_VERSION[shape] - 1 }, (_, i) => [i + 1, i + 2]),
      );
    }
    expect(MIGRATIONS.every((step) => SHAPES.includes(step.shape))).toBe(true);
  });

  it("never mutates its input", () => {
    for (const step of MIGRATIONS) {
      const input = Object.freeze({
        front: "a",
        back: "b",
        title: "t",
        creator: Object.freeze(["Anton"]),
        source: Object.freeze([]),
        direction: "front-to-back",
        easeFactor: 1,
      });
      expect(() => step.up(input, CONTEXT)).not.toThrow();
    }
  });

  it("names a gap in the chain", () => {
    expect(() => stepFor("instance", 2)).toThrow("No migration from instance format 2.");
  });
});

describe("migrate", () => {
  it("returns a latest record untouched", () => {
    const data = { front: { en: "Sweden" }, back: { "": "Stockholm" }, distractor: [] };
    expect(migrate("card", { version: 5, data }, CONTEXT)).toBe(data);
  });

  it("restamps a format-4 deck and card, changing nothing but the deck's keywords' form: no language guessed, stand-ins and untagged sides kept", () => {
    const card = { front: { "": "Sweden" }, back: { en: "Stockholm", sv: "Stockholm" }, backNote: { en: "Huvudstad.", sv: "Huvudstad." } };
    expect(migrate("card", { version: 4, data: card }, CONTEXT)).toEqual({ ...card, distractor: [] });
    const deck = {
      title: { en: "Japanska glosor", sv: "Japanska glosor" },
      description: { en: "Flashcards: Japanska glosor.", sv: "Kortlek: Japanska glosor." },
      creator: [],
      studyDirection: `${SM}frontToBack` as const,
      theme: [],
      keyword: [],
      distribution: [],
      cardsDocument: "d",
      reviewsDocument: "r",
    };
    expect(migrate("deck", { version: 4, data: deck }, CONTEXT)).toEqual({ ...deck, keyword: {} });
  });

  it("keeps a deck's, a release's and a series' keywords untagged, their language unknown: no language guessed", () => {
    const keyword = ["capitals", "huvudstäder"];
    const deck = { title: { sv: "Huvudstäder" }, description: { sv: "Kortlek." }, creator: [], studyDirection: `${SM}frontToBack` as const, theme: [], keyword, distribution: [], cardsDocument: "d", reviewsDocument: "r" };
    expect(migrate("deck", { version: 5, data: deck }, CONTEXT)).toEqual({ ...deck, keyword: { "": keyword } });
    const release = {
      title: { en: "Capitals" },
      description: { en: "Capitals." },
      creator: [],
      publisher: "p",
      studyDirection: `${SM}frontToBack` as const,
      theme: [EDUC],
      keyword,
      language: [],
      version: "2",
      inSeries: "s",
      isVersionOf: "s",
      distribution: [],
      wasDerivedFrom: [],
    };
    expect(migrate("libraryDeck", { version: 4, data: release }, CONTEXT)).toEqual({ ...release, keyword: { "": keyword } });
    const series = { title: { en: "L" }, description: { en: "C." }, publisher: "p", theme: [], keyword, first: "a", last: "b", hasVersion: ["a", "b"], hasCurrentVersion: "b" };
    expect(migrate("libraryDeckSeries", { version: 2, data: series }, CONTEXT)).toEqual({ ...series, keyword: { "": keyword } });
  });

  it("brings the library's kinds to the formats whose keywords state their language", () => {
    expect(LATEST_VERSION.libraryDeck).toBe(5);
    expect(LATEST_VERSION.libraryDeckSeries).toBe(3);
  });

  it("walks a record up to the latest version", () => {
    expect(migrate("card", { version: 1, data: { front: "Sweden", back: "Stockholm" } }, CONTEXT)).toEqual({
      front: { "": "Sweden" },
      back: { "": "Stockholm" },
      distractor: [],
    });
    expect(migrate("card", { version: 3, data: { frontImage: "https://flagcdn.com/se.svg", back: "Sweden" } }, CONTEXT)).toEqual({
      frontImage: "https://flagcdn.com/se.svg",
      back: { "": "Sweden" },
      distractor: [],
    });
    expect(migrate("card", { version: 3, data: { front: "Sweden", backImage: "https://flagcdn.com/se.svg" } }, CONTEXT)).toEqual({
      front: { "": "Sweden" },
      backImage: "https://flagcdn.com/se.svg",
      distractor: [],
    });
    const deck = { title: "Own", creator: ["Anton"], cardsDocument: "d", reviewsDocument: "r" };
    expect(migrate("deck", { version: 1, data: deck }, CONTEXT)).toEqual({
      title: { en: "Own" },
      description: { en: "Flashcards: Own.", sv: "Kortlek: Own." },
      creator: ["https://pod.example/x.ttl#agent-anton"],
      studyDirection: `${SM}frontToBack`,
      theme: [],
      keyword: {},
      distribution: ["https://pod.example/x.ttl#it-cards"],
      cardsDocument: "d",
      reviewsDocument: "r",
    });
    expect(
      migrate(
        "deck",
        { version: 2, data: { ...deck, description: "Mine.", direction: "bidirectional", source: "https://solid-memo.com/decks/capitals/v1.ttl" } },
        CONTEXT,
      ),
    ).toMatchObject({
      description: { en: "Mine." },
      studyDirection: `${SM}bidirectional`,
      source: "https://solid-memo.com/decks/capitals/v1.ttl",
    });
    const LIBRARY = "https://solid-memo.com/decks/capitals/v1.ttl";
    expect(
      migrate(
        "libraryDeck",
        { version: 1, data: { title: "L", description: "Capitals.", creator: [], source: ["https://en.wikipedia.org/"] } },
        { subject: LIBRARY },
      ),
    ).toEqual({
      title: { en: "L" },
      description: { en: "Capitals." },
      creator: [],
      publisher: "https://solid-memo.com/decks/index.ttl#solid-memo",
      studyDirection: `${SM}frontToBack`,
      theme: [EDUC],
      keyword: {},
      language: [],
      version: "1",
      inSeries: "https://solid-memo.com/decks/index.ttl#capitals",
      isVersionOf: "https://solid-memo.com/decks/index.ttl#capitals",
      distribution: [`${LIBRARY}#turtle`],
      wasDerivedFrom: ["https://en.wikipedia.org/"],
    });
    expect(
      migrate("libraryDeck", { version: 2, data: { title: "L", creator: [], direction: "back-to-front", source: [] } }, { subject: LIBRARY }),
    ).toMatchObject({ description: { en: "Flashcards: L." }, studyDirection: `${SM}backToFront` });
    const series = { title: "L", description: "Capitals.", publisher: "p", theme: [], keyword: [], first: "a", last: "b", hasVersion: ["a", "b"], hasCurrentVersion: "b" };
    expect(migrate("libraryDeckSeries", { version: 1, data: series }, { subject: LIBRARY })).toEqual({
      ...series,
      title: { en: "L" },
      description: { en: "Capitals." },
      keyword: {},
    });
    const review = {
      easeFactor: 2.5,
      intervalDays: 1,
      repetitions: 1,
      due: "2026-09-22",
      firstReviewedAt: "2026-09-21T10:00:00.000Z",
      lastReviewedAt: "2026-09-21T10:00:00.000Z",
    };
    expect(migrate("reviewState", { version: 1, data: review }, CONTEXT)).toEqual(review);
    const snapshot = {
      previousEaseFactor: 2.4,
      previousIntervalDays: 1,
      previousRepetitions: 1,
      previousDue: "2026-09-21",
      previousLastReviewedAt: "2026-09-20T10:00:00.000Z",
    };
    expect(migrate("reviewState", { version: 1, data: { ...review, ...snapshot } }, CONTEXT)).toEqual({
      ...review,
      ...snapshot,
    });
    expect(
      migrate("reviewState", { version: 1, data: { ...review, previousDue: "2026-09-21" } }, CONTEXT),
    ).toEqual(review);
    expect(migrate("preferences", { version: 1, data: { newCardsPerDay: 5 } }, CONTEXT)).toEqual({
      ...DEFAULT_PREFERENCES,
      ...MIGRATED_CONCEPTS,
      newCardsPerDay: 5,
    });
    expect(migrate("preferences", { version: 1, data: { answerScale: "minimal", developerMode: true } }, CONTEXT)).toEqual({
      ...DEFAULT_PREFERENCES,
      ...MIGRATED_CONCEPTS,
      // A format-1 document without the field meant the default of its day.
      newCardsPerDay: 20,
      answerScale: "minimal",
      developerMode: true,
    });
  });
});
