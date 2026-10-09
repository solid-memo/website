import { expect, it } from "vitest";
import { iri, model, text } from "../testing/releaseModel";
import { curationProblems, podPolicy, repoPolicy } from "./curationRules";

const EDUC = "http://publications.europa.eu/resource/authority/data-theme/EDUC";
const curated = model({
  title: [text("Solid"), text("Solid", "sv")],
  description: [text("About Solid.", "en-gb")],
  keywords: [text("pods"), text("poddar", "sv"), iri("https://example.com/keyword")],
  themes: [iri(EDUC)],
});

it("accepts a release the repository's policy asks nothing more of", () => {
  expect(curationProblems(curated, repoPolicy)).toEqual([]);
});

it("names each language and theme the repository's policy asks and a release lacks", () => {
  const bare = model({ title: [text("Solid", "sv")], keywords: [text("pods"), iri("https://example.com/sv")], themes: [iri("https://example.com/theme")] });
  expect(curationProblems(bare, repoPolicy).map(({ code, field, params }) => ({ code, field, params }))).toEqual([
    { code: "missingLanguage", field: "http://purl.org/dc/terms/title", params: { language: "en" } },
    { code: "missingLanguage", field: "http://purl.org/dc/terms/description", params: { language: "en" } },
    { code: "missingLanguage", field: "http://www.w3.org/ns/dcat#keyword", params: { language: "sv" } },
    { code: "missingTheme", field: "http://www.w3.org/ns/dcat#theme", params: { theme: EDUC } },
  ]);
});

it("asks nothing of a release in a pod", () => {
  expect(curationProblems(model(), podPolicy)).toEqual([]);
});
