// @vitest-environment node
/**
 * The instance digest against a real Solid server (docs/data-model.md):
 * what a visit learns is written to digest.ttl, and the next visit,
 * a new page with nothing in memory, asks the pod only whether each
 * document changed. Runs against each server globalSetup.ts starts.
 * node-solid-server (5.x, 6.0.0) gives no ETag on a read, so there nothing can
 * be known to be unchanged: nothing is kept, every visit reads all, and
 * the counts are the same. Community Solid Server 6 gives an ETag that an
 * edit in the same second keeps: these tests edit within the second, so
 * there they are skipped (docs/data-model.md#the-digest).
 */
import { beforeAll, describe, expect, inject, it, vi } from "vitest";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/sources";
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
import { ETAG_OUTLIVES_EDITS, etagMarksEveryEdit, versioned } from "./serverTraits";

const SERVERS = inject("solidServers");
const RULESET = "e2e-rules";

interface Recorded {
  method: string;
  url: string;
  ifNoneMatch: string | null;
  status?: number;
}

/** A page of the app as createAppUseCases wires it, every request recorded; each call is a new page, with nothing in memory. */
function page() {
  const requests: Recorded[] = [];
  const recording: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    const recorded: Recorded = { method: (init?.method ?? "GET").toUpperCase(), url: String(input), ifNoneMatch: headers.get("If-None-Match") };
    requests.push(recorded);
    const response = await fetch(input, init);
    recorded.status = response.status;
    return response;
  };
  const writeFence = createWriteFence(recording);
  const podFetch = writeFence.fetch;
  const shapeValidator = createShaclShapeValidator({ fetch: podFetch, shapesFetch, ...SHAPE_SOURCES });
  const checkWrite = shapeValidator.checkSubjects;
  const deps = { fetch: podFetch, checkWrite, now: () => new Date(), randomId: () => crypto.randomUUID() };
  const useCases = createUseCases({
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
    ruleset: RULESET,
  });
  return { useCases, requests };
}

/** An instance with one deck of three cards, made by the app. */
async function seed(server: string): Promise<{ instanceUrl: string; deck: Deck }> {
  const base = new URL(`digest-${crypto.randomUUID()}/`, server).href;
  const webId = `${base}profile/card#me`;
  const typeIndex = `${base}settings/privateTypeIndex.ttl`;
  const put = async (url: string, body: string) => {
    const response = await fetch(url, { method: "PUT", headers: { "content-type": "text/turtle" }, body });
    if (!response.ok) throw new Error(`Seeding ${url}: ${response.status}`);
  };
  await put(`${base}profile/card`, `<#me> <http://www.w3.org/ns/solid/terms#privateTypeIndex> <${typeIndex}> .`);
  await put(typeIndex, `<> a <http://www.w3.org/ns/solid/terms#TypeIndex>, <http://www.w3.org/ns/solid/terms#UnlistedDocument> .`);
  const { useCases } = page();
  const instance = await useCases.createInstance({ webId }, { containerUrl: `${base}solid-memo/`, name: "Main", registrationTarget: "private" });
  const deck = await useCases.createDeck(instance.url, { en: "Capitals" });
  for (const [front, back] of [["Sweden", "Stockholm"], ["Norway", "Oslo"], ["Finland", "Helsinki"]]) {
    await useCases.addCard(deck, { front: { en: front }, back: { en: back } });
  }
  return { instanceUrl: instance.url, deck };
}

const isDocument = (deck: Deck) => (r: Recorded) => r.url === deck.cardsDocumentUrl || r.url === deck.reviewsDocumentUrl;

/**
 * How long to wait for what pages write in the background: every write is
 * checked against the shapes first, and is made again if the digest
 * changed meanwhile, which on a busy CI runner takes longer than waitFor's
 * default second.
 */
const LEARNING = { timeout: 10_000 };

async function digestOf(instanceUrl: string): Promise<string> {
  const response = await fetch(`${instanceUrl}digest.ttl`);
  return response.ok ? response.text() : "";
}

/**
 * Until the pod's digest holds what the next visit relies on: the deck's
 * schedule and the receipt of its cards document by these rules. Pages
 * write what they learn in the background, in more than one write.
 */
async function untilLearned(instanceUrl: string, deck: Deck): Promise<void> {
  await vi.waitFor(
    async () => {
      const digest = await createSolidDigestRepository({ fetch }).readDigest(instanceUrl);
      expect(digest?.schedules[deck.url]).toBeDefined();
      expect(digest?.receipts[deck.cardsDocumentUrl]?.conformedTo).toBe(RULESET);
    },
    LEARNING,
  );
}

describe.each(SERVERS)("the instance digest on $name", ({ url: server }) => {
  /** Whether this server gives an ETag on a read that an edit within the second keeps; asked once (serverTraits.ts). */
  let unreliableEtags = false;
  beforeAll(async () => {
    const probe = new URL(`etag-${crypto.randomUUID()}.ttl`, server).href;
    await fetch(probe, { method: "PUT", headers: { "content-type": "text/turtle" }, body: `<#a> <#b> "1" .` });
    unreliableEtags = (await versioned(probe)) && !(await etagMarksEveryEdit(server));
  });

  it("lets the next visit count today's study and check the instance without downloading unchanged documents", async (context) => {
    if (unreliableEtags) context.skip(ETAG_OUTLIVES_EDITS);
    const { instanceUrl, deck } = await seed(server);
    const now = new Date();
    const etags = await versioned(deck.cardsDocumentUrl);

    const first = page();
    const counts = await first.useCases.getStudyCounts(instanceUrl, deck, now);
    expect(counts).toEqual({ dueCount: 0, newCount: 3 });
    expect((await first.useCases.checkInstance(instanceUrl)).conforms).toBe(true);
    if (etags) await untilLearned(instanceUrl, deck);

    const second = page();
    expect(await second.useCases.getStudyCounts(instanceUrl, deck, now)).toEqual(counts);
    expect((await second.useCases.checkInstance(instanceUrl)).conforms).toBe(true);
    const cards = second.requests.filter((r) => r.url === deck.cardsDocumentUrl);
    if (etags) {
      // Asked about with the version the digest names, and not sent again.
      expect(cards.length).toBeGreaterThan(0);
      expect(cards.map((r) => ({ conditional: r.ifNoneMatch !== null, status: r.status }))).toEqual(
        cards.map(() => ({ conditional: true, status: 304 })),
      );
    } else {
      expect(await digestOf(instanceUrl)).not.toContain("DeckSchedule");
      expect(cards.every((r) => r.status === 200)).toBe(true);
    }
    expect(second.requests.filter(isDocument(deck)).every((r) => [200, 304, 404].includes(r.status!))).toBe(true);
  });

  it("counts a card added since the digest was written", async (context) => {
    if (unreliableEtags) context.skip(ETAG_OUTLIVES_EDITS);
    const { instanceUrl, deck } = await seed(server);
    const now = new Date();
    const first = page();
    await first.useCases.getStudyCounts(instanceUrl, deck, now);
    if (await versioned(deck.cardsDocumentUrl)) {
      await vi.waitFor(async () => expect(await digestOf(instanceUrl)).toContain("DeckSchedule"), LEARNING);
    }
    await first.useCases.addCard(deck, { front: { en: "Denmark" }, back: { en: "Copenhagen" } });
    expect(await page().useCases.getStudyCounts(instanceUrl, deck, now)).toEqual({ dueCount: 0, newCount: 4 });
  });

  it("keeps what two pages learn at once", async (context) => {
    const { instanceUrl, deck } = await seed(server);
    if (!(await versioned(deck.cardsDocumentUrl))) context.skip("this server gives no ETag on a read, so nothing is kept");
    if (unreliableEtags) context.skip(ETAG_OUTLIVES_EDITS);
    const [a, b] = [page(), page()];
    await Promise.all([a.useCases.getStudyCounts(instanceUrl, deck, new Date()), b.useCases.checkInstance(instanceUrl)]);
    await vi.waitFor(async () => {
      const digest = await digestOf(instanceUrl);
      expect(digest).toContain("DeckSchedule");
      expect(digest).toContain(RULESET);
    }, LEARNING);
  });
});
