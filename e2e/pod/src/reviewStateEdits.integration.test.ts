// @vitest-environment node
/**
 * The Studio's edits of review states (UseCases.rescheduleCards and
 * resetCards, docs/studio.md#review-state) against a real Solid server:
 * a card set due on a day keeps its schedule but loses its snapshot for
 * resetting the study day, in one write of the reviews document, which
 * stays valid, so a reset of the day then cannot bring back the state
 * from before; a card forgotten loses its states, while its answers stay
 * in the log.
 */
import { describe, expect, inject, it } from "vitest";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/sources";
import { createUseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import { studyDayOf } from "@solid-memo/domain/scheduling";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
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

const SERVERS = inject("solidServers");

/** A page of the app as createAppUseCases wires it, its answers logged. */
function page() {
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
  });
}

/** An instance with a deck of two cards, both reviewed three days ago and again now, so each has a snapshot. */
async function seed(server: string): Promise<{ instanceUrl: string; deck: Deck; useCases: ReturnType<typeof page> }> {
  const base = new URL(`review-edits-${crypto.randomUUID()}/`, server).href;
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
  const earlier = new Date(Date.now() - 3 * 86_400_000);
  for (const [front, back] of [
    ["gull", "mås"],
    ["owl", "uggla"],
  ]) {
    const card = await useCases.addCard(deck, { front: { en: front! }, back: { sv: back! } });
    await useCases.recordReview(instance.url, deck, { card, direction: "front-to-back" }, 4, earlier);
    await useCases.recordReview(instance.url, deck, { card, direction: "front-to-back" }, 5, new Date());
  }
  return { instanceUrl: instance.url, deck, useCases };
}

const today = () => studyDayOf(new Date(), DEFAULT_PREFERENCES.dayBoundaryHour);

describe.each(SERVERS)("edits of review states on $name", ({ url: server }) => {
  it("sets a card due on a day, its snapshot dropped, so a reset of the day makes it due today", async () => {
    const { instanceUrl, deck, useCases } = await seed(server);
    const [gull] = (await useCases.listDeckReviewStates(deck)).filter((state) => state.previous !== undefined);
    expect(gull).toBeDefined();
    await expect(useCases.rescheduleCards(instanceUrl, deck, [gull!.cardId], "2099-01-01")).resolves.toBe(1);
    const moved = (await page().listDeckReviewStates(deck)).find((state) => state.cardId === gull!.cardId)!;
    expect(moved.due).toBe("2099-01-01");
    expect(moved.intervalDays).toBe(gull!.intervalDays);
    expect(moved).not.toHaveProperty("previous");
    expect((await page().validateInstance(instanceUrl)).conforms).toBe(true);

    await useCases.resetStudyDay(instanceUrl, deck, new Date());
    const reset = (await page().listDeckReviewStates(deck)).find((state) => state.cardId === gull!.cardId)!;
    // Not the snapshot's due day: the state from before the reschedule never comes back.
    expect(reset.due).toBe(today());
    expect(reset.intervalDays).toBe(gull!.intervalDays);
  });

  it("forgets a card, its answers kept in the log", async () => {
    const { instanceUrl, deck, useCases } = await seed(server);
    const states = await useCases.listDeckReviewStates(deck);
    // The seed's answers, all in the log once read.
    const before = await useCases.getStatistics(instanceUrl, new Date(), { deckUrl: deck.url });
    expect(before.totals.answers).toBe(4);
    await expect(useCases.resetCards(instanceUrl, deck, [states[0]!.cardId, "never-studied"])).resolves.toBe(1);
    expect((await page().listDeckReviewStates(deck)).map((state) => state.cardId)).toEqual([states[1]!.cardId]);
    const after = await page().getStatistics(instanceUrl, new Date(), { deckUrl: deck.url });
    expect(after.totals).toEqual(before.totals);
    expect((await page().validateInstance(instanceUrl)).conforms).toBe(true);
  });
});
