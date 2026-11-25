// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { EU_LANGUAGES } from "@solid-memo/vocab/concepts.generated";
import { languageTagOf } from "./euLanguages";

const LANGUAGE = "http://publications.europa.eu/resource/authority/language/";

describe("languageTagOf", () => {
  it("gives every language of the reference data a tag of its own", () => {
    const tags = EU_LANGUAGES.map((concept) => languageTagOf(concept.iri));
    for (const [index, tag] of tags.entries()) {
      expect(tag, EU_LANGUAGES[index]!.code).toMatch(/^[a-z]{2}$/);
    }
    expect(new Set(tags).size).toBe(EU_LANGUAGES.length);
  });

  it("tags the table's languages by their two-letter codes", () => {
    expect(languageTagOf(`${LANGUAGE}ENG`)).toBe("en");
    expect(languageTagOf(`${LANGUAGE}KOR`)).toBe("ko");
  });

  it("has no tag for an IRI the reference data does not describe", () => {
    expect(languageTagOf(`${LANGUAGE}NOR`)).toBeUndefined();
    expect(languageTagOf("https://example.org/swedish")).toBeUndefined();
  });
});
