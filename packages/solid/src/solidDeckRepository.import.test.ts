// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * An import's failures after its entry was checked, over a pod in memory
 * that answers some requests otherwise: no document is left that no entry
 * names, and a failure says so when one may be.
 */
import { describe, expect, it } from "vitest";
import { GUEST_ORIGIN } from "@solid-memo/domain/guest";
import { AppError } from "@solid-memo/domain/appError";
import { createLocalPod } from "./localPod";
import { createMemoryResourceStore } from "./memoryResourceStore";
import { createSolidDeckRepository } from "./solidDeckRepository";
import type { LibraryCard } from "@solid-memo/domain/library";
import { release } from "./testing/deckWrites";

const INSTANCE = "https://pod.example/memo/";
const CATALOG = `${INSTANCE}catalog.ttl`;
const CARDS = `${INSTANCE}decks/deck-new.ttl`;
const WRITES = new Set(["PUT", "PATCH", "POST"]);

/** What the pod does with a request: answer it otherwise, or `pass` it on. */
type Answer = (
  method: string,
  url: string,
  pass: () => Promise<Response>,
) => Promise<Response> | undefined;

function importInto(answer: Answer, root = "https://pod.example/", instance = INSTANCE) {
  const store = createMemoryResourceStore();
  let etag = 0;
  const pod = createLocalPod({
    root,
    store,
    newEtag: () => `"e${etag++}"`,
  });
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    return answer(method, url, () => pod(input, init)) ?? pod(input, init);
  }) as typeof globalThis.fetch;
  const repository = createSolidDeckRepository({
    fetch,
    now: () => new Date("2026-11-06T00:00:00Z"),
    randomId: () => "new",
  });
  return { store, repository, run: () => repository.importDeck(instance, release(2)) };
}

const refused = (status: number) => new Response("", { status });
const lost = () => Promise.reject(new TypeError("Failed to fetch"));

describe("an import cut off", () => {
  it("deletes the cards document when the pod refuses the entry", async () => {
    const { store, run } = importInto((method, url) =>
      WRITES.has(method) && url === CATALOG ? Promise.resolve(refused(412)) : undefined,
    );

    await expect(run()).rejects.toMatchObject({ code: "createdElsewhere" });
    expect(await store.urls()).not.toContain(CARDS);
  });

  it("deletes the cards document when the entry's write fails and the catalog does not have it", async () => {
    const { store, run } = importInto((method, url) =>
      WRITES.has(method) && url === CATALOG ? Promise.resolve(refused(500)) : undefined,
    );

    await expect(run()).rejects.not.toMatchObject({ code: "importDocumentLeft" });
    expect(await store.urls()).not.toContain(CARDS);
  });

  it("deletes the cards document when its own write's answer is lost", async () => {
    const { store, run } = importInto((method, url, pass) =>
      WRITES.has(method) && url === CARDS ? pass().then(lost) : undefined,
    );

    await expect(run()).rejects.toThrow("Failed to fetch");
    const urls = await store.urls();
    expect(urls).not.toContain(CARDS);
    expect(urls).not.toContain(CATALOG);
  });

  it("deletes nothing when the pod refuses the cards document", async () => {
    const asked: string[] = [];
    const { run } = importInto((method, url) => {
      asked.push(method);
      return WRITES.has(method) && url === CARDS ? Promise.resolve(refused(412)) : undefined;
    });

    await expect(run()).rejects.toMatchObject({ code: "createdElsewhere" });
    expect(asked).not.toContain("DELETE");
  });

  it("has the deck when the entry was written after all, its answer lost", async () => {
    const { store, run } = importInto((method, url, pass) =>
      WRITES.has(method) && url === CATALOG ? pass().then(lost) : undefined,
    );

    await expect(run()).resolves.toMatchObject({ cardsDocumentUrl: CARDS });
    expect(await store.urls()).toContain(CARDS);
  });

  it("says where the document is when it cannot be deleted", async () => {
    const { store, run } = importInto((method, url) => {
      if (WRITES.has(method) && url === CATALOG) return Promise.resolve(refused(412));
      return method === "DELETE" && url === CARDS ? Promise.resolve(refused(403)) : undefined;
    });

    await expect(run()).rejects.toMatchObject({
      code: "importDocumentLeft",
      vars: { url: CARDS },
    });
    expect(await store.urls()).toContain(CARDS);
  });

  it("says where the document is when it is still there after its removal", async () => {
    const { store, run } = importInto((method, url) => {
      if (WRITES.has(method) && url === CATALOG) return Promise.resolve(refused(412));
      return method === "DELETE" && url === CARDS ? Promise.resolve(refused(200)) : undefined;
    });

    await expect(run()).rejects.toMatchObject({ code: "importDocumentLeft" });
    expect(await store.urls()).toContain(CARDS);
  });

  it("says where the document is when its removal is not seen", async () => {
    let cut = false;
    const { run } = importInto((method, url) => {
      if (WRITES.has(method) && url === CATALOG) {
        cut = true;
        return Promise.resolve(refused(412));
      }
      return cut && method === "GET" && url === CARDS ? lost() : undefined;
    });

    await expect(run()).rejects.toMatchObject({ code: "importDocumentLeft" });
  });

  it("keeps the document, and says the outcome is unknown, when the catalog cannot be read to tell whether the entry was written", async () => {
    let cut = false;
    const { store, run } = importInto((method, url) => {
      if (WRITES.has(method) && url === CATALOG) {
        cut = true;
        return lost();
      }
      return cut && url === CATALOG ? lost() : undefined;
    });

    await expect(run()).rejects.toMatchObject({
      code: "importOutcomeUnknown",
      vars: { url: CARDS },
    });
    expect(await store.urls()).toContain(CARDS);
  });

  it("does not ask a guest to delete a document, on a path a guest can reach", async () => {
    const instance = `${GUEST_ORIGIN}memo/`;
    const catalog = `${instance}catalog.ttl`;
    const cards = `${instance}decks/deck-new.ttl`;
    const guestStore = (answer: Answer) => importInto(answer, GUEST_ORIGIN, instance);

    const left = guestStore((method, url) => {
      if (WRITES.has(method) && url === catalog)
        return Promise.reject(new AppError("guestStudyBeingMoved"));
      return method === "DELETE" && url === cards
        ? Promise.reject(new AppError("guestStudyBeingMoved"))
        : undefined;
    });
    await expect(left.run()).rejects.toMatchObject({ code: "guestImportDocumentLeft" });

    let cut = false;
    const unknown = guestStore((method, url) => {
      if (WRITES.has(method) && url === catalog) {
        cut = true;
        return Promise.reject(new TypeError("aborted"));
      }
      return cut && url === catalog ? Promise.reject(new TypeError("aborted")) : undefined;
    });
    await expect(unknown.run()).rejects.toMatchObject({ code: "guestImportOutcomeUnknown" });
    expect(await unknown.store.urls()).toContain(cards);
  });

  it("does not call the document unused when the entry was written and the catalog cannot be read", async () => {
    let cut = false;
    const { store, run } = importInto((method, url, pass) => {
      if (WRITES.has(method) && url === CATALOG) {
        cut = true;
        return pass().then(lost);
      }
      return cut && url === CATALOG ? lost() : undefined;
    });

    const failure = run();
    await expect(failure).rejects.toMatchObject({ code: "importOutcomeUnknown" });
    await expect(failure).rejects.toThrow(/cannot tell whether it was added/);
    expect(await store.urls()).toEqual(expect.arrayContaining([CARDS, CATALOG]));
  });
});

describe("an import of a release that links to the guest's pod", () => {
  it("is refused before anything is written, whatever links there: a guest could not keep it (GHSA-hc3p-fpwj-fvjp)", async () => {
    const content = release(2);
    const [first, second] = content.cards as [LibraryCard, LibraryCard];
    for (const linking of [
      { ...content, license: `${GUEST_ORIGIN}license` },
      { ...content, themes: [`${GUEST_ORIGIN}theme`] },
      { ...content, cards: [first, { ...second, frontImageUrl: `${GUEST_ORIGIN}p.png` }] },
      { ...content, cards: [{ ...first, subjects: [`${GUEST_ORIGIN}a`] }, second] },
    ]) {
      const { store, repository } = importInto(() => undefined);
      await expect(repository.importDeck(INSTANCE, linking)).rejects.toEqual(
        new AppError("releaseLinksGuestPod", { url: content.url }),
      );
      expect(await store.urls()).toEqual([]);
    }
  });

  it("is not refused for the release's own address, which the copy names as its source", async () => {
    const { repository } = importInto(() => undefined);
    const url = `${GUEST_ORIGIN}memo/drafts/capitals/v1/release.ttl`;
    expect(await repository.importDeck(INSTANCE, { ...release(2), url })).toMatchObject({
      sourceUrl: url,
    });
  });
});
