import { EDUCATION_THEME } from "../dcat.ts";
import { problem, type ReleaseProblem } from "./problems.ts";
import { DCAT_NS, DCTERMS_NS, type ReleaseModel, type ReleaseTerm } from "./releaseModel.ts";

/**
 * What a library asks of its releases beyond what the data needs
 * (docs/deck-library.md, A version): a value the caller passes in,
 * never a rule of a series, author or host. The repository's library
 * asks a title and a description in English, keywords in English and
 * Swedish, and the EU data theme EDUC; a release in a pod asks nothing.
 */
export interface LibraryPolicy {
  /** Languages the title has text in, beside any others. */
  titleLanguages: readonly string[];
  descriptionLanguages: readonly string[];
  /** Languages the keywords have at least one keyword in. */
  keywordLanguages: readonly string[];
  /** Themes (dcat:theme) among the release's. */
  themes: readonly string[];
}

/** The policy of this repository's decks/. */
export const repoPolicy: LibraryPolicy = {
  titleLanguages: ["en"],
  descriptionLanguages: ["en"],
  keywordLanguages: ["en", "sv"],
  themes: [EDUCATION_THEME],
};

/** The policy of a release published in a pod: the data's own rules, nothing more. */
export const podPolicy: LibraryPolicy = {
  titleLanguages: [],
  descriptionLanguages: [],
  keywordLanguages: [],
  themes: [],
};

/** What a release lacks that the policy asks. */
export function curationProblems(model: ReleaseModel, policy: LibraryPolicy): ReleaseProblem[] {
  const problems: ReleaseProblem[] = [];
  const languages = (field: string, terms: readonly ReleaseTerm[], wanted: readonly string[]) => {
    const stated = terms.flatMap((term) => (term.kind === "literal" ? [term.language] : []));
    // A language range, as sh:languageIn reads it: "en" is met by "en-gb" too.
    const has = (language: string) => stated.some((tag) => tag === language || tag.startsWith(`${language}-`));
    for (const language of wanted.filter((language) => !has(language))) {
      problems.push(problem(model.url, { code: "missingLanguage", params: { language } }, { field }));
    }
  };
  languages(`${DCTERMS_NS}title`, model.title, policy.titleLanguages);
  languages(`${DCTERMS_NS}description`, model.description, policy.descriptionLanguages);
  languages(`${DCAT_NS}keyword`, model.keywords, policy.keywordLanguages);
  const themes = new Set(model.themes.map((theme) => theme.value));
  for (const theme of policy.themes.filter((theme) => !themes.has(theme))) {
    problems.push(problem(model.url, { code: "missingTheme", params: { theme } }, { field: `${DCAT_NS}theme` }));
  }
  return problems;
}
