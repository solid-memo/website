// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  defaultDeckDescription,
  defaultDeckDescriptionText,
  defaultDeckGroupDescription,
  descriptionInFormat4,
  isDefaultDeckDescription,
  isDefaultDeckGroupDescription,
} from "./dcat";
import { HASHED_CHARACTERS } from "./pathKeys";

describe("a deck's default description", () => {
  it("is English before format 4", () => {
    expect(defaultDeckDescription("Capitals")).toBe("Flashcards: Capitals.");
  });

  it("is English and Swedish in format 4, naming the deck by its Swedish title when it has one", () => {
    expect(defaultDeckDescriptionText({ en: "Capitals", sv: "Huvudstäder" })).toEqual({
      en: "Flashcards: Capitals.",
      sv: "Kortlek: Huvudstäder.",
    });
    expect(defaultDeckDescriptionText({ en: "Capitals" })).toEqual({
      en: "Flashcards: Capitals.",
      sv: "Kortlek: Capitals.",
    });
    expect(defaultDeckDescriptionText({ de: "Hauptstädte" })).toEqual({
      en: "Flashcards: Hauptstädte.",
      sv: "Kortlek: Hauptstädte.",
    });
  });

  it("is stated in Swedish too when a format-3 deck moves to format 4, any other description in English", () => {
    expect(descriptionInFormat4("Flashcards: Capitals.", "Capitals")).toEqual({
      en: "Flashcards: Capitals.",
      sv: "Kortlek: Capitals.",
    });
    expect(descriptionInFormat4("Every capital.", "Capitals")).toEqual({ en: "Every capital." });
  });

  it("names a format-5 deck titled in no English by the title it has", () => {
    expect(defaultDeckDescriptionText({ sv: "Huvudstäder" })).toEqual({
      en: "Flashcards: Huvudstäder.",
      sv: "Kortlek: Huvudstäder.",
    });
    expect(defaultDeckDescriptionText({ ja: "日本語の単語" })).toEqual({
      en: "Flashcards: 日本語の単語.",
      sv: "Kortlek: 日本語の単語.",
    });
  });
});

describe("a deck's default description for a title as long as a term (GHSA-87vh-m93g-54f6)", () => {
  // A text tagged with a two-letter language, as a term's longest name has it: in quotes, `@en` after it.
  const ROOM = 5;
  const loneSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

  it("cuts the title short, an ellipsis after it, so that the text is no longer than a term may be", () => {
    const title = "T".repeat(16_370);
    const { en, sv } = defaultDeckDescriptionText({ en: title });
    expect(en).toHaveLength(HASHED_CHARACTERS - ROOM);
    expect(en).toMatch(/^Flashcards: T+…\.$/);
    expect(sv).toHaveLength(HASHED_CHARACTERS - ROOM);
    expect(sv).toMatch(/^Kortlek: T+…\.$/);
    expect(defaultDeckDescription(title)).toBe(en);
  });

  it("keeps a title that just fits whole", () => {
    const title = "T".repeat(HASHED_CHARACTERS - ROOM - "Flashcards: .".length);
    expect(defaultDeckDescription(title)).toBe(`Flashcards: ${title}.`);
    expect(defaultDeckDescription(`${title}T`)).toMatch(/…\.$/);
  });

  it("counts a character a term's name escapes as two", () => {
    const en = defaultDeckDescription('"'.repeat(9_000));
    const quotes = en.length - "Flashcards: ….".length;
    expect(quotes).toBe(Math.floor((HASHED_CHARACTERS - ROOM - "Flashcards: ….".length) / 2));
  });

  it("cuts at a code point, never between the halves of a surrogate pair", () => {
    const en = defaultDeckDescription(`a${"😀".repeat(8_190)}`);
    expect(en).toMatch(/…\.$/);
    expect(loneSurrogate.test(en)).toBe(false);
    expect(en.length).toBeLessThanOrEqual(HASHED_CHARACTERS - ROOM);
  });

  it("is still known as the default, and moves to format 4 as one", () => {
    const title = "T".repeat(16_370);
    const description = defaultDeckDescription(title);
    expect(isDefaultDeckDescription({ en: description }, [{ en: title }])).toBe(true);
    expect(descriptionInFormat4(description, title)).toEqual(
      defaultDeckDescriptionText({ en: title }),
    );
  });

  it("knows the uncut default an older record holds, and moves it to format 4 as the cut one", () => {
    for (const length of [16_366, 16_367, 16_368]) {
      const title = "T".repeat(length);
      const whole = `Flashcards: ${title}.`;
      expect(defaultDeckDescription(title)).not.toBe(whole);
      expect(descriptionInFormat4(whole, title)).toEqual(defaultDeckDescriptionText({ en: title }));
      expect(isDefaultDeckDescription({ en: whole }, [{ en: title }])).toBe(true);
    }
  });
});

describe("isDefaultDeckDescription", () => {
  it("knows the default in English, with or without its Swedish, for any of the deck's titles", () => {
    const titles = [{ en: "Capitals of the world" }, { en: "Capitals" }];
    expect(isDefaultDeckDescription({ en: "Flashcards: Capitals." }, titles)).toBe(true);
    expect(
      isDefaultDeckDescription(
        { en: "Flashcards: Capitals of the world.", sv: "Kortlek: Capitals of the world." },
        titles,
      ),
    ).toBe(true);
    expect(
      isDefaultDeckDescription({ en: "Flashcards: Capitals.", sv: "Mina huvudstäder." }, titles),
    ).toBe(false);
    expect(isDefaultDeckDescription({ en: "Every capital." }, titles)).toBe(false);
    expect(
      isDefaultDeckDescription({ en: "Flashcards: Hauptstädte.", de: "Karten" }, [
        { de: "Hauptstädte" },
      ]),
    ).toBe(false);
  });

  it("knows the default of a deck titled in no English", () => {
    expect(
      isDefaultDeckDescription({ en: "Flashcards: Huvudstäder.", sv: "Kortlek: Huvudstäder." }, [
        { sv: "Huvudstäder" },
      ]),
    ).toBe(true);
    expect(
      isDefaultDeckDescription({ en: "Flashcards: 日本語の単語.", sv: "Kortlek: 日本語の単語." }, [
        { ja: "日本語の単語" },
      ]),
    ).toBe(true);
    expect(
      isDefaultDeckDescription({ en: "Flashcards: 日本語の単語.", sv: "Kortlek: 日本語の単語." }, [
        { ja: "日本語" },
      ]),
    ).toBe(false);
  });

  it("stays in sync when the user retags the title the default was written for", () => {
    // Written for a Japanese title the step to format 4 tagged English.
    const description = defaultDeckDescriptionText({ en: "日本語の単語" });
    expect(isDefaultDeckDescription(description, [{ ja: "日本語の単語" }])).toBe(true);
    // A Swedish title retagged German: the default named the deck by it, so it
    // is known by the title it was written for (a release's, say), not the new.
    const capitals = defaultDeckDescriptionText({ en: "Capitals", sv: "Huvudstäder" });
    const retagged = { en: "Capitals", de: "Huvudstäder" };
    expect(isDefaultDeckDescription(capitals, [retagged])).toBe(false);
    expect(
      isDefaultDeckDescription(capitals, [retagged, { en: "Capitals", sv: "Huvudstäder" }]),
    ).toBe(true);
  });
});

describe("a deck group's default description", () => {
  it("is English and Swedish, naming the group by its Swedish name when it has one", () => {
    expect(defaultDeckGroupDescription({ en: "Languages" })).toEqual({
      en: "Deck group: Languages.",
      sv: "Kortleksgrupp: Languages.",
    });
    expect(defaultDeckGroupDescription({ sv: "Språk" })).toEqual({
      en: "Deck group: Språk.",
      sv: "Kortleksgrupp: Språk.",
    });
    expect(defaultDeckGroupDescription({ en: "Languages", sv: "Språk" })).toEqual({
      en: "Deck group: Languages.",
      sv: "Kortleksgrupp: Språk.",
    });
  });

  it("is known as the default for the group's name, with or without its Swedish, and nothing else is", () => {
    const title = { sv: "Språk" };
    expect(
      isDefaultDeckGroupDescription(
        { en: "Deck group: Språk.", sv: "Kortleksgrupp: Språk." },
        title,
      ),
    ).toBe(true);
    expect(isDefaultDeckGroupDescription({ en: "Deck group: Språk." }, title)).toBe(true);
    expect(
      isDefaultDeckGroupDescription({ en: "Deck group: Språk.", sv: "Mina språk." }, title),
    ).toBe(false);
    expect(isDefaultDeckGroupDescription({ en: "Deck group: Languages." }, title)).toBe(false);
    expect(isDefaultDeckGroupDescription({ sv: "Kortleksgrupp: Språk." }, title)).toBe(false);
  });
});
