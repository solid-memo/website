// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, it } from "vitest";
import { LOCALES } from "../locale";
import { growth } from "../testing/growth";
import { at, card, iri, model, RELEASE, text } from "../testing/releaseModel";
import { curationProblems, LIBRARY_CONTACT, podPolicy, repoPolicy } from "./curationRules";

const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";
const EDUC = "http://publications.europa.eu/resource/authority/data-theme/EDUC";
const KIND = "http://www.w3.org/2006/vcard/ns#Kind";
const contact = (url: string, types = [KIND]) => ({
  point: iri(at("contact")),
  types,
  urls: [iri(url)],
});
/** Text in every language the app speaks, English as "en-gb" and the rest as `language`. */
const everyLanguage = (value: string) =>
  LOCALES.map((language) => text(value, language === "en" ? "en-gb" : language));
const curated = model({
  title: [text("Solid"), ...everyLanguage("Solid")],
  description: everyLanguage("About Solid."),
  keywords: [...everyLanguage("pods"), iri("https://example.com/keyword")],
  themes: [iri(EDUC)],
  contacts: [contact("https://example.com/other"), contact(LIBRARY_CONTACT)],
});

it("accepts a release the repository's policy asks nothing more of", () => {
  expect(curationProblems(curated, repoPolicy)).toEqual([]);
});

it("asks a title, a description and keywords in every language the app speaks", () => {
  expect(repoPolicy.titleLanguages).toEqual(LOCALES);
  expect(repoPolicy.descriptionLanguages).toEqual(LOCALES);
  expect(repoPolicy.keywordLanguages).toEqual(LOCALES);
});

it("names each language and theme the repository's policy asks and a release lacks", () => {
  const others = (value: string, lacking: string) =>
    everyLanguage(value).filter((term) => !term.language.startsWith(lacking));
  const bare = model({
    title: others("Solid", "en"),
    description: others("About Solid.", "ko"),
    keywords: [...others("pods", "sv"), iri("https://example.com/sv")],
    themes: [iri("https://example.com/theme")],
  });
  expect(
    curationProblems(bare, repoPolicy).map(({ code, field, params }) => ({ code, field, params })),
  ).toEqual([
    {
      code: "missingLanguage",
      field: "http://purl.org/dc/terms/title",
      params: { language: "en" },
    },
    {
      code: "missingLanguage",
      field: "http://purl.org/dc/terms/description",
      params: { language: "ko" },
    },
    {
      code: "missingLanguage",
      field: "http://www.w3.org/ns/dcat#keyword",
      params: { language: "sv" },
    },
    { code: "missingTheme", field: "http://www.w3.org/ns/dcat#theme", params: { theme: EDUC } },
    {
      code: "missingContact",
      field: "http://www.w3.org/ns/dcat#contactPoint",
      params: { contact: LIBRARY_CONTACT },
    },
  ]);
});

it("asks the library's contact, a vcard:Kind, and no one's email", () => {
  const found = (extra: Parameters<typeof model>[0]) =>
    curationProblems({ ...curated, ...extra }, repoPolicy).map(({ code, subject, field }) => ({
      code,
      subject,
      field,
    }));
  const missing = {
    code: "missingContact",
    subject: RELEASE,
    field: "http://www.w3.org/ns/dcat#contactPoint",
  };
  expect(found({ contacts: [contact("https://example.com/other")] })).toEqual([missing]);
  expect(found({ contacts: [contact(LIBRARY_CONTACT, [])] })).toEqual([missing]);
  expect(
    found({ contacts: [{ ...contact(LIBRARY_CONTACT), urls: [text(LIBRARY_CONTACT, "")] }] }),
  ).toEqual([missing]);
  expect(
    found({
      emails: [
        { subject: at("ann"), object: iri("mailto:ann@example.com") },
        { subject: at("bo"), object: iri("mailto:bo@example.com") },
      ],
    }),
  ).toEqual(
    ["ann", "bo"].map((id) => ({
      code: "emailNamed",
      subject: at(id),
      field: "http://xmlns.com/foaf/0.1/mbox",
    })),
  );
  // More than one call takes as arguments.
  const emails = Array.from({ length: 130_000 }, (_, i) => ({
    subject: at(`e${i}`),
    object: iri(`mailto:e${i}@example.com`),
  }));
  expect(found({ emails })).toHaveLength(emails.length);
});

it("asks a description of each picture in English and every language its card's text is in", () => {
  const picture = "https://example.com/flag.svg";
  const pictured = {
    ...curated,
    cards: [
      card("described", {
        frontImage: [picture],
        frontImageDescription: [text("Three stripes", "en-gb"), text("Tre ränder", "sv")],
        back: [text("Answer"), text("Svar", "sv-se")],
      }),
      card("bare", {
        frontLabel: [text("Fråga", "sv")],
        backNote: [text("Note", "")],
        backImage: [picture],
        backImageDescription: [text("Ränder", "sv"), text("Stripes", "")],
      }),
      card("unpictured", {
        frontImageDescription: [],
        back: [text("답", "ko")],
      }),
    ],
  };
  expect(
    curationProblems(pictured, repoPolicy).map(({ code, subject, field, params }) => ({
      code,
      subject,
      field,
      params,
    })),
  ).toEqual([
    {
      code: "missingImageDescription",
      subject: at("bare"),
      field: `${SM}backImageDescription`,
      params: { language: "en" },
    },
  ]);
  expect(curationProblems(pictured, podPolicy)).toEqual([]);
});

it("reads each language asked as a range a longer tag meets, and never the other way", () => {
  const picture = "https://example.com/flag.svg";
  const lacks = (descriptions: string[], textLanguages: string[]) =>
    curationProblems(
      {
        ...curated,
        cards: [
          card("pictured", {
            frontImage: [picture],
            frontImageDescription: descriptions.map((language) => text("Stripes", language)),
            front: textLanguages.map((language) => text("Flag", language)),
          }),
        ],
      },
      repoPolicy,
    ).map(({ params }) => params);
  expect(lacks(["en-gb-oxendict", "sv-se", "ko"], ["sv", "ko-kr"])).toEqual([]);
  // "e" and "english" are no range of "en", nor "s" of "sv".
  expect(lacks(["e", "english-x", "s-x"], ["sv"])).toEqual([
    { language: "en" },
    { language: "sv" },
  ]);
});

/** A card with a front picture, its text in `count` languages and its picture described in `count` others. */
const manyLanguages = (count: number) => {
  const tags = (letter: string) =>
    Array.from({ length: count }, (_, i) => `${letter}${i.toString(36).padStart(4, "0")}`);
  return {
    ...curated,
    cards: [
      card("polyglot", {
        frontImage: ["https://example.com/flag.svg"],
        front: tags("x").map((language) => text("Flag", language)),
        frontImageDescription: tags("y").map((language) => text("Stripes", `${language}-x`)),
      }),
    ],
  };
};

it("names at most ten languages a picture lacks", () => {
  const problems = curationProblems(manyLanguages(20), repoPolicy);
  expect(problems.map(({ params }) => params)).toEqual(
    ["en", ...Array.from({ length: 9 }, (_, i) => `x000${i}`)].map((language) => ({ language })),
  );
});

it("checks a picture in time that grows with its card's languages, not with their square", () => {
  // Eight times the text languages and eight times the descriptions take
  // about as long as an eighth of them eight times over; comparing each
  // language asked with each described would take eight times as long.
  const ratio = growth(
    (count) => {
      const release = manyLanguages(count);
      return () => curationProblems(release, repoPolicy);
    },
    1000,
    8,
  );
  expect(ratio).toBeLessThan(4);
});

it("checks a picture described in long tags in time that grows with their number", () => {
  // Long tags of one length are slow to tell apart in a set, so only
  // each one's short primary subtag is kept; "en" is still met by the
  // "en" each one starts with.
  const longTags = (count: number) => ({
    ...curated,
    cards: [
      card("described", {
        frontImage: ["https://example.com/flag.svg"],
        front: [text("Flag", "en")],
        frontImageDescription: Array.from({ length: count }, (_, i) =>
          text("Stripes", `en-${"xx-".repeat(5_700)}${i.toString(36).padStart(4, "0")}`),
        ),
      }),
    ],
  });
  expect(curationProblems(longTags(2), repoPolicy)).toEqual([]);
  const ratio = growth(
    (count) => {
      const release = longTags(count);
      return () => curationProblems(release, repoPolicy);
    },
    256,
    8,
  );
  expect(ratio).toBeLessThan(4);
});

it("asks no description in a language longer than a language subtag, nor keeps one", () => {
  // A primary subtag has at most eight letters, so a longer one names no
  // language: it is not asked, and a tag that starts with one meets
  // nothing. Neither is kept, so a long one costs no more than its length,
  // with or without a "-" every other character.
  const pictured = (language: string, length: number) => ({
    ...curated,
    cards: [
      card("described", {
        frontImage: ["https://example.com/flag.svg"],
        front: [text("Flag", language), text("Flagga", "sv")],
        frontImageDescription: [
          text("Stripes", "z".repeat(length)),
          ...Array.from({ length: 8 }, (_, i) => text("Stripes", `${"z-".repeat(length / 2)}${i}`)),
          text("Ränder", "sv"),
        ],
      }),
    ],
  });
  const lacks = (language: string, length: number) =>
    curationProblems(pictured(language, length), repoPolicy).map(({ params }) => params);
  expect(lacks("z".repeat(100_000), 100_000)).toEqual([{ language: "en" }]);
  expect(lacks("zzzzzzzz", 2)).toEqual([{ language: "en" }, { language: "zzzzzzzz" }]);
  expect(lacks("zzzzzzzzz", 2)).toEqual([{ language: "en" }]);
  const ratio = growth(
    (length) => {
      const release = pictured("z".repeat(length), length);
      return () => curationProblems(release, repoPolicy);
    },
    4_000,
    8,
  );
  expect(ratio).toBeLessThan(4);
});

it("asks nothing of a release in a pod, an email included", () => {
  const emailed = model({
    emails: [{ subject: at("ann"), object: iri("mailto:ann@example.com") }],
  });
  expect(curationProblems(emailed, podPolicy)).toEqual([]);
});
