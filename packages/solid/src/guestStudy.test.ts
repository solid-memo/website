/**
 * A guest's study, end to end, through the app's own use cases and Solid
 * adapters wired as in main.tsx (docs/guest-mode.md): the guest studies in
 * the pod kept on their device, then logs in and keeps it. Their pod is a
 * second local pod here; e2e/pod moves a guest's study into real servers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/pod";
import { createUseCases } from "@solid-memo/application/useCases";
import type { ResourceStore } from "@solid-memo/application/ports";
import { GUEST_ORIGIN, GUEST_SESSION } from "@solid-memo/domain/guest";
import { createLocalGuestPod } from "./localGuestPod";
import { createLocalPod } from "./localPod";
import { createMemoryResourceStore } from "./memoryResourceStore";
import { routedFetch } from "./routedFetch";
import { createShaclShapeValidator } from "./shaclShapeValidator";
import { createSolidAnswerLog } from "./solidAnswerLog";
import { createSolidDeckRepository } from "./solidDeckRepository";
import { createSolidDigestRepository } from "./solidDigestRepository";
import { createSolidInstanceCopier } from "./solidInstanceCopier";
import { createSolidInstanceRepository } from "./solidInstanceRepository";
import { createSolidPreferencesRepository } from "./solidPreferencesRepository";
import { createSolidRepairRepository } from "./solidRepairRepository";
import { createSolidReviewStateRepository } from "./solidReviewStateRepository";
import { createSolidStorageGateway } from "./solidStorageGateway";
import { createSolidWebIdDocumentRepository } from "./solidWebIdDocumentRepository";
import { createWriteFence } from "./writeFence";

const ALICE_POD = "https://alice.example/";
const ALICE = { webId: `${ALICE_POD}profile/card#me` };
const TARGET = `${ALICE_POD}solid-memo/main/`;

/** Every RDF document of a store, as N-Triples lines. */
async function everyTriple(store: ResourceStore): Promise<string[]> {
  const lines: string[] = [];
  for (const url of await store.urls()) {
    const resource = await store.get(url);
    if (resource?.kind === "rdf") lines.push(...resource.triples);
  }
  return lines;
}

const SM_NS = "https://pod.solid-memo.com/vocab/v1#";
const XSD_INTEGER = "http://www.w3.org/2001/XMLSchema#integer";

/** A subject's stated format set back to `version`, in place, as an app of that format left it. */
async function restamp(store: ResourceStore, subject: string, version: number): Promise<void> {
  const document = subject.slice(0, subject.indexOf("#"));
  const resource = await store.get(document);
  if (resource?.kind !== "rdf") throw new Error(`No document ${document}`);
  const stamp = `<${subject}> <${SM_NS}formatVersion> `;
  const triples = resource.triples.map((line) => (line.startsWith(stamp) ? `${stamp}"${version}"^^<${XSD_INTEGER}> .` : line));
  expect(triples, subject).not.toEqual(resource.triples);
  await store.set(document, { ...resource, triples, etag: `"${crypto.randomUUID()}"` });
}

/** A card's sides untagged in place, as a format-4 app wrote text typed in it, its language unknown. */
async function untagSides(store: ResourceStore, subject: string): Promise<void> {
  const document = subject.slice(0, subject.indexOf("#"));
  const resource = await store.get(document);
  if (resource?.kind !== "rdf") throw new Error(`No document ${document}`);
  const sides = [`<${subject}> <${SM_NS}front> `, `<${subject}> <${SM_NS}back> `];
  const triples = resource.triples.map((line) => (sides.some((side) => line.startsWith(side)) ? line.replace(/"@[a-z-]+ \.$/, '" .') : line));
  expect(triples, subject).not.toEqual(resource.triples);
  await store.set(document, { ...resource, triples, etag: `"${crypto.randomUUID()}"` });
}

/** Triples added to a document in place, as another app wrote them. */
async function addTriples(store: ResourceStore, document: string, lines: string[]): Promise<void> {
  const resource = await store.get(document);
  if (resource?.kind !== "rdf") throw new Error(`No document ${document}`);
  await store.set(document, { ...resource, triples: [...resource.triples, ...lines], etag: `"${crypto.randomUUID()}"` });
}

async function app() {
  const newEtag = () => `"${crypto.randomUUID()}"`;
  const guestStore = createMemoryResourceStore();
  const guestFetch = createLocalPod({ root: GUEST_ORIGIN, store: guestStore, newEtag });
  const aliceStore = createMemoryResourceStore();
  const aliceFetch = createLocalPod({ root: ALICE_POD, store: aliceStore, newEtag });
  await aliceFetch(`${ALICE_POD}profile/card`, {
    method: "PUT",
    headers: { "Content-Type": "text/turtle" },
    body: `<#me> <http://xmlns.com/foaf/0.1/name> "Alice" ; <http://www.w3.org/ns/pim/space#storage> <${ALICE_POD}> .`,
  });
  const requests: string[] = [];
  const recorded: typeof fetch = (input, init) => {
    requests.push(input instanceof Request ? input.url : String(input));
    return aliceFetch(input, init);
  };
  const writeFence = createWriteFence(routedFetch({ origin: GUEST_ORIGIN, local: guestFetch, remote: recorded }));
  const podFetch = writeFence.fetch;
  const shapeValidator = createShaclShapeValidator({
    fetch: podFetch,
    shapesFetch,
    ...SHAPE_SOURCES,
  });
  const checkWrite = shapeValidator.checkSubjects;
  const ids = { now: () => new Date(), randomId: () => crypto.randomUUID() };
  const useCases = createUseCases({
    sessionGateway: { restore: async () => null, discoverOidcIssuer: async () => Promise.reject(new Error("none")) } as never,
    deckLibrary: undefined as never,
    webIdDocumentRepository: createSolidWebIdDocumentRepository({ fetch: podFetch }),
    storageGateway: createSolidStorageGateway({ fetch: podFetch }),
    instanceRepository: createSolidInstanceRepository({ fetch: podFetch, checkWrite, ...ids }),
    deckRepository: createSolidDeckRepository({ fetch: podFetch, checkWrite, ...ids }),
    preferencesRepository: createSolidPreferencesRepository({ fetch: podFetch, checkWrite }),
    reviewStateRepository: createSolidReviewStateRepository({ fetch: podFetch, checkWrite }),
    shapeValidator,
    repairRepository: createSolidRepairRepository({ fetch: podFetch }),
    instanceCopier: createSolidInstanceCopier({ fetch: podFetch }),
    digestRepository: createSolidDigestRepository({ fetch: podFetch, checkWrite }),
    answerLog: createSolidAnswerLog({ fetch: podFetch, checkWrite }),
    guestPod: createLocalGuestPod({ fetch: guestFetch, store: guestStore }),
    writeFence,
  });
  return { useCases, guestStore, aliceStore, requests };
}

describe("a guest's study", () => {
  // Nothing reaches the network: every request goes to one of the two local pods.
  beforeEach(() => {
    vi.stubGlobal("fetch", async (input: unknown) => {
      throw new Error(`Sent to the network: ${String(input)}`);
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is kept on the device, with nothing sent anywhere, until the guest logs in", { timeout: 30_000 }, async () => {
    const { useCases, guestStore, requests } = await app();
    expect(await useCases.restoreSession()).toBeNull();
    expect(await useCases.startGuest("My study")).toEqual(GUEST_SESSION);
    expect(await useCases.restoreSession()).toEqual({ session: GUEST_SESSION, origin: "restored" });
    const [instance] = await useCases.listInstances(GUEST_SESSION);
    expect(instance!.url.startsWith(GUEST_ORIGIN)).toBe(true);
    const deck = await useCases.createDeck(instance!.url, { en: "Capitals" });
    await useCases.addCard(deck, { front: { en: "Sweden" }, back: { en: "Stockholm" } });
    const now = new Date();
    const queue = await useCases.getStudyQueue(instance!.url, deck, now);
    await useCases.recordReview(instance!.url, deck, queue.newPrompts[0]!, 4, now);
    expect((await useCases.getStatistics(instance!.url, now)).totals.answers).toBe(1);
    expect((await useCases.checkInstance(instance!.url)).conforms).toBe(true);
    expect(requests).toEqual([]);
    expect((await useCases.discoverAccount(GUEST_SESSION)).podUrl).toBe(GUEST_ORIGIN);
    expect(await useCases.findGuestStudy()).toEqual({ instances: [{ instance, deckCount: 1 }] });
    expect((await guestStore.urls()).length).toBeGreaterThan(5);
  });

  it("moves into the pod the guest logs in to, as theirs, and leaves the device", { timeout: 30_000 }, async () => {
    const { useCases, guestStore, aliceStore } = await app();
    await useCases.startGuest("My study");
    const [guestInstance] = await useCases.listInstances(GUEST_SESSION);
    const deck = await useCases.createDeck(guestInstance!.url, { en: "Capitals" });
    await useCases.addCard(deck, { front: { en: "Sweden" }, back: { en: "Stockholm" } });
    const now = new Date();
    const queue = await useCases.getStudyQueue(guestInstance!.url, deck, now);
    await useCases.recordReview(guestInstance!.url, deck, queue.newPrompts[0]!, 4, now);

    const outcome = await useCases.transferGuestStudy(ALICE, guestInstance!, {
      containerUrl: TARGET,
      registrationTarget: "private",
    });

    expect(outcome).toEqual({ ok: true, instance: { url: TARGET, name: "My study" }, tidied: true });
    expect(await useCases.listInstances(ALICE)).toEqual([{ url: TARGET, name: "My study" }]);
    const [moved] = await useCases.listDecks(TARGET);
    expect(moved!.url).toBe(`${TARGET}catalog.ttl#${deck.id}`);
    const cards = await useCases.listCards(moved!);
    expect(cards.map((card) => card.front)).toEqual([{ en: "Sweden" }]);
    const studied = await useCases.getStudyQueue(TARGET, moved!, now);
    expect(studied.newPrompts).toEqual([]);
    expect((await useCases.getStatistics(TARGET, now)).totals.answers).toBe(1);
    expect((await useCases.validateInstance(TARGET)).conforms).toBe(true);
    const triples = await everyTriple(aliceStore);
    expect(triples.filter((line) => line.includes(GUEST_ORIGIN))).toEqual([]);
    expect(triples).toContain(`<${TARGET}catalog.ttl#catalog> <http://purl.org/dc/terms/publisher> <${ALICE.webId}> .`);
    expect(triples).toContain(`<${ALICE.webId}> <http://xmlns.com/foaf/0.1/name> "Alice" .`);
    expect(await guestStore.urls()).toEqual([]);
    expect(await useCases.findGuestStudy()).toBeNull();
  });

  it("moves a study that mixes formats 4 and 5, each subject checked against its own format and kept at it", { timeout: 30_000 }, async () => {
    const { useCases, guestStore, aliceStore } = await app();
    await useCases.startGuest("My study");
    const [guestInstance] = await useCases.listInstances(GUEST_SESSION);
    // A format-4 deck, as a format-4 app left it: a Swedish title with an
    // English stand-in, a card whose sides do not say their language and
    // one with a note saved the same in English and Swedish.
    const old = await useCases.createDeck(guestInstance!.url, { en: "Huvudstäder", sv: "Huvudstäder" });
    const unstated = await useCases.addCard(old, { front: { sv: "Sverige" }, back: { sv: "Stockholm" } });
    await untagSides(guestStore, unstated.url);
    const standIn = await useCases.addCard(old, {
      front: { sv: "Norge" },
      back: { sv: "Oslo" },
      backNote: { en: "Huvudstad sedan 1299.", sv: "Huvudstad sedan 1299." },
    });
    for (const subject of [old.url, unstated.url, standIn.url]) await restamp(guestStore, subject, 4);
    // A deck of the current formats beside it (deck 6, card 5), with a note in Finnish only: valid at 5, not at 4.
    const current = await useCases.createDeck(guestInstance!.url, { en: "Capitals" });
    const finnish = await useCases.addCard(current, { front: { fi: "Suomi" }, back: { fi: "Helsinki" } });
    await addTriples(guestStore, current.cardsDocumentUrl, [`<${finnish.url}> <${SM_NS}frontNote> "Pääkaupunki vuodesta 1812."@fi .`]);
    // Both directions are held to: the Finnish note fails format 4, and a
    // format-4 subject fails format 5 on its stated version alone (each
    // shape has sh:hasValue on solid-memo:formatVersion), so a check that
    // held every subject to one format, the latest or 4, would not conform.
    expect((await useCases.checkInstance(guestInstance!.url)).conforms).toBe(true);

    const outcome = await useCases.transferGuestStudy(ALICE, guestInstance!, { containerUrl: TARGET, registrationTarget: "private" });

    expect(outcome).toMatchObject({ ok: true, instance: { url: TARGET } });
    expect((await useCases.validateInstance(TARGET)).conforms).toBe(true);
    const moved = (url: string) => url.replace(guestInstance!.url, TARGET);
    const triples = await everyTriple(aliceStore);
    const stated = (subject: string) => triples.find((line) => line.startsWith(`<${moved(subject)}> <${SM_NS}formatVersion> `));
    for (const subject of [old.url, unstated.url, standIn.url]) expect(stated(subject), subject).toContain('"4"');
    expect(stated(current.url)).toContain('"6"');
    expect(stated(finnish.url)).toContain('"5"');
    // The text is as the guest's pod had it: nothing tagged, nothing dropped.
    expect(triples).toEqual(
      expect.arrayContaining([
        `<${moved(old.url)}> <http://purl.org/dc/terms/title> "Huvudstäder"@en .`,
        `<${moved(old.url)}> <http://purl.org/dc/terms/title> "Huvudstäder"@sv .`,
        `<${moved(unstated.url)}> <${SM_NS}front> "Sverige" .`,
        `<${moved(unstated.url)}> <${SM_NS}back> "Stockholm" .`,
        `<${moved(standIn.url)}> <${SM_NS}backNote> "Huvudstad sedan 1299."@en .`,
        `<${moved(standIn.url)}> <${SM_NS}backNote> "Huvudstad sedan 1299."@sv .`,
        `<${moved(finnish.url)}> <${SM_NS}frontNote> "Pääkaupunki vuodesta 1812."@fi .`,
      ]),
    );
    // The format-4 deck and its cards are what the next format update moves to 5.
    expect(await useCases.planMigration(TARGET)).toMatchObject({ deckCount: 1, cardCount: 2 });
  });
});
