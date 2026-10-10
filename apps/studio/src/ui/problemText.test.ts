import { describe, expect, it } from "vitest";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { problem, type ProblemDetail } from "@solid-memo/domain/release/problems";
import { createI18n } from "@solid-memo/ui/i18n";
import { courseDraft, DRAFT_URL } from "../test/fixtures";
import { fieldName, problemMessage, subjectName } from "./problemText";

const draft = courseDraft();
const at = (id: string) => `${DRAFT_URL}#${id}`;
const en = createI18n("en");
const sv = createI18n("sv");
const DCTERMS = "http://purl.org/dc/terms/";
const DCAT = "http://www.w3.org/ns/dcat#";
const literal = (value: string) => ({ kind: "literal" as const, value, language: "", datatype: "" });
const iri = (value: string) => ({ kind: "iri" as const, value });

/** Each problem's message, in English, in `field` when given. */
function say(detail: ProblemDetail, field?: string, i18n = en): string {
  return problemMessage(problem(at("q-pods-1a"), detail, field === undefined ? {} : { field }), draft, i18n);
}

describe("problemMessage", () => {
  it("says every problem in the reader's language, the subjects it names by their ids", () => {
    expect(say({ code: "notARelease", params: { path: "Solid/v1.ttl" } })).toBe(
      "Solid/v1.ttl is no place for a release in the library: its name may hold only lower-case letters, digits and dashes.",
    );
    expect(say({ code: "versionGap", params: { deck: "solid", versions: [1, 1] } })).toBe("The library's versions of solid would not run 1, 2, … without gaps: 1, 1.");
    expect(say({ code: "notOneDeck", params: { decks: [] } })).toBe("The release does not describe exactly one deck, itself: it has nothing.");
    expect(say({ code: "notOneDeck", params: { decks: [DRAFT_URL, at("other"), "https://elsewhere.example/"] } })).toBe(
      "The release does not describe exactly one deck, itself: it has <>, #other, <https://elsewhere.example/>.",
    );
    expect(say({ code: "versionMismatch", params: { stated: [literal("1")], expected: 2 } })).toBe('States version "1"; its place says "2".');
    expect(say({ code: "linkMismatch", params: { stated: [iri(at("series"))], expected: ["https://site.example/decks/index.ttl#solid"] } }, `${DCAT}inSeries`)).toBe(
      "Series: states #series; its place says <https://site.example/decks/index.ttl#solid>.",
    );
    expect(say({ code: "linkMismatch", params: { stated: [], expected: [] } }, `${DCAT}prev`)).toBe(
      "Previous version: states nothing; its place says nothing, being the first version.",
    );
    expect(say({ code: "cardsDropped", params: { ids: ["a", "b"], previous: "https://r.example/v1.ttl" } })).toContain("Drops #a, #b, which <https://r.example/v1.ttl> has.");
    expect(say({ code: "outlineDropped", params: { ids: ["c"], previous: "https://r.example/v1.ttl" } })).toContain("Drops #c");
    expect(say({ code: "idReused", params: { id: "x", was: "card", now: "step", previous: "https://r.example/v1.ttl" } })).toBe(
      "#x is a step here, but a card in <https://r.example/v1.ttl>: an id names one subject for good.",
    );
    expect(say({ code: "versionNotNext", params: { version: 3, previousVersion: 1, previous: "https://r.example/v1.ttl" } })).toBe(
      "Version 3 does not follow <https://r.example/v1.ttl>, version 1.",
    );
    expect(say({ code: "outlineWithoutCourse", params: {} })).toBe("Has chapters or steps, but is no course.");
    expect(say({ code: "courseWithoutChapter", params: {} })).toBe("A course has at least one chapter.");
    expect(say({ code: "courseDirection", params: { stated: [iri(SM.backToFront)] } })).toBe(`A course is studied front to back; this states <${SM.backToFront}>.`);
    expect(say({ code: "chapterPartOf", params: { parts: [DRAFT_URL, "https://x.example/"] } })).toBe(
      "Is part of <>, <https://x.example/>: a chapter is part of the release it is in.",
    );
    expect(say({ code: "stepPartOf", params: { part: at("q-pods-1a") } })).toBe("Is part of #q-pods-1a, which is no chapter of this release.");
    expect(say({ code: "askedNotACard", params: { card: at("gone") } })).toBe("Asks #gone, which is no card of this release.");
    expect(say({ code: "askedRetired", params: { card: at("old") } })).toContain("Asks #old, which is retired");
    expect(say({ code: "notADistractor", params: { distractor: at("q-pods-r01") } })).toContain("Names #q-pods-r01 as a wrong option");
    expect(say({ code: "distractorShared", params: { cards: [at("a"), at("b")] } })).toBe("Is a wrong option of #a, #b: each card has its own.");
    expect(say({ code: "checkedTwice", params: { steps: [at("s1"), at("s2")] } })).toBe("Is asked by steps #s1, #s2: one step at most asks a question.");
    expect(say({ code: "checkedAndReviewed", params: { steps: [at("s1")], chapters: [at("c1")] } })).toBe(
      "Is asked by #s1 and in the review of #c1: a question is asked in one place.",
    );
    expect(say({ code: "noBack", params: {} })).toBe("Has no text on its back, the right option.");
    expect(say({ code: "fewDistractors", params: { count: 1, least: 2 } })).toBe("Has 1 wrong option in use: a question a course asks has at least 2.");
    expect(say({ code: "distractorLanguages", params: { card: at("q-pods-1a"), missing: ["sv", ""] } })).toBe(
      "Has no text in Swedish, untagged text, which the back of #q-pods-1a has.",
    );
    expect(say({ code: "chapterPositions", params: { chapters: [at("a"), at("b")], position: "0" } })).toBe("Chapters #a, #b share place 0.");
    expect(say({ code: "stepPositions", params: { steps: [at("a"), at("b")], chapter: at("c"), position: "1" } })).toBe("Steps #a, #b share place 1.");
    expect(say({ code: "chapterWithoutStep", params: {} })).toBe("Has no step in use.");
    expect(say({ code: "textFormatMisplaced", params: { distractor: true } })).toContain("States a text format");
    expect(say({ code: "textFormatUnknown", params: { format: iri("https://format.example/") } })).toBe(
      "States a text format this app does not know, <https://format.example/>: its text shows as plain text.",
    );
    expect(say({ code: "markdown", params: { language: "en", finding: { code: "notOneParagraph" } } }, SM.back)).toBe(
      "Back, English: This card's back is one of the options of a question: keep it to one paragraph, as the others are.",
    );
    expect(say({ code: "theoryEmptyChunk", params: { language: "en" } }, SM.theory)).toContain("Theory, English: a thematic break first");
    expect(
      say({ code: "theoryChunks", params: { counts: [{ language: "en", chunks: 1 }, { language: "sv", chunks: 2 }] } }, SM.theory),
    ).toBe("Theory: in 1 part in English, 2 parts in Swedish. A step's theory is in as many parts in each language, so a learner who switches language keeps their place.");
    expect(say({ code: "missingLanguage", params: { language: "en" } }, `${DCTERMS}title`)).toBe("Title: no text in English.");
    expect(say({ code: "missingTheme", params: { theme: "http://publications.europa.eu/resource/authority/data-theme/EDUC" } })).toBe("Themes: EDUC is missing.");
    expect(say({ code: "required", params: {} }, `${DCTERMS}publisher`)).toBe("Publisher: not stated yet.");
    expect(say({ code: "unshaped", params: {} })).toBe("Is of a Solid Memo class that no shape of this app describes.");
    expect(say({ code: "previousUnread", params: { previous: "https://pod.example/v1.ttl" } })).toBe(
      "The release it follows, <https://pod.example/v1.ttl>, could not be read, so nothing is checked against it. Check again later.",
    );
    expect(say({ code: "libraryUnread", params: {} })).toContain("The library's index could not be read");
  });

  it("says what a source or the release's making lacks, in English and Swedish", () => {
    expect(say({ code: "sourceUndescribed", params: { missing: ["title", "creator", "licence"] } })).toBe(
      "Does not state its title, its creator, its licence or the evidence for one: a source says what it is, whose it is, and on what terms it was used.",
    );
    expect(say({ code: "sourceUndescribed", params: { missing: ["licence"] } }, undefined, sv)).toBe(
      "Anger inte sin licens eller belägget för en: en källa säger vad den är, vems den är och på vilka villkor den användes.",
    );
    expect(say({ code: "usedNotDerived", params: {} })).toBe("Was used to make the release, which does not say it is derived from it.");
    expect(say({ code: "countDisagrees", params: { what: "cards", stated: 466, counted: 465 } })).toBe("Says 466 cards in all, but the release has 465.");
    expect(say({ code: "countDisagrees", params: { what: "chapters", stated: 17, counted: 16 } }, undefined, sv)).toBe("Säger 17 kapitel, men utgåvan har 16.");
  });

  it("says a shape's result in its own words, the validator's by its constraint, a profile's named", () => {
    const shaped = { message: { en: "A title is text.", sv: "En titel är text." }, constraint: "Datatype" };
    expect(say({ code: "shape", params: shaped }, `${DCTERMS}title`)).toBe("Title: A title is text.");
    expect(say({ code: "shape", params: shaped }, `${DCTERMS}title`, sv)).toBe("Titel: En titel är text.");
    expect(say({ code: "shape", params: shaped })).toBe("A title is text.");
    const builtIn = { message: { en: "Less than 1 values" }, constraint: "MinCount", builtIn: true as const, profile: "dcat-ap" };
    expect(say({ code: "shape", params: builtIn }, `${DCTERMS}description`, sv)).toBe("Beskrivning: DCAT-AP: Ett värde saknas.");
  });
});

describe("fieldName", () => {
  it("names a field it knows, and any other by its IRI", () => {
    expect(fieldName(`${DCTERMS}title`, sv.t)).toBe("Titel");
    expect(fieldName("http://www.w3.org/2000/01/rdf-schema#comment", en.t)).toBe("Comment");
    expect(fieldName("http://www.w3.org/ns/adms#versionNotes", sv.t)).toBe("Versionsanteckningar");
    expect(fieldName("https://other.example/p", en.t)).toBe("https://other.example/p");
    expect(fieldName(undefined, en.t)).toBe("");
  });
});

describe("subjectName", () => {
  it("names the release, a chapter by its title, a step by its place, a question by its front, a wrong option by its id", () => {
    expect(subjectName(draft, DRAFT_URL, en)).toBe("This release");
    expect(subjectName(draft, at("ch-pods"), en)).toBe("Pods");
    expect(subjectName(draft, at("ch-pods-2"), en)).toBe("Step 2");
    expect(subjectName(draft, at("q-pods-1a"), en)).toBe("What holds data?");
    expect(subjectName(draft, at("q-pods-1a-d1"), en)).toBe("Wrong option q-pods-1a-d1");
    expect(subjectName(draft, at("series"), en)).toBe("#series");
    expect(subjectName(draft, "solid/v1.ttl", en)).toBe("solid/v1.ttl");
  });

  it("names a chapter without a title, and a step of no chapter, by their ids", () => {
    const loose = {
      ...draft,
      chapters: draft.chapters.map((node) => ({ ...node, data: { ...node.data, title: undefined } })),
      steps: [...draft.steps, { id: "loose", data: { checkedBy: [] } }],
    };
    expect(subjectName(loose, at("ch-pods"), en)).toBe("ch-pods");
    expect(subjectName(loose, at("loose"), en)).toBe("loose");
  });
});
