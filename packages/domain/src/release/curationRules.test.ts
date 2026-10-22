// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, it } from "vitest";
import { LOCALES } from "../locale";
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

it("asks nothing of a release in a pod, an email included", () => {
  const emailed = model({
    emails: [{ subject: at("ann"), object: iri("mailto:ann@example.com") }],
  });
  expect(curationProblems(emailed, podPolicy)).toEqual([]);
});
