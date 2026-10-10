import { describe, expect, it } from "vitest";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { courseDraft, DRAFT, of } from "../testing/releaseDraft";
import { draftReleaseModel } from "./draftModel";
import { problem, type ReleaseProblem } from "./problems";
import {
  checkProblems,
  curationOf,
  groupProblems,
  isTargetField,
  libraryProblems,
  libraryReleaseUrl,
  librarySeriesUrl,
  movedProblems,
  problemCounts,
  problemTarget,
  readWhole,
  ruleProblems,
  type ReleaseCheck,
} from "./releaseCheck";
import { podPolicy, repoPolicy } from "./curationRules";

const DCTERMS = "http://purl.org/dc/terms/";
const DCAT = "http://www.w3.org/ns/dcat#";
const INDEX = "https://site.example/decks/index.ttl";

describe("the policies", () => {
  it("asks a pod's curation, or the repository's library's", () => {
    expect(curationOf("pod")).toBe(podPolicy);
    expect(curationOf("library")).toBe(repoPolicy);
  });
});

describe("ruleProblems", () => {
  it("names the course's problems, what a release needs, and the policy's curation, each once", () => {
    const model = draftReleaseModel(courseDraft());
    const pod = ruleProblems(model, "pod").map((p) => `${p.code} ${p.field ?? ""}`);
    expect(pod).toContain("chapterWithoutStep ");
    expect(pod).toContain(`required ${DCTERMS}publisher`);
    expect(pod).toContain(`missingTheme ${DCAT}theme`);
    expect(pod).not.toContain(`missingLanguage ${DCAT}keyword`);
    const library = ruleProblems(model, "library").map((p) => `${p.code} ${p.field ?? ""}`);
    expect(library).toContain(`missingLanguage ${DCAT}keyword`);
    // EDUC is asked by both the release's readiness and the library's curation: once.
    expect(library.filter((p) => p === `missingTheme ${DCAT}theme`)).toHaveLength(1);
    expect(library.filter((p) => p === `missingLanguage ${DCTERMS}description`)).toHaveLength(1);
  });
});

describe("the library's place", () => {
  it("is beside the index, in the deck's series", () => {
    expect(libraryReleaseUrl(INDEX, "solid", 2)).toBe("https://site.example/decks/solid/v2.ttl");
    expect(librarySeriesUrl(INDEX, "solid")).toBe(`${INDEX}#solid`);
  });

  it("names a name that is not plain, a gap or a version the library has, and metadata against the place", () => {
    const at = libraryReleaseUrl(INDEX, "solid", 2);
    const model = { ...draftReleaseModel(courseDraft(), at), version: [{ kind: "literal" as const, value: "2", language: "", datatype: "" }] };
    const index = { url: INDEX, publisher: `${INDEX}#me`, releases: ["https://site.example/decks/solid/v1.ttl", "https://site.example/decks/other/v1.ttl", "https://elsewhere.example/solid/v1.ttl"] };
    const found = libraryProblems(model, index, "solid", 2);
    expect(found.map((p) => [p.code, p.field ?? "", "expected" in p.params ? p.params.expected : ""])).toEqual([
      ["linkMismatch", `${DCAT}inSeries`, [`${INDEX}#solid`]],
      ["linkMismatch", `${DCAT}isVersionOf`, [`${INDEX}#solid`]],
      ["linkMismatch", `${DCTERMS}publisher`, [`${INDEX}#me`]],
      ["linkMismatch", `${DCAT}prev`, ["https://site.example/decks/solid/v1.ttl"]],
      ["linkMismatch", `${DCAT}previousVersion`, ["https://site.example/decks/solid/v1.ttl"]],
    ]);
    const first = libraryProblems(draftReleaseModel(courseDraft(), libraryReleaseUrl(INDEX, "Solid", 1)), { ...index, publisher: null }, "Solid", 1);
    expect(first[0]).toMatchObject({ code: "notARelease", params: { path: "Solid/v1.ttl" } });
    expect(first.find((p) => p.field === `${DCTERMS}publisher`)).toMatchObject({ params: { expected: [""] } });
    const again = libraryProblems(draftReleaseModel(courseDraft(), libraryReleaseUrl(INDEX, "solid", 1)), index, "solid", 1);
    expect(again[0]).toMatchObject({ code: "versionGap", params: { deck: "solid", versions: [1, 1] } });
  });
});

describe("readWhole", () => {
  it("says a check whole unless the release it follows or the library's index could not be read", () => {
    const other = problem(DRAFT, { code: "versionGap", params: { deck: "solid", versions: [1, 1] } });
    expect(readWhole({ drops: [], library: [other] })).toBe(true);
    expect(readWhole({ drops: [problem(DRAFT, { code: "previousUnread", params: { previous: INDEX } })], library: [] })).toBe(false);
    expect(readWhole({ drops: [], library: [problem(DRAFT, { code: "libraryUnread", params: {} })] })).toBe(false);
  });
});

describe("movedProblems", () => {
  it("names the same subjects at another address", () => {
    const from = "https://site.example/decks/solid/v1.ttl";
    const found = [problem(`${from}#q-1`, { code: "noBack", params: {} }), problem(from, { code: "noBack", params: {} }, { related: [`${from}#q-2`, "https://other.example/"] })];
    expect(movedProblems(found, from, DRAFT)).toEqual([
      { severity: "error", subject: of("q-1"), code: "noBack", params: {} },
      { severity: "error", subject: DRAFT, related: [of("q-2"), "https://other.example/"], code: "noBack", params: {} },
    ]);
  });
});

describe("grouping", () => {
  const error = (subject: string) => problem(subject, { code: "noBack", params: {} });
  const warning = (subject: string) => problem(subject, { code: "unshaped", params: {} }, { severity: "warning" });

  it("lists every problem of a check, the shapes last when they were asked", () => {
    const check: ReleaseCheck = { rules: [error("a")], library: [error("b")], drops: [error("c")], markdown: [error("d")], shapes: null };
    expect(checkProblems(check).map((p) => p.subject)).toEqual(["a", "b", "c", "d"]);
    expect(checkProblems({ ...check, shapes: [warning("e")] }).map((p) => p.subject)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("groups by severity, errors first, then by subject in the order they come", () => {
    expect(groupProblems([warning("w"), error("a"), error("b"), error("a")])).toEqual([
      { severity: "error", subjects: [{ subject: "a", problems: [error("a"), error("a")] }, { subject: "b", problems: [error("b")] }] },
      { severity: "warning", subjects: [{ subject: "w", problems: [warning("w")] }] },
    ]);
    expect(groupProblems([])).toEqual([]);
  });

  it("counts each subject of the draft's problems by its id", () => {
    expect([...problemCounts({ url: DRAFT, cards: [] }, [error(of("a")), error(of("a")), warning(of("b")), error(DRAFT), error("https://other.example/")])]).toEqual([
      ["a", 2],
      ["b", 1],
    ]);
  });

  it("counts a wrong option's problems under the question that has it", () => {
    const draft = courseDraft();
    const card = draft.cards.find((node) => node.data.distractor.length > 0)!;
    const distractor = card.data.distractor[0]!;
    expect(problemCounts(draft, [error(distractor), warning(distractor)]).get(card.id)).toBe(2);
  });
});

describe("problemTarget", () => {
  const draft = courseDraft();
  const target = (subject: string, more: { field?: string; code?: ReleaseProblem["code"] } = {}) =>
    problemTarget(draft, { ...problem(subject, { code: (more.code ?? "noBack") as "noBack", params: {} }), ...(more.field === undefined ? {} : { field: more.field }) });

  it("opens a chapter's editor at its title, description, steps or review questions", () => {
    expect(target(of("ch-a"), { field: `${DCTERMS}title` })).toEqual({ screen: "chapter", chapter: "ch-a", field: "title" });
    expect(target(of("ch-a"), { field: `${DCTERMS}description` })).toEqual({ screen: "chapter", chapter: "ch-a", field: "description" });
    expect(target(of("ch-a"), { field: SM.reviewQuestion })).toEqual({ screen: "chapter", chapter: "ch-a", field: "review" });
    expect(target(of("ch-b"), { code: "chapterWithoutStep" })).toEqual({ screen: "chapter", chapter: "ch-b", field: "steps" });
    expect(target(of("ch-b"), { code: "stepPositions" })).toEqual({ screen: "chapter", chapter: "ch-b", field: "steps" });
    expect(target(of("ch-b"), { field: "https://schema.org/position" })).toEqual({ screen: "chapter", chapter: "ch-b" });
  });

  it("opens a step's editor at its theory or questions", () => {
    expect(target(of("ch-a-1"), { field: SM.theory })).toEqual({ screen: "step", step: "ch-a-1", field: "theory" });
    expect(target(of("ch-a-1"), { field: SM.checkedBy })).toEqual({ screen: "step", step: "ch-a-1", field: "questions" });
    expect(target(of("ch-a-1"))).toEqual({ screen: "step", step: "ch-a-1" });
  });

  it("opens a question's editor at its text or wrong options, and a distractor's card at it", () => {
    expect(target(of("q-a-1a"), { field: SM.back })).toEqual({ screen: "question", card: "q-a-1a", field: "back" });
    expect(target(of("q-a-1a"), { field: SM.distractor })).toEqual({ screen: "question", card: "q-a-1a", field: "distractors" });
    expect(target(of("q-a-1a"), { field: SM.textFormat })).toEqual({ screen: "question", card: "q-a-1a" });
    expect(target(of("q-a-1a"))).toEqual({ screen: "question", card: "q-a-1a" });
    expect(target(of("q-a-1a-d2"), { field: SM.distractorText })).toEqual({ screen: "question", card: "q-a-1a", field: "distractor:q-a-1a-d2" });
  });

  it("opens the overview for the release itself, at its title, description or outline, and for any other subject", () => {
    expect(target(DRAFT, { field: `${DCTERMS}title` })).toEqual({ screen: "draft", field: "title" });
    expect(target(DRAFT, { field: `${DCTERMS}description` })).toEqual({ screen: "draft", field: "description" });
    expect(target(DRAFT, { code: "courseWithoutChapter" })).toEqual({ screen: "draft", field: "outline" });
    expect(target(DRAFT, { field: `${DCAT}theme`, code: "missingTheme" })).toEqual({ screen: "draft" });
    expect(target(of("series"))).toEqual({ screen: "draft" });
    expect(target("solid/v2.ttl")).toEqual({ screen: "draft" });
  });

  it("knows each screen's fields", () => {
    expect(isTargetField("draft", "outline")).toBe(true);
    expect(isTargetField("draft", "theory")).toBe(false);
    expect(isTargetField("chapter", "review")).toBe(true);
    expect(isTargetField("step", "questions")).toBe(true);
    expect(isTargetField("question", "backNote")).toBe(true);
    expect(isTargetField("question", "distractors")).toBe(true);
    expect(isTargetField("question", "distractor:x")).toBe(true);
    expect(isTargetField("question", "distractor:")).toBe(false);
  });
});
