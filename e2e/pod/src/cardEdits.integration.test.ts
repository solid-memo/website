// @vitest-environment node
/**
 * The Studio's bulk edits of a deck's cards (UseCases.editCards and
 * undoCardEdit) against a real Solid server: an edit is written in one
 * write of the cards document, which stays valid, the review states of
 * deleted cards in one write of the reviews document, and an undo puts
 * both back. The cards write is made only if the document is as it was
 * read: one changed meanwhile by another app is read again and the edit
 * planned again, and written while that plan is the one previewed; else
 * nothing is written (where the server enforces If-Match, preconditionsOf).
 */
import { beforeAll, describe, expect, inject, it } from "vitest";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/sources";
import { SM_NS as SM } from "@solid-memo/vocab/vocab.generated";
import { createUseCases, type UseCases } from "@solid-memo/application/useCases";
import { planCardEdit, type CardEdit } from "@solid-memo/domain/cardBulk";
import type { Deck } from "@solid-memo/domain/deck";
import { createShaclShapeValidator } from "@solid-memo/solid/shaclShapeValidator";
import { createSolidDeckRepository } from "@solid-memo/solid/solidDeckRepository";
import { createSolidDigestRepository } from "@solid-memo/solid/solidDigestRepository";
import { createSolidInstanceCopier } from "@solid-memo/solid/solidInstanceCopier";
import { createSolidInstanceRepository } from "@solid-memo/solid/solidInstanceRepository";
import { createSolidPreferencesRepository } from "@solid-memo/solid/solidPreferencesRepository";
import { createSolidRepairRepository } from "@solid-memo/solid/solidRepairRepository";
import { createSolidReviewStateRepository } from "@solid-memo/solid/solidReviewStateRepository";
import { createSolidWebIdDocumentRepository } from "@solid-memo/solid/solidWebIdDocumentRepository";
import { createWriteFence } from "@solid-memo/solid/writeFence";
import { ETAG_OUTLIVES_EDITS, etagMarksEveryEdit, preconditionsOf } from "./serverTraits";

const SERVERS = inject("solidServers");

/** A page of the app as createAppUseCases wires it; `beforeWrite` runs before each write it makes. */
function page(beforeWrite: (url: string) => Promise<void> = async () => undefined) {
  const watching: typeof fetch = async (input, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "PUT" || method === "PATCH") await beforeWrite(String(input));
    return fetch(input, init);
  };
  const writeFence = createWriteFence(watching);
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
    ruleset: "e2e-rules",
  });
}

/**
 * An instance with a deck of three cards, their text beyond ASCII, one
 * with a wrong option. The deck's name is ASCII: the catalog's PATCH
 * carries it, which Community Solid Server's in-memory store would cut short.
 */
async function seed(server: string): Promise<{ instanceUrl: string; deck: Deck }> {
  const base = new URL(`card-edits-${crypto.randomUUID()}/`, server).href;
  const webId = `${base}profile/card.ttl#me`;
  const typeIndex = `${base}settings/privateTypeIndex.ttl`;
  const put = async (url: string, body: string) => {
    const response = await fetch(url, { method: "PUT", headers: { "content-type": "text/turtle" }, body });
    if (!response.ok) throw new Error(`Seeding ${url}: ${response.status}`);
  };
  await put(`${base}profile/card.ttl`, `<#me> <http://www.w3.org/ns/solid/terms#privateTypeIndex> <${typeIndex}> .`);
  await put(typeIndex, `<> a <http://www.w3.org/ns/solid/terms#TypeIndex>, <http://www.w3.org/ns/solid/terms#UnlistedDocument> .`);
  const useCases = page();
  const instance = await useCases.createInstance({ webId }, { containerUrl: `${base}solid-memo/`, name: "Main", registrationTarget: "private" });
  const deck = await useCases.createDeck(instance.url, { en: "Birds" });
  await put(
    deck.cardsDocumentUrl,
    `@prefix sm: <${SM}> .
@prefix dcterms: <http://purl.org/dc/terms/> .
<#bird> a sm:Card ; sm:front "fågel"@sv ; sm:back "bird"@en ; sm:distractor <#bird-fish> ;
  dcterms:created "2026-10-01T10:00:00Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> ; sm:formatVersion 5 .
<#bird-fish> a sm:Distractor, <https://schema.org/Answer> ; sm:distractorText "fisk"@sv .
<#gull> a sm:Card ; sm:front "fiskmås"@sv ; sm:back "gull"@en ;
  dcterms:created "2026-10-01T10:00:00Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> ; sm:formatVersion 5 .
<#owl> a sm:Card ; sm:front "uggla"@sv ; sm:back "owl"@en ;
  dcterms:created "2026-10-01T10:00:00Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> ; sm:formatVersion 5 .
`,
  );
  return { instanceUrl: instance.url, deck };
}

/** What the user previews: the edit planned on the deck's cards and review states as they are. */
async function preview(useCases: UseCases, deck: Deck, ids: string[], edit: CardEdit) {
  const [cards, states] = await Promise.all([useCases.listCards(deck), useCases.listDeckReviewStates(deck)]);
  return planCardEdit(cards, ids, edit, states);
}

const byId = async (deck: Deck) => Object.fromEntries((await page().listCards(deck)).map((card) => [card.id, card]));

describe.each(SERVERS)("bulk edits of cards on $name", ({ url: server }) => {
  /** Whether this server refuses an edit whose If-Match names another version. */
  let conditional = false;
  /** Whether its ETag changes on every edit (etagMarksEveryEdit). */
  let everyEdit = false;
  beforeAll(async () => {
    conditional = (await preconditionsOf(server)).edits;
    everyEdit = await etagMarksEveryEdit(server);
  });

  it("replaces text in one write, the cards staying valid, and undoes it", async () => {
    const { instanceUrl, deck } = await seed(server);
    const useCases = page();
    const edit: CardEdit = { kind: "replaceText", find: "fisk", replace: "sill", fields: ["front", "distractor"], caseSensitive: false, wholeWord: false };
    const previewed = await preview(useCases, deck, ["bird", "gull", "owl"], edit);
    const written = await useCases.editCards(instanceUrl, deck, ["bird", "gull", "owl"], edit, previewed);
    expect(written.save.map((card) => card.id)).toEqual(["bird", "gull"]);
    let cards = await byId(deck);
    expect(cards.gull?.front).toEqual({ sv: "sillmås" });
    expect(cards.bird?.distractors).toEqual([{ id: "bird-fish", text: { sv: "sill" } }]);
    expect(cards.owl?.front).toEqual({ sv: "uggla" });
    expect((await page().validateInstance(instanceUrl)).conforms).toBe(true);

    await useCases.undoCardEdit(instanceUrl, deck, written);
    cards = await byId(deck);
    expect(cards.gull?.front).toEqual({ sv: "fiskmås" });
    expect(cards.bird?.distractors).toEqual([{ id: "bird-fish", text: { sv: "fisk" } }]);
    expect((await page().validateInstance(instanceUrl)).conforms).toBe(true);
  });

  it("deletes cards with their review states, and undo puts both back", async () => {
    const { instanceUrl, deck } = await seed(server);
    const useCases = page();
    const owl = (await byId(deck)).owl!;
    await useCases.recordReview(instanceUrl, deck, { card: owl, direction: "front-to-back" }, 5, new Date());
    const edit: CardEdit = { kind: "remove" };
    const previewed = await preview(useCases, deck, ["owl"], edit);
    const written = await useCases.editCards(instanceUrl, deck, ["owl"], edit, previewed);
    expect(await byId(deck)).not.toHaveProperty("owl");
    expect(await page().listDeckReviewStates(deck)).toEqual([]);

    await useCases.undoCardEdit(instanceUrl, deck, written);
    expect((await byId(deck)).owl?.front).toEqual({ sv: "uggla" });
    expect((await page().listDeckReviewStates(deck)).map((state) => state.cardId)).toEqual(["owl"]);
    expect((await page().validateInstance(instanceUrl)).conforms).toBe(true);
  });

  /** A page whose first write of the cards document is preceded by another app's change to the card `id`. */
  function racing(deck: Deck, id: string) {
    let changed = false;
    return page(async (url) => {
      if (url !== deck.cardsDocumentUrl || changed) return;
      changed = true;
      // Written whole: Community Solid Server's in-memory store cuts short a PATCH beyond ASCII.
      const read = await fetch(deck.cardsDocumentUrl, { headers: { accept: "text/turtle" } });
      const body = `${await read.text()}\n<#${id}> <${SM}backNote> "edited in another tab"@en .\n`;
      const response = await fetch(deck.cardsDocumentUrl, { method: "PUT", headers: { "content-type": "text/turtle" }, body });
      if (!response.ok) throw new Error(`Changing ${deck.cardsDocumentUrl} as another app: ${response.status}.`);
    });
  }

  it("plans the edit again on a cards document another app changed since it was read, keeping that change", async (context) => {
    if (!conditional) context.skip("this server ignores If-Match, so a change made elsewhere cannot be detected");
    // The change is made in the same second as the read, which such a server's ETag does not tell apart.
    if (!everyEdit) context.skip(ETAG_OUTLIVES_EDITS);
    const { instanceUrl, deck } = await seed(server);
    const useCases = racing(deck, "owl");
    const edit: CardEdit = { kind: "retire" };
    const previewed = await preview(useCases, deck, ["gull"], edit);
    await useCases.editCards(instanceUrl, deck, ["gull"], edit, previewed);
    const cards = await byId(deck);
    expect(cards.gull?.retired).toBe(true);
    expect(cards.owl?.backNote).toEqual({ en: "edited in another tab" });
  });

  it("writes nothing once the edit planned again is not the one previewed", async (context) => {
    if (!conditional) context.skip("this server ignores If-Match, so a change made elsewhere cannot be detected");
    if (!everyEdit) context.skip(ETAG_OUTLIVES_EDITS);
    const { instanceUrl, deck } = await seed(server);
    const useCases = racing(deck, "gull");
    const edit: CardEdit = { kind: "retire" };
    const previewed = await preview(useCases, deck, ["gull"], edit);
    await expect(useCases.editCards(instanceUrl, deck, ["gull"], edit, previewed)).rejects.toMatchObject({ code: "changedElsewhere" });
    const cards = await byId(deck);
    expect(cards.gull?.retired).toBeUndefined();
    expect(cards.gull?.backNote).toEqual({ en: "edited in another tab" });
  });
});
