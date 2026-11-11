// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/testing/shapeSources";
import { describe, expect, it } from "vitest";
import { getSolidDatasetOrNull } from "./datasets";
import { createShaclShapeValidator } from "./shaclShapeValidator";
import { createSolidDeckRepository } from "./solidDeckRepository";
import { fakePod } from "./testing/fakePod";

/**
 * A node a subject of Solid Memo's links to, with more rdf:type
 * statements than the engine reads, so it is checked as having none:
 * DCAT-AP's class check on the link is a warning, a catalog's link to a
 * member included, and the node's own result still names it. Every
 * deck-tree edit and save of a deck still passes the write check. A link
 * to a member of the wrong class with few types still counts. Through
 * the real deck repository and write check, against a fake pod.
 */

const INSTANCE = "https://pod.example/solid-memo/main/";
const CATALOG = `${INSTANCE}catalog.ttl`;
const ROOT = `${CATALOG}#catalog`;
const at = (id: string) => `${CATALOG}#${id}`;
const ME = "https://pod.example/profile/card#me";
const SCHEME = "http://publications.europa.eu/resource/authority/data-theme";
const EDUC = `${SCHEME}/EDUC`;
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const MEMBER = "http://www.w3.org/ns/dcat#dataset";
const PREFIXES = `@prefix sm: <https://solid-memo.com/ns/vocab/v1.ttl#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .
`;

const deckTtl = (id: string) => `<#${id}> a sm:Deck, dcat:Dataset ; sm:formatVersion 6 ;
  dcterms:title "${id}"@en ; dcterms:description "Flashcards: ${id}."@en ; sm:studyDirection sm:frontToBack ;
  sm:cardsDocument <${INSTANCE}decks/${id}.ttl> ; sm:reviewsDocument <${INSTANCE}reviews/${id}.ttl> .
`;
const agent = `<${ME}> a <http://xmlns.com/foaf/0.1/Agent> ; <http://xmlns.com/foaf/0.1/name> "Me" .`;
/** A deck group of deck a, in the catalog with decks b and c. */
const grouped = `<#catalog> dcat:catalog <#group-1> .
  <#group-1> a sm:DeckGroup, dcat:Catalog ; sm:formatVersion 1 ; dcterms:title "Languages"@en ;
    dcterms:description "Deck group: Languages."@en ; dcterms:publisher <${ME}> ;
    dcat:dataset <#a> ; sm:position 1 .
  <#b> sm:position 0 . <#c> sm:position 2 . <#a> sm:position 0 .`;
/** `count` rdf:type statements on `node`, of classes nothing describes. */
const types = (node: string, count = 33) =>
  Array.from({ length: count }, (_, i) => `<${node}> a <https://x.example/T${i}> .`).join("\n");

/** A pod whose instance has a catalog of decks a, b and c, the agent, and `extra`. */
async function podWith(extra: string) {
  const pod = fakePod();
  await pod.put(
    CATALOG,
    `${PREFIXES}<#catalog> a dcat:Catalog ; dcterms:title "Main" ; dcterms:description "My decks." ;
      dcterms:publisher <${ME}> ; dcat:dataset <#a>, <#b>, <#c> .
    ${deckTtl("a")}${deckTtl("b")}${deckTtl("c")}${agent}
    ${extra}`,
  );
  const validator = createShaclShapeValidator({
    fetch: pod.fetch,
    shapesFetch,
    ...SHAPE_SOURCES,
  }).over(pod.fetch);
  const repository = createSolidDeckRepository({
    fetch: pod.fetch,
    now: () => new Date("2026-11-11T10:00:00.000Z"),
    randomId: () => "new",
    checkWrite: validator.checkSubjects,
  });
  return { fetch: pod.fetch, validator, repository };
}

const combine = (dragged: string, target: string, group: string) =>
  ({
    kind: "combine",
    dragged: at(dragged),
    target: at(target),
    group: { url: at(group), title: { en: group } },
  }) as const;

type Planted = Awaited<ReturnType<typeof podWith>>;

/** Each result of the instance check on the catalog document about `subject`, as [constraint, path, value, severity]. */
async function resultsOn({ validator }: Planted, subject: string) {
  const document = await validator.validateDocument(CATALOG);
  return document.subjects
    .filter((report) => report.url === subject)
    .flatMap((report) => ("violations" in report ? report.violations : []))
    .map((v) => [v.constraint, v.path, v.value, v.severity]);
}

const overTyped = (node: string) => ["MaxCount", RDF_TYPE, node, expect.any(String)];

describe("a linked node with more types than the engine reads", () => {
  it("leaves every deck-tree edit open when the catalog's theme taxonomy is one", async () => {
    const planted = await podWith(`<#catalog> dcat:themeTaxonomy <${SCHEME}> .\n${types(SCHEME)}`);
    await planted.repository.editDeckTree(INSTANCE, combine("c", "a", "group-1"));
    expect(await resultsOn(planted, SCHEME)).toContainEqual(overTyped(SCHEME));
  }, 30_000);

  it("leaves a deck's save open when its theme is one", async () => {
    const planted = await podWith(`<#a> dcat:theme <${EDUC}> .\n${types(EDUC)}`);
    const deck = (await planted.repository.listDecks(INSTANCE)).find((d) => d.url === at("a"))!;
    await planted.repository.saveDecks([{ ...deck, title: { en: "renamed" } }]);
    expect(await resultsOn(planted, EDUC)).toContainEqual(overTyped(EDUC));
  }, 30_000);

  it("leaves a new group open when the publisher is one", async () => {
    const planted = await podWith(types(ME));
    await planted.repository.editDeckTree(INSTANCE, combine("c", "a", "group-1"));
    expect(await resultsOn(planted, ME)).toContainEqual(overTyped(ME));
  }, 30_000);

  it("leaves the catalog's edits open, and warns about its link, when a deck's entry is one", async () => {
    const planted = await podWith(types(at("b")));
    await planted.repository.editDeckTree(INSTANCE, combine("c", "a", "group-1"));
    expect(await resultsOn(planted, at("b"))).toContainEqual(overTyped(at("b")));
    expect(await resultsOn(planted, ROOT)).toContainEqual(["Class", MEMBER, at("b"), "warning"]);
  }, 30_000);

  it("leaves the catalog's edits open when a deck group is one", async () => {
    const planted = await podWith(`${grouped}\n${types(at("group-1"))}`);
    await planted.repository.editDeckTree(INSTANCE, combine("c", "b", "group-2"));
    expect(await resultsOn(planted, at("group-1"))).toContainEqual(overTyped(at("group-1")));
  }, 30_000);

  it("still counts the catalog's link to a member of the wrong class with fewer types", async () => {
    const planted = await podWith(
      `${grouped}\n<#catalog> dcat:dataset <#group-1> .\n${types(at("group-1"), 3)}`,
    );
    expect(await resultsOn(planted, ROOT)).toContainEqual([
      "Class",
      MEMBER,
      at("group-1"),
      "violation",
    ]);
    const read = await getSolidDatasetOrNull(CATALOG, planted.fetch);
    await expect(planted.validator.checkSubjects(read!, [ROOT], "pod")).rejects.toThrow(
      `<${ROOT}> (${MEMBER}): DCAT-AP:`,
    );
  }, 30_000);
});
