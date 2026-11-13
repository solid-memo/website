// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  buildThing,
  createThing,
  getBoolean,
  getInteger,
  getStringNoLocale,
  getUrl,
} from "../client/rdf";
import { toPreferences, toPreferencesThing } from "./preferencesMapper";
import { RDF, SM } from "../vocab";
import { decimalLiteral, integerLiteral } from "../testing/literals";

const SUBJECT = "https://pod.example/solid-memo/a/preferences.ttl#it";

const FULL = {
  newCardsPerDay: 10,
  maxReviewsPerDay: 50,
  dayBoundaryHour: 2,
  answerScale: "minimal" as const,
  developerMode: true,
  invalidDataPolicy: "block-subject" as const,
  theme: "system" as const,
  scheduler: "sm2" as const,
  desiredRetention: 0.9,
  schedulerInvitationDismissed: false,
  palette: SM.standardPalette,
  textSize: "default" as const,
};

describe("toPreferences", () => {
  it("maps a format-2 document with its version", () => {
    const thing = buildThing(createThing({ url: SUBJECT }))
      .addIri(RDF.type, SM.Preferences)
      .addLiteral(SM.formatVersion, integerLiteral(2))
      .addLiteral(SM.newCardsPerDay, integerLiteral(10))
      .addLiteral(SM.maxReviewsPerDay, integerLiteral(50))
      .addLiteral(SM.dayBoundaryHour, integerLiteral(2))
      .addStringNoLocale(SM.answerScale, "minimal")
      .addBoolean(SM.developerMode, true)
      .build();
    expect(toPreferences(thing)).toEqual({
      preferences: FULL,
      formatVersion: 2,
    });
  });

  it("fills a format-1 document's missing fields with defaults", () => {
    const thing = buildThing(createThing({ url: SUBJECT }))
      .addIri(RDF.type, SM.Preferences)
      .addLiteral(SM.newCardsPerDay, integerLiteral(10))
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
        scheduler: "sm2" as const,
        desiredRetention: 0.9,
        schedulerInvitationDismissed: false,
        palette: SM.standardPalette,
        textSize: "default" as const,
      },
      formatVersion: 1,
    });
    const empty = buildThing(createThing({ url: SUBJECT }))
      .addIri(RDF.type, SM.Preferences)
      .build();
    expect(toPreferences(empty)?.preferences).toEqual({
      newCardsPerDay: 20,
      maxReviewsPerDay: 200,
      dayBoundaryHour: 4,
      answerScale: "sm2",
      developerMode: false,
      invalidDataPolicy: "block-subject" as const,
      theme: "system" as const,
      scheduler: "sm2" as const,
      desiredRetention: 0.9,
      schedulerInvitationDismissed: false,
      palette: SM.standardPalette,
      textSize: "default" as const,
    });
  });

  it("reads a desired retention outside the shape's range as the default", () => {
    const stored = (desiredRetention: number) =>
      buildThing(toPreferencesThing(SUBJECT, { ...FULL, scheduler: "fsrs6" }, null))
        .removeAll(SM.desiredRetention)
        .addLiteral(SM.desiredRetention, decimalLiteral(desiredRetention))
        .build();
    expect(toPreferences(stored(-1))?.preferences.desiredRetention).toBe(0.9);
    expect(toPreferences(stored(2))?.preferences.desiredRetention).toBe(0.9);
    expect(toPreferences(stored(0.75))?.preferences.desiredRetention).toBe(0.75);
  });

  it("is null for a format-2 document missing a field, or a subject of another class", () => {
    const partial = buildThing(createThing({ url: SUBJECT }))
      .addIri(RDF.type, SM.Preferences)
      .addLiteral(SM.formatVersion, integerLiteral(2))
      .addLiteral(SM.newCardsPerDay, integerLiteral(10))
      .build();
    expect(toPreferences(partial)).toBeNull();
    const card = buildThing(createThing({ url: SUBJECT }))
      .addIri(RDF.type, SM.Card)
      .build();
    expect(toPreferences(card)).toBeNull();
  });

  it("is null for an older format holding a value only a later one has, or a version not an integer", () => {
    const format2 = () =>
      buildThing(createThing({ url: SUBJECT }))
        .addIri(RDF.type, SM.Preferences)
        .addLiteral(SM.newCardsPerDay, integerLiteral(10))
        .addLiteral(SM.maxReviewsPerDay, integerLiteral(50))
        .addLiteral(SM.dayBoundaryHour, integerLiteral(2))
        .addStringNoLocale(SM.answerScale, "minimal")
        .addBoolean(SM.developerMode, true);
    expect(
      toPreferences(format2().addLiteral(SM.formatVersion, integerLiteral(2)).build()),
    ).not.toBeNull();
    expect(
      toPreferences(
        format2()
          .addLiteral(SM.formatVersion, integerLiteral(2))
          .addIri(SM.studyScheduler, SM.fsrs6)
          .build(),
      ),
    ).toBeNull();
    expect(toPreferences(format2().addIri(SM.textSize, SM.largeTextSize).build())).toBeNull();
    expect(toPreferences(format2().addStringNoLocale(SM.formatVersion, "2").build())).toBeNull();
  });
});

describe("toPreferencesThing", () => {
  it("writes the current format, in place when the subject exists", () => {
    const fresh = toPreferencesThing(SUBJECT, FULL, null);
    expect(getInteger(fresh, SM.formatVersion)).toBe(6);
    expect(toPreferences(fresh)).toEqual({
      preferences: FULL,
      formatVersion: 6,
    });
    const existing = buildThing(createThing({ url: SUBJECT }))
      .addLiteral(SM.newCardsPerDay, integerLiteral(99))
      .addStringNoLocale("https://other.example/#note", "kept")
      .build();
    const rewritten = toPreferencesThing(SUBJECT, FULL, existing);
    expect(getInteger(rewritten, SM.newCardsPerDay)).toBe(10);
    expect(getStringNoLocale(rewritten, "https://other.example/#note")).toBe("kept");
  });

  it("keeps whether logging in skips the Connected screen, which no shape owns", () => {
    const stored = buildThing(toPreferencesThing(SUBJECT, FULL, null))
      .addBoolean(SM.connectedScreenSkipped, true)
      .build();
    const rewritten = toPreferencesThing(SUBJECT, { ...FULL, newCardsPerDay: 3 }, stored);
    expect(getBoolean(rewritten, SM.connectedScreenSkipped)).toBe(true);
  });

  it("writes a palette this version does not know as it was read", () => {
    const own = "https://pod.example/solid-memo/a/palettes.ttl#mine";
    const thing = toPreferencesThing(SUBJECT, { ...FULL, palette: own, textSize: "larger" }, null);
    expect(getUrl(thing, SM.palette)).toBe(own);
    expect(getUrl(thing, SM.textSize)).toBe(SM.largerTextSize);
    expect(toPreferences(thing)?.preferences).toEqual({
      ...FULL,
      palette: own,
      textSize: "larger",
    });
  });
});
