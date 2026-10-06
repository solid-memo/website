import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  baseProblems,
  buildIndex,
  defaultIo,
  INDEX_URL,
  loadValidators,
  main,
  metadataProblems,
  releasesOf,
  run,
  validateLibrary,
  type DeckRelease,
  type LibraryIo,
} from "./deckLibrary.ts";
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

<>
    a solid-memo:Deck ,
      dcat:Dataset ;
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
  .join("")}`;
}

function release(deck: string, version: number, fixture?: Fixture): DeckRelease {
  const turtle = releaseText(deck, version, fixture);
  return { deck, version, turtle, quads: parseTurtle(turtle, `${DECKS}${deck}/v${version}.ttl`) };
}

const NORWAY: Fixture = { cards: { se: ["Sweden", "Stockholm"], no: ["Norway", "Oslo"] } };
const CAPITALS = [release("capitals", 1), release("capitals", 2, NORWAY)];
const RIVERS = release("rivers", 1, { title: "Rivers" });
const LIBRARY = [...CAPITALS, RIVERS];

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

  it("names an index that breaks the shapes and the profiles", async () => {
    const problems = await validateLibrary([], `<${INDEX}> a <${DCAT}Catalog> .`, validators);
    expect(problems).toHaveLength(2);
    for (const problem of problems) expect(problem).toMatch(/^decks\/index\.ttl:\n/);
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
    expect(library.loadValidators).toBe(loadValidators);
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
