// @vitest-environment node
/**
 * Stating the language of a deck's untagged card sides (UseCases.stateCardLanguages)
 * against a real Solid server: the sides are re-keyed in one write of the
 * cards document, which stays valid, and a write made only if the
 * document is as it was read: one changed meanwhile by another app is
 * not overwritten (where the server enforces If-Match, preconditionsOf).
 * The cards hold text beyond ASCII, which a PATCH would leave cut short
 * on Community Solid Server's in-memory store: the write is one PUT.
 */
import { beforeAll, describe, expect, inject, it } from "vitest";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/sources";
import { SM_NS as SM } from "@solid-memo/vocab/vocab.generated";
import { createUseCases } from "@solid-memo/application/useCases";
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

/** An instance with a deck whose cards an older app saved with untagged sides, one card tagged already. */
async function seed(server: string): Promise<{ instanceUrl: string; deck: Deck }> {
  const base = new URL(`languages-${crypto.randomUUID()}/`, server).href;
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
  const deck = await useCases.createDeck(instance.url, { en: "Kanji" });
  await put(
    deck.cardsDocumentUrl,
    `@prefix sm: <${SM}> .
<#water> a sm:Card ; sm:front "水" ; sm:back "water" ; sm:formatVersion 5 .
<#fire> a sm:Card ; sm:front "火" ; sm:back "fire"@en ; sm:formatVersion 5 .
<#tree> a sm:Card ; sm:front "木"@ja ; sm:back "tree"@en ; sm:formatVersion 5 .
`,
  );
  return { instanceUrl: instance.url, deck };
}

describe.each(SERVERS)("stating card languages on $name", ({ url: server }) => {
  /** Whether this server refuses an edit whose If-Match names another version. */
  let conditional = false;
  /** Whether its ETag changes on every edit (etagMarksEveryEdit). */
  let everyEdit = false;
  beforeAll(async () => {
    conditional = (await preconditionsOf(server)).edits;
    everyEdit = await etagMarksEveryEdit(server);
  });

  it("re-keys the untagged sides in one write, every tagged side kept, and the cards stay valid", async () => {
    const { instanceUrl, deck } = await seed(server);
    const useCases = page();
    await expect(useCases.stateCardLanguages(deck, { front: "ja", back: "en" })).resolves.toBe(2);
    const cards = Object.fromEntries((await page().listCards(deck)).map((card) => [card.id, card]));
    expect(cards.water).toMatchObject({ front: { ja: "水" }, back: { en: "water" } });
    expect(cards.fire).toMatchObject({ front: { ja: "火" }, back: { en: "fire" } });
    expect(cards.tree).toMatchObject({ front: { ja: "木" }, back: { en: "tree" } });
    expect((await page().validateInstance(instanceUrl)).conforms).toBe(true);
    // Nothing left to state: no write.
    await expect(page().stateCardLanguages(deck, { front: "ja", back: "en" })).resolves.toBe(0);
  });

  it("writes nothing over a cards document another app changed since it was read", async (context) => {
    if (!conditional) context.skip("this server ignores If-Match, so a change made elsewhere cannot be detected");
    // The change is made in the same second as the read, which such a server's ETag does not tell apart.
    if (!everyEdit) context.skip(ETAG_OUTLIVES_EDITS);
    const { deck } = await seed(server);
    let changed = false;
    const useCases = page(async (url) => {
      if (url !== deck.cardsDocumentUrl || changed) return;
      changed = true;
      // Written whole: the in-memory store of Community Solid Server cuts short a PATCH of a document with
      // text beyond ASCII (as saveDataset's `whole` says), which is not what this test is about.
      const read = await fetch(deck.cardsDocumentUrl, { headers: { accept: "text/turtle" } });
      const body = `${await read.text()}\n<#water> <${SM}note> "edited in another tab" .\n`;
      const response = await fetch(deck.cardsDocumentUrl, { method: "PUT", headers: { "content-type": "text/turtle" }, body });
      if (!response.ok) throw new Error(`Changing ${deck.cardsDocumentUrl} as another app: ${response.status}.`);
    });
    await expect(useCases.stateCardLanguages(deck, { front: "ja" })).rejects.toMatchObject({ code: "changedElsewhere" });
    const cards = Object.fromEntries((await page().listCards(deck)).map((card) => [card.id, card]));
    expect(cards.water?.front).toEqual({ "": "水" });
    const turtle = await (await fetch(deck.cardsDocumentUrl, { headers: { accept: "text/turtle" } })).text();
    expect(turtle).toContain("edited in another tab");
  });
});
