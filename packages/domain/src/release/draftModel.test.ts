import { describe, expect, it } from "vitest";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { courseDraft, deckDraft, DRAFT, link, of } from "../testing/releaseDraft";
import { courseProblems } from "./courseRules";
import { draftReleaseModel } from "./draftModel";
import { publishedIds } from "./releaseModel";

const PROV = "http://www.w3.org/ns/prov#";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const LANG_STRING = "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString";
const XSD = "http://www.w3.org/2001/XMLSchema#";

describe("draftReleaseModel", () => {
  it("reads a course draft as the release it will be: its metadata, outline, cards and distractors", () => {
    const model = draftReleaseModel(courseDraft());
    expect(model.url).toBe(DRAFT);
    expect(model.decks).toEqual([DRAFT]);
    expect(model.types).toEqual([SM.Deck, "http://www.w3.org/ns/dcat#Dataset", "https://schema.org/Course"]);
    expect(model.title).toEqual([{ kind: "literal", value: "Solid", language: "en", datatype: LANG_STRING }]);
    expect(model.version).toEqual([{ kind: "literal", value: "1", language: "", datatype: `${XSD}string` }]);
    expect(model.studyDirection).toEqual([{ kind: "iri", value: SM.frontToBack }]);
    expect(model.inSeries).toEqual([{ kind: "iri", value: of("series") }]);
    expect(model.distribution).toEqual([{ kind: "iri", value: of("turtle") }]);
    expect(model.sources).toEqual([{ kind: "iri", value: "https://source.example/" }]);
    expect(model.activities).toEqual([{ iri: of("compilation"), generating: true }]);
    expect(model.publisher).toEqual([]);
    expect(model.issued).toEqual([]);
    expect(model.chapters[0]).toEqual({
      iri: of("ch-a"),
      retired: false,
      title: [{ kind: "literal", value: "A", language: "en", datatype: LANG_STRING }],
      description: [],
      isPartOf: [DRAFT],
      positions: ["0"],
      reviewQuestions: [of("q-a-r01")],
    });
    expect(model.steps[0]).toMatchObject({ iri: of("ch-a-1"), isPartOf: [of("ch-a")], positions: ["0"], checkedBy: [of("q-a-1a")] });
    expect(model.cards[0]).toMatchObject({ iri: of("q-a-1a"), distractors: [{ kind: "iri", value: of("q-a-1a-d1") }, { kind: "iri", value: of("q-a-1a-d2") }] });
    expect(model.distractors.map((d) => [d.iri, d.typed, d.note.length])).toEqual([
      [of("q-a-1a-d1"), true, 0],
      [of("q-a-1a-d2"), true, 1],
    ]);
    expect(model.distractorLinks).toEqual([
      { subject: of("q-a-1a"), object: { kind: "iri", value: of("q-a-1a-d1") } },
      { subject: of("q-a-1a"), object: { kind: "iri", value: of("q-a-1a-d2") } },
    ]);
    expect(publishedIds(model, "card")).toEqual(["q-a-1a", "q-a-2a", "q-a-r01", "q-loose"]);
    // The draft's own outline holds together but for its chapter without a step and the questions without options.
    expect(courseProblems(model).map((p) => p.code)).toEqual(["fewDistractors", "fewDistractors", "chapterWithoutStep"]);
  });

  it("moves every subject to the release's address", () => {
    const url = "https://site.example/decks/solid/v1.ttl";
    const model = draftReleaseModel(courseDraft(), url);
    expect(model.url).toBe(url);
    expect(model.decks).toEqual([url]);
    expect(model.chapters[0]!.iri).toBe(`${url}#ch-a`);
    expect(model.chapters[0]!.isPartOf).toEqual([url]);
    expect(model.steps[0]!.checkedBy).toEqual([`${url}#q-a-1a`]);
    expect(model.inSeries).toEqual([{ kind: "iri", value: `${url}#series` }]);
    expect(model.activities).toEqual([{ iri: `${url}#compilation`, generating: true }]);
  });

  it("reads what the records leave unsaid from the statements: other types and decks, text formats, distractors, keywords, times", () => {
    const deck = deckDraft();
    const draft = {
      ...deck,
      root: {
        ...deck.root,
        keyword: { en: ["a", "b"], sv: ["c"] },
        issued: "2026-10-10T10:00:00.000Z",
        versionNotes: "First",
        publisher: of("me"),
        theme: ["https://theme.example/"],
      },
      cards: [
        { id: "w1", data: { ...deck.cards[0]!.data, back: { "": "plain" }, textFormat: SM.markdown, distractor: [of("w1-x")], deprecated: true } },
      ],
      triples: [
        link(DRAFT, RDF_TYPE, "https://schema.org/Book"),
        link(DRAFT, RDF_TYPE, SM.Deck),
        link(of("other"), RDF_TYPE, SM.Deck),
        link(of("turtle"), SM.textFormat, SM.markdown),
        link(of("note"), SM.distractor, of("w1")),
        link(of("old"), RDF_TYPE, `${PROV}Activity`),
      ],
    };
    const model = draftReleaseModel(draft);
    expect(model.types).toEqual([SM.Deck, "http://www.w3.org/ns/dcat#Dataset", "https://schema.org/Book"]);
    expect(model.decks).toEqual([DRAFT, of("other")]);
    expect(model.keywords.map((k) => [k.value, (k as { language: string }).language])).toEqual([
      ["a", "en"],
      ["b", "en"],
      ["c", "sv"],
    ]);
    expect(model.issued).toEqual([{ kind: "literal", value: "2026-10-10T10:00:00.000Z", language: "", datatype: `${XSD}dateTime` }]);
    expect(model.versionNotes.map((n) => n.value)).toEqual(["First"]);
    expect(model.publisher).toEqual([{ kind: "iri", value: of("me") }]);
    expect(model.themes).toEqual([{ kind: "iri", value: "https://theme.example/" }]);
    expect(model.studyDirection).toEqual([{ kind: "iri", value: SM.bidirectional }]);
    expect(model.cards[0]).toMatchObject({ retired: true, back: [{ value: "plain", language: "", datatype: `${XSD}string` }] });
    expect(model.distractors).toEqual([{ iri: of("w1-x"), typed: false, retired: false, text: [], note: [] }]);
    expect(model.distractorLinks).toEqual([
      { subject: of("w1"), object: { kind: "iri", value: of("w1-x") } },
      { subject: of("note"), object: { kind: "iri", value: of("w1") } },
    ]);
    expect(model.textFormats).toEqual([
      { subject: of("w1"), object: { kind: "iri", value: SM.markdown } },
      { subject: of("turtle"), object: { kind: "iri", value: SM.markdown } },
    ]);
    expect(model.activities).toEqual([{ iri: of("old"), generating: false }]);
  });

  it("reads a chapter or step without a place, chapter or course as having none", () => {
    const draft = courseDraft();
    const loose = {
      ...draft,
      chapters: [{ id: "ch-x", data: { reviewQuestion: [] } }],
      steps: [{ id: "s-x", data: { checkedBy: [] } }],
    };
    const model = draftReleaseModel(loose);
    expect(model.chapters[0]).toMatchObject({ isPartOf: [], positions: [] });
    expect(model.steps[0]).toMatchObject({ isPartOf: [], positions: [] });
  });

  it("names a distractor two cards share once", () => {
    const deck = deckDraft();
    const shared = { ...deck.cards[0]!.data, distractor: [of("x")] };
    const model = draftReleaseModel({ ...deck, cards: [{ id: "a", data: shared }, { id: "b", data: shared }] });
    expect(model.distractors.map((d) => d.iri)).toEqual([of("x")]);
  });
});
