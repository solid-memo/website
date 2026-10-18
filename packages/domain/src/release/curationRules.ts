// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { EDUCATION_THEME } from "../dcat.ts";
import { LOCALES } from "../locale.ts";
import { problem, type ReleaseProblem } from "./problems.ts";
import {
  DCAT_NS,
  DCTERMS_NS,
  FOAF_MBOX,
  VCARD_NS,
  type ReleaseModel,
  type ReleaseTerm,
} from "./releaseModel.ts";

/**
 * What a library asks of its releases beyond what the data needs
 * (docs/deck-library.md, A version): a value the caller passes in,
 * never a rule of a series, author or host. The repository's library
 * asks a title, a description and keywords in every language the app
 * speaks (LIBRARY_LANGUAGES), the EU data theme EDUC, and its contact,
 * the project's issue tracker, in place of anyone's email; a release in
 * a pod asks nothing.
 */
export interface LibraryPolicy {
  /** Languages the title has text in, beside any others. */
  titleLanguages: readonly string[];
  descriptionLanguages: readonly string[];
  /** Languages the keywords have at least one keyword in. */
  keywordLanguages: readonly string[];
  /** Themes (dcat:theme) among the release's. */
  themes: readonly string[];
  /**
   * The web page the release's contact names: a dcat:contactPoint, a
   * vcard:Kind with this vcard:hasURL; and then no foaf:mbox, of any
   * subject. Null to ask neither.
   */
  contact: string | null;
}

/** This repository's library's contact (docs/deck-library.md, Contact): the project's issue tracker. */
export const LIBRARY_CONTACT = "https://github.com/solid-memo/website/issues";

/**
 * The languages this repository's library asks of a deck's title,
 * description and keywords: every language the app speaks (LOCALES), so
 * a language the app gains is asked of every deck, which a new version
 * then adds (docs/deck-library.md, A version).
 */
export const LIBRARY_LANGUAGES = {
  titleLanguages: LOCALES,
  descriptionLanguages: LOCALES,
  keywordLanguages: LOCALES,
} satisfies Partial<LibraryPolicy>;

/** The policy of this repository's decks/. */
export const repoPolicy: LibraryPolicy = {
  ...LIBRARY_LANGUAGES,
  themes: [EDUCATION_THEME],
  contact: LIBRARY_CONTACT,
};

/** The policy of a release published in a pod: the data's own rules, nothing more. */
export const podPolicy: LibraryPolicy = {
  titleLanguages: [],
  descriptionLanguages: [],
  keywordLanguages: [],
  themes: [],
  contact: null,
};

/** What a release lacks that the policy asks. */
export function curationProblems(model: ReleaseModel, policy: LibraryPolicy): ReleaseProblem[] {
  const problems: ReleaseProblem[] = [];
  const languages = (field: string, terms: readonly ReleaseTerm[], wanted: readonly string[]) => {
    const stated = terms.flatMap((term) => (term.kind === "literal" ? [term.language] : []));
    // A language range, as sh:languageIn reads it: "en" is met by "en-gb" too.
    const has = (language: string) =>
      stated.some((tag) => tag === language || tag.startsWith(`${language}-`));
    for (const language of wanted.filter((language) => !has(language))) {
      problems.push(
        problem(model.url, { code: "missingLanguage", params: { language } }, { field }),
      );
    }
  };
  languages(`${DCTERMS_NS}title`, model.title, policy.titleLanguages);
  languages(`${DCTERMS_NS}description`, model.description, policy.descriptionLanguages);
  languages(`${DCAT_NS}keyword`, model.keywords, policy.keywordLanguages);
  const themes = new Set(model.themes.map((theme) => theme.value));
  for (const theme of policy.themes.filter((theme) => !themes.has(theme))) {
    problems.push(
      problem(model.url, { code: "missingTheme", params: { theme } }, { field: `${DCAT_NS}theme` }),
    );
  }
  if (policy.contact !== null) problems.push(...contactProblems(model, policy.contact));
  return problems;
}

/** A release's contact, unless it names `contact`, and each email it names. */
function contactProblems(model: ReleaseModel, contact: string): ReleaseProblem[] {
  const named = model.contacts.some(
    (point) =>
      point.types.includes(`${VCARD_NS}Kind`) &&
      point.urls.some((url) => url.kind === "iri" && url.value === contact),
  );
  return [
    ...(named
      ? []
      : [
          problem(
            model.url,
            { code: "missingContact", params: { contact } },
            { field: `${DCAT_NS}contactPoint` },
          ),
        ]),
    ...model.emails.map(({ subject }) =>
      problem(subject, { code: "emailNamed", params: {} }, { field: FOAF_MBOX }),
    ),
  ];
}
