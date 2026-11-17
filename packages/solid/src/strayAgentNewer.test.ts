// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * An agent's node in a deck catalog that no deck names, stamped with a
 * format newer than this app's: every catalog write leaves it as it is,
 * as it is no subject the write is of, and goes on (GHSA-hqvj-6p8f-vqfx).
 * So does one a deck the write saves or removes named: an agent node a
 * newer version wrote is never removed or rewritten. A deck saved over
 * it names its author's next node, whoever the node names, and the
 * newer node stays as it is. A node is a newer version's when it is
 * stamped above the agent format, whatever its classes: an untyped
 * one, another app's class, an agent that is also a deck stamped below
 * the deck format, a dataset or a concept, or one of more classes than
 * the write check reads.
 */
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/testing/shapeSources";
import { describe, expect, it } from "vitest";
import { getSolidDatasetOrNull } from "./datasets";
import { getInteger, getThing, getUrlAll } from "./client/rdf";
import { createShaclShapeValidator } from "./shaclShapeValidator";
import { createSolidDeckRepository } from "./solidDeckRepository";
import { fakePod } from "./testing/fakePod";

const INSTANCE = "https://pod.example/solid-memo/main/";
const CATALOG = `${INSTANCE}catalog.ttl`;
const ME = "https://pod.example/profile/card#me";
const FOAF = "http://xmlns.com/foaf/0.1/";
const FORMAT_VERSION = "https://solid-memo.com/ns/vocab/v1.ttl#formatVersion";
const CREATOR = "http://purl.org/dc/terms/creator";
const STRAY = `${CATALOG}#agent-x`;
const PREFIXES = `@prefix sm: <https://solid-memo.com/ns/vocab/v1.ttl#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .
`;
const deckTtl = (id: string, version: number, extra = "") =>
  `<#${id}> a sm:Deck, dcat:Dataset ; sm:formatVersion ${version} ;
  dcterms:title "${id}"@en ; dcterms:description "Flashcards: ${id}."@en ; sm:studyDirection sm:frontToBack ;
  sm:cardsDocument <${INSTANCE}decks/${id}.ttl> ; sm:reviewsDocument <${INSTANCE}reviews/${id}.ttl> ${extra}.
`;

const NAMES_STRAY = "; dcterms:creator <#agent-x> ";

/** A catalog with decks a and b (format 6), c and d (format 5), and `agent`; `named` are the decks whose entry says `names` (by default, that it names <#agent-x>). */
async function podWith(agent: string, named: readonly string[] = [], names = NAMES_STRAY) {
  const pod = fakePod();
  let n = 0;
  await pod.put(
    CATALOG,
    `${PREFIXES}<#catalog> a dcat:Catalog ; dcterms:title "Main" ; dcterms:description "My decks." ;
    dcterms:publisher <${ME}> ; dcat:dataset <#a>, <#b>, <#c>, <#d> .
  ${[6, 6, 5, 5]
    .map((version, i) => {
      const id = "abcd"[i]!;
      return deckTtl(id, version, named.includes(id) ? names : "");
    })
    .join("")}<${ME}> a <${FOAF}Agent> ; <${FOAF}name> "Me" .
  ${agent}`,
  );
  const validator = createShaclShapeValidator({
    fetch: pod.fetch,
    shapesFetch,
    ...SHAPE_SOURCES,
  }).over(pod.fetch);
  const repository = createSolidDeckRepository({
    fetch: pod.fetch,
    now: () => new Date("2026-11-11T10:00:00.000Z"),
    randomId: () => `new-${n++}`,
    checkWrite: validator.checkSubjects,
  });
  const subject = async (url: string) =>
    getThing((await getSolidDatasetOrNull(CATALOG, pod.fetch))!, url);
  const stray = () => subject(STRAY);
  const versionOf = async (id: string) =>
    getInteger((await subject(`${CATALOG}#${id}`))!, FORMAT_VERSION);
  const creatorOf = async (id: string) => getUrlAll((await subject(`${CATALOG}#${id}`))!, CREATOR);
  return { repository, stray, versionOf, creatorOf, subject };
}

describe.each([
  `<#agent-x> a <${FOAF}Agent> ; sm:formatVersion 2 .`,
  `<#agent-x> a <${FOAF}Agent> ; <${FOAF}name> "x" ; sm:formatVersion 99 .`,
])("an unnamed agent stamped newer in the catalog (%s)", (agent) => {
  it("is left as it is by create, import, rename, upgrade and removal", async () => {
    const { repository, stray } = await podWith(agent);
    const before = await stray();
    expect(before).not.toBeNull();
    const [a, b] = await repository.listDecks(INSTANCE);
    await repository.createDeck(INSTANCE, { en: "New" });
    await repository.importDeck(INSTANCE, {
      url: "https://solid-memo.com/decks/capitals/v1.ttl",
      title: { en: "Capitals" },
      formatVersion: 1,
      authors: ["Anton Wiklund"],
      license: "https://creativecommons.org/publicdomain/zero/1.0/",
      direction: "front-to-back",
      version: "1",
      seriesUrl: "https://solid-memo.com/decks/index.ttl#capitals",
      themes: [],
      keywords: {},
      cards: [
        { id: "sweden", front: { "": "Sweden" }, back: { "": "Stockholm" }, formatVersion: 1 },
      ],
    });
    await repository.renameDeck(a!, { en: "Renamed" });
    await expect(repository.upgradeDecks(INSTANCE, null)).resolves.toBe(true);
    await repository.removeDeck(b!);
    expect(await stray()).toEqual(before);
    expect((await repository.listDecks(INSTANCE)).map(({ title }) => title.en).sort()).toEqual([
      "Capitals",
      "New",
      "Renamed",
      "c",
      "d",
    ]);
  });
});

const NEWER = (name: string) =>
  `<#agent-x> a <${FOAF}Agent> ; <${FOAF}name> "${name}" ; sm:formatVersion 2 .`;
/** An agent node at this app's format that no deck names: the writes below remove it. */
const OLD = `${CATALOG}#agent-old`;
const OLD_TTL = `<#agent-old> a <${FOAF}Agent> ; <${FOAF}name> "Old" ; sm:formatVersion 1 .`;

describe.each([
  ["x", new RegExp(`^${CATALOG}#agent-x-.+`)],
  ["y", new RegExp(`^${CATALOG}#agent-y$`)],
])("an agent stamped newer, named %s, that a deck's entry names", (name, creator) => {
  it("is left as it is by the upgrade of an outdated deck that names it, which names the author's next node, and the other is upgraded", async () => {
    const { repository, stray, versionOf, creatorOf, subject } = await podWith(
      `${NEWER(name)}\n${OLD_TTL}`,
      ["c"],
    );
    const before = await stray();
    await expect(repository.upgradeDecks(INSTANCE, null)).resolves.toBe(true);
    expect(await versionOf("c")).toBe(6);
    expect(await versionOf("d")).toBe(6);
    expect(await creatorOf("c")).toEqual([expect.stringMatching(creator)]);
    expect(await stray()).toEqual(before);
    expect(await subject(OLD)).toBeNull();
  });

  it("is left as it is by the rename and the removal of a deck that names it", async () => {
    const { repository, stray, creatorOf, subject } = await podWith(`${NEWER(name)}\n${OLD_TTL}`, [
      "b",
    ]);
    const before = await stray();
    const b = (await repository.listDecks(INSTANCE)).find(({ id }) => id === "b")!;
    expect(b.authors).toEqual([name]);
    await repository.renameDeck(b, { en: "Renamed" });
    expect(await stray()).toEqual(before);
    const [named] = await creatorOf("b");
    expect(named).toMatch(creator);
    expect(getInteger((await subject(named!))!, FORMAT_VERSION)).toBe(1);
    expect(await subject(OLD)).toBeNull();
    const renamed = (await repository.listDecks(INSTANCE)).find(({ id }) => id === "b")!;
    expect(renamed.title.en).toBe("Renamed");
    expect(renamed.authors).toEqual([name]);
    await repository.removeDeck(renamed);
    expect(await stray()).toEqual(before);
    expect((await repository.listDecks(INSTANCE)).map(({ id }) => id)).not.toContain("b");
  });
});

describe("an agent stamped newer at the node of another author", () => {
  it("gives the deck saved its author's next node, and is left as it is", async () => {
    const { repository, stray, creatorOf, subject } = await podWith(`${NEWER("y")}\n${OLD_TTL}`);
    const before = await stray();
    const b = (await repository.listDecks(INSTANCE)).find(({ id }) => id === "b")!;
    await repository.saveDeck({ ...b, authors: ["x"] });
    const [creator] = await creatorOf("b");
    expect(creator).toMatch(new RegExp(`^${CATALOG}#agent-x-.+`));
    const node = (await subject(creator!))!;
    expect(getInteger(node, FORMAT_VERSION)).toBe(1);
    expect(await stray()).toEqual(before);
    expect(await subject(OLD)).toBeNull();
  });
});

/** Another app's subject that names the node at <#agent-x>, so that no write takes it for a stray. */
const NAMED_BY_FOREIGN = "<#z> dcterms:creator <#agent-x> .";
/** The agent node at this app's format that decks c and d name: an author named "x". */
const MINE_TTL = `<#agent-mine> a <${FOAF}Agent> ; <${FOAF}name> "x" ; sm:formatVersion 1 .`;
const NAMES_MINE = "; dcterms:creator <#agent-mine> ";

type Repository = Awaited<ReturnType<typeof podWith>>["repository"];

/** A write of a deck by the author "x", and the URL of the deck it wrote. */
const WRITES_BY_X: [string, (repository: Repository) => Promise<string>][] = [
  [
    "saveDeck",
    async (repository) => {
      const b = (await repository.listDecks(INSTANCE)).find(({ id }) => id === "b")!;
      await repository.saveDeck({ ...b, authors: ["x"] });
      return b.url;
    },
  ],
  [
    "importDeck",
    async (repository) => {
      await repository.importDeck(INSTANCE, {
        url: "https://solid-memo.com/decks/capitals/v1.ttl",
        title: { en: "Capitals" },
        formatVersion: 1,
        authors: ["x"],
        license: "https://creativecommons.org/publicdomain/zero/1.0/",
        direction: "front-to-back",
        version: "1",
        seriesUrl: "https://solid-memo.com/decks/index.ttl#capitals",
        themes: [],
        keywords: {},
        cards: [
          { id: "sweden", front: { "": "Sweden" }, back: { "": "Stockholm" }, formatVersion: 1 },
        ],
      });
      const decks = await repository.listDecks(INSTANCE);
      return decks.find(({ title }) => title.en === "Capitals")!.url;
    },
  ],
  [
    "renameDeck",
    async (repository) => {
      const c = (await repository.listDecks(INSTANCE)).find(({ id }) => id === "c")!;
      expect(c.authors).toEqual(["x"]);
      await repository.renameDeck(c, { en: "Renamed" });
      return c.url;
    },
  ],
  [
    "upgradeDecks",
    async (repository) => {
      await expect(repository.upgradeDecks(INSTANCE, null)).resolves.toBe(true);
      return `${CATALOG}#d`;
    },
  ],
];

/** Nodes of the author "x" stamped newer, of a class a shape describes or of more classes than the write check reads. */
const SAME_AUTHOR_SHAPED: [string, string][] = [
  [
    "that is an agent and a dataset",
    `<#agent-x> a <${FOAF}Agent>, dcat:Dataset ; <${FOAF}name> "x" ; sm:formatVersion 2 .`,
  ],
  [
    "that is an agent and a concept",
    `<#agent-x> a <${FOAF}Agent>, <http://www.w3.org/2004/02/skos/core#Concept> ; <${FOAF}name> "x" ; sm:formatVersion 2 .`,
  ],
  [
    "that is an agent of 33 more classes",
    `<#agent-x> a <${FOAF}Agent>, ${Array.from({ length: 33 }, (_, i) => `<urn:x:T${i}>`).join(", ")} ; <${FOAF}name> "x" ; sm:formatVersion 2 .`,
  ],
];

describe.each(SAME_AUTHOR_SHAPED)(
  "a node of the deck's author %s, stamped newer, that an outdated deck and another subject name",
  (_, node) => {
    it("is left as it is by the upgrade, which upgrades both outdated decks", async () => {
      const { repository, stray, versionOf, creatorOf, subject } = await podWith(
        `${node}\n${NAMED_BY_FOREIGN}`,
        ["c"],
      );
      const before = await stray();
      await expect(repository.upgradeDecks(INSTANCE, null)).resolves.toBe(true);
      expect(await versionOf("c")).toBe(6);
      expect(await versionOf("d")).toBe(6);
      const [creator] = await creatorOf("c");
      expect(creator).toMatch(new RegExp(`^${CATALOG}#agent-x-.+`));
      expect(getInteger((await subject(creator!))!, FORMAT_VERSION)).toBe(1);
      expect(await stray()).toEqual(before);
      expect(await subject(`${CATALOG}#z`)).not.toBeNull();
    });
  },
);

describe.each([
  ["untyped", `<#agent-x> sm:formatVersion 2 ; <https://example.org/said> "z" .`],
  ["of another app's class", `<#agent-x> a <urn:x:T> ; sm:formatVersion 2 .`],
  [
    "that is an agent and a deck, at a deck's format above the agent's,",
    `<#agent-x> a <${FOAF}Agent>, sm:Deck ; <${FOAF}name> "x" ; sm:formatVersion 3 .`,
  ],
  ...SAME_AUTHOR_SHAPED,
])("a node %s stamped newer at the first node of an author another subject names", (_, node) => {
  it.each(WRITES_BY_X)(
    "is left as it is by %s, and the deck names the author's next node",
    async (_, write) => {
      const { repository, stray, subject } = await podWith(
        `${node}\n${NAMED_BY_FOREIGN}\n${MINE_TTL}`,
        ["c", "d"],
        NAMES_MINE,
      );
      const before = await stray();
      const url = await write(repository);
      const creator = getUrlAll((await subject(url))!, CREATOR);
      expect(creator).toEqual([expect.stringMatching(new RegExp(`^${CATALOG}#agent-x-.+`))]);
      expect(getInteger((await subject(creator[0]!))!, FORMAT_VERSION)).toBe(1);
      expect(await stray()).toEqual(before);
      expect(await subject(`${CATALOG}#z`)).not.toBeNull();
    },
  );
});
