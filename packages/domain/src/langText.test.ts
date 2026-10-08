import { describe, expect, it } from "vitest";
import {
  english,
  inEnglish,
  sameText,
  shown,
  shownTag,
  tidiedSideText,
  tidiedStated,
  tidiedTagged,
  usualTag,
} from "./langText";

describe("text in several languages", () => {
  it("finds the English text, a regional English when there is no plain one", () => {
    expect(english({ sv: "Huvudstäder", en: "Capitals" })).toBe("Capitals");
    expect(english({ "en-gb": "Capitals", "en-us": "Capitals (US)" })).toBe("Capitals");
    expect(english({ sv: "Huvudstäder" })).toBeUndefined();
  });

  it("shows the English text, else the first language's", () => {
    expect(shown({ sv: "Huvudstäder", en: "Capitals" })).toBe("Capitals");
    expect(shown({ sv: "Huvudstäder", de: "Hauptstädte" })).toBe("Hauptstädte");
    expect(shown({})).toBe("");
  });

  it("shows the text in the first preferred language it is in", () => {
    const text = { en: "Capitals", sv: "Huvudstäder", "pt-br": "Capitais" };
    expect(shown(text, ["fi", "sv", "en"])).toBe("Huvudstäder");
    expect(shown(text, ["fi"])).toBe("Capitals");
  });

  it("matches a preferred language with or without its region", () => {
    expect(shown({ en: "Capitals", sv: "Huvudstäder" }, ["sv-SE"])).toBe("Huvudstäder");
    expect(shown({ en: "Capitals", "pt-br": "Capitais" }, ["pt"])).toBe("Capitais");
    expect(shown({ "en-gb": "Colours", "en-us": "Colors" }, ["en-US"])).toBe("Colors");
  });

  it("names the language of the text it shows", () => {
    const text = { en: "Capitals", sv: "Huvudstäder", "pt-br": "Capitais" };
    expect(shownTag(text, ["sv-SE"])).toBe("sv");
    expect(shownTag(text, ["fi"])).toBe("en");
    expect(shownTag(text, ["pt"])).toBe("pt-br");
    expect(shownTag({ de: "Hauptstädte", sv: "Huvudstäder" })).toBe("de");
    expect(shownTag({ "": "en bil" }, ["sv"])).toBe("");
    expect(shownTag({})).toBeUndefined();
  });

  it("compares texts language by language", () => {
    expect(sameText({ en: "a", sv: "b" }, { sv: "b", en: "a" })).toBe(true);
    expect(sameText({ en: "a" }, { en: "a", sv: "b" })).toBe(false);
    expect(sameText({ en: "a", sv: "b" }, { en: "a", de: "b" })).toBe(false);
    expect(sameText(undefined, undefined)).toBe(true);
    expect(sameText({ en: "a" }, undefined)).toBe(false);
  });

  it("reads a format-3 deck's untagged text as English", () => {
    expect(inEnglish("Capitals")).toEqual({ en: "Capitals" });
  });
});

describe("a card side's text", () => {
  it("shows untagged text when it is in no language the reader prefers", () => {
    expect(shown({ "": "en bil" }, ["sv"])).toBe("en bil");
  });

  it("trims every language and leaves out an empty one, each language on its own", () => {
    expect(tidiedSideText({ en: " Mona Lisa ", sv: " " })).toEqual({ en: "Mona Lisa" });
    expect(tidiedSideText({ en: " ", sv: "Mona Lisa" })).toEqual({ sv: "Mona Lisa" });
    expect(tidiedSideText({ "": " en bil " })).toEqual({ "": "en bil" });
    expect(tidiedSideText({ "": "  " })).toEqual({});
    expect(tidiedSideText({})).toEqual({});
  });

  it("keeps the spaces a formatted text's first line starts with, losing only blank lines before and white space after", () => {
    expect(tidiedSideText({ en: " \n\t\r\n    code \n", sv: "\n " }, true)).toEqual({ en: "    code" });
    expect(tidiedTagged({ en: "  - item\n" }, true)).toEqual({ en: "  - item" });
    expect(tidiedTagged({ en: "  - item\n" })).toEqual({ en: "- item" });
  });
});

describe("language-tagged text that needs no English", () => {
  it("trims every language, leaves out an empty one, and is none when no text is left", () => {
    expect(tidiedTagged({ en: " A flag ", de: " " })).toEqual({ en: "A flag" });
    expect(tidiedTagged({ sv: " En flagga " })).toEqual({ sv: "En flagga" });
    expect(tidiedTagged({ en: " ", sv: "En flagga" })).toEqual({ sv: "En flagga" });
    expect(tidiedTagged({ en: " ", sv: "" })).toBeUndefined();
    expect(tidiedTagged({})).toBeUndefined();
    expect(tidiedTagged(undefined)).toBeUndefined();
  });

  it("keeps untagged text, for the card's validation to ask its language", () => {
    expect(tidiedTagged({ "": " Ädel " })).toEqual({ "": "Ädel" });
  });
});

describe("text whose languages the user states", () => {
  it("finds the tag the texts use most, untagged text stating none", () => {
    expect(usualTag([{ sv: "en bil" }, { sv: "ett hus", en: "a house" }, { en: "a tree" }, { sv: "en båt" }])).toBe("sv");
    expect(usualTag([{ fi: "auto" }, { "": "en bil" }, { "": "ett hus" }])).toBe("fi");
    expect(usualTag([{ ja: "犬" }, { de: "Hund" }])).toBe("ja");
    expect(usualTag([{ "": "en bil" }, {}])).toBeUndefined();
    expect(usualTag([])).toBeUndefined();
  });
});

describe("tidiedStated", () => {
  it("trims every language and leaves out an empty one, empty when none is left", () => {
    expect(tidiedStated({ sv: " Huvudstäder ", en: " " })).toEqual({ sv: "Huvudstäder" });
    expect(tidiedStated({ ja: " " })).toEqual({});
    expect(tidiedStated({ "": " ", fi: "Pääkaupungit" })).toEqual({ fi: "Pääkaupungit" });
  });

  it("refuses untagged text, which states no language", () => {
    expect(() => tidiedStated({ "": "Capitals" })).toThrow("cannot be untagged");
  });

  it("keeps tags lower case, refusing a language given twice", () => {
    expect(tidiedStated({ "pt-BR": " Capitais ", SV: "Huvudstäder" })).toEqual({ "pt-br": "Capitais", sv: "Huvudstäder" });
    // An emptied one is no language at all, so it does not clash.
    expect(tidiedStated({ EN: " ", en: "Capitals" })).toEqual({ en: "Capitals" });
    expect(() => tidiedStated({ EN: "Capitals", en: "Capitals" })).toThrow("has en twice");
  });
});
