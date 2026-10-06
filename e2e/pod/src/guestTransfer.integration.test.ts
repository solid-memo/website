// @vitest-environment node
/**
 * Keeping a guest's study (docs/guest-mode.md) against a real Solid server:
 * a guest studies in the pod kept on their device, then logs in and moves
 * their study into their pod on the server — through the app's own use
 * cases and Solid adapters, wired as in main.tsx: one fetch routed to the
 * guest's pod or the server by URL. Runs against each server globalSetup.ts
 * starts.
 */
import { describe, expect, inject, it } from "vitest";
import { Parser, Writer } from "n3";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/sources";
import { createUseCases } from "@solid-memo/application/useCases";
import { GUEST_ORIGIN, GUEST_SESSION } from "@solid-memo/domain/guest";
import { createLocalGuestPod } from "@solid-memo/solid/localGuestPod";
import { createLocalPod } from "@solid-memo/solid/localPod";
import { createMemoryResourceStore } from "@solid-memo/solid/memoryResourceStore";
import { routedFetch } from "@solid-memo/solid/routedFetch";
import { createShaclShapeValidator } from "@solid-memo/solid/shaclShapeValidator";
import { createSolidAnswerLog } from "@solid-memo/solid/solidAnswerLog";
import { createSolidDeckRepository } from "@solid-memo/solid/solidDeckRepository";
import { createSolidDigestRepository } from "@solid-memo/solid/solidDigestRepository";
import { createSolidInstanceCopier } from "@solid-memo/solid/solidInstanceCopier";
import { createSolidInstanceRepository } from "@solid-memo/solid/solidInstanceRepository";
import { createSolidPreferencesRepository } from "@solid-memo/solid/solidPreferencesRepository";
import { createSolidRepairRepository } from "@solid-memo/solid/solidRepairRepository";
import { createSolidReviewStateRepository } from "@solid-memo/solid/solidReviewStateRepository";
import { createSolidStorageGateway } from "@solid-memo/solid/solidStorageGateway";
import { createSolidWebIdDocumentRepository } from "@solid-memo/solid/solidWebIdDocumentRepository";
import { createWriteFence } from "@solid-memo/solid/writeFence";

const SERVERS = inject("solidServers");

/**
 * A user's empty pod in a fresh folder of the server: a profile naming its
 * storage and an empty private type index. The profile is card.ttl, not
 * card: servers that serve a document without an extension as
 * application/octet-stream (the JavaScript Solid Server, Solid-Nextcloud)
 * then serve it as Turtle, as their own profiles are.
 */
async function seedPod(server: string) {
  const base = new URL(`run-${crypto.randomUUID()}/`, server).href;
  const webId = `${base}profile/card.ttl#me`;
  const typeIndex = `${base}settings/privateTypeIndex.ttl`;
  const put = async (url: string, body: string) => {
    const response = await fetch(url, { method: "PUT", headers: { "content-type": "text/turtle" }, body });
    if (!response.ok) throw new Error(`Seeding ${url}: ${response.status}`);
  };
  await put(
    `${base}profile/card.ttl`,
    `<#me> a <http://xmlns.com/foaf/0.1/Person> ; <http://xmlns.com/foaf/0.1/name> "Alice" ;
    <http://www.w3.org/ns/pim/space#storage> <${base}> ;
    <http://www.w3.org/ns/solid/terms#privateTypeIndex> <${typeIndex}> .`,
  );
  await put(
    typeIndex,
    `<> a <http://www.w3.org/ns/solid/terms#TypeIndex>, <http://www.w3.org/ns/solid/terms#UnlistedDocument> .`,
  );
  return { base, session: { webId } };
}

/** The app as main.tsx wires it, its guest's pod in memory, the user's pod on the server. */
function app() {
  const guestStore = createMemoryResourceStore();
  const guestFetch = createLocalPod({ root: GUEST_ORIGIN, store: guestStore, newEtag: () => `"${crypto.randomUUID()}"` });
  const writeFence = createWriteFence(routedFetch({ origin: GUEST_ORIGIN, local: guestFetch, remote: fetch }));
  const podFetch = writeFence.fetch;
  const shapeValidator = createShaclShapeValidator({
    fetch: podFetch,
    shapesFetch,
    ...SHAPE_SOURCES,
  });
  const checkWrite = shapeValidator.checkSubjects;
  const ids = { now: () => new Date(), randomId: () => crypto.randomUUID() };
  const useCases = createUseCases({
    sessionGateway: undefined as never,
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
  return { useCases, guestStore };
}

/** A document as N-Triples: every IRI written out in full, whatever the server's Turtle abbreviates. */
function nTriples(url: string, turtle: string): string {
  return new Writer({ format: "N-Triples" }).quadsToString(new Parser({ baseIRI: url }).parse(turtle));
}

/** Every resource below a container, as the server serves it. */
async function contents(container: string): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const visit = async (url: string) => {
    const body = await (await fetch(url, { headers: { accept: "text/turtle" } })).text();
    result.set(url, body);
    if (!url.endsWith("/")) return;
    const children = [...body.matchAll(/<([^>]+)>/g)]
      .map((match) => new URL(match[1]!, url).href)
      .filter((child) => child.startsWith(url) && child !== url && !child.includes("#"));
    for (const child of [...new Set(children)].sort()) await visit(child);
  };
  await visit(container);
  return result;
}

describe.each(SERVERS)("a guest's study on $name", ({ url: server }) => {
  it("moves into the pod the guest logs in to, as theirs, and leaves the device", async () => {
    const { base, session } = await seedPod(server);
    const { useCases, guestStore } = app();
    await useCases.startGuest("My study");
    const [guestInstance] = await useCases.listInstances(GUEST_SESSION);
    const deck = await useCases.createDeck(guestInstance!.url, { en: "Capitals" });
    await useCases.addCard(deck, { front: { en: "Sweden" }, back: { en: "Stockholm" } });
    const now = new Date();
    const queue = await useCases.getStudyQueue(guestInstance!.url, deck, now);
    await useCases.recordReview(guestInstance!.url, deck, queue.newPrompts[0]!, 4, now);

    const [storage] = await useCases.listStorages(session);
    expect(storage!.url).toBe(base);
    const target = `${base}solid-memo/main/`;
    const outcome = await useCases.transferGuestStudy(session, guestInstance!, {
      containerUrl: target,
      registrationTarget: "private",
    });

    expect(outcome).toEqual({ ok: true, instance: { url: target, name: "My study" }, tidied: true });
    expect(await useCases.listInstances(session)).toEqual([{ url: target, name: "My study" }]);
    const [moved] = await useCases.listDecks(target);
    expect((await useCases.listCards(moved!)).map((card) => card.front)).toEqual([{ en: "Sweden" }]);
    expect((await useCases.getStudyQueue(target, moved!, now)).newPrompts).toEqual([]);
    expect((await useCases.getStatistics(target, now)).totals.answers).toBe(1);
    expect((await useCases.validateInstance(target)).conforms).toBe(true);
    const served = await contents(target);
    expect([...served.keys()].some((url) => url.endsWith("/history/"))).toBe(true);
    expect([...served].filter(([, body]) => body.includes(GUEST_ORIGIN)).map(([url]) => url)).toEqual([]);
    expect(nTriples(`${target}catalog.ttl`, served.get(`${target}catalog.ttl`)!)).toContain(
      `<${target}catalog.ttl#catalog> <http://purl.org/dc/terms/publisher> <${session.webId}> .`,
    );
    expect(await guestStore.urls()).toEqual([]);
  });

  it("leaves the guest's study as it was when the folder in the pod is taken", async () => {
    const { base, session } = await seedPod(server);
    const { useCases, guestStore } = app();
    await useCases.startGuest("My study");
    const [guestInstance] = await useCases.listInstances(GUEST_SESSION);
    const taken = `${base}solid-memo/main/`;
    const put = await fetch(`${taken}note.ttl`, { method: "PUT", headers: { "content-type": "text/turtle" }, body: "" });
    expect(put.ok).toBe(true);
    const before = (await guestStore.urls()).sort();

    const outcome = await useCases.transferGuestStudy(session, guestInstance!, {
      containerUrl: taken,
      registrationTarget: "private",
    });

    expect(outcome).toMatchObject({ ok: false, step: "stage", cleanedUp: true });
    expect((await guestStore.urls()).sort()).toEqual(before);
    expect(await useCases.listInstances(session)).toEqual([]);
    expect((await fetch(`${taken}note.ttl`)).ok).toBe(true);
  });
});
