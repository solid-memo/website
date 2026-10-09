// @vitest-environment node
/**
 * A deck saved as a file and made a deck again (UseCases.exportDeckFile,
 * openDeckFile and importDeckFile, docs/studio.md#import-and-export)
 * against a real Solid server: a deck with Markdown, a picture, wrong
 * options (one retired), text in two languages, a retired card and
 * review states goes through Turtle and JSON-LD into another instance
 * as it was, its progress with it when asked; a deck exported, removed
 * and imported again comes back at its URLs; and every document stays
 * valid.
 */
import { Parser, Writer } from "n3";
import { describe, expect, inject, it } from "vitest";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/sources";
import { SM_NS as SM } from "@solid-memo/vocab/vocab.generated";
import { createUseCases } from "@solid-memo/application/useCases";
import type { FileExchange } from "@solid-memo/application/ports";
import type { Card, Deck } from "@solid-memo/domain/deck";
import { DECK_FILE_FORMATS } from "@solid-memo/domain/deckFile";
import { createShaclShapeValidator } from "@solid-memo/solid/shaclShapeValidator";
import { createSolidAnswerLog } from "@solid-memo/solid/solidAnswerLog";
import { createSolidDeckArchive } from "@solid-memo/solid/solidDeckArchive";
import { createSolidDeckRepository } from "@solid-memo/solid/solidDeckRepository";
import { createSolidDigestRepository } from "@solid-memo/solid/solidDigestRepository";
import { createSolidInstanceCopier } from "@solid-memo/solid/solidInstanceCopier";
import { createSolidInstanceRepository } from "@solid-memo/solid/solidInstanceRepository";
import { createSolidPreferencesRepository } from "@solid-memo/solid/solidPreferencesRepository";
import { createSolidRepairRepository } from "@solid-memo/solid/solidRepairRepository";
import { createSolidReviewStateRepository } from "@solid-memo/solid/solidReviewStateRepository";
import { createSolidWebIdDocumentRepository } from "@solid-memo/solid/solidWebIdDocumentRepository";
import { createWriteFence } from "@solid-memo/solid/writeFence";

const SERVERS = inject("solidServers");

/** Files as the browser would keep them: the last one saved, which the next open picks. */
function files(): FileExchange & { saved: { name: string; mediaType: string; text: string }[] } {
  const saved: { name: string; mediaType: string; text: string }[] = [];
  return {
    saved,
    save: (name, mediaType, text) => void saved.push({ name, mediaType, text }),
    open: async () => {
      const last = saved.at(-1);
      return last === undefined ? null : { name: last.name, text: last.text };
    },
  };
}

/** A page of the app as createAppUseCases wires it, its files kept by `fileExchange`. */
function page(fileExchange: FileExchange = files()) {
  const writeFence = createWriteFence(fetch);
  const podFetch = writeFence.fetch;
  const shapeValidator = createShaclShapeValidator({ fetch: podFetch, shapesFetch, ...SHAPE_SOURCES });
  const checkWrite = shapeValidator.checkSubjects;
  const deps = { fetch: podFetch, checkWrite, now: () => new Date(), randomId: () => crypto.randomUUID() };
  return createUseCases({
    sessionGateway: undefined as never,
    storageGateway: undefined as never,
    deckLibrary: undefined as never,
    webIdDocumentRepository: createSolidWebIdDocumentRepository({ fetch: podFetch }),
    instanceRepository: createSolidInstanceRepository(deps),
    deckRepository: createSolidDeckRepository(deps),
    preferencesRepository: createSolidPreferencesRepository({ fetch: podFetch, checkWrite }),
    reviewStateRepository: createSolidReviewStateRepository({ fetch: podFetch, checkWrite }),
    shapeValidator,
    repairRepository: createSolidRepairRepository({ fetch: podFetch }),
    instanceCopier: createSolidInstanceCopier({ fetch: podFetch }),
    writeFence,
    digestRepository: createSolidDigestRepository({ fetch: podFetch, checkWrite }),
    answerLog: createSolidAnswerLog({ fetch: podFetch, checkWrite }),
    ruleset: "e2e-rules",
    deckArchive: createSolidDeckArchive({ fetch: podFetch }),
    fileExchange,
  });
}

const CREATED = `dcterms:created "2026-10-01T10:00:00Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> ; sm:formatVersion 5`;

/**
 * Two instances of one user; in the first, a deck of three cards: one
 * in Markdown in two languages with two wrong options, one retired; a
 * picture with its description; and a retired card. Two of them are
 * studied. The deck's name is ASCII: the catalog's PATCH carries it,
 * which Community Solid Server's in-memory store would cut short.
 */
async function seed(server: string) {
  const base = new URL(`deck-files-${crypto.randomUUID()}/`, server).href;
  const webId = `${base}profile/card.ttl#me`;
  const typeIndex = `${base}settings/privateTypeIndex.ttl`;
  const put = async (url: string, body: string) => {
    const response = await fetch(url, { method: "PUT", headers: { "content-type": "text/turtle" }, body });
    if (!response.ok) throw new Error(`Seeding ${url}: ${response.status}`);
  };
  await put(`${base}profile/card.ttl`, `<#me> <http://www.w3.org/ns/solid/terms#privateTypeIndex> <${typeIndex}> .`);
  await put(typeIndex, `<> a <http://www.w3.org/ns/solid/terms#TypeIndex>, <http://www.w3.org/ns/solid/terms#UnlistedDocument> .`);
  const useCases = page();
  const session = { webId };
  const main = await useCases.createInstance(session, { containerUrl: `${base}main/`, name: "Main", registrationTarget: "private" });
  const other = await useCases.createInstance(session, { containerUrl: `${base}other/`, name: "Other", registrationTarget: "private" });
  const deck = await useCases.createDeck(main.url, { en: "Capitals" });
  const prefixes = `@prefix sm: <${SM}> .\n@prefix dcterms: <http://purl.org/dc/terms/> .\n@prefix owl: <http://www.w3.org/2002/07/owl#> .\n`;
  await put(
    deck.cardsDocumentUrl,
    `${prefixes}<#se> a sm:Card ; sm:front "**Sweden**"@en, "**Sverige**"@sv ; sm:back "Stockholm"@en, "Stockholm"@sv ;
  sm:backNote "Since 1634."@en, "Sedan 1634."@sv ; sm:textFormat sm:markdown ; sm:distractor <#se-d1>, <#se-d2> ; ${CREATED} .
<#se-d1> a sm:Distractor, <https://schema.org/Answer> ; sm:distractorText "Gothenburg"@en, "Göteborg"@sv ; sm:distractorNote "The second city."@en .
<#se-d2> a sm:Distractor, <https://schema.org/Answer> ; sm:distractorText "Uppsala"@en, "Uppsala"@sv ; owl:deprecated true .
<#flag> a sm:Card ; sm:frontImage <https://flagcdn.com/h80/se.png> ; sm:frontImageDescription "A yellow cross on blue"@en ; sm:back "Sweden"@en ; ${CREATED} .
<#old> a sm:Card ; sm:front "Prussia"@en ; sm:back "Berlin"@en ; owl:deprecated true ; ${CREATED} .
`,
  );
  const cards = Object.fromEntries((await useCases.listCards(deck)).map((card) => [card.id, card]));
  for (const id of ["se", "flag"]) {
    await useCases.recordReview(main.url, deck, { card: cards[id]!, direction: "front-to-back" }, 4, new Date());
  }
  return { main, other, deck, useCases };
}

/** A document as N-Triples: every IRI written out in full, whatever the server's Turtle abbreviates. */
async function triples(url: string): Promise<string> {
  const turtle = await fetch(url, { headers: { accept: "text/turtle" } }).then((response) => response.text());
  return new Writer({ format: "N-Triples" }).quadsToString(new Parser({ baseIRI: url }).parse(turtle));
}

/** A deck's cards without where they are: what a file carries over. */
const contentOf = (cards: readonly Card[]) => cards.map(({ url: _, ...card }) => card).sort((a, b) => a.id.localeCompare(b.id));
const statesOf = async (deck: Deck) =>
  (await page().listDeckReviewStates(deck)).sort((a, b) => a.cardId.localeCompare(b.cardId));

describe.each(SERVERS)("decks as files on $name", ({ url: server }) => {
  for (const format of DECK_FILE_FORMATS) {
    it(`takes a deck through ${format} into another instance, its progress with it`, async () => {
      const { other, deck } = await seed(server);
      const exchange = files();
      const useCases = page(exchange);
      await useCases.exportDeckFile(deck, { format, withProgress: true });
      expect(exchange.saved).toHaveLength(1);
      const file = (await useCases.openDeckFile())!;
      expect(file).toMatchObject({ name: `capitals${format === "turtle" ? ".ttl" : ".jsonld"}`, format });
      expect(file.content.upgraded).toEqual([]);
      expect(file.content.dropped).toEqual([]);

      const imported = await useCases.importDeckFile(other.url, file, { withProgress: true });
      expect(imported).toMatchObject({ id: deck.id, url: `${other.url}catalog.ttl#${deck.id}`, title: { en: "Capitals" } });
      expect(contentOf(await page().listCards(imported))).toEqual(contentOf(await page().listCards(deck)));
      const copied = await statesOf(imported);
      expect(copied.map((state) => state.cardId)).toEqual(["flag", "se"]);
      expect(copied).toEqual(await statesOf(deck));
      // Written as Solid Memo writes them: each wrong option a suggested answer too, each state naming its card here.
      const cardsWritten = await triples(imported.cardsDocumentUrl);
      for (const id of ["se-d1", "se-d2"]) {
        expect(cardsWritten).toContain(`<${imported.cardsDocumentUrl}#se> <https://schema.org/suggestedAnswer> <${imported.cardsDocumentUrl}#${id}> .`);
      }
      expect(await triples(imported.reviewsDocumentUrl)).toContain(
        `<${imported.reviewsDocumentUrl}#se> <${SM}reviewOf> <${imported.cardsDocumentUrl}#se> .`,
      );
      expect((await page().validateInstance(other.url)).conforms).toBe(true);
    });
  }

  it("imports a deck without its progress, and one exported and removed back at its URLs", async () => {
    const { main, other, deck } = await seed(server);
    const exchange = files();
    const useCases = page(exchange);
    await useCases.exportDeckFile(deck, { format: "turtle", withProgress: false });
    const file = (await useCases.openDeckFile())!;
    expect(file.content.reviews).toBeUndefined();
    const fresh = await useCases.importDeckFile(other.url, file, { withProgress: false });
    expect(await statesOf(fresh)).toEqual([]);

    await useCases.removeDecks([deck]);
    const back = await useCases.importDeckFile(main.url, file, { withProgress: false });
    expect(back.url).toBe(deck.url);
    expect(back.cardsDocumentUrl).toBe(deck.cardsDocumentUrl);
    expect(contentOf(await page().listCards(back))).toEqual(contentOf(await page().listCards(fresh)));
    // Imported again beside itself: a fresh id, its own documents.
    const twice = await useCases.importDeckFile(main.url, file, { withProgress: false });
    expect(twice.id).not.toBe(deck.id);
    expect((await page().listDecks(main.url)).map((each) => each.url).sort()).toEqual([back.url, twice.url].sort());
    expect((await page().validateInstance(main.url)).conforms).toBe(true);
  });
});
