// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * Another app's node that a subject of Solid Memo's names through a link
 * Solid Memo never writes on it, or that is of another class than the
 * link names, stays another app's: its results are warnings, and it sets
 * no deck nor the arrangement aside (GHSA-p5vh-8mrx-96hv).
 */
import { describe, expect, it } from "vitest";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/testing/shapeSources";
import type { Deck } from "@solid-memo/domain/deck";
import { arrangementSetAside, deckSetAside, summarize } from "@solid-memo/domain/validation";
import { solidMemoSubjects } from "./ownership";
import { createShaclShapeValidator } from "./shaclShapeValidator";
import { datasetOfTurtle } from "./testing/datasets";

const INSTANCE = "https://pod.example/solid-memo/a/";
const CARDS = `${INSTANCE}cards/deck-1.ttl`;
const REVIEWS = `${INSTANCE}reviews/deck-1.ttl`;
const CATALOG = `${INSTANCE}catalog.ttl`;
const PREFIXES = `@prefix sm: <https://solid-memo.com/ns/vocab/v1.ttl#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
`;
const DECK = {
  url: `${CATALOG}#deck-1`,
  cardsDocumentUrl: CARDS,
  reviewsDocumentUrl: REVIEWS,
} as Deck;

async function check(url: string, turtle: string, context: "pod" | "draft" = "pod") {
  const validator = createShaclShapeValidator({
    fetch: () => Promise.reject(new Error("offline")),
    shapesFetch,
    ...SHAPE_SOURCES,
  });
  const report = await validator.validateDataset(
    url,
    await datasetOfTurtle(url, PREFIXES + turtle),
    context,
  );
  const subject = (id: string) => report.subjects.find((s) => s.url === `${url}#${id}`);
  return { summary: summarize(INSTANCE, [report]), subject };
}

const RELEASE = "https://library.example/decks/deck-1/v1.ttl";
const DRAFT = `${INSTANCE}drafts/deck-1/v1.ttl`;

/** The subjects of the document at `url` that are Solid Memo's (solidMemoSubjects). */
async function ownedOf(url: string, turtle: string) {
  return solidMemoSubjects(await datasetOfTurtle(url, PREFIXES + turtle));
}

/** Expects each subject of `url` named by `ids` to be Solid Memo's: reported, and not as another app's. */
function expectOwned(subject: (id: string) => unknown, url: string, ids: readonly string[]) {
  for (const id of ids) {
    expect(subject(id)).toMatchObject({ url: `${url}#${id}` });
    expect(subject(id)).not.toHaveProperty("foreign");
  }
}

const CARD = `<#c1> a sm:Card ; sm:formatVersion 5 ; sm:front "f"@en ; sm:back "b"@en .
<#theirs> a foaf:Agent, dcat:Distribution .
`;

describe("another app's node named from a subject of Solid Memo's", () => {
  it.each(["dcterms:creator", "dcat:distribution", "dcterms:publisher"])(
    "stays another app's when a card names it by %s, and sets no deck aside",
    async (link) => {
      const { summary, subject } = await check(CARDS, `${CARD}<#c1> ${link} <#theirs> .`);
      expect(subject("theirs")).toMatchObject({ foreign: true });
      expect(deckSetAside(summary, DECK)).toBe(false);
    },
  );

  it("stays another app's when a review state names it as its creator", async () => {
    const { subject } = await check(
      REVIEWS,
      "<#rs-1> a sm:ReviewState ; dcterms:creator <#theirs> .\n<#theirs> a foaf:Agent .",
    );
    expect(subject("theirs")).toMatchObject({ foreign: true });
  });

  it("stays another app's when a deck entry names a catalog as its creator, and leaves the arrangement as it is", async () => {
    const { summary, subject } = await check(
      CATALOG,
      "<#deck-1> a sm:Deck ; dcterms:creator <#x> .\n<#x> a dcat:Catalog .",
    );
    expect(subject("x")).toMatchObject({ foreign: true });
    expect(arrangementSetAside(summary)).toBe(false);
  });

  it("stays another app's when a deck entry names it as its creator but it is a distribution too", async () => {
    const { subject } = await check(
      CATALOG,
      "<#deck-1> a sm:Deck ; dcterms:creator <#theirs> .\n<#theirs> a foaf:Agent, dcat:Distribution .",
    );
    expect(subject("theirs")).toMatchObject({ foreign: true });
  });

  it("is Solid Memo's when a deck entry, the catalog or a deck group names it, of the class the link names", async () => {
    const { subject } = await check(
      CATALOG,
      `<#catalog> dcterms:publisher <#pub> .
<#group-1> a sm:DeckGroup ; dcterms:publisher <#pub-2> .
<#deck-1> a sm:Deck ; dcterms:creator <#agent-1> ; dcat:distribution <#dist-1> .
<#pub> a foaf:Agent .
<#pub-2> a foaf:Agent .
<#agent-1> a foaf:Agent .
<#dist-1> a dcat:Distribution .`,
    );
    for (const id of ["pub", "pub-2", "agent-1", "dist-1"]) {
      expect(subject(id)).toMatchObject({ url: `${CATALOG}#${id}` });
      expect(subject(id)).not.toHaveProperty("foreign");
    }
  });

  it("stays another app's when a deck entry of the catalog names it as its publisher", async () => {
    const { summary, subject } = await check(
      CATALOG,
      "<#deck-1> a sm:Deck ; dcterms:publisher <#theirs> .\n<#theirs> a foaf:Agent .",
    );
    expect(subject("theirs")).toMatchObject({ foreign: true });
    expect(arrangementSetAside(summary)).toBe(false);
  });

  it.each([
    ["cards", CARDS],
    ["reviews", REVIEWS],
  ])(
    "stays another app's when a %s document's untyped #catalog names it, as that is no catalog",
    async (_, url) => {
      const { summary, subject } = await check(
        url,
        `<#catalog> dcterms:publisher <#theirs> .
<#theirs> a foaf:Agent .`,
      );
      expect(subject("theirs")).toMatchObject({ foreign: true });
      expect(deckSetAside(summary, DECK)).toBe(false);
    },
  );
});

describe("another app's node named from a deck's cards or reviews document", () => {
  // Solid Memo writes none of these links in a deck's cards or reviews
  // document, whatever class a subject there says it has besides its own.
  // The subject naming it is held to its own shape all the same, so the
  // deck is set aside with the link as it is without it.
  const VALID_CARD = `sm:formatVersion 5 ; sm:front "f"@en ; sm:back "b"@en`;
  it.each([
    [
      "a card that says it is a series too names it as its publisher",
      CARDS,
      `<#c1> a sm:Card, dcat:DatasetSeries ; ${VALID_CARD}`,
      "dcterms:publisher",
    ],
    [
      "a card that says it is a dataset too names it as its creator",
      CARDS,
      `<#c1> a sm:Card, dcat:Dataset ; ${VALID_CARD}`,
      "dcterms:creator",
    ],
    [
      "a stamped series beside a card names it as its publisher",
      CARDS,
      `<#c1> a sm:Card ; ${VALID_CARD} .\n<#s> a dcat:DatasetSeries ; sm:formatVersion 3`,
      "dcterms:publisher",
    ],
    [
      "a review state that says it is a series too names it as its publisher",
      REVIEWS,
      "<#rs> a sm:ReviewState, dcat:DatasetSeries",
      "dcterms:publisher",
    ],
  ])("stays another app's when %s", async (_, url, turtle, link) => {
    const theirs = "<#theirs> a foaf:Agent .";
    const { summary, subject } = await check(url, `${turtle} ; ${link} <#theirs> .\n${theirs}`);
    const without = await check(url, `${turtle} .\n${theirs}`);
    expect(subject("theirs")).toMatchObject({ foreign: true });
    expect(deckSetAside(summary, DECK)).toBe(deckSetAside(without.summary, DECK));
  });

  it("sets no deck aside when a valid card that says it is a series too names it", async () => {
    const { summary } = await check(
      CARDS,
      `<#c1> a sm:Card, dcat:DatasetSeries ; ${VALID_CARD} ; dcterms:publisher <#theirs> .
<#theirs> a foaf:Agent .`,
    );
    expect(deckSetAside(summary, DECK)).toBe(false);
  });
});

describe("a node a subject of Solid Memo's names where Solid Memo writes the link", () => {
  // A release is wholly its publisher's when it is checked (nothing in it
  // is reported as another app's), so what is Solid Memo's in it is
  // asked of solidMemoSubjects itself.
  it("is Solid Memo's as a release's publisher, creator and distribution", async () => {
    const owned = await ownedOf(
      RELEASE,
      `<> a sm:Deck ; dcterms:publisher <#pub> ; dcterms:creator <#agent-1> ; dcat:distribution <#dist-1> .
<#c1> a sm:Card ; dcterms:creator <#theirs> .
<#pub> a foaf:Agent .
<#agent-1> a foaf:Agent .
<#dist-1> a dcat:Distribution .
<#theirs> a foaf:Agent .`,
    );
    expect([...owned].sort()).toEqual(
      ["", "#agent-1", "#c1", "#dist-1", "#pub"].map((id) => `${RELEASE}${id}`),
    );
  });

  it("is Solid Memo's as a draft's publisher and creator", async () => {
    const { subject } = await check(
      DRAFT,
      `<> a sm:Deck ; dcterms:publisher <#pub> ; dcterms:creator <#agent-1> .
<#pub> a foaf:Agent .
<#agent-1> a foaf:Agent .`,
      "draft",
    );
    expectOwned(subject, DRAFT, ["pub", "agent-1"]);
  });

  it("is Solid Memo's as the publisher of a release's series", async () => {
    const owned = await ownedOf(
      RELEASE,
      `<> a sm:Deck ; dcat:inSeries <#series> .
<#series> a dcat:DatasetSeries, dcat:Dataset ; sm:formatVersion 3 ; dcterms:publisher <#solid-memo> .
<#deck-2> a dcat:DatasetSeries ; dcterms:publisher <#theirs> .
<#solid-memo> a foaf:Agent .
<#theirs> a foaf:Agent .`,
    );
    expect([...owned].sort()).toEqual(
      ["", "#series", "#solid-memo"].map((id) => `${RELEASE}${id}`),
    );
  });

  it("is Solid Memo's as the publisher of the catalog, typed or not, and of a deck group", async () => {
    for (const catalog of ["<#catalog>", "<#catalog> a dcat:Catalog ;"]) {
      const { subject } = await check(
        CATALOG,
        `${catalog} dcterms:publisher <#pub> .
<#group-1> a sm:DeckGroup ; dcterms:publisher <#pub-2> .
<#pub> a foaf:Agent .
<#pub-2> a foaf:Agent .`,
      );
      expectOwned(subject, CATALOG, ["catalog", "pub", "pub-2"]);
    }
  });
});
