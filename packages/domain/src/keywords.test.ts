import { describe, expect, it } from "vitest";
import {
  allKeywords,
  copyKeywords,
  keywordsIn,
  noKeywords,
  sameKeywords,
  tidiedKeywords,
  untaggedKeywords,
} from "./keywords";

const KEYWORDS = {
  en: ["capitals", "countries"],
  sv: ["huvudstäder", "länder"],
  "sv-fi": ["huvudstäder", "städer"],
  "": ["legacy"],
  zxx: ["ISO 3166"],
  de: ["Hauptstädte"],
};

describe("keywordsIn", () => {
  it("shows the keywords of every tag of the language, and those in no stated language, each once in stored order", () => {
    expect(keywordsIn(KEYWORDS, "sv")).toEqual([
      "huvudstäder",
      "länder",
      "städer",
      "legacy",
      "ISO 3166",
    ]);
    expect(keywordsIn(KEYWORDS, "en")).toEqual(["capitals", "countries", "legacy", "ISO 3166"]);
    expect(keywordsIn(KEYWORDS, "SV-se")).toEqual(keywordsIn(KEYWORDS, "sv"));
  });

  it("shows nothing in another language, with no fallback", () => {
    expect(keywordsIn({ en: ["capitals"] }, "sv")).toEqual([]);
    expect(keywordsIn({ "en-gb": ["capitals"] }, "en")).toEqual(["capitals"]);
    expect(keywordsIn(undefined, "en")).toEqual([]);
  });
});

describe("allKeywords", () => {
  it("lists every keyword in every language once, for search", () => {
    expect(allKeywords(KEYWORDS)).toEqual([
      "capitals",
      "countries",
      "huvudstäder",
      "länder",
      "städer",
      "legacy",
      "ISO 3166",
      "Hauptstädte",
    ]);
    expect(allKeywords(undefined)).toEqual([]);
  });
});

describe("noKeywords", () => {
  it("holds absent keywords and empty lists for none", () => {
    expect(noKeywords(undefined)).toBe(true);
    expect(noKeywords({})).toBe(true);
    expect(noKeywords({ en: [] })).toBe(true);
    expect(noKeywords({ en: [], sv: ["x"] })).toBe(false);
  });
});

describe("copyKeywords", () => {
  it("copies every language's list", () => {
    const list = ["capitals"];
    const copy = copyKeywords({ en: list });
    expect(copy).toEqual({ en: ["capitals"] });
    expect(copy.en).not.toBe(list);
    expect(copyKeywords(undefined)).toEqual({});
  });
});

describe("sameKeywords", () => {
  it("compares language by language, in any order", () => {
    expect(sameKeywords({ en: ["a", "b"], sv: ["c"] }, { sv: ["c"], en: ["b", "a"] })).toBe(true);
    expect(sameKeywords({ en: ["a"] }, { sv: ["a"] })).toBe(false);
    expect(sameKeywords({ en: ["a"] }, { en: ["a", "b"] })).toBe(false);
    expect(sameKeywords({ en: ["a", "b"] }, { en: ["a", "c"] })).toBe(false);
    expect(sameKeywords({ "": ["a"] }, { en: ["a"] })).toBe(false);
    expect(sameKeywords({ en: ["a"] }, { en: ["a"], sv: ["b"] })).toBe(false);
  });

  it("takes absent keywords and empty languages for none", () => {
    expect(sameKeywords(undefined, {})).toBe(true);
    expect(sameKeywords({ en: [] }, undefined)).toBe(true);
    expect(sameKeywords({ en: ["a"], sv: [] }, { en: ["a"] })).toBe(true);
    expect(sameKeywords(undefined, { en: ["a"] })).toBe(false);
  });
});

describe("tidiedKeywords", () => {
  it("trims, drops empty and repeated keywords and empty languages, lower-cases tags", () => {
    expect(
      tidiedKeywords(
        { EN: [" capitals ", "", "capitals", "countries"], sv: [" "], "SV-fi": ["städer"] },
        undefined,
      ),
    ).toEqual({
      en: ["capitals", "countries"],
      "sv-fi": ["städer"],
    });
  });

  it("merges two tags that differ only in case", () => {
    expect(tidiedKeywords({ sv: ["a", "b"], SV: ["b", "c"] }, undefined)).toEqual({
      sv: ["a", "b", "c"],
    });
  });

  it("keeps untagged keywords only as saved, some of them removed", () => {
    const saved = { "": ["capitals", "huvudstäder"] };
    expect(tidiedKeywords({ "": ["capitals", "huvudstäder"], en: ["countries"] }, saved)).toEqual({
      "": ["capitals", "huvudstäder"],
      en: ["countries"],
    });
    expect(tidiedKeywords({ "": ["huvudstäder"] }, saved)).toEqual({ "": ["huvudstäder"] });
    expect(tidiedKeywords({ "": [] }, saved)).toEqual({});
  });

  it("asks for the language of new untagged keywords", () => {
    expect(() => tidiedKeywords({ "": ["capitals", "new"] }, { "": ["capitals"] })).toThrow(
      "Choose the language of the keywords.",
    );
    expect(() => tidiedKeywords({ "": ["new"] }, undefined)).toThrow(
      "Choose the language of the keywords.",
    );
  });
});

describe("untaggedKeywords", () => {
  it("keeps an older format's keywords untagged, guessing no language", () => {
    expect(untaggedKeywords(["capitals", "huvudstäder"])).toEqual({
      "": ["capitals", "huvudstäder"],
    });
    expect(untaggedKeywords([])).toEqual({});
    expect(untaggedKeywords(undefined)).toEqual({});
  });
});
