import { describe, expect, it } from "vitest";
import { provenanceOf, provenanceProblems, RDFS_COMMENT } from "./provenanceRules";
import { emptyReleaseModel, type ReleaseModel, type ReleaseTerm, type ReleaseText } from "./releaseModel";

const URL = "https://pod.example/releases/solid/v1.ttl";
const PROV = "http://www.w3.org/ns/prov#";
const DCTERMS = "http://purl.org/dc/terms/";
const iri = (value: string): ReleaseTerm => ({ kind: "iri", value });
const text = (value: string, language = "en"): ReleaseText => ({ kind: "literal", value, language, datatype: "" });

describe("provenanceOf", () => {
  const statements: Record<string, ReleaseTerm[]> = {
    [`${URL}#compilation ${PROV}used`]: [iri("https://a.example/"), iri("https://b.example/"), { kind: "blank", value: "b0" }],
    [`${URL}#compilation ${RDFS_COMMENT}`]: [text("Compiled by Ann."), iri("https://not.example/")],
    [`https://a.example/ ${DCTERMS}title`]: [text("A")],
    [`https://b.example/ ${DCTERMS}creator`]: [text("Bo")],
  };
  const said = (subject: string, predicate: string) => statements[`${subject} ${predicate}`] ?? [];

  it("reads what each making used and says, and what the release states of each source, each once", () => {
    const { making, sourceDetails } = provenanceOf(said, [`${URL}#compilation`, `${URL}#revision-2`], [iri("https://a.example/"), { kind: "blank", value: "s" }], new Set([`${URL}#compilation`]));
    expect(making).toEqual([
      { iri: `${URL}#compilation`, used: ["https://a.example/", "https://b.example/"], comments: [text("Compiled by Ann.")], carried: true },
      { iri: `${URL}#revision-2`, used: [], comments: [], carried: false },
    ]);
    expect(sourceDetails).toEqual([
      { iri: "https://a.example/", title: [text("A")], creator: [], licence: [], comments: [] },
      { iri: "https://b.example/", title: [], creator: [text("Bo")], licence: [], comments: [] },
    ]);
    expect(provenanceOf(said, [], []).making).toEqual([]);
  });
});

describe("provenanceProblems", () => {
  const model = (more: Partial<ReleaseModel>): ReleaseModel => ({ ...emptyReleaseModel(URL), ...more });
  const making = (comments: string[], more: { used?: string[]; carried?: boolean } = {}) => ({
    iri: `${URL}#compilation`,
    used: more.used ?? [],
    comments: comments.map((one) => text(one)),
    carried: more.carried ?? false,
  });

  it("warns of a source that does not say what it is, whose it is, or on what terms it was used", () => {
    const problems = provenanceProblems(
      model({
        sources: [iri("https://a.example/"), iri("https://b.example/"), iri("https://c.example/")],
        sourceDetails: [
          { iri: "https://a.example/", title: [], creator: [], licence: [], comments: [] },
          { iri: "https://b.example/", title: [text("B")], creator: [text("Bo")], licence: [], comments: [text("The page's footer: CC0.")] },
          { iri: "https://c.example/", title: [text("C")], creator: [text("Cy")], licence: [iri("https://cc0.example/")], comments: [] },
        ],
      }),
    );
    expect(problems).toEqual([{ severity: "warning", subject: "https://a.example/", code: "sourceUndescribed", params: { missing: ["title", "creator", "licence"] } }]);
  });

  it("warns of a source the making used that the release is not derived from", () => {
    const described = { title: [text("D")], creator: [text("Di")], licence: [iri("https://cc0.example/")], comments: [] };
    const problems = provenanceProblems(
      model({
        sources: [iri("https://a.example/")],
        making: [making([], { used: ["https://a.example/", "https://d.example/"] })],
        sourceDetails: [
          { iri: "https://a.example/", ...described },
          { iri: "https://d.example/", ...described },
        ],
      }),
    );
    expect(problems).toEqual([{ severity: "warning", subject: "https://d.example/", related: [`${URL}#compilation`], code: "usedNotDerived", params: {} }]);
  });

  it("does not hold what an earlier version's making used to this version's derivation", () => {
    const described = { title: [text("D")], creator: [text("Di")], licence: [iri("https://cc0.example/")], comments: [] };
    const carried = model({
      making: [making([], { used: ["https://d.example/"], carried: true })],
      sourceDetails: [{ iri: "https://d.example/", ...described }],
    });
    expect(provenanceProblems(carried)).toEqual([]);
  });

  const course = (comments: string[], carried = false) =>
    model({
      types: ["https://schema.org/Course"],
      sources: [iri("https://a.example/"), iri("https://b.example/")],
      chapters: [
        { iri: `${URL}#ch-a`, retired: false, title: [], description: [], isPartOf: [], positions: [], reviewQuestions: [] },
        { iri: `${URL}#ch-old`, retired: true, title: [], description: [], isPartOf: [], positions: [], reviewQuestions: [] },
      ],
      steps: [{ iri: `${URL}#ch-a-1`, retired: false, theory: [], isPartOf: [], positions: [], checkedBy: [] }],
      cards: [1, 2, 3].map((n) => ({ iri: `${URL}#q${n}`, retired: n === 3, front: [], back: [], backLabel: [], frontNote: [], backNote: [], distractors: [] })),
      making: [making(comments, { carried })],
    });
  const counted = (problems: ReturnType<typeof provenanceProblems>) =>
    problems.map((one) => (one.code === "countDisagrees" ? [one.params.what, one.params.stated, one.params.counted] : one.code));

  it("warns of a count the making's comments state that the release does not have, in English or Swedish", () => {
    expect(counted(provenanceProblems(course(["1 chapter of 1 step in all, from 2 documents; 2 cards in all."])))).toEqual([]);
    expect(
      counted(provenanceProblems(course(["17 chapters of 193 steps in all, from 1,248 sources; 466 questions in total.", "Kursen har 3 kapitel, 4 steg och 2 kort sammanlagt, ur 5 källor."]))),
    ).toEqual([
      ["chapters", 17, 1],
      ["steps", 193, 1],
      ["sources", 1248, 2],
      ["cards", 466, 2],
      ["chapters", 3, 1],
      ["steps", 4, 1],
      ["sources", 5, 2],
    ]);
  });

  it("leaves card counts that are no total, words that only begin a count, and an earlier version's making alone", () => {
    expect(counted(provenanceProblems(course(["15 chemical-name cards, near 80 cards, 3 cards (in all), 2 stepsisters, Steps 6.2 and 14.13."])))).toEqual([]);
    expect(counted(provenanceProblems(course(["17 chapters."], true)))).toEqual([]);
  });

  it("counts a deck's sources and cards, never the chapters of a book it names", () => {
    const deck = model({ sources: [iri("https://a.example/")], cards: [], making: [making(["The last 40 chapters, from 2 sources; 1 card in all."])] });
    expect(counted(provenanceProblems(deck))).toEqual([
      ["sources", 2, 1],
      ["cards", 1, 0],
    ]);
  });
});
