import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  baseProblems,
  buildIndex,
  courseProblems,
  defaultIo,
  INDEX_URL,
  loadValidators,
  main,
  markdownProblems,
  metadataProblems,
  NEWCOMER_COURSE,
  newcomerProblems,
  normalizationProblems,
  releasesOf,
  run,
  validateLibrary,
  type DeckRelease,
  type LibraryIo,
} from "./deckLibrary.ts";
import { DataFactory, type Quad_Object, type Quad_Subject } from "n3";
import { formatTurtle } from "@solid-memo/turtle/formatTurtle";
import { parseTurtle, RDF_TYPE } from "@solid-memo/turtle/rdf";
import { SM_NS as SM } from "@solid-memo/vocab/tooling/vocab";

const validators = await loadValidators();

const DCAT = "http://www.w3.org/ns/dcat#";
const DCTERMS = "http://purl.org/dc/terms/";
const DECKS = "https://solid-memo.com/decks/";
const INDEX = `${DECKS}index.ttl`;

interface Fixture {
  /** Card ids → front and back; a card in `retired` states owl:deprecated true. */
  cards?: Record<string, [string, string]>;
  retired?: string[];
  title?: string;
  notes?: string;
  issued?: string | null;
  /** Replaces what follows the deck's metadata on the deck subject. */
  release?: string;
  /** A course's outline, cards and distractors, in Turtle: the release is then a schema:Course too. */
  course?: string;
}

/** A release of `deck` in library deck format 5, as decks/<deck>/v<version>.ttl holds it. */
function releaseText(deck: string, version: number, fixture: Fixture = {}): string {
  const {
    cards = { se: ["Sweden", "Stockholm"] },
    retired = [],
    title = "Capitals",
    notes = version === 1 ? "First release." : "Changed.",
    issued = `2026-10-0${version}T10:00:00Z`,
  } = fixture;
  const previous = `<${DECKS}${deck}/v${version - 1}.ttl>`;
  const release =
    fixture.release ??
    [
      `    dcat:version "${version}" ;`,
      `    dcterms:publisher <${INDEX}#solid-memo> ;`,
      `    dcat:inSeries <${INDEX}#${deck}> ;`,
      `    dcat:isVersionOf <${INDEX}#${deck}> ;`,
      ...(version > 1 ? [`    dcat:prev ${previous} ;`, `    dcat:previousVersion ${previous} ;`] : []),
    ].join("\n");
  return `@base <${DECKS}${deck}/v${version}.ttl> .

@prefix solid-memo: <${SM}> .
@prefix dcterms:    <http://purl.org/dc/terms/> .
@prefix dcat:       <http://www.w3.org/ns/dcat#> .
@prefix foaf:       <http://xmlns.com/foaf/0.1/> .
@prefix adms:       <http://www.w3.org/ns/adms#> .
@prefix owl:        <http://www.w3.org/2002/07/owl#> .
@prefix xsd:        <http://www.w3.org/2001/XMLSchema#> .
@prefix schema:     <https://schema.org/> .

<>
    a solid-memo:Deck ,
      dcat:Dataset${fixture.course === undefined ? "" : " ,\n      schema:Course"} ;
    solid-memo:formatVersion 5 ;
    dcterms:title "${title}"@en ;
    dcterms:description "${title} of the world."@en ;
    dcterms:creator <#anton> ;
    dcterms:license <https://creativecommons.org/publicdomain/zero/1.0/> ;
${issued === null ? "" : `    dcterms:issued "${issued}"^^xsd:dateTime ;\n`}    solid-memo:studyDirection solid-memo:frontToBack ;
    dcat:theme <http://publications.europa.eu/resource/authority/data-theme/EDUC> ,
               <https://solid-memo.com/ns/vocab/topics.ttl#geography> ;
    dcat:keyword "capitals"@en ;
    dcterms:language <http://publications.europa.eu/resource/authority/language/ENG> ;
    adms:versionNotes "${notes}" ;
    dcat:distribution <#turtle> ;
${release} .

<#anton>
    a foaf:Agent ;
    foaf:name "Anton" .

<#turtle>
    a dcat:Distribution ;
    dcat:accessURL <> ;
    dcat:downloadURL <> ;
    dcat:mediaType <https://www.iana.org/assignments/media-types/text/turtle> .

<https://creativecommons.org/publicdomain/zero/1.0/>
    a dcterms:LicenseDocument .
${Object.entries(cards)
  .map(
    ([id, [front, back]]) => `
<#${id}>
    a solid-memo:Card ;
    solid-memo:formatVersion 4 ;
    solid-memo:front "${front}" ;
    solid-memo:back "${back}"${retired.includes(id) ? " ;\n    owl:deprecated true" : ""} .
`,
  )
  .join("")}${fixture.course ?? ""}`;
}

function release(deck: string, version: number, fixture?: Fixture): DeckRelease {
  const turtle = releaseText(deck, version, fixture);
  return { deck, version, turtle, quads: parseTurtle(turtle, `${DECKS}${deck}/v${version}.ttl`) };
}

const NORWAY: Fixture = { cards: { se: ["Sweden", "Stockholm"], no: ["Norway", "Oslo"] } };
const CAPITALS = [release("capitals", 1), release("capitals", 2, NORWAY)];
const RIVERS = release("rivers", 1, { title: "Rivers" });
const LIBRARY = [...CAPITALS, RIVERS];

/** What a course's subject states to be retired. */
const RETIRED = " ;\n    owl:deprecated true";

function chapter(id: string, position: number, extra = ""): string {
  return `
<#${id}>
    a solid-memo:Chapter ,
      schema:Syllabus ;
    solid-memo:formatVersion 1 ;
    dcterms:title "Chapter ${id}"@en ;
    schema:isPartOf <> ;
    schema:position ${position}${extra} .
`;
}

function step(id: string, of: string, position: number, checks: readonly string[], extra = ""): string {
  return `
<#${id}>
    a solid-memo:Step ,
      schema:LearningResource ;
    solid-memo:formatVersion 1 ;
    solid-memo:theory "Theory ${id}."@en ;
    schema:isPartOf <#${of}> ;
    schema:position ${position} ;
    solid-memo:checkedBy ${checks.map((card) => `<#${card}>`).join(" , ")}${extra} .
`;
}

/** A card a course asks, naming its distractors; `back` replaces its English back. */
function question(id: string, distractors: readonly string[], extra = "", back = `solid-memo:back "Answer ${id}"@en ;`): string {
  const named = distractors.length === 0 ? "" : ` ;\n    solid-memo:distractor ${distractors.map((d) => `<#${d}>`).join(" , ")}`;
  return `
<#${id}>
    a solid-memo:Card ;
    solid-memo:front "Question ${id}"@en ;
    ${back}
    solid-memo:formatVersion 5${named}${extra} .
`;
}

function distractor(id: string, extra = "", text = `"Wrong ${id}"@en`): string {
  return `
<#${id}>
    a solid-memo:Distractor ,
      schema:Answer ;
    solid-memo:formatVersion 1 ;
    solid-memo:distractorText ${text}${extra} .
`;
}

/** A card a course asks with its two distractors. */
function asked(id: string): string {
  return question(id, [`${id}-a`, `${id}-b`]) + distractor(`${id}-a`) + distractor(`${id}-b`);
}

/** Two chapters: the first with a step and a review question, the second with a step. */
const OUTLINE = [
  chapter("ch-1", 0, " ;\n    solid-memo:reviewQuestion <#q-2>"),
  chapter("ch-2", 1),
  step("s-1", "ch-1", 0, ["q-1"]),
  step("s-2", "ch-2", 0, ["q-3"]),
  asked("q-1"),
  asked("q-2"),
  asked("q-3"),
].join("");

/** A version of the course "solid", its outline and cards beside the fixture's one card. */
function course(version: number, outline = OUTLINE): DeckRelease {
  return release("solid", version, { title: "Solid", course: outline });
}

/** The library's files for these releases, its index built from them. */
function filesOf(releases: readonly DeckRelease[], index = buildIndex(releases)): Map<string, string> {
  return new Map([
    ["index.ttl", index],
    ...releases.map((r) => [`${r.deck}/v${r.version}.ttl`, r.turtle] as [string, string]),
  ]);
}

describe("releasesOf", () => {
  it("reads every release, sorted by deck then version", () => {
    const { releases, problems } = releasesOf(filesOf([RIVERS, CAPITALS[1], CAPITALS[0]]));
    expect(releases.map((r) => `${r.deck}/v${r.version}`)).toEqual(["capitals/v1", "capitals/v2", "rivers/v1"]);
    expect(releases[0].quads).toEqual(CAPITALS[0].quads);
    expect(problems).toEqual([]);
  });

  it("names every file that is neither the index nor a release, a gap in a deck's versions, and a release that is no Turtle", () => {
    const files = new Map([
      ["README.md", "x"],
      ["Bad_Name/v1.ttl", "x"],
      ["capitals/draft.ttl", "x"],
      ["capitals/v01.ttl", "x"],
      ["capitals/v1.ttl", CAPITALS[0].turtle],
      ["capitals/v3.ttl", "<> <x"],
      ["capitals/nested/v1.ttl", "x"],
    ]);
    const { releases, problems } = releasesOf(files);
    expect(releases.map((r) => `${r.deck}/v${r.version}`)).toEqual(["capitals/v1"]);
    const stray = (path: string) =>
      `decks/${path} is neither the index nor a release: decks/ holds only index.ttl and <name>/v<N>.ttl, the name lower-case letters, digits and dashes.`;
    expect(problems).toEqual([
      stray("README.md"),
      stray("Bad_Name/v1.ttl"),
      stray("capitals/draft.ttl"),
      stray("capitals/v01.ttl"),
      expect.stringMatching(/^decks\/capitals\/v3\.ttl: /),
      stray("capitals/nested/v1.ttl"),
      "decks/capitals/: versions must run 1, 2, … without gaps; found v1.ttl, v3.ttl.",
    ]);
  });
});

describe("buildIndex", () => {
  const index = buildIndex(LIBRARY);
  const quads = parseTurtle(index, "https://elsewhere.example/");
  const of = (s: string, p: string) =>
    quads.filter((q) => q.subject.value === s && q.predicate.value === p).map((q) => q.object.value);

  it("states its own address as its @base, in the house style", () => {
    expect(index.startsWith(`@base <${INDEX}> .\n`)).toBe(true);
    expect(index).toContain("<#capitals>");
    expect(formatTurtle(index, "https://format.invalid/decks/index.ttl")).toBe(index);
  });

  it("is a catalogue of the decks, published by Solid Memo, classified by the EU themes and the topics", () => {
    expect(of(INDEX, RDF_TYPE)).toEqual([`${DCAT}Catalog`]);
    expect(of(INDEX, `${DCAT}dataset`)).toEqual([`${INDEX}#capitals`, `${INDEX}#rivers`]);
    expect(of(INDEX, `${DCTERMS}publisher`)).toEqual([`${INDEX}#solid-memo`]);
    expect(of(INDEX, `${DCTERMS}modified`)).toEqual(["2026-10-02T10:00:00Z"]);
    expect(of(INDEX, `${DCAT}themeTaxonomy`)).toEqual([
      "http://publications.europa.eu/resource/authority/data-theme",
      "https://solid-memo.com/ns/vocab/topics.ttl",
    ]);
    expect(of(`${INDEX}#solid-memo`, "http://xmlns.com/foaf/0.1/name")).toEqual(["Solid Memo"]);
  });

  it("describes each deck as a series of its releases, which are its versions too", () => {
    const series = `${INDEX}#capitals`;
    expect(of(series, RDF_TYPE)).toEqual([`${DCAT}DatasetSeries`, `${DCAT}Dataset`]);
    expect(of(series, `${SM}formatVersion`)).toEqual(["3"]);
    expect(of(series, `${DCTERMS}title`)).toEqual(["Capitals"]);
    expect(of(series, `${DCAT}keyword`)).toEqual(["capitals"]);
    expect(of(series, `${DCAT}first`)).toEqual([`${DECKS}capitals/v1.ttl`]);
    expect(of(series, `${DCAT}last`)).toEqual([`${DECKS}capitals/v2.ttl`]);
    expect(of(series, `${DCAT}hasVersion`)).toEqual([`${DECKS}capitals/v1.ttl`, `${DECKS}capitals/v2.ttl`]);
    expect(of(series, `${DCAT}hasCurrentVersion`)).toEqual([`${DECKS}capitals/v2.ttl`]);
  });

  it("summarizes older releases and describes the current one in full, without its cards", () => {
    expect(of(`${DECKS}capitals/v1.ttl`, `${DCAT}version`)).toEqual(["1"]);
    expect(of(`${DECKS}capitals/v1.ttl`, "http://www.w3.org/ns/adms#versionNotes")).toEqual(["First release."]);
    expect(of(`${DECKS}capitals/v1.ttl`, `${SM}cardCount`)).toEqual([]);
    const current = `${DECKS}capitals/v2.ttl`;
    expect(of(current, `${SM}cardCount`)).toEqual(["2"]);
    expect(of(current, `${SM}studyDirection`)).toEqual([`${SM}frontToBack`]);
    expect(of(`${current}#anton`, "http://xmlns.com/foaf/0.1/name")).toEqual(["Anton"]);
    expect(of(`${current}#se`, `${SM}front`)).toEqual([]);
  });

  it("counts only the cards in use, not the retired ones", () => {
    const retired = release("capitals", 3, { ...NORWAY, retired: ["no"] });
    const built = parseTurtle(buildIndex([...CAPITALS, retired]), INDEX);
    expect(
      built
        .filter((q) => q.subject.value === `${DECKS}capitals/v3.ttl` && q.predicate.value === `${SM}cardCount`)
        .map((q) => q.object.value),
    ).toEqual(["1"]);
  });

  it("leaves out how the current release was made: its activities and every comment", () => {
    const turtle = `${releaseText("capitals", 1)}
<> <http://www.w3.org/ns/prov#wasGeneratedBy> <#compilation> .

<#compilation>
    a <http://www.w3.org/ns/prov#Activity> ;
    <http://www.w3.org/ns/prov#wasAssociatedWith> <#anton> ;
    <http://www.w3.org/ns/prov#wasInformedBy> <#review> .

<#review> a <http://www.w3.org/ns/prov#Activity> .

<#anton> <http://www.w3.org/2000/01/rdf-schema#comment> "Compiled the deck." .
`;
    const made: DeckRelease = { deck: "capitals", version: 1, turtle, quads: parseTurtle(turtle, `${DECKS}capitals/v1.ttl`) };
    const built = parseTurtle(buildIndex([made]), INDEX);
    const current = `${DECKS}capitals/v1.ttl`;
    expect(built.filter((q) => q.subject.value === `${current}#compilation`).map((q) => [q.predicate.value, q.object.value])).toEqual([
      [RDF_TYPE, "http://www.w3.org/ns/prov#Activity"],
    ]);
    expect(built.filter((q) => q.subject.value === `${current}#review`)).toEqual([]);
    expect(built.filter((q) => q.predicate.value === "http://www.w3.org/2000/01/rdf-schema#comment")).toEqual([]);
    expect(built.some((q) => q.subject.value === current && q.object.value === `${current}#compilation`)).toBe(true);
    expect(built.some((q) => q.subject.value === `${current}#anton` && q.object.value === "Anton")).toBe(true);
  });

  it("keeps a course's type but leaves out its chapters, steps and distractors, counting its cards in use", () => {
    const built = parseTurtle(buildIndex([course(1)]), INDEX);
    const current = `${DECKS}solid/v1.ttl`;
    expect(built.filter((q) => q.subject.value === current && q.predicate.value === RDF_TYPE).map((q) => q.object.value)).toContain(
      "https://schema.org/Course",
    );
    expect(built.filter((q) => q.subject.value.startsWith(`${current}#`)).map((q) => q.subject.value)).toEqual([
      `${current}#anton`,
      `${current}#anton`,
      `${current}#turtle`,
      `${current}#turtle`,
      `${current}#turtle`,
      `${current}#turtle`,
    ]);
    expect(
      built.filter((q) => q.subject.value === current && q.predicate.value === `${SM}cardCount`).map((q) => q.object.value),
    ).toEqual(["4"]);
  });

  it("states a node the decks share once", () => {
    const built = parseTurtle(index, INDEX);
    const keys = built.map((q) => JSON.stringify([q.subject.value, q.predicate.value, q.object.value, q.object.termType]));
    expect(new Set(keys).size).toBe(keys.length);
    expect(
      built.filter((q) => q.subject.value === "https://creativecommons.org/publicdomain/zero/1.0/" && q.predicate.value === RDF_TYPE),
    ).toHaveLength(1);
  });

  it("states the current release's themes and keywords as it states them, a blank node too", () => {
    const turtle = `${releaseText("capitals", 1)}\n<> <${DCAT}theme> [ a <http://www.w3.org/2004/02/skos/core#Concept> ] .\n`;
    const built = parseTurtle(buildIndex([{ deck: "capitals", version: 1, turtle, quads: parseTurtle(turtle, `${DECKS}capitals/v1.ttl`) }]), INDEX);
    const themes = built.filter((q) => q.subject.value === `${INDEX}#capitals` && q.predicate.value === `${DCAT}theme`);
    expect(themes.map((q) => q.object.termType)).toEqual(["NamedNode", "NamedNode", "BlankNode"]);
  });

  it("leaves out what a release does not say, for validation to name", () => {
    const bare = (version: number): DeckRelease => ({
      deck: "x",
      version,
      turtle: "",
      quads: parseTurtle(`<> a <${SM}Deck> .`, `${DECKS}x/v${version}.ttl`),
    });
    const built = parseTurtle(buildIndex([bare(1), bare(2)]), INDEX);
    expect(built.filter((q) => q.subject.value === `${DECKS}x/v1.ttl`).map((q) => q.predicate.value)).toEqual([RDF_TYPE]);
    expect(built.some((q) => q.subject.value === `${INDEX}#x` && q.predicate.value === `${DCTERMS}title`)).toBe(false);
    expect(built.some((q) => q.predicate.value === `${DCTERMS}modified`)).toBe(false);
    expect(buildIndex([])).not.toContain("modified");
  });

  it("names the course for newcomers when given one, even one the library does not have", () => {
    const named = (index: string) =>
      parseTurtle(index, INDEX).filter((q) => q.predicate.value === `${SM}newcomerCourse`).map((q) => [q.subject.value, q.object.value]);
    expect(named(buildIndex([course(1)], "solid"))).toEqual([[INDEX, `${INDEX}#solid`]]);
    expect(buildIndex([course(1)], "solid")).toContain("solid-memo:newcomerCourse <#solid>");
    expect(named(buildIndex(LIBRARY, "nowhere"))).toEqual([[INDEX, `${INDEX}#nowhere`]]);
    expect(named(index)).toEqual([]);
  });
});

describe("metadataProblems", () => {
  it("accepts a release whose metadata is what its path says", () => {
    for (const r of LIBRARY) expect(metadataProblems(r)).toEqual([]);
  });

  it("names a release whose @base is not its own address, or that states none", () => {
    const moved = { ...CAPITALS[0], turtle: CAPITALS[0].turtle.replace("capitals/v1.ttl> .", "capitals/v9.ttl> .") };
    expect(metadataProblems(moved)).toEqual([
      `decks/capitals/v1.ttl: states @base <${DECKS}capitals/v9.ttl>; its path says @base <${DECKS}capitals/v1.ttl>.`,
    ]);
    const none = { ...CAPITALS[0], turtle: CAPITALS[0].turtle.replace(/^@base[^\n]*\n/, "") };
    expect(metadataProblems(none)[0]).toBe(
      `decks/capitals/v1.ttl: states no @base; its path says @base <${DECKS}capitals/v1.ttl>.`,
    );
  });

  it("names a release that is not one deck, the document itself", () => {
    const url = `${DECKS}capitals/v1.ttl`;
    const two = { ...CAPITALS[0], quads: parseTurtle(`${CAPITALS[0].turtle}\n<#other> a <${SM}Deck> .\n`, url) };
    expect(metadataProblems(two)).toEqual([
      `decks/capitals/v1.ttl: expected the document itself to be its one solid-memo:Deck, found <${url}>, <${url}#other>.`,
    ]);
    const none = { ...CAPITALS[0], quads: [] };
    expect(metadataProblems(none)).toContain(
      "decks/capitals/v1.ttl: expected the document itself to be its one solid-memo:Deck, found none.",
    );
  });

  it("names a version, series, publisher or previous version other than its path says", () => {
    const wrong = release("capitals", 2, {
      release: [
        '    dcat:version "3" ;',
        "    dcterms:publisher <https://example.com/someone> ;",
        `    dcat:inSeries <${INDEX}#rivers> ;`,
        `    dcat:isVersionOf <${INDEX}#capitals> , <${INDEX}#rivers> ;`,
        `    dcat:prev <${DECKS}capitals/v2.ttl>`,
      ].join("\n"),
    });
    expect(metadataProblems(wrong)).toEqual([
      'decks/capitals/v2.ttl: states dcat:version "3"; its path says "2".',
      `decks/capitals/v2.ttl: states dcat:inSeries <${INDEX}#rivers>; its path says <${INDEX}#capitals>.`,
      `decks/capitals/v2.ttl: states dcat:isVersionOf <${INDEX}#capitals>, <${INDEX}#rivers>; its path says <${INDEX}#capitals>.`,
      `decks/capitals/v2.ttl: states dcterms:publisher <https://example.com/someone>; its path says <${INDEX}#solid-memo>.`,
      `decks/capitals/v2.ttl: states dcat:prev <${DECKS}capitals/v2.ttl>; its path says <${DECKS}capitals/v1.ttl>.`,
      `decks/capitals/v2.ttl: states dcat:previousVersion nothing; its path says <${DECKS}capitals/v1.ttl>.`,
    ]);
  });

  it("names a first version that follows another, or states no version", () => {
    const first = release("capitals", 1, {
      release: [
        `    dcterms:publisher <${INDEX}#solid-memo> ;`,
        `    dcat:inSeries <${INDEX}#capitals> ;`,
        `    dcat:isVersionOf <${INDEX}#capitals> ;`,
        `    dcat:previousVersion <${DECKS}capitals/v0.ttl>`,
      ].join("\n"),
    });
    expect(metadataProblems(first)).toEqual([
      'decks/capitals/v1.ttl: states dcat:version nothing; its path says "1".',
      `decks/capitals/v1.ttl: states dcat:previousVersion <${DECKS}capitals/v0.ttl>; its path says nothing, being the first version.`,
    ]);
  });
});

describe("validateLibrary", () => {
  it("accepts releases and an index that conform to the shapes and to the profiles", async () => {
    await expect(validateLibrary(LIBRARY, buildIndex(LIBRARY), validators)).resolves.toEqual([]);
  });

  it("names a release that drops a card of the version before it, and accepts one that retires it", async () => {
    const dropped = [...CAPITALS, release("capitals", 3)];
    expect(await validateLibrary(dropped, buildIndex(dropped), validators)).toEqual([
      "decks/capitals/v3.ttl: drops <#no>, which v2.ttl has. A card is never removed: retire it (owl:deprecated true), so the copies that have it keep it and its review history.",
    ]);
    const retired = [...CAPITALS, release("capitals", 3, { ...NORWAY, retired: ["no"] })];
    await expect(validateLibrary(retired, buildIndex(retired), validators)).resolves.toEqual([]);
  });

  it("names a version other than its path says once, on the release that states it", async () => {
    const stating = (r: DeckRelease, version: string): DeckRelease => {
      const turtle = r.turtle.replace(`dcat:version "${r.version}"`, `dcat:version "${version}"`);
      return { ...r, turtle, quads: parseTurtle(turtle, `${DECKS}${r.deck}/v${r.version}.ttl`) };
    };
    const first = [stating(CAPITALS[0], "2"), CAPITALS[1]];
    expect(await validateLibrary(first, buildIndex(first), validators)).toEqual([
      'decks/capitals/v1.ttl: states dcat:version "2"; its path says "1".',
    ]);
    const second = [CAPITALS[0], stating(CAPITALS[1], "3")];
    expect(await validateLibrary(second, buildIndex(second), validators)).toEqual([
      'decks/capitals/v2.ttl: states dcat:version "3"; its path says "2".',
    ]);
  });

  it("names a release that gives an id of the version before it to another kind of subject", async () => {
    const reused = [course(1), course(2, OUTLINE.replace("<#s-2>", "<#s-2-new>") + chapter("s-2", 2, RETIRED))];
    expect(await validateLibrary(reused, buildIndex(reused), validators)).toEqual([
      "decks/solid/v2.ttl: <#s-2> is a chapter, but a step in v1.ttl: an id names one subject for good, so give the chapter an id of its own.",
    ]);
  });

  it("accepts a course, and names what its outline does not hold together", async () => {
    await expect(validateLibrary([course(1)], buildIndex([course(1)]), validators)).resolves.toEqual([]);
    const empty = [course(1, "")];
    expect(await validateLibrary(empty, buildIndex(empty), validators)).toEqual([
      "decks/solid/v1.ttl: is a schema:Course without a chapter: a course has at least one solid-memo:Chapter.",
    ]);
  });

  it("names text in Markdown that would not show as written", async () => {
    const outline = OUTLINE.replace(
      'solid-memo:front "Question q-1"@en ;',
      'solid-memo:front "Question <q-1>"@en ;\n    solid-memo:textFormat solid-memo:markdown ;',
    );
    const marked = [course(1, outline)];
    expect(await validateLibrary(marked, buildIndex(marked), validators)).toEqual([
      `decks/solid/v1.ttl: <#q-1> solid-memo:front@en has raw HTML, "<q-1>", which is shown as its source: write it as code, or escape its "<" (\\<).`,
    ]);
  });

  it("names a release that drops a chapter, step or distractor of the version before it, and accepts one that retires them", async () => {
    const v1 = [
      chapter("ch-1", 0),
      chapter("ch-2", 1),
      step("s-1", "ch-1", 0, ["q-1"]),
      step("s-2", "ch-2", 0, ["q-2"]),
      question("q-1", ["q-1-a", "q-1-b", "q-1-c"]),
      distractor("q-1-a"),
      distractor("q-1-b"),
      distractor("q-1-c"),
      asked("q-2"),
    ];
    const dropped = [
      course(1, v1.join("")),
      course(2, [v1[0], step("s-1", "ch-1", 0, ["q-1"]), question("q-1", ["q-1-a", "q-1-b"]), v1[5], v1[6], asked("q-2")].join("")),
    ];
    expect(await validateLibrary(dropped, buildIndex(dropped), validators)).toEqual([
      "decks/solid/v2.ttl: drops <#ch-2>, <#s-2>, <#q-1-c>, which v1.ttl has. A chapter, step or distractor is never removed: retire it (owl:deprecated true), so the copies that follow the course keep their place in it.",
    ]);
    const retired = [
      course(1, v1.join("")),
      course(
        2,
        [
          v1[0],
          chapter("ch-2", 1, RETIRED),
          v1[2],
          step("s-2", "ch-2", 0, ["q-2"], RETIRED),
          question("q-1", ["q-1-a", "q-1-b", "q-1-c"]),
          v1[5],
          v1[6],
          distractor("q-1-c", RETIRED),
          asked("q-2"),
        ].join(""),
      ),
    ];
    await expect(validateLibrary(retired, buildIndex(retired), validators)).resolves.toEqual([]);
  });

  it("names a literal of a release or of the index that is not in Unicode NFC", async () => {
    const card = [release("capitals", 1, { cards: { kr: ["South Korea", "서울".normalize("NFD")] } })];
    expect(await validateLibrary(card, buildIndex(card), validators)).toEqual([
      `decks/capitals/v1.ttl: <#kr> <${SM}back> is not in Unicode NFC: its character 1, U+1109 U+1165, is U+C11C composed. Write text composed, as keyboards type it.`,
    ]);
    const title = [release("capitals", 1, { title: "Cafe\u0301" })];
    expect(await validateLibrary(title, buildIndex(title), validators)).toContain(
      `decks/index.ttl: <#capitals> <${DCTERMS}title>@en is not in Unicode NFC: its character 4, U+0065 U+0301, is U+00E9 composed. Write text composed, as keyboards type it.`,
    );
  });

  it("names a release whose metadata is not what its path says", async () => {
    const moved = { ...CAPITALS[0], version: 2, quads: parseTurtle(CAPITALS[0].turtle, `${DECKS}capitals/v2.ttl`) };
    expect(await validateLibrary([moved], buildIndex([moved]), validators)).toContain(
      `decks/capitals/v2.ttl: states @base <${DECKS}capitals/v1.ttl>; its path says @base <${DECKS}capitals/v2.ttl>.`,
    );
  });

  it("names a release that breaks a shape", async () => {
    const broken = [release("capitals", 1)];
    broken[0].quads = broken[0].quads.filter((q) => q.predicate.value !== `${SM}studyDirection`);
    const problems = await validateLibrary(broken, buildIndex(broken), validators);
    expect(problems).toContainEqual(
      expect.stringContaining(`decks/capitals/v1.ttl:\n  <${DECKS}capitals/v1.ttl> (${SM}studyDirection): `),
    );
  });

  it("names a release that breaks DCAT-AP, with the index beside it", async () => {
    const unnamed = [release("capitals", 1)];
    unnamed[0].quads = unnamed[0].quads.filter((q) => q.predicate.value !== "http://xmlns.com/foaf/0.1/name");
    expect(await validateLibrary(unnamed, buildIndex(unnamed), validators)).toContainEqual(
      expect.stringMatching(/^decks\/capitals\/v1\.ttl:\n {2}<https:\/\/solid-memo\.com\/decks\/capitals\/v1\.ttl#anton> \(http:\/\/xmlns\.com\/foaf\/0\.1\/name\): Less than 1 values/),
    );
  });

  it("names a release that breaks SKOS", async () => {
    const skos = "http://www.w3.org/2004/02/skos/core#";
    const turtle = `${CAPITALS[0].turtle}\n<#red> a <${skos}Concept> ; <${skos}prefLabel> "Red"@en , "Crimson"@en .\n`;
    const labelled = [{ ...CAPITALS[0], turtle, quads: parseTurtle(turtle, `${DECKS}capitals/v1.ttl`) }];
    expect(await validateLibrary(labelled, buildIndex(labelled), validators)).toContainEqual(
      expect.stringMatching(/^decks\/capitals\/v1\.ttl:\n {2}<https:\/\/solid-memo\.com\/decks\/capitals\/v1\.ttl#red> \(http:\/\/www\.w3\.org\/2004\/02\/skos\/core#prefLabel\): Language "en" has been used by 2 values/),
    );
  });

  it("accepts the course for newcomers, and names one that is no course of the library", async () => {
    await expect(validateLibrary([course(1)], buildIndex([course(1)], "solid"), validators)).resolves.toEqual([]);
    expect(await validateLibrary([course(1)], buildIndex([course(1)], "nowhere"), validators)).toEqual([
      `decks/index.ttl: names <${INDEX}#nowhere> by solid-memo:newcomerCourse, which is no deck of the library.`,
    ]);
    expect(await validateLibrary(LIBRARY, buildIndex(LIBRARY, "rivers"), validators)).toEqual([
      `decks/index.ttl: names <${INDEX}#rivers> by solid-memo:newcomerCourse, which is not a course: its current release is no schema:Course.`,
    ]);
  });

  it("names an index that breaks the shapes and the profiles", async () => {
    const problems = await validateLibrary([], `<${INDEX}> a <${DCAT}Catalog> .`, validators);
    expect(problems).toHaveLength(2);
    for (const problem of problems) expect(problem).toMatch(/^decks\/index\.ttl:\n/);
  });
});

describe("newcomerProblems", () => {
  const { namedNode, literal, quad } = DataFactory;
  const index = parseTurtle(buildIndex([course(1)], "solid"), INDEX);
  const naming = (object: Quad_Object) => quad(namedNode(INDEX), namedNode(`${SM}newcomerCourse`), object);

  it("accepts an index that names one course of the library, or none", () => {
    expect(newcomerProblems(index)).toEqual([]);
    expect(newcomerProblems(parseTurtle(buildIndex([course(1)]), INDEX))).toEqual([]);
  });

  it("names an index that names more than one, or one that is no IRI", () => {
    expect(newcomerProblems([...index, naming(literal("solid"))])).toEqual([
      "decks/index.ttl: names 2 courses for newcomers by solid-memo:newcomerCourse: at most one.",
      'decks/index.ttl: names "solid" by solid-memo:newcomerCourse, which is no IRI.',
    ]);
  });
});

describe("normalizationProblems", () => {
  const { blankNode, literal, namedNode, quad } = DataFactory;
  const URL = `${DECKS}capitals/v1.ttl`;
  const text = (subject: Quad_Subject, value: string) => quad(subject, namedNode(`${SM}front`), literal(value));

  it("accepts composed text, Hangul included, and finds nothing in a library that is composed", () => {
    expect(normalizationProblems("L", URL, [text(namedNode(`${URL}#a`), "사람, café, Ångström")])).toEqual([]);
    for (const r of LIBRARY) expect(normalizationProblems("L", `${DECKS}${r.deck}/v${r.version}.ttl`, r.quads)).toEqual([]);
  });

  it("names the first character that composes differently, and its subject in the document or out of it", () => {
    expect(
      normalizationProblems("L", URL, [
        text(namedNode(`${URL}#a`), `사${"람".normalize("NFD")}`),
        text(namedNode(`${DECKS}rivers/v1.ttl`), "\u212B and A\u030A"),
        text(blankNode(), "e\u0301"),
      ]),
    ).toEqual([
      `L: <#a> <${SM}front> is not in Unicode NFC: its character 2, U+1105 U+1161 U+11B7, is U+B78C composed. Write text composed, as keyboards type it.`,
      `L: <${DECKS}rivers/v1.ttl> <${SM}front> is not in Unicode NFC: its character 1, U+212B, is U+00C5 composed. Write text composed, as keyboards type it.`,
      `L: a blank node's <${SM}front> is not in Unicode NFC: its character 1, U+0065 U+0301, is U+00E9 composed. Write text composed, as keyboards type it.`,
    ]);
  });
});

describe("courseProblems", () => {
  const L = "decks/solid/v1.ttl";
  /** The problems of version 1 of a course with this outline. */
  const problemsOf = (outline: string) => courseProblems(course(1, outline));

  it("accepts a course whose outline holds together, and a deck that is no course", () => {
    expect(problemsOf(OUTLINE)).toEqual([]);
    for (const r of LIBRARY) expect(courseProblems(r)).toEqual([]);
  });

  it("names chapters or steps in a release that is no schema:Course", () => {
    const deck = release("solid", 1, { title: "Solid", course: OUTLINE });
    deck.quads = deck.quads.filter((q) => q.object.value !== "https://schema.org/Course");
    expect(courseProblems(deck)).toEqual([
      `${L}: has chapters or steps but is no schema:Course: type the release itself schema:Course.`,
    ]);
  });

  it("names a course without a chapter", () => {
    expect(problemsOf("")).toEqual([
      `${L}: is a schema:Course without a chapter: a course has at least one solid-memo:Chapter.`,
    ]);
  });

  it("names a course that does not study front to back", () => {
    const backwards = course(1);
    backwards.quads = backwards.quads.map((q) =>
      q.object.value === `${SM}frontToBack` ? DataFactory.quad(q.subject, q.predicate, DataFactory.namedNode(`${SM}backToFront`)) : q,
    );
    expect(courseProblems(backwards)).toEqual([
      `${L}: states solid-memo:studyDirection <${SM}backToFront>; a course studies solid-memo:frontToBack.`,
    ]);
    const unstated = course(1);
    unstated.quads = unstated.quads.filter((q) => q.predicate.value !== `${SM}studyDirection`);
    expect(courseProblems(unstated)).toEqual([
      `${L}: states solid-memo:studyDirection nothing; a course studies solid-memo:frontToBack.`,
    ]);
  });

  it("names a chapter that is part of something else than its release, and a step that is part of no chapter of it", () => {
    expect(
      problemsOf(`${OUTLINE}
<#ch-2> schema:isPartOf <https://example.com/other> .
<#s-2> schema:isPartOf <#q-1> .
`),
    ).toEqual([
      `${L}: chapter <#ch-2> is part of <${DECKS}solid/v1.ttl>, <https://example.com/other>; a chapter is part of the release it is in (schema:isPartOf <>).`,
      `${L}: step <#s-2> is part of <#q-1>, which is no chapter of this release.`,
    ]);
  });

  it("names a card a step checks or a chapter reviews that is no card of the release, or retired, but not one a retired one names", () => {
    expect(
      problemsOf(
        [
          chapter("ch-1", 0, " ;\n    solid-memo:reviewQuestion <#q-2> , <https://example.com/card>"),
          chapter("ch-2", 1, " ;\n    solid-memo:reviewQuestion <#q-4>"),
          chapter("ch-3", 2, ` ;\n    solid-memo:reviewQuestion <#q-4>${RETIRED}`),
          step("s-1", "ch-1", 0, ["q-1", "nothing"]),
          step("s-2", "ch-2", 0, ["q-3"]),
          step("s-3", "ch-2", 1, ["q-4"], RETIRED),
          asked("q-1"),
          asked("q-2"),
          asked("q-3"),
          question("q-4", [], RETIRED),
        ].join(""),
      ),
    ).toEqual([
      `${L}: <#s-1> names <#nothing> by solid-memo:checkedBy, which is no card of this release.`,
      `${L}: <#ch-1> names <https://example.com/card> by solid-memo:reviewQuestion, which is no card of this release.`,
      `${L}: <#ch-2> names <#q-4> by solid-memo:reviewQuestion, which is retired: name a card in use, or retire <#ch-2> too.`,
    ]);
  });

  it("names a distractor of any card that is no distractor of the release", () => {
    expect(
      problemsOf(`${OUTLINE}
<#se> solid-memo:distractor <#q-1> .
<#q-1> solid-memo:distractor <#nowhere> .
`),
    ).toEqual([
      `${L}: <#se> names <#q-1> by solid-memo:distractor, which is no solid-memo:Distractor of this release.`,
      `${L}: <#q-1> names <#nowhere> by solid-memo:distractor, which is no solid-memo:Distractor of this release.`,
    ]);
  });

  it("names a distractor that more than one card names", () => {
    expect(
      problemsOf(`${OUTLINE}
<#q-2> solid-memo:distractor <#q-1-a> .
<#se> solid-memo:distractor <#q-1-a> .
`),
    ).toEqual([`${L}: distractor <#q-1-a> is named by <#q-1>, <#q-2>, <#se>; a distractor is one card's: give each card its own.`]);
  });

  it("names a card checked by two steps, or both checked by a step and reviewed by a chapter", () => {
    expect(
      problemsOf(`${OUTLINE}
<#s-2> solid-memo:checkedBy <#q-1> , <#q-2> .
`),
    ).toEqual([
      `${L}: <#q-1> is checked by <#s-1>, <#s-2>; a card is checked by one step at most.`,
      `${L}: <#q-2> is checked by <#s-2> and a review question of <#ch-1>; a card is the one or the other.`,
    ]);
  });

  it("names a card a course asks without text on its back, or with too few distractors in use", () => {
    expect(
      problemsOf(
        [
          chapter("ch-1", 0, " ;\n    solid-memo:reviewQuestion <#q-2>"),
          step("s-1", "ch-1", 0, ["q-1"]),
          question("q-1", ["q-1-a", "q-1-b"], "", ""),
          distractor("q-1-a", "", '"Wrong"'),
          distractor("q-1-b", RETIRED, '"Wrong"'),
          question("q-2", []),
        ].join(""),
      ),
    ).toEqual([
      `${L}: <#q-1> has no text on its back (solid-memo:back), the right one among the options a course offers.`,
      `${L}: <#q-1> has too few distractors (1); a card a course asks has at least 2.`,
      `${L}: <#q-2> has too few distractors (0); a card a course asks has at least 2.`,
    ]);
  });

  it("names a distractor without text in a language of its card's back, untagged text included", () => {
    expect(
      problemsOf(
        [
          chapter("ch-1", 0),
          step("s-1", "ch-1", 0, ["q-1", "q-2"]),
          question("q-1", ["q-1-a", "q-1-b"], "", 'solid-memo:back "Answer"@en , "Svar"@sv ;'),
          distractor("q-1-a", "", '"Wrong"@en , "Fel"@sv'),
          distractor("q-1-b"),
          question("q-2", ["q-2-a", "q-2-b"], "", 'solid-memo:back "42" ;'),
          distractor("q-2-a", "", '"41"'),
          distractor("q-2-b", "", '"43"@en'),
        ].join(""),
      ),
    ).toEqual([
      `${L}: distractor <#q-1-b> has no text @sv, which the back of <#q-1> has.`,
      `${L}: distractor <#q-2-b> has no text untagged, which the back of <#q-2> has.`,
    ]);
  });

  it("names chapters, and a chapter's steps, in use that share a position, but not retired ones", () => {
    expect(
      problemsOf(
        [
          chapter("ch-1", 0),
          chapter("ch-2", 0),
          chapter("ch-3", 0, RETIRED),
          step("s-1", "ch-1", 0, ["q-1"]),
          step("s-2", "ch-1", 0, ["q-2"]),
          step("s-3", "ch-1", 0, ["q-3"], RETIRED),
          step("s-4", "ch-2", 0, ["q-3"], RETIRED),
          step("s-5", "ch-2", 1, ["q-3"]),
          asked("q-1"),
          asked("q-2"),
          asked("q-3"),
        ].join(""),
      ),
    ).toEqual([
      `${L}: chapters <#ch-1>, <#ch-2> share schema:position 0; a course's chapters each have their own.`,
      `${L}: steps <#s-1>, <#s-2> of <#ch-1> share schema:position 0; a chapter's steps each have their own.`,
    ]);
  });

  it("names a chapter in use without a step in use, but not a retired one", () => {
    expect(
      problemsOf(
        [
          chapter("ch-1", 0),
          chapter("ch-2", 1, RETIRED),
          step("s-1", "ch-1", 0, ["q-1"], RETIRED),
          question("q-1", [], RETIRED),
        ].join(""),
      ),
    ).toEqual([`${L}: chapter <#ch-1> has no step in use; a chapter in use has at least one step that is not retired.`]);
  });
});

describe("markdownProblems", () => {
  const L = "decks/solid/v1.ttl";
  const MD = " ;\n    solid-memo:textFormat solid-memo:markdown";
  const problemsOf = (outline: string) => markdownProblems(course(1, outline));
  /** A marked card with `fields` (Turtle) beside its front and back, and its two distractors. */
  const marked = (id: string, fields: string, distractors = [distractor(`${id}-a`), distractor(`${id}-b`)]) =>
    question(id, distractors.length === 0 ? [] : [`${id}-a`, `${id}-b`], `${MD}${fields}`) + distractors.join("");

  it("accepts Markdown that shows as written, and finds nothing in text that is not marked", () => {
    const good = [
      chapter("ch-1", 0, `${MD} ;\n    dcterms:description "Read *this* first, from [the spec](https://solidproject.org/TR/protocol)."@en`),
      step(
        "s-1",
        "ch-1",
        0,
        ["q-1"],
        `${MD} ;\n    solid-memo:theory """Create with \`PUT\`:\n\n\`\`\`http\nPUT /notes/a HTTP/1.1\n\`\`\`\n\n| Method | Target |\n|---|---|\n| \`PUT\` | the resource |"""@en`,
      ),
      marked("q-1", ` ;\n    solid-memo:backNote "See [solidproject.org](https://solidproject.org/)."@en`),
      question("q-2", [], `${MD} ;\n    solid-memo:backLabel "Status"@en`, `solid-memo:back """\`201\`\n\nor \`200\`"""@en ;`),
      step("s-2", "ch-1", 1, ["q-3"], ` ;\n    solid-memo:theory "git clone <url> &aring; [x](http://x.example)"@en`),
      question("q-3", [], ` ;\n    solid-memo:textFormat solid-memo:plainText ;\n    solid-memo:frontNote "<b>&aring;</b>"@en`),
      // Only a marked card's distractors are Markdown, and only the fields of docs/markdown.md: no title, no picture's description.
      question("q-4", ["q-4-a", "q-4-b"]),
      distractor("q-4-a", ` ;\n    solid-memo:distractorNote "<b>&aring;</b>"@en`, `"<b>"@en`),
      distractor("q-4-b", "", `"""&aring;\n\n- a"""@en`),
      chapter("ch-2", 1, `${MD} ;\n    dcterms:title "<x> &aring;"@en`),
      marked("q-5", ` ;\n    solid-memo:frontImageDescription "<x> &aring;"@en ;\n    solid-memo:backImageDescription "&aring;"@en`),
    ].join("");
    expect(problemsOf(good)).toEqual([]);
    for (const r of LIBRARY) expect(markdownProblems(r)).toEqual([]);
  });

  it("names, field by field, what a card's text, its distractors', a step's theory and a chapter's description would not show as meant", () => {
    const bad = [
      chapter("ch-1", 0, `${MD} ;\n    dcterms:description "Run \`ls‮\`."@en`),
      step("s-1", "ch-1", 0, ["q-1"], `${MD} ;\n    solid-memo:theory "See [example.org](https://evil.example/) [it](https://x.example/\u200B)."@en`),
      marked(
        "q-1",
        ` ;\n    solid-memo:frontNote "&aring;"@en ;\n    solid-memo:backNote "![a](https://a.example/a.png) [b](http://b.example)"@en`,
        [
          distractor("q-1-a", ` ;\n    solid-memo:distractorNote "[c](mailto:c@c.example)"@en`, `"<ex:title>"@en`),
          distractor("q-1-b", "", `"""a\n\nb"""@en`),
        ],
      ),
      question("q-2", [], `${MD} ;\n    solid-memo:backLabel "[d](https://d.example)"`, `solid-memo:back "git clone <url>"@en , "x"@sv ;`),
    ].join("");
    expect(problemsOf(bad)).toEqual([
      `${L}: <#q-1> solid-memo:frontNote@en has the character reference &aring;, which Markdown shows decoded: write it as code, or escape its "&" (\\&aring;).`,
      `${L}: <#q-1> solid-memo:backNote@en has a picture, "![a](https://a.example/a.png)", which is never shown, only its description: a card shows a picture by solid-memo:frontImage or backImage.`,
      `${L}: <#q-1> solid-memo:backNote@en links to "http://b.example", which the app does not follow: only an https: address without a user name or password is.`,
      `${L}: <#q-1-a> solid-memo:distractorText@en has a link, "<ex:title>", where none may be (a card's sides, its label and its options): an autolink loses its angle brackets; write it as code to show it as written.`,
      `${L}: <#q-1-a> solid-memo:distractorNote@en links to "mailto:c@c.example", which the app does not follow: only an https: address without a user name or password is.`,
      `${L}: <#q-1-b> solid-memo:distractorText@en is an option but not one paragraph: the right option and the wrong ones must look alike.`,
      `${L}: <#q-2> solid-memo:back@en has raw HTML, "<url>", which is shown as its source: write it as code, or escape its "<" (\\<).`,
      `${L}: <#q-2> solid-memo:backLabel has a link, "[d](https://d.example)", where none may be (a card's sides, its label and its options): write it as code to show it as written.`,
      `${L}: <#s-1> solid-memo:theory@en has link text that reads as the host name or address "example.org", but the link leads to evil.example: name that host, or word the text otherwise (a file's name, such as package.json, reads as a host name too).`,
      `${L}: <#s-1> solid-memo:theory@en has ⟨U+200B⟩ in a link, which would show as markers: such controls make text read other than it is.`,
      `${L}: <#ch-1> dcterms:description@en has ⟨U+202E⟩ in code, which would show as markers: such controls make text read other than it is.`,
    ]);
  });

  it("holds the back of a card with distractors to one paragraph, as its options", () => {
    expect(problemsOf(marked("q-1", "").replace(`solid-memo:back "Answer q-1"@en`, `solid-memo:back "- a"@en`))).toEqual([
      `${L}: <#q-1> solid-memo:back@en is an option but not one paragraph: the right option and the wrong ones must look alike.`,
    ]);
  });

  it("names text the app would not read as Markdown, or would show in part as its source", () => {
    const theory = (id: string, position: number, text: string) =>
      step(id, "ch-1", position, ["q-1"], `${MD} ;\n    solid-memo:theory ${JSON.stringify(text)}@en`);
    const outline = [
      chapter("ch-1", 0),
      theory("s-1", 0, "a".repeat(20_001)),
      theory("s-2", 1, "*".repeat(2_001)),
      theory("s-3", 2, `${"> ".repeat(8)}*a*`),
      theory("s-4", 3, `|${" a |".repeat(21)}\n|${"-|".repeat(21)}`),
    ].join("");
    expect(problemsOf(outline)).toEqual([
      `${L}: <#s-1> solid-memo:theory@en is 20001 characters, more than the 20000 the app reads as Markdown: it would be shown as plain text. Make it shorter.`,
      `${L}: <#s-2> solid-memo:theory@en nests or marks up more than the app reads as Markdown (docs/markdown.md, Limits): it would be shown as plain text.`,
      `${L}: <#s-3> solid-memo:theory@en nests "*a*" past the 8 levels of blocks and markup the app reads (each quote, list item, paragraph, emphasis and link is one): it would be shown as its source.`,
      `${L}: <#s-4> solid-memo:theory@en has a table of more than 20 columns or 2000 cells: it would be shown as its source.`,
    ]);
  });

  it("holds a step's theory to chunks with text in each, as many in each language", () => {
    const theory = (id: string, position: number, texts: string) =>
      step(id, "ch-1", position, ["q-1"], MD).replace(`"Theory ${id}."@en`, texts);
    const outline = [
      chapter("ch-1", 0),
      // Rules inside a list or a quote, and a step not in Markdown, split nothing.
      theory("s-1", 0, `"""a\n\n---\n\nb"""@en , """c\n\n***\n\nd"""@sv`),
      theory("s-2", 1, `"""- a\n\n  ---\n\n> b\n>\n> ---"""@en , "c"@sv`),
      step("s-3", "ch-1", 2, ["q-1"]).replace(`"Theory s-3."@en`, `"""---\n\na"""@en , "b"@sv`),
      theory("s-4", 3, `"""---\n\na\n\n---\n\n---\n\nb\n\n---"""@en , """a\n\n---\n\nb"""@sv`),
      theory("s-5", 4, `"""a\n\n---\n\nb"""@en , "c"@sv , """d\n\n---\n\ne\n\n---\n\nf"""`),
      theory("s-6", 5, `"""a\n\n---"""`),
    ].join("");
    expect(problemsOf(outline)).toEqual([
      `${L}: <#s-4> solid-memo:theory@en has a thematic break first, last or right after another, which makes an empty chunk the app drops: a step's theory is shown a chunk at a time, split at its top-level thematic breaks, with text between each two.`,
      `${L}: <#s-5> has its theory in 2 chunks in solid-memo:theory@en, 1 chunk in solid-memo:theory@sv, 3 chunks in solid-memo:theory: a step's theory is in as many chunks in each language, so a learner who switches language keeps their place.`,
      `${L}: <#s-6> solid-memo:theory has a thematic break first, last or right after another, which makes an empty chunk the app drops: a step's theory is shown a chunk at a time, split at its top-level thematic breaks, with text between each two.`,
    ]);
  });

  it("names a line with a thematic break right under it, which underlines it as a heading instead of ending a chunk", () => {
    const outline = [
      chapter("ch-1", 0),
      step("s-1", "ch-1", 0, ["q-1"], MD).replace(`"Theory s-1."@en`, `"""a\n---\n\nb"""@en`),
      step("s-2", "ch-1", 1, ["q-1"], MD).replace(`"Theory s-2."@en`, `"""a\n\n---\n\nb"""@en`),
    ].join("");
    expect(problemsOf(outline)).toEqual([
      `${L}: <#s-1> solid-memo:theory@en underlines a line with dashes, "a\\n---", which makes it a heading, not a line of text and a thematic break: put a blank line before the break (in a step's theory, it ends a chunk), or write the heading with "##".`,
    ]);
  });

  it("names a text format on what has none of its own, and one that is no concept of solid-memo:TextFormats", () => {
    const outline = [
      chapter("ch-1", 0),
      step("s-1", "ch-1", 0, ["q-1"], ` ;\n    solid-memo:textFormat <https://example.org/rst>`),
      question("q-1", ["q-1-a", "q-1-b"]),
      distractor("q-1-a", MD),
      distractor("q-1-b"),
      "\n<> solid-memo:textFormat solid-memo:markdown .\n",
    ].join("");
    expect(problemsOf(outline)).toEqual([
      `${L}: <#s-1> states solid-memo:textFormat <https://example.org/rst>, no concept of solid-memo:TextFormats: the app shows its text as plain text.`,
      `${L}: <#q-1-a> states solid-memo:textFormat, which only a card, a step or a chapter does: a distractor's text is written as its card's.`,
      `${L}: <https://solid-memo.com/decks/solid/v1.ttl> states solid-memo:textFormat, which only a card, a step or a chapter does: its text is plain text.`,
    ]);
  });
});

describe("baseProblems", () => {
  it("accepts versions new since the ref and a changed index", () => {
    const published = filesOf(CAPITALS.slice(0, 1));
    expect(baseProblems(filesOf(LIBRARY), published, "main")).toEqual([]);
  });

  it("names a published version that was edited or removed", () => {
    const files = filesOf([{ ...CAPITALS[0], turtle: `${CAPITALS[0].turtle}\n` }]);
    expect(baseProblems(files, filesOf(CAPITALS), "origin/main")).toEqual([
      "decks/capitals/v1.ttl has changed since origin/main: a published version is never edited; publish the next version instead.",
      "decks/capitals/v2.ttl was published at origin/main and is gone: a published version is never removed.",
    ]);
  });
});

describe("main", () => {
  function io(files: Map<string, string>, published = new Map<string, string>()) {
    const log = vi.fn<(message: string) => void>();
    const writeIndex = vi.fn<(text: string) => Promise<void>>(async () => undefined);
    const readFilesAt = vi.fn(async (_ref: string) => published as ReadonlyMap<string, string>);
    const value: LibraryIo = {
      readFiles: async () => files,
      readFilesAt,
      writeIndex,
      loadValidators: async () => validators,
      log,
    };
    return { io: value, log, writeIndex, readFilesAt };
  }

  it("writes the index and reports the library valid", async () => {
    const files = filesOf(LIBRARY, "stale");
    const { io: library, log, writeIndex } = io(files);
    expect(await main(["node"], library)).toBe(0);
    expect(writeIndex).toHaveBeenCalledWith(buildIndex(LIBRARY));
    expect(log.mock.calls.map(([m]) => m)).toEqual(["wrote decks/index.ttl", "decks/: 3 versions of 2 decks, valid."]);
  });

  it("names in the index the course for newcomers its io names", async () => {
    const { io: library, writeIndex } = io(filesOf([course(1)], "stale"));
    expect(await main(["node"], { ...library, newcomerCourse: "solid" })).toBe(0);
    expect(writeIndex).toHaveBeenCalledWith(buildIndex([course(1)], "solid"));
  });

  it("writes no index while the layout is broken", async () => {
    const files = filesOf(LIBRARY);
    files.set("notes.txt", "x");
    const { io: library, log, writeIndex } = io(files);
    expect(await main(["node"], library)).toBe(1);
    expect(writeIndex).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^decks\/notes\.txt is neither/));
  });

  it("checks that the index is up to date, writing nothing", async () => {
    const { io: library, log, writeIndex } = io(filesOf(LIBRARY));
    expect(await main(["node", "--check"], library)).toBe(0);
    expect(writeIndex).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("decks/: 3 versions of 2 decks, valid.");
  });

  it("fails the check on an index out of date, or missing", async () => {
    const stale = io(filesOf(LIBRARY, buildIndex(CAPITALS)));
    expect(await main(["node", "--check"], stale.io)).toBe(1);
    expect(stale.log).toHaveBeenCalledWith("decks/index.ttl is out of date: run `npm run library`.");
    const files = filesOf(LIBRARY);
    files.delete("index.ttl");
    const missing = io(files);
    expect(await main(["node", "--check"], missing.io)).toBe(1);
    expect(missing.log).toHaveBeenCalledWith("decks/index.ttl is missing: run `npm run library`.");
  });

  it("checks against a git ref that no published version was edited or removed", async () => {
    const ok = io(filesOf(LIBRARY), filesOf(CAPITALS));
    expect(await main(["node", "--check", "--base", "origin/main"], ok.io)).toBe(0);
    expect(ok.readFilesAt).toHaveBeenCalledWith("origin/main");
    const gone = io(filesOf(CAPITALS.slice(0, 1)), filesOf(CAPITALS));
    expect(await main(["node", "--base", "HEAD"], gone.io)).toBe(1);
    expect(gone.writeIndex).not.toHaveBeenCalled();
    expect(gone.log).toHaveBeenCalledWith(
      "decks/capitals/v2.ttl was published at HEAD and is gone: a published version is never removed.",
    );
  });

  it("fails on a release that does not validate", async () => {
    const dropped = [...CAPITALS, release("capitals", 3)];
    const { io: library, log } = io(filesOf(dropped));
    expect(await main(["node", "--check"], library)).toBe(1);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^decks\/capitals\/v3\.ttl: drops <#no>/));
  });

  it("reports what it could not read", async () => {
    const { io: library, log } = io(filesOf(LIBRARY));
    library.readFilesAt = async () => {
      throw new Error("fatal: not a valid ref");
    };
    expect(await main(["node", "--check", "--base", "nope"], library)).toBe(1);
    expect(log).toHaveBeenCalledWith("fatal: not a valid ref");
  });

  it("shows how to run it when the arguments are not its own", async () => {
    for (const argv of [["node", "--bogus"], ["node", "--base"], ["node", "--base", "--check"], ["node", "extra"]]) {
      const { io: library, log } = io(filesOf(LIBRARY));
      expect(await main(argv, library), argv.join(" ")).toBe(1);
      expect(log.mock.calls).toEqual([
        ["Usage: npm run library [-- --base <git ref>], or npm run library:check [-- --base <git ref>]"],
      ]);
    }
  });
});

describe("defaultIo", () => {
  const git = (repo: string, ...args: string[]) =>
    execFileSync("git", ["-C", repo, "-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args], {
      encoding: "utf8",
    });

  it("reads decks/ in the working tree and at a git ref, and writes the index", async () => {
    const repo = await mkdtemp(join(tmpdir(), "solid-memo-decks-"));
    git(repo, "init", "--quiet");
    await writeFile(join(repo, "README.md"), "x");
    git(repo, "add", ".");
    git(repo, "commit", "--quiet", "-m", "before the library");
    const library = defaultIo(repo);
    await expect(library.readFiles()).resolves.toEqual(new Map());

    await mkdir(join(repo, "decks", "capitals"), { recursive: true });
    await writeFile(join(repo, "decks", "capitals", "v1.ttl"), CAPITALS[0].turtle);
    await library.writeIndex("index");
    git(repo, "add", ".");
    git(repo, "commit", "--quiet", "-m", "the library");
    await writeFile(join(repo, "decks", "capitals", "v2.ttl"), CAPITALS[1].turtle);

    expect(await readFile(join(repo, "decks", "index.ttl"), "utf8")).toBe("index");
    await expect(library.readFiles()).resolves.toEqual(
      new Map([
        ["capitals/v1.ttl", CAPITALS[0].turtle],
        ["capitals/v2.ttl", CAPITALS[1].turtle],
        ["index.ttl", "index"],
      ]),
    );
    await expect(library.readFilesAt("HEAD")).resolves.toEqual(
      new Map([
        ["capitals/v1.ttl", CAPITALS[0].turtle],
        ["index.ttl", "index"],
      ]),
    );
    await expect(library.readFilesAt("HEAD~1")).resolves.toEqual(new Map());
    await expect(library.readFilesAt("no-such-ref")).rejects.toThrow();
    await symlink(join(repo, "decks", "capitals", "v1.ttl"), join(repo, "decks", "capitals", "v3.ttl"));
    await expect(library.readFiles()).rejects.toThrow(
      "decks/capitals/v3.ttl is neither a file nor a folder: decks/ holds only index.ttl and <name>/v<N>.ttl, as plain files.",
    );
    expect(library.loadValidators).toBe(loadValidators);
    expect(library.newcomerCourse).toBe(NEWCOMER_COURSE);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    library.log("hello");
    expect(log).toHaveBeenCalledWith("hello");
    log.mockRestore();
  });
});

describe("run", () => {
  it("sets the exit code from main, for the repository's own decks/", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const process = { argv: ["node", "--bogus"], exitCode: undefined as number | undefined };
    await run(process);
    expect(process.exitCode).toBe(1);
    log.mockRestore();
  });
});

it("writes IRIs of the index at the address INDEX_URL", () => {
  expect(INDEX_URL).toBe(INDEX);
});
