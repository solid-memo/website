// @vitest-environment node
/**
 * The Studio's move and copy of cards between decks
 * (UseCases.transferCards, docs/studio.md#moving-and-copying-cards)
 * against a real Solid server: cards go with their wrong options and,
 * when asked, their review states; a card whose id the target uses gets
 * a new one; the target is written first, then the source's states,
 * then its cards, so a move stopped before the last write leaves the
 * cards in both decks, and making it again finishes it without writing
 * a card twice nor leaving a state behind; a target changed by another app
 * meanwhile has the transfer planned again; the answer log is never
 * rewritten, and every document stays valid.
 */
import { beforeAll, describe, expect, inject, it } from "vitest";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/sources";
import { SM_NS as SM } from "@solid-memo/vocab/vocab.generated";
import { createUseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import { createShaclShapeValidator } from "@solid-memo/solid/shaclShapeValidator";
import { createSolidAnswerLog } from "@solid-memo/solid/solidAnswerLog";
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

/** A page of the app as createAppUseCases wires it; `beforeWrite` runs before each write it makes, and may stop it. */
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
    answerLog: createSolidAnswerLog({ fetch: podFetch, checkWrite }),
    ruleset: "e2e-rules",
  });
}

const CREATED = `dcterms:created "2026-10-01T10:00:00Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> ; sm:formatVersion 5`;

/**
 * An instance with two decks. Birds has three cards, one with a wrong
 * option, two of them studied (their answers in the log); Seabirds,
 * never studied, has a card of its own under the id `gull`. The decks'
 * names are ASCII: the catalog's PATCH carries them, which Community
 * Solid Server's in-memory store would cut short.
 */
async function seed(server: string): Promise<{ instanceUrl: string; birds: Deck; seabirds: Deck }> {
  const base = new URL(`card-transfer-${crypto.randomUUID()}/`, server).href;
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
  const birds = await useCases.createDeck(instance.url, { en: "Birds" });
  const seabirds = await useCases.createDeck(instance.url, { en: "Seabirds" });
  const prefixes = `@prefix sm: <${SM}> .\n@prefix dcterms: <http://purl.org/dc/terms/> .\n`;
  await put(
    birds.cardsDocumentUrl,
    `${prefixes}<#bird> a sm:Card ; sm:front "fågel"@sv ; sm:back "bird"@en ; sm:distractor <#bird-d1> ; ${CREATED} .
<#bird-d1> a sm:Distractor, <https://schema.org/Answer> ; sm:distractorText "fisk"@sv .
<#gull> a sm:Card ; sm:front "fiskmås"@sv ; sm:back "gull"@en ; ${CREATED} .
<#owl> a sm:Card ; sm:front "uggla"@sv ; sm:back "owl"@en ; ${CREATED} .
`,
  );
  await put(seabirds.cardsDocumentUrl, `${prefixes}<#gull> a sm:Card ; sm:front "trut"@sv ; sm:back "herring gull"@en ; ${CREATED} .\n`);
  const cards = Object.fromEntries((await useCases.listCards(birds)).map((card) => [card.id, card]));
  for (const id of ["bird", "gull"]) {
    await useCases.recordReview(instance.url, birds, { card: cards[id]!, direction: "front-to-back" }, 5, new Date());
  }
  return { instanceUrl: instance.url, birds, seabirds };
}

const byId = async (deck: Deck) => Object.fromEntries((await page().listCards(deck)).map((card) => [card.id, card]));
const statesOf = async (deck: Deck) => (await page().listDeckReviewStates(deck)).map((state) => state.cardId).sort();

describe.each(SERVERS)("moving and copying cards on $name", ({ url: server }) => {
  /** Whether this server refuses an edit whose If-Match names another version. */
  let conditional = false;
  /** Whether its ETag changes on every edit (etagMarksEveryEdit). */
  let everyEdit = false;
  beforeAll(async () => {
    conditional = (await preconditionsOf(server)).edits;
    everyEdit = await etagMarksEveryEdit(server);
  });

  it("moves cards with their wrong options and progress, a card whose id is taken given a new one, the answers left in the log", async () => {
    const { instanceUrl, birds, seabirds } = await seed(server);
    const useCases = page();
    const before = await useCases.getStatistics(instanceUrl, new Date(), { deckUrl: birds.url });
    expect(before.totals.answers).toBe(2);

    const plan = await useCases.transferCards(instanceUrl, birds, seabirds, ["bird", "gull"], { mode: "move", keepProgress: true });
    expect(plan.cards).toEqual([
      { from: "bird", to: "bird", present: false },
      { from: "gull", to: "gull-2", present: false },
    ]);
    const target = await byId(seabirds);
    expect(Object.keys(target).sort()).toEqual(["bird", "gull", "gull-2"]);
    expect(target.bird?.distractors).toEqual([{ id: "bird-d1", text: { sv: "fisk" } }]);
    expect(target["gull-2"]?.front).toEqual({ sv: "fiskmås" });
    expect(target["gull-2"]?.createdAt).toBe("2026-10-01T10:00:00.000Z");
    // Seabirds was never studied: its reviews document is made for the states.
    expect(await statesOf(seabirds)).toEqual(["bird", "gull-2"]);
    expect(Object.keys(await byId(birds))).toEqual(["owl"]);
    expect(await statesOf(birds)).toEqual([]);

    // The log is not rewritten: the answers still count for Birds.
    const after = await page().getStatistics(instanceUrl, new Date(), { deckUrl: birds.url });
    expect(after.totals).toEqual(before.totals);
    expect((await page().validateInstance(instanceUrl)).conforms).toBe(true);
  });

  it("copies cards without progress, the source left as it is", async () => {
    const { instanceUrl, birds, seabirds } = await seed(server);
    await page().transferCards(instanceUrl, birds, seabirds, ["bird"], { mode: "copy", keepProgress: false });
    expect(Object.keys(await byId(seabirds)).sort()).toEqual(["bird", "gull"]);
    expect(await statesOf(seabirds)).toEqual([]);
    expect(Object.keys(await byId(birds)).sort()).toEqual(["bird", "gull", "owl"]);
    expect(await statesOf(birds)).toEqual(["bird", "gull"]);
  });

  it("leaves the cards in both decks when a move stops before the source's cards are written, and finishes it when made again", async () => {
    const { instanceUrl, birds, seabirds } = await seed(server);
    // The page is closed as it is about to write the source's cards, its states removed.
    const stopping = page(async (url) => {
      if (url === birds.cardsDocumentUrl) throw new Error("The tab was closed.");
    });
    await expect(
      stopping.transferCards(instanceUrl, birds, seabirds, ["bird", "gull"], { mode: "move", keepProgress: true }),
    ).rejects.toThrow("The tab was closed.");
    expect(Object.keys(await byId(seabirds)).sort()).toEqual(["bird", "gull", "gull-2"]);
    expect(await statesOf(seabirds)).toEqual(["bird", "gull-2"]);
    expect(Object.keys(await byId(birds)).sort()).toEqual(["bird", "gull", "owl"]);
    expect(await statesOf(birds)).toEqual([]);

    const plan = await page().transferCards(instanceUrl, birds, seabirds, ["bird", "gull"], { mode: "move", keepProgress: true });
    expect(plan.cards).toEqual([
      { from: "bird", to: "bird", present: true },
      { from: "gull", to: "gull-2", present: true },
    ]);
    // Each card once in the target, with its state; none left in the source.
    expect(Object.keys(await byId(seabirds)).sort()).toEqual(["bird", "gull", "gull-2"]);
    expect(await statesOf(seabirds)).toEqual(["bird", "gull-2"]);
    expect(Object.keys(await byId(birds))).toEqual(["owl"]);
    expect(await statesOf(birds)).toEqual([]);
    expect((await page().validateInstance(instanceUrl)).conforms).toBe(true);
  });

  it("plans the transfer again on a target another app changed since it was read, keeping that change", async (context) => {
    if (!conditional) context.skip("this server ignores If-Match, so a change made elsewhere cannot be detected");
    // The change is made in the same second as the read, which such a server's ETag does not tell apart.
    if (!everyEdit) context.skip(ETAG_OUTLIVES_EDITS);
    const { instanceUrl, birds, seabirds } = await seed(server);
    let changed = false;
    const racing = page(async (url) => {
      if (url !== seabirds.cardsDocumentUrl || changed) return;
      changed = true;
      // Another app adds a card under the id `owl`, as the transfer is about to write it.
      const read = await fetch(seabirds.cardsDocumentUrl, { headers: { accept: "text/turtle" } });
      const body = `${await read.text()}\n<#owl> a <${SM}Card> ; <${SM}front> "berguv"@sv ; <${SM}back> "eagle-owl"@en ; <http://purl.org/dc/terms/created> "2026-10-01T10:00:00Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> ; <${SM}formatVersion> 5 .\n`;
      const response = await fetch(seabirds.cardsDocumentUrl, { method: "PUT", headers: { "content-type": "text/turtle" }, body });
      if (!response.ok) throw new Error(`Changing ${seabirds.cardsDocumentUrl} as another app: ${response.status}.`);
    });
    const plan = await racing.transferCards(instanceUrl, birds, seabirds, ["owl"], { mode: "move", keepProgress: true });
    expect(plan.cards).toEqual([{ from: "owl", to: "owl-2", present: false }]);
    const target = await byId(seabirds);
    expect(target.owl?.back).toEqual({ en: "eagle-owl" });
    expect(target["owl-2"]?.back).toEqual({ en: "owl" });
    expect((await page().validateInstance(instanceUrl)).conforms).toBe(true);
  });
});
