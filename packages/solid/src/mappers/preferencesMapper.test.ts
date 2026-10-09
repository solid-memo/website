import { describe, expect, it } from "vitest";
import { buildThing, createThing, getInteger, getStringNoLocale } from "@inrupt/solid-client";
import { toPreferences, toPreferencesThing } from "./preferencesMapper";
import { RDF, SM } from "../vocab";

const SUBJECT = "https://pod.example/solid-memo/a/preferences.ttl#it";

const FULL = {
  newCardsPerDay: 10,
  maxReviewsPerDay: 50,
  dayBoundaryHour: 2,
  answerScale: "minimal" as const,
  developerMode: true,
  invalidDataPolicy: "block-subject" as const,
  theme: "system" as const,
};

describe("toPreferences", () => {
  it("maps a format-2 document with its version", () => {
    const thing = buildThing(createThing({ url: SUBJECT }))
      .addIri(RDF.type, SM.Preferences)
      .addInteger(SM.formatVersion, 2)
      .addInteger(SM.newCardsPerDay, 10)
      .addInteger(SM.maxReviewsPerDay, 50)
      .addInteger(SM.dayBoundaryHour, 2)
      .addStringNoLocale(SM.answerScale, "minimal")
      .addBoolean(SM.developerMode, true)
      .build();
    expect(toPreferences(thing)).toEqual({ preferences: FULL, formatVersion: 2 });
  });

  it("fills a format-1 document's missing fields with defaults", () => {
    const thing = buildThing(createThing({ url: SUBJECT }))
      .addIri(RDF.type, SM.Preferences)
      .addInteger(SM.newCardsPerDay, 10)
      .addStringNoLocale(SM.answerScale, "emoji")
      .build();
    expect(toPreferences(thing)).toEqual({
      preferences: {
        newCardsPerDay: 10,
        maxReviewsPerDay: 200,
        dayBoundaryHour: 4,
        answerScale: "sm2",
        developerMode: false,
        invalidDataPolicy: "block-subject" as const,
        theme: "system" as const,
      },
      formatVersion: 1,
    });
    const empty = buildThing(createThing({ url: SUBJECT })).addIri(RDF.type, SM.Preferences).build();
    expect(toPreferences(empty)?.preferences).toEqual({
      newCardsPerDay: 20,
      maxReviewsPerDay: 200,
      dayBoundaryHour: 4,
      answerScale: "sm2",
      developerMode: false,
      invalidDataPolicy: "block-subject" as const,
      theme: "system" as const,
    });
  });

  it("is null for a format-2 document missing a field, or a subject of another class", () => {
    const partial = buildThing(createThing({ url: SUBJECT }))
      .addIri(RDF.type, SM.Preferences)
      .addInteger(SM.formatVersion, 2)
      .addInteger(SM.newCardsPerDay, 10)
      .build();
    expect(toPreferences(partial)).toBeNull();
    const card = buildThing(createThing({ url: SUBJECT })).addIri(RDF.type, SM.Card).build();
    expect(toPreferences(card)).toBeNull();
  });
});

describe("toPreferencesThing", () => {
  it("writes the current format, in place when the subject exists", () => {
    const fresh = toPreferencesThing(SUBJECT, FULL, null);
    expect(getInteger(fresh, SM.formatVersion)).toBe(4);
    expect(toPreferences(fresh)).toEqual({ preferences: FULL, formatVersion: 4 });
    const existing = buildThing(createThing({ url: SUBJECT }))
      .addInteger(SM.newCardsPerDay, 99)
      .addStringNoLocale("https://other.example/#note", "kept")
      .build();
    const rewritten = toPreferencesThing(SUBJECT, FULL, existing);
    expect(getInteger(rewritten, SM.newCardsPerDay)).toBe(10);
    expect(getStringNoLocale(rewritten, "https://other.example/#note")).toBe("kept");
  });
});
