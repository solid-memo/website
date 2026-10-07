import { describe, expect, it } from "vitest";
import {
  defaultDeckDescription,
  defaultDeckDescriptionText,
  defaultDeckGroupDescription,
  descriptionInFormat4,
  isDefaultDeckDescription,
  isDefaultDeckGroupDescription,
} from "./dcat";

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

describe("isDefaultDeckDescription", () => {
  it("knows the default in English, with or without its Swedish, for any of the deck's titles", () => {
    const titles = [{ en: "Capitals of the world" }, { en: "Capitals" }];
    expect(isDefaultDeckDescription({ en: "Flashcards: Capitals." }, titles)).toBe(true);
    expect(isDefaultDeckDescription({ en: "Flashcards: Capitals of the world.", sv: "Kortlek: Capitals of the world." }, titles)).toBe(true);
    expect(isDefaultDeckDescription({ en: "Flashcards: Capitals.", sv: "Mina huvudstäder." }, titles)).toBe(false);
    expect(isDefaultDeckDescription({ en: "Every capital." }, titles)).toBe(false);
    expect(isDefaultDeckDescription({ en: "Flashcards: Hauptstädte.", de: "Karten" }, [{ de: "Hauptstädte" }])).toBe(false);
  });

  it("knows the default of a deck titled in no English", () => {
    expect(isDefaultDeckDescription({ en: "Flashcards: Huvudstäder.", sv: "Kortlek: Huvudstäder." }, [{ sv: "Huvudstäder" }])).toBe(true);
    expect(isDefaultDeckDescription({ en: "Flashcards: 日本語の単語.", sv: "Kortlek: 日本語の単語." }, [{ ja: "日本語の単語" }])).toBe(true);
    expect(isDefaultDeckDescription({ en: "Flashcards: 日本語の単語.", sv: "Kortlek: 日本語の単語." }, [{ ja: "日本語" }])).toBe(false);
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
    expect(isDefaultDeckDescription(capitals, [retagged, { en: "Capitals", sv: "Huvudstäder" }])).toBe(true);
  });
});

describe("a deck group's default description", () => {
  it("is English and Swedish, naming the group by its Swedish name when it has one", () => {
    expect(defaultDeckGroupDescription({ en: "Languages" })).toEqual({
      en: "Deck group: Languages.",
      sv: "Kortleksgrupp: Languages.",
    });
    expect(defaultDeckGroupDescription({ sv: "Språk" })).toEqual({ en: "Deck group: Språk.", sv: "Kortleksgrupp: Språk." });
    expect(defaultDeckGroupDescription({ en: "Languages", sv: "Språk" })).toEqual({
      en: "Deck group: Languages.",
      sv: "Kortleksgrupp: Språk.",
    });
  });

  it("is known as the default for the group's name, with or without its Swedish, and nothing else is", () => {
    const title = { sv: "Språk" };
    expect(isDefaultDeckGroupDescription({ en: "Deck group: Språk.", sv: "Kortleksgrupp: Språk." }, title)).toBe(true);
    expect(isDefaultDeckGroupDescription({ en: "Deck group: Språk." }, title)).toBe(true);
    expect(isDefaultDeckGroupDescription({ en: "Deck group: Språk.", sv: "Mina språk." }, title)).toBe(false);
    expect(isDefaultDeckGroupDescription({ en: "Deck group: Languages." }, title)).toBe(false);
    expect(isDefaultDeckGroupDescription({ sv: "Kortleksgrupp: Språk." }, title)).toBe(false);
  });
});
