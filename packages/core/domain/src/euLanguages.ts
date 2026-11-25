// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { EU_LANGUAGES } from "@solid-memo/vocab/concepts.generated";

/**
 * The language tag (BCP 47, lower case, as the app keeps them) of each
 * language of the EU's table a release may state (EU_LANGUAGES), by its
 * code there.
 */
const TAGS: Readonly<Record<string, string>> = {
  ARA: "ar",
  DEU: "de",
  ELL: "el",
  ENG: "en",
  FIN: "fi",
  FRA: "fr",
  ITA: "it",
  JPN: "ja",
  KOR: "ko",
  LAT: "la",
  POR: "pt",
  SPA: "es",
  SWE: "sv",
};

/**
 * The language tag of a language of the EU's table, by its IRI
 * (".../authority/language/KOR" is "ko"): undefined for an IRI the
 * reference data does not describe.
 */
export function languageTagOf(iri: string): string | undefined {
  const concept = EU_LANGUAGES.find((one) => one.iri === iri);
  return concept === undefined ? undefined : TAGS[concept.code];
}
