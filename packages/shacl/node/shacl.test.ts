import { NS_ROOT, VOCAB_ROOT } from "@solid-memo/vocab/tooling/root";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  loadEngine,
  loadProfileEngine,
  loadReferenceData,
  loadShapesGraph,
  validateProfile,
  validateTurtleDocument,
} from "./shacl.ts";
import { parseTurtle, readTurtleTree } from "@solid-memo/turtle/rdf";
import { VOCAB_BASE } from "@solid-memo/vocab/tooling/sources";
import { SM_NS as SM } from "@solid-memo/vocab/vocab.generated";

const ROOT = VOCAB_ROOT;
const DC = "http://purl.org/dc/terms/";
const SCHEMA = "https://schema.org/";

/** What each invalid fixture must be rejected for. */
const EXPECTED: Record<string, { path?: string; message: string }> = {
  "answer/v1/invalid/grade-out-of-range.ttl": { path: `${SM}grade`, message: "An answer's grade is one whole number, 0 to 5." },
  "answer/v1/invalid/both-ways.ttl": { path: `${SM}answeredDirection`, message: "An answer states the way the card was asked" },
  "answer/v1/invalid/study-day-as-date.ttl": { path: `${SM}answeredOn`, message: "The study day an answer counts towards" },
  "answer/v1/invalid/unknown-mode.ttl": { path: `${SM}answerMode`, message: "An answer states how it was given, at most once" },
  "card/v5/invalid/distractor-as-literal.ttl": { path: `${SM}distractor`, message: "A card's distractors, its wrong options, are IRIs" },
  "card/v5/invalid/two-text-formats.ttl": { path: `${SM}textFormat`, message: "A card's text format is at most one IRI, a concept of solid-memo:TextFormats." },
  "card/v5/invalid/text-format-as-literal.ttl": { path: `${SM}textFormat`, message: "A card's text format is at most one IRI, a concept of solid-memo:TextFormats." },
  "chapter/v1/invalid/library-without-english-title.ttl": { path: `${DC}title`, message: "A chapter's title is language-tagged text, one per language, and one of them English" },
  "chapter/v1/invalid/library-with-negative-position.ttl": { path: `${SCHEMA}position`, message: "A chapter's place among the course's chapters is one whole number, 0 or more" },
  "chapter/v1/invalid/library-without-course.ttl": { path: `${SCHEMA}isPartOf`, message: "A chapter is part of one course" },
  "chapter/v1/invalid/library-with-two-text-formats.ttl": { path: `${SM}textFormat`, message: "A chapter's text format is at most one IRI" },
  "distractor/v1/invalid/tagged-and-untagged-text.ttl": { message: "A distractor's text is either untagged or language-tagged, never both." },
  "distractor/v1/invalid/without-text.ttl": { path: `${SM}distractorText`, message: "A distractor's text is one untagged text" },
  "distractor/v1/invalid/untagged-note.ttl": { path: `${SM}distractorNote`, message: "A note on why an option is wrong is language-tagged text" },
  "distractor/v1/invalid/not-an-answer.ttl": { path: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type", message: "A distractor is a schema:Answer." },
  "distractor/v1/invalid/deprecated-not-boolean.ttl": { path: "http://www.w3.org/2002/07/owl#deprecated", message: "A retired distractor states owl:deprecated true" },
  "step/v1/invalid/library-without-theory.ttl": { path: `${SM}theory`, message: "A step's theory is language-tagged text, one per language, and one of them English" },
  "step/v1/invalid/library-with-untagged-theory.ttl": { path: `${SM}theory`, message: "A step's theory is language-tagged text, one per language, and one of them English" },
  "step/v1/invalid/library-without-question.ttl": { path: `${SM}checkedBy`, message: "A step is checked by one or more cards of the release" },
  "step/v1/invalid/library-with-text-format-literal.ttl": { path: `${SM}textFormat`, message: "A step's text format is at most one IRI" },
  "card/v1/invalid/missing-back.ttl": { path: `${SM}back`, message: "A format-1 card has text on its back." },
  "card/v2/invalid/image-as-literal.ttl": { path: `${SM}frontImage`, message: "A picture is an IRI" },
  "card/v2/invalid/side-without-content.ttl": { message: "Each side of a card needs text or a picture." },
  "card/v2/invalid/untyped-version.ttl": { path: `${SM}formatVersion`, message: "Card format 2 states its format version, 2." },
  "card/v3/invalid/deprecated-as-string.ttl": { path: "http://www.w3.org/2002/07/owl#deprecated", message: "A retired card states owl:deprecated true" },
  "card/v3/invalid/untagged-note.ttl": { path: `${SM}backNote`, message: "A note under the back is language-tagged text" },
  "card/v3/invalid/two-english-labels.ttl": { path: `${SM}backLabel`, message: "A label above the back is language-tagged text" },
  "card/v3/invalid/front-note-without-english.ttl": { message: "Each side of a card needs text or a picture, and a note or label" },
  "card/v3/invalid/side-without-content.ttl": { message: "Each side of a card needs text or a picture, and a note or label" },
  "card/v3/invalid/tagged-back.ttl": { path: `${SM}back`, message: "Value does not have datatype" },
  "card/v4/invalid/tagged-and-untagged-back.ttl": { message: "Each side of a card needs text or a picture, its text either untagged or language-tagged, never both" },
  "card/v4/invalid/two-untagged-fronts.ttl": { path: `${SM}front`, message: "A side's text is one untagged text" },
  "card/v4/invalid/two-english-backs.ttl": { path: `${SM}back`, message: 'Language "en" has been used by 2 values' },
  "card/v4/invalid/untagged-image-description.ttl": { path: `${SM}frontImageDescription`, message: "A picture's description is language-tagged text" },
  "card/v4/invalid/two-english-image-descriptions.ttl": { path: `${SM}backImageDescription`, message: 'Language "en" has been used by 2 values' },
  "card/v4/invalid/back-as-iri.ttl": { path: `${SM}back`, message: "A side's text is one untagged text" },
  "card/v5/invalid/tagged-and-untagged-front.ttl": { message: "Each side of a card needs text or a picture, its text either untagged or language-tagged, never both." },
  "card/v5/invalid/untagged-note.ttl": { path: `${SM}backNote`, message: "A note under the back is language-tagged text in any language, one per language" },
  "card/v5/invalid/two-swedish-labels.ttl": { path: `${SM}backLabel`, message: 'Language "sv" has been used by 2 values' },
  "deck/v1/invalid/missing-title.ttl": { path: `${DC}title`, message: "Less than 1 values" },
  "deck/v2/invalid/bad-direction.ttl": { path: `${SM}direction`, message: "A format-2 deck states its direction" },
  "deck/v2/invalid/missing-direction.ttl": { path: `${SM}direction`, message: "A format-2 deck states its direction" },
  "deck/v2/invalid/pod-without-cards-document.ttl": { path: `${SM}cardsDocument`, message: "Less than 1 values" },
  "deck/v2/invalid/library-with-cards-document.ttl": { path: `${SM}cardsDocument`, message: "A library deck has no cards document" },
  "deck/v2/invalid/modified-not-a-datetime.ttl": { path: `${DC}modified`, message: "A modification time is an xsd:dateTime" },
  "instance/v1/invalid/missing-created.ttl": { path: `${DC}created`, message: "Less than 1 values" },
  "review-state/v1/invalid/missing-due.ttl": { path: `${SM}due`, message: "The due day is a plain" },
  "review-state/v1/invalid/bad-subject-suffix.ttl": { message: "A review state names its card with solid-memo:reviewOf or is named #<cardId> or #<cardId>@back-to-front." },
  "review-state/v2/invalid/partial-snapshot.ttl": { message: "A review state names its card with solid-memo:reviewOf or is named #<cardId> or #<cardId>@back-to-front, and its previous* snapshot is all five triples or none." },
  "review-state/v2/invalid/bad-subject-suffix.ttl": { message: "A review state names its card with solid-memo:reviewOf or is named #<cardId>" },
  "review-state/v2/invalid/both-ways.ttl": { path: `${SM}reviewDirection`, message: "A review state's direction is at most one of solid-memo:frontToBack or solid-memo:backToFront." },
  "review-state/v2/invalid/card-as-literal.ttl": { path: `${SM}reviewOf`, message: "A review state names at most one card, an IRI" },
  "review-state/v2/invalid/scheduler-as-literal.ttl": { path: `${SM}scheduler`, message: "A review state's scheduler is at most one IRI" },
  "review-state/v2/invalid/due-not-a-day.ttl": { path: `${SM}due`, message: 'The due day is a plain "YYYY-MM-DD" string.' },
  "preferences/v1/invalid/bad-answer-scale.ttl": { path: `${SM}answerScale`, message: "The answer scale is sm2 or minimal." },
  "preferences/v2/invalid/missing-developer-mode.ttl": { path: `${SM}developerMode`, message: "Less than 1 values" },
  "preferences/v2/invalid/hour-out-of-range.ttl": { path: `${SM}dayBoundaryHour`, message: "The day boundary is an hour of the day, 0 to 23." },
  "preferences/v3/invalid/missing-policy.ttl": { path: `${SM}invalidDataPolicy`, message: "Preferences state what to do with invalid data" },
  "preferences/v3/invalid/unknown-policy.ttl": { path: `${SM}invalidDataPolicy`, message: "Preferences state what to do with invalid data" },
  "preferences/v4/invalid/missing-theme.ttl": { path: `${SM}theme`, message: "Preferences state the theme" },
  "preferences/v4/invalid/unknown-theme.ttl": { path: `${SM}theme`, message: "Preferences state the theme" },
  "deck/v3/invalid/pod-with-old-direction.ttl": { path: `${SM}direction`, message: "Format 3 states the study direction with solid-memo:studyDirection" },
  "deck/v3/invalid/pod-without-description.ttl": { path: `${DC}description`, message: "A format-3 deck has a description" },
  "deck/v3/invalid/unknown-direction.ttl": { path: `${SM}studyDirection`, message: "A format-3 deck states its study direction" },
  "deck/v3/invalid/library-without-series.ttl": { path: "http://www.w3.org/ns/dcat#inSeries", message: "A release belongs to its deck's series." },
  "deck/v3/invalid/library-without-education-theme.ttl": { path: "http://www.w3.org/ns/dcat#theme", message: "A library deck has the EU data theme EDUC" },
  "deck/v3/invalid/library-with-source.ttl": { path: `${DC}source`, message: "A format-3 deck names what it is drawn from with prov:wasDerivedFrom" },
  "deck/v3/invalid/library-bad-version.ttl": { path: "http://www.w3.org/ns/dcat#version", message: "A release states its version: 1, 2, …" },
  "deck/v3/invalid/pod-with-negative-new-cards-per-day.ttl": { path: `${SM}deckNewCardsPerDay`, message: "A deck's new cards per day is one whole number, 0 or more." },
  "deck/v3/invalid/library-with-new-cards-per-day.ttl": { path: `${SM}deckNewCardsPerDay`, message: "A library deck sets no study caps" },
  "deck/v4/invalid/pod-with-untagged-title.ttl": { path: `${DC}title`, message: "A title is language-tagged text, one per language, and one of them English" },
  "deck/v4/invalid/pod-with-two-titles-in-one-language.ttl": { path: `${DC}title`, message: 'Language "sv" has been used by 2 values' },
  "deck/v4/invalid/pod-with-two-english-titles.ttl": { path: `${DC}title`, message: "A title is language-tagged text, one per language, and one of them English" },
  "deck/v4/invalid/library-without-english-description.ttl": { path: `${DC}description`, message: "A description is language-tagged text, one per language, and one of them English" },
  "deck/v5/invalid/pod-with-untagged-title.ttl": { path: `${DC}title`, message: "A deck's title is language-tagged text in any language, one per language" },
  "deck/v5/invalid/pod-with-two-titles-in-one-language.ttl": { path: `${DC}title`, message: 'Language "sv" has been used by 2 values' },
  "deck/v5/invalid/pod-without-description.ttl": { path: `${DC}description`, message: "A deck's description is language-tagged text in any language, one per language" },
  "deck/v6/invalid/pod-with-typed-keyword.ttl": { path: "http://www.w3.org/ns/dcat#keyword", message: "A keyword is language-tagged text (\"…\"@sv), several per language; untagged keywords are kept only from older formats." },
  "deck/v6/invalid/pod-with-keyword-iri.ttl": { path: "http://www.w3.org/ns/dcat#keyword", message: "A keyword is language-tagged text" },
  "library-deck/v5/invalid/library-with-untagged-keyword.ttl": { path: "http://www.w3.org/ns/dcat#keyword", message: "A library deck's keyword is language-tagged text (\"…\"@sv), several per language." },
  "deck-series/v3/invalid/library-with-keyword-iri.ttl": { path: "http://www.w3.org/ns/dcat#keyword", message: "A keyword is language-tagged text (\"…\"@sv), several per language, or untagged as copied from an older release." },
  "deck-series/v2/invalid/library-with-untagged-description.ttl": { path: `${DC}description`, message: "A description is language-tagged text, one per language, and one of them English" },
  "deck-series/v1/invalid/library-without-current-version.ttl": { path: "http://www.w3.org/ns/dcat#hasCurrentVersion", message: "A deck series names its current release." },
  "deck-group/v1/invalid/pod-without-title.ttl": { path: `${DC}title`, message: "A deck group's name is language-tagged text in any language, one per language" },
  "deck-group/v1/invalid/pod-with-untagged-title.ttl": { path: `${DC}title`, message: "A deck group's name is language-tagged text in any language, one per language" },
  "deck-group/v1/invalid/pod-without-publisher.ttl": { path: `${DC}publisher`, message: "A deck group names its publisher" },
  "deck-group/v1/invalid/pod-with-negative-position.ttl": { path: `${SM}position`, message: "A deck group's position among its parent's members is one whole number, 0 or more." },
  "catalog/v1/invalid/without-publisher.ttl": { path: `${DC}publisher`, message: "A catalogue names its publisher" },
  "agent/v1/invalid/without-name.ttl": { path: "http://xmlns.com/foaf/0.1/name", message: "An agent has a name." },
  "agent/v1/invalid/mbox-not-mailto.ttl": { path: "http://xmlns.com/foaf/0.1/mbox", message: "An agent's mailbox is a mailto: IRI." },
};

const contextOf = (path: string) =>
  path.includes("/library-") ? ("library" as const) : ("pod" as const);

describe("the shapes over the fixtures", async () => {
  const engine = await loadEngine();
  const fixtures = (await readTurtleTree(`${ROOT}fixtures`)).filter(
    (f) => !f.path.startsWith("profile/"),
  );
  const base = (path: string) => `https://pod.example/${path}`;

  it("accept every valid fixture", async () => {
    const valid = fixtures.filter((f) => f.path.includes("/valid/"));
    expect(valid.length).toBeGreaterThan(10);
    for (const { path, turtle } of valid) {
      await expect(
        validateTurtleDocument(path, parseTurtle(turtle, base(path)), engine, contextOf(path)),
        path,
      ).resolves.toBeUndefined();
    }
  });

  it("reject every invalid fixture for the expected reason", async () => {
    const invalid = fixtures.filter((f) => f.path.includes("/invalid/"));
    expect(invalid.map((f) => f.path).sort()).toEqual(Object.keys(EXPECTED).sort());
    for (const { path, turtle } of invalid) {
      const expected = EXPECTED[path];
      const where = expected.path === undefined ? ">: " : ` (${expected.path}): `;
      await expect(
        validateTurtleDocument(path, parseTurtle(turtle, base(path)), engine, contextOf(path)),
        path,
      ).rejects.toThrow(`${path}:\n  <`);
      await expect(
        validateTurtleDocument(path, parseTurtle(turtle, base(path)), engine, contextOf(path)),
        path,
      ).rejects.toThrow(`${where}${expected.message}`);
    }
  });

  it("report a format this app does not know", async () => {
    const { turtle } = fixtures.find((f) => f.path === "card/unknown-version.ttl")!;
    await expect(
      validateTurtleDocument("x.ttl", parseTurtle(turtle, base("x.ttl")), engine, "pod"),
    ).rejects.toThrow(
      "x.ttl:\n  <https://pod.example/x.ttl#se> is card format 6; this app knows formats 1–5.",
    );
  });

  it("reject a subject typed with a Solid Memo term that is no class", async () => {
    const quads = parseTurtle(`<#x> a <https://solid-memo.com/ns/vocab/v1.ttl#front> .`, base("x.ttl"));
    await expect(validateTurtleDocument("x.ttl", quads, engine, "pod")).rejects.toThrow(
      "x.ttl:\n  <https://pod.example/x.ttl#x> is typed with a Solid Memo term that names no class.",
    );
  });

  it("skip subjects without a Solid Memo type", async () => {
    const quads = parseTurtle(
      `<https://en.wikipedia.org/> <http://purl.org/dc/terms/title> "Wikipedia" .`,
      base("x.ttl"),
    );
    await expect(validateTurtleDocument("x.ttl", quads, engine, "library")).resolves.toBeUndefined();
  });
});

describe("loadShapesGraph", () => {
  it("merges every shape the app knows into one graph", async () => {
    const graph = await loadShapesGraph();
    expect(graph.size).toBeGreaterThan(500);
  });
});

const DCAT = "http://www.w3.org/ns/dcat#";
const FOAF = "http://xmlns.com/foaf/0.1/";
const SKOS = "http://www.w3.org/2004/02/skos/core#";

/**
 * What each invalid profile fixture must be rejected for: every property
 * DCAT-AP 3.0.1 makes mandatory on the classes Solid Memo writes, and
 * the class checks its values must pass.
 */
const PROFILE_EXPECTED: Record<string, { path: string; message: string }> = {
  "dcat-ap/invalid/agent-without-name.ttl": { path: `${FOAF}name`, message: "Less than 1 values" },
  "dcat-ap/invalid/catalog-lists-untyped-group.ttl": { path: `${DCAT}catalog`, message: "Class constraint failed." },
  "dcat-ap/invalid/catalog-without-publisher.ttl": { path: `${DC}publisher`, message: "Less than 1 values" },
  "dcat-ap/invalid/dataset-without-description.ttl": { path: `${DC}description`, message: "Less than 1 values" },
  "dcat-ap/invalid/distribution-without-access-url.ttl": { path: `${DCAT}accessURL`, message: "Less than 1 values" },
  "dcat-ap/invalid/language-not-described.ttl": { path: `${DC}language`, message: "Class constraint failed." },
  "dcat-ap/invalid/series-without-title.ttl": { path: `${DC}title`, message: "Less than 1 values" },
  "dcat-ap/invalid/source-not-a-dataset.ttl": { path: `${DC}source`, message: "Class constraint failed." },
  "dcat-ap/invalid/theme-not-a-concept.ttl": { path: `${DCAT}theme`, message: "Class constraint failed." },
  "skos/invalid/concept-without-label.ttl": { path: `${SKOS}prefLabel`, message: "S14: A resource has no more than one value" },
  "skos/invalid/scheme-without-title.ttl": { path: `${DC}title`, message: "Concept Scheme has no dct:title with a language tag!" },
  "skos/invalid/two-labels-in-one-language.ttl": { path: `${SKOS}prefLabel`, message: 'Language "en" has been used by 2 values' },
};

describe("the vendored profiles over their fixtures", async () => {
  const reference = await loadReferenceData();
  const engines = {
    "dcat-ap": await loadProfileEngine(ROOT, "dcat-ap"),
    skos: await loadProfileEngine(ROOT, "skos"),
  };
  const fixtures = await readTurtleTree(`${ROOT}fixtures/profile`);
  const profileOf = (path: string) => (path.startsWith("skos/") ? "skos" : "dcat-ap");
  // Solid Memo's own concept schemes are held to SKOS best practice too.
  const minimumOf = (path: string) => (profileOf(path) === "skos" ? "warning" : "violation");
  const check = (path: string, turtle: string) =>
    validateProfile(
      path,
      parseTurtle(turtle, `https://pod.example/${path}`),
      engines[profileOf(path)],
      reference,
      minimumOf(path),
    );

  it("accept every valid fixture", async () => {
    const valid = fixtures.filter((f) => f.path.includes("/valid/"));
    expect(valid.map((f) => f.path)).toEqual(["dcat-ap/valid/library.ttl", "skos/valid/scheme.ttl"]);
    for (const { path, turtle } of valid) {
      await expect(check(path, turtle), path).resolves.toBeUndefined();
    }
  });

  it("reject every invalid fixture for the expected reason", async () => {
    const invalid = fixtures.filter((f) => f.path.includes("/invalid/"));
    expect(invalid.map((f) => f.path).sort()).toEqual(Object.keys(PROFILE_EXPECTED).sort());
    for (const { path, turtle } of invalid) {
      const expected = PROFILE_EXPECTED[path];
      await expect(check(path, turtle), path).rejects.toThrow(`${path}:\n  <`);
      await expect(check(path, turtle), path).rejects.toThrow(
        ` (${expected.path}): ${expected.message}`,
      );
    }
  });

  it("let a profile's warnings pass unless asked to fail on them", async () => {
    const { path, turtle } = fixtures.find((f) => f.path === "skos/invalid/scheme-without-title.ttl")!;
    await expect(
      validateProfile(path, parseTurtle(turtle, `https://pod.example/${path}`), engines.skos, reference),
    ).resolves.toBeUndefined();
  });

  it("report only results about the document's own subjects", async () => {
    const quads = parseTurtle(`<#x> <${DC}title> "x" .`, "https://pod.example/x.ttl");
    const unlabelled = parseTurtle(`<#y> a <${FOAF}Agent> .`, "https://pod.example/y.ttl");
    await expect(
      validateProfile("x.ttl", quads, engines["dcat-ap"], unlabelled),
    ).resolves.toBeUndefined();
  });

  it("name a result on the subject itself without a path", async () => {
    const quads = parseTurtle(`<#x> <${DC}title> "x" .`, "https://pod.example/x.ttl");
    const engine = {
      validateNode: async () => [],
      validate: async () => [
        {
          focusNode: "https://pod.example/x.ttl#x",
          message: { en: "Not allowed." },
          severity: "violation" as const,
          constraint: "Not",
        },
      ],
    };
    await expect(validateProfile("x.ttl", quads, engine, [])).rejects.toThrow(
      "x.ttl:\n  <https://pod.example/x.ttl#x>: Not allowed.",
    );
  });

  it("accept the valid decks, catalogue, deck groups and series, which Solid Memo writes, whatever the title's language", async () => {
    const fixture = async (path: string) => {
      const { turtle } = (await readTurtleTree(`${ROOT}fixtures`)).find((f) => f.path === path)!;
      return parseTurtle(turtle, `https://pod.example/${path}`);
    };
    const index = await fixture("deck-series/v3/valid/library-index.ttl");
    await expect(
      validateProfile("pod", await fixture("deck/v4/valid/pod.ttl"), engines["dcat-ap"], reference),
    ).resolves.toBeUndefined();
    for (const path of ["deck/v5/valid/pod-titled-in-swedish.ttl", "deck/v5/valid/pod-titled-in-japanese-and-english.ttl", "deck/v5/valid/pod-with-stand-in.ttl", "deck/v6/valid/pod.ttl", "deck-group/v1/valid/pod.ttl"]) {
      await expect(validateProfile(path, await fixture(path), engines["dcat-ap"], reference), path).resolves.toBeUndefined();
    }
    await expect(
      validateProfile("release", await fixture("deck/v4/valid/library-release.ttl"), engines["dcat-ap"], [...reference, ...index]),
    ).resolves.toBeUndefined();
    await expect(
      validateProfile("release", await fixture("library-deck/v5/valid/library-release.ttl"), engines["dcat-ap"], [...reference, ...index]),
    ).resolves.toBeUndefined();
    for (const path of ["deck-series/v2/valid/library-index.ttl", "deck-series/v3/valid/library-index-with-untagged-keywords.ttl"]) {
      await expect(validateProfile(path, await fixture(path), engines["dcat-ap"], reference), path).resolves.toBeUndefined();
    }
    await expect(
      validateProfile("series", index, engines["dcat-ap"], reference),
    ).resolves.toBeUndefined();
  });

  it("accept the reference data under both profiles", async () => {
    await expect(
      validateProfile("vocab/external.ttl", reference, engines["dcat-ap"], []),
    ).resolves.toBeUndefined();
    await expect(
      validateProfile("vocab/external.ttl", reference, engines.skos, [], "warning"),
    ).resolves.toBeUndefined();
  });
});

describe("ns/vocab/", async () => {
  it("holds every concept scheme to SKOS, best practice included", async () => {
    const engine = await loadProfileEngine(ROOT, "skos");
    for (const { path, turtle } of await readTurtleTree(`${NS_ROOT}vocab`)) {
      await expect(
        validateProfile(
          `ns/vocab/${path}`,
          parseTurtle(turtle, `${VOCAB_BASE}${path}`),
          engine,
          [],
          "warning",
        ),
      ).resolves.toBeUndefined();
    }
  });
});

describe("vendor/", async () => {
  const manifest = JSON.parse(await readFile(`${ROOT}vendor/manifest.json`, "utf8")) as {
    files: { path: string; sha256: string }[];
  };

  it("holds every vendored file byte for byte as its manifest entry records", async () => {
    const onDisk = (await readTurtleTree(`${ROOT}vendor`)).map((f) => f.path);
    expect(manifest.files.map((f) => f.path).sort()).toEqual(onDisk);
    for (const { path, sha256 } of manifest.files) {
      const bytes = await readFile(`${ROOT}vendor/${path}`);
      expect(createHash("sha256").update(bytes).digest("hex"), path).toBe(sha256);
    }
  });
});
