// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { deleteInstanceData } from "./instanceData";
import { createLocalPod } from "./localPod";
import { createMemoryResourceStore } from "./memoryResourceStore";

const ROOT = "https://pod.example/";
const INSTANCE = `${ROOT}solid-memo/main/`;
const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";

/**
 * A pod in memory, every DELETE recorded; `fail` answers a request (by
 * method and URL) with a status instead. Each address is resolved as a
 * browser's fetch resolves it before the request leaves (dot segments,
 * `%2e%2e` too, removed), so a test sees where a request really goes.
 */
function pod(fail: (method: string, url: string) => number | null = () => null) {
  const store = createMemoryResourceStore();
  let etags = 0;
  const local = createLocalPod({ root: ROOT, store, newEtag: () => `"e${++etags}"` });
  const deleted: string[] = [];
  const fetch = (async (input, init) => {
    const url = new Request(String(input)).url;
    const method = (init?.method ?? "GET").toUpperCase();
    const status = fail(method, url);
    if (status !== null) return new Response("refused", { status });
    const response = await local(url, init);
    if (method === "DELETE" && response.ok) deleted.push(url);
    return response;
  }) as typeof globalThis.fetch;
  const put = async (url: string, body: string, type = "text/turtle") => {
    const response = await local(url, { method: "PUT", headers: { "Content-Type": type }, body });
    expect(response.ok).toBe(true);
  };
  const exists = async (url: string) => (await local(url, { method: "HEAD" })).ok;
  return { fetch, put, exists, deleted, urls: async () => (await store.urls()).sort() };
}

/** An instance as Solid Memo writes it: two decks (one with no reviews yet), two months of answers, a digest. */
async function seedInstance(p: ReturnType<typeof pod>, catalogExtra = "") {
  await p.put(`${INSTANCE}meta.ttl`, `<#it> a <${SM}Instance> .`);
  await p.put(`${INSTANCE}preferences.ttl`, `<#it> a <${SM}Preferences> .`);
  await p.put(
    `${INSTANCE}palettes.ttl`,
    `<#palette-1> a <${SM}Palette> ; <${SM}lightColors> <#palette-1-light> .
<#palette-1-light> a <${SM}ColorSet> .`,
  );
  await p.put(`${INSTANCE}digest.ttl`, `<#receipt-catalog.ttl> a <${SM}DocumentReceipt> .`);
  await p.put(
    `${INSTANCE}catalog.ttl`,
    `<#catalog> a <http://www.w3.org/ns/dcat#Catalog> .
<#deck-1> a <${SM}Deck> ; <${SM}cardsDocument> <decks/deck-1.ttl> ; <${SM}reviewsDocument> <reviews/deck-1.ttl> .
<#deck-2> a <${SM}Deck> ; <${SM}cardsDocument> <decks/deck-2-0f3a.ttl> ; <${SM}reviewsDocument> <reviews/deck-2-0f3a.ttl> .
${catalogExtra}`,
  );
  await p.put(`${INSTANCE}decks/deck-1.ttl`, `<#c1> a <${SM}Card> .`);
  await p.put(`${INSTANCE}reviews/deck-1.ttl`, `<#c1> a <${SM}ReviewState> .`);
  await p.put(`${INSTANCE}decks/deck-2-0f3a.ttl`, `<#c2> a <${SM}Card> .`);
  await p.put(`${INSTANCE}history/2026-09.ttl`, `<#answer-1> a <${SM}Answer> .`);
  await p.put(`${INSTANCE}history/2026-10.ttl`, `<#answer-2> a <${SM}Answer> .`);
}

describe("deleteInstanceData", () => {
  it("deletes an instance that holds only what Solid Memo wrote, folder and all: the decks' documents first, the catalog after them, meta.ttl last", async () => {
    const p = pod();
    await p.put(`${ROOT}profile/card`, `<#me> a <http://xmlns.com/foaf/0.1/Person> .`);
    await seedInstance(p);

    await expect(deleteInstanceData(INSTANCE.slice(0, -1), p.fetch)).resolves.toEqual({
      keptFolder: null,
      keptReleases: false,
      keptDocuments: [],
    });

    expect(p.deleted).toEqual([
      `${INSTANCE}decks/deck-1.ttl`,
      `${INSTANCE}reviews/deck-1.ttl`,
      `${INSTANCE}decks/deck-2-0f3a.ttl`,
      `${INSTANCE}history/2026-09.ttl`,
      `${INSTANCE}history/2026-10.ttl`,
      `${INSTANCE}preferences.ttl`,
      `${INSTANCE}palettes.ttl`,
      `${INSTANCE}digest.ttl`,
      `${INSTANCE}catalog.ttl`,
      `${INSTANCE}decks/`,
      `${INSTANCE}reviews/`,
      `${INSTANCE}history/`,
      `${INSTANCE}meta.ttl`,
      INSTANCE,
    ]);
    expect(await p.urls()).toEqual([
      ROOT,
      `${ROOT}profile/`,
      `${ROOT}profile/card`,
      `${ROOT}solid-memo/`,
    ]);
  });

  it("deletes the drafts the catalog links, before the catalog, and never one elsewhere", async () => {
    const p = pod();
    const draft = `${INSTANCE}drafts/solid/v1/`;
    const elsewhere = `${ROOT}solid-memo/other/drafts/solid/v1/release.ttl`;
    await seedInstance(
      p,
      `<#catalog> <${SM}releaseDraft> <drafts/solid/v1/release.ttl> , <${elsewhere}> , <decks/deck-1.ttl> .`,
    );
    await p.put(`${draft}release.ttl`, `<> a <${SM}Deck> .`);
    await p.put(`${draft}chapter-ch-a.ttl`, `<#ch-a> a <${SM}Chapter> .`);
    await p.put(`${draft}cards.ttl`, `<#q> a <${SM}Card> .`);
    await p.put(elsewhere, `<> a <${SM}Deck> .`);

    await expect(deleteInstanceData(INSTANCE, p.fetch)).resolves.toEqual({
      keptFolder: null,
      keptReleases: false,
      keptDocuments: [],
    });

    const deleted = p.deleted;
    expect(
      deleted.slice(
        deleted.indexOf(`${INSTANCE}history/2026-10.ttl`) + 1,
        deleted.indexOf(`${INSTANCE}preferences.ttl`),
      ),
    ).toEqual([
      `${draft}cards.ttl`,
      `${draft}chapter-ch-a.ttl`,
      `${draft}release.ttl`,
      draft,
      `${INSTANCE}drafts/solid/`,
      `${INSTANCE}drafts/`,
    ]);
    expect(await p.exists(elsewhere)).toBe(true);
  });

  it("finds no draft in a catalog document without the catalog", async () => {
    const p = pod();
    await p.put(
      `${INSTANCE}catalog.ttl`,
      `<#deck-1> a <${SM}Deck> ; <${SM}cardsDocument> <decks/deck-1.ttl> .`,
    );
    await p.put(`${INSTANCE}decks/deck-1.ttl`, `<#c1> a <${SM}Card> .`);
    await expect(deleteInstanceData(INSTANCE, p.fetch)).resolves.toEqual({
      keptFolder: null,
      keptReleases: false,
      keptDocuments: [],
    });
  });

  it("keeps what another app put in the folder, and the containers holding it, and says the folder was kept", async () => {
    const p = pod();
    await seedInstance(p);
    const foreign = [
      `${INSTANCE}attachments/picture.png`,
      `${INSTANCE}decks/notes.ttl`,
      `${INSTANCE}history/2026-10-summary.ttl`,
      `${INSTANCE}history/2026/01.ttl`,
      `${INSTANCE}readme.md`,
    ];
    for (const url of foreign) {
      await p.put(
        url,
        url.endsWith(".ttl") ? `<#note> <#says> "kept" .` : "kept",
        url.endsWith(".ttl") ? "text/turtle" : "text/plain",
      );
    }

    await expect(deleteInstanceData(INSTANCE, p.fetch)).resolves.toEqual({
      keptFolder: INSTANCE,
      keptReleases: false,
      keptDocuments: [],
    });

    for (const url of foreign) expect(await p.exists(url), url).toBe(true);
    expect(await p.urls()).toEqual(
      [
        ROOT,
        `${ROOT}solid-memo/`,
        INSTANCE,
        `${INSTANCE}attachments/`,
        `${INSTANCE}decks/`,
        `${INSTANCE}history/`,
        `${INSTANCE}history/2026/`,
        ...foreign,
      ].sort(),
    );
  });

  it("removes only Solid Memo's subjects from a document that also holds another app's, keeps it, and names it", async () => {
    const p = pod();
    await seedInstance(p, `<#recipes> <https://other.example/says> "kept" .`);
    const other = `<#note> <https://other.example/says> "kept" .`;
    for (const url of [
      `${INSTANCE}decks/deck-1.ttl`,
      `${INSTANCE}history/2026-09.ttl`,
      `${INSTANCE}preferences.ttl`,
      `${INSTANCE}palettes.ttl`,
      `${INSTANCE}meta.ttl`,
    ]) {
      const text = await (await p.fetch(url)).text();
      await p.put(url, `${text}\n${other}`);
    }

    const kept = [
      `${INSTANCE}decks/deck-1.ttl`,
      `${INSTANCE}history/2026-09.ttl`,
      `${INSTANCE}preferences.ttl`,
      `${INSTANCE}palettes.ttl`,
      `${INSTANCE}catalog.ttl`,
      `${INSTANCE}meta.ttl`,
    ];
    await expect(deleteInstanceData(INSTANCE, p.fetch)).resolves.toEqual({
      keptFolder: INSTANCE,
      keptReleases: false,
      keptDocuments: kept,
    });
    for (const url of kept) {
      const text = await (await p.fetch(url)).text();
      expect(text, url).toContain("https://other.example/says");
      expect(text, url).not.toContain(SM);
    }
    expect(await p.exists(`${INSTANCE}reviews/deck-1.ttl`)).toBe(false);
    expect(await p.exists(`${INSTANCE}digest.ttl`)).toBe(false);
  });

  it("removes a deck's document elsewhere that says it is the deck's, and nothing of one that does not", async () => {
    const p = pod();
    const linked = `${ROOT}notes/linked.ttl`;
    const unlinked = `${ROOT}notes/unlinked.ttl`;
    await seedInstance(
      p,
      `<#deck-3> a <${SM}Deck> ; <${SM}cardsDocument> <${linked}> ; <${SM}reviewsDocument> <${unlinked}> .`,
    );
    await p.put(
      linked,
      `<> <http://purl.org/dc/terms/isPartOf> <${INSTANCE}catalog.ttl#deck-3> .\n<#c3> a <${SM}Card> .`,
    );
    await p.put(unlinked, `<#c3> a <${SM}ReviewState> .`);

    await deleteInstanceData(INSTANCE, p.fetch);

    expect(await p.exists(linked)).toBe(false);
    expect(await p.exists(unlinked)).toBe(true);
  });

  it("keeps the releases published from the instance, and says they are why the folder was kept", async () => {
    const p = pod();
    await seedInstance(p, `<#catalog> <${SM}publishedRelease> <releases/solid/v1.ttl> .`);
    await p.put(`${INSTANCE}releases/solid/v1.ttl`, `<> a <${SM}Deck> .`);

    await expect(deleteInstanceData(INSTANCE, p.fetch)).resolves.toEqual({
      keptFolder: INSTANCE,
      keptReleases: true,
      keptDocuments: [],
    });

    expect(await p.urls()).toEqual([
      ROOT,
      `${ROOT}solid-memo/`,
      INSTANCE,
      `${INSTANCE}releases/`,
      `${INSTANCE}releases/solid/`,
      `${INSTANCE}releases/solid/v1.ttl`,
    ]);
  });

  it("follows the catalog only to documents below the folder, never to the folder's own documents or a container", async () => {
    const p = pod();
    const elsewhere = `${ROOT}solid-memo/other/decks/deck-9.ttl`;
    await seedInstance(
      p,
      `<#deck-3> a <${SM}Deck> ; <${SM}cardsDocument> <${elsewhere}> ; <${SM}reviewsDocument> <meta.ttl> .
<#deck-4> a <${SM}Deck> ; <${SM}cardsDocument> <decks/> ; <${SM}reviewsDocument> <catalog.ttl#x> .
<#deck-5> a <${SM}Deck> ; <${SM}cardsDocument> <decks/deck-1.ttl#shared> .
<#not-a-deck> <${SM}cardsDocument> <attachments/kept.ttl> .`,
    );
    await p.put(elsewhere, `<#c9> a <${SM}Card> .`);
    await p.put(`${INSTANCE}attachments/kept.ttl`, `<#k> <#v> "1" .`);

    // The catalog keeps the subject that is no deck, which is not Solid Memo's.
    await expect(deleteInstanceData(INSTANCE, p.fetch)).resolves.toEqual({
      keptFolder: INSTANCE,
      keptReleases: false,
      keptDocuments: [`${INSTANCE}catalog.ttl`],
    });

    expect(await p.exists(elsewhere)).toBe(true);
    expect(await p.exists(`${INSTANCE}attachments/kept.ttl`)).toBe(true);
    // Each document once, meta.ttl last, after the containers emptied of Solid Memo's.
    expect(p.deleted.filter((url) => url === `${INSTANCE}decks/deck-1.ttl`)).toHaveLength(1);
    expect(p.deleted.slice(-1)).toEqual([`${INSTANCE}meta.ttl`]);
    expect(await p.exists(`${INSTANCE}meta.ttl`)).toBe(false);
  });

  it("follows the catalog to no address a request would resolve outside decks/ and reviews/, however it is spelled", async () => {
    const p = pod();
    // Another user's documents on the same server, and the user's own beside the instance.
    const targets = [
      `${ROOT}alice/profile/card`,
      `${ROOT}alice/private/diary.ttl`,
      `${ROOT}solid-memo/secret.ttl`,
      `${INSTANCE}attachments/kept.ttl`,
      `${INSTANCE}decks/deck-1.ttl`,
    ];
    const spellings = [
      `${INSTANCE}decks/../../../alice/profile/card`,
      `${INSTANCE}%2e%2e/%2E%2e/alice/private/diary.ttl`,
      `${INSTANCE}reviews/.%2E/%2e./secret.ttl`,
      `${INSTANCE}decks/%2e%2e/attachments/kept.ttl`,
      `${INSTANCE}reviews/../decks/deck-1.ttl`,
      `HTTPS://POD.EXAMPLE/solid-memo/main/decks/deck-1.ttl`,
      `https://pod.example:443/solid-memo/main/reviews/../decks/deck-1.ttl`,
    ];
    await seedInstance(
      p,
      spellings
        .map(
          (url, n) =>
            `<#far-${n}> a <${SM}Deck> ; <${SM}cardsDocument> <${url}> ; <${SM}reviewsDocument> <${url}> .`,
        )
        .join("\n"),
    );
    for (const url of targets) await p.put(url, `<#x> <#y> "kept" .`);
    await p.put(`${INSTANCE}decks/deck-1.ttl`, `<#c1> a <${SM}Card> .`);

    await deleteInstanceData(INSTANCE, p.fetch);

    for (const url of targets.slice(0, 4)) expect(await p.exists(url), url).toBe(true);
    // The deck's own document goes as the catalog's deck-1 names it, once.
    expect(p.deleted.filter((url) => url === `${INSTANCE}decks/deck-1.ttl`)).toHaveLength(1);
    expect(p.deleted.every((url) => url.startsWith(INSTANCE))).toBe(true);
  });

  it("follows another user's attached instance to nothing of the user's on the same server", async () => {
    const p = pod();
    const bob = `${ROOT}bob/solid-memo/main/`;
    const card = `${ROOT}alice/profile/card`;
    await p.put(card, `<#me> a <http://xmlns.com/foaf/0.1/Person> .`);
    await p.put(`${bob}meta.ttl`, `<#it> a <${SM}Instance> .`);
    await p.put(
      `${bob}catalog.ttl`,
      `<#d> a <${SM}Deck> ; <${SM}cardsDocument> <${bob}../../../alice/profile/card> ; <${SM}reviewsDocument> <${card}> .`,
    );

    await expect(deleteInstanceData(bob, p.fetch)).resolves.toEqual({
      keptFolder: null,
      keptReleases: false,
      keptDocuments: [],
    });
    expect(await p.exists(card)).toBe(true);
    expect(p.deleted.every((url) => url.startsWith(bob))).toBe(true);
  });

  it("counts what is already gone as deleted, so a delete that failed part-way can be done again", async () => {
    const p = pod();
    await expect(deleteInstanceData(INSTANCE, p.fetch)).resolves.toEqual({
      keptFolder: null,
      keptReleases: false,
      keptDocuments: [],
    });
    await p.put(`${INSTANCE}meta.ttl`, `<#it> a <${SM}Instance> .`);
    await expect(deleteInstanceData(INSTANCE, p.fetch)).resolves.toEqual({
      keptFolder: null,
      keptReleases: false,
      keptDocuments: [],
    });
    expect(await p.urls()).toEqual([ROOT, `${ROOT}solid-memo/`]);

    // Gone between the question and the delete (the pod answers the DELETE with 404): counted as deleted, the rest goes on.
    const raced = pod((method, url) =>
      method === "DELETE" && url === `${INSTANCE}digest.ttl` ? 404 : null,
    );
    await raced.put(`${INSTANCE}digest.ttl`, `<#receipt-catalog.ttl> a <${SM}DocumentReceipt> .`);
    await raced.put(`${INSTANCE}meta.ttl`, `<#it> a <${SM}Instance> .`);
    await expect(deleteInstanceData(INSTANCE, raced.fetch)).resolves.toEqual({
      keptFolder: INSTANCE,
      keptReleases: false,
      keptDocuments: [],
    });
    expect(await raced.urls()).toEqual([
      ROOT,
      `${ROOT}solid-memo/`,
      INSTANCE,
      `${INSTANCE}digest.ttl`,
    ]);
  });

  it("stops at a delete the pod refuses, leaving meta.ttl, so the instance still attaches and the delete can be retried", async () => {
    const p = pod((method, url) =>
      method === "DELETE" && url === `${INSTANCE}history/2026-10.ttl` ? 403 : null,
    );
    await seedInstance(p);

    await expect(deleteInstanceData(INSTANCE, p.fetch)).rejects.toMatchObject({ statusCode: 403 });

    expect(await p.exists(`${INSTANCE}meta.ttl`)).toBe(true);
    expect(await p.exists(`${INSTANCE}catalog.ttl`)).toBe(true);
    expect(await p.exists(`${INSTANCE}decks/deck-1.ttl`)).toBe(false);
  });

  it("keeps a folder that gains something between its listing and its delete, and fails on a listing it cannot read", async () => {
    const raced = pod((method, url) => (method === "DELETE" && url === INSTANCE ? 409 : null));
    await seedInstance(raced);
    await expect(deleteInstanceData(INSTANCE, raced.fetch)).resolves.toEqual({
      keptFolder: INSTANCE,
      keptReleases: false,
      keptDocuments: [],
    });

    const unreadable = pod((method, url) =>
      method === "GET" && url === `${INSTANCE}reviews/` ? 500 : null,
    );
    await seedInstance(unreadable);
    await expect(deleteInstanceData(INSTANCE, unreadable.fetch)).rejects.toMatchObject({
      statusCode: 500,
    });
    expect(await unreadable.exists(`${INSTANCE}meta.ttl`)).toBe(true);

    const undeletable = pod((method, url) =>
      method === "DELETE" && url === `${INSTANCE}decks/` ? 403 : null,
    );
    await seedInstance(undeletable);
    await expect(deleteInstanceData(INSTANCE, undeletable.fetch)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("keeps a catalog it cannot read, and the decks' documents it names, and deletes the rest", async () => {
    const p = pod();
    await seedInstance(p);
    // As another app might have written it: served as Turtle, but not Turtle.
    const garbled = (async (input, init) =>
      String(input) === `${INSTANCE}catalog.ttl` && (init?.method ?? "GET") === "GET"
        ? new Response("this is <not Turtle", {
            status: 200,
            headers: { "Content-Type": "text/turtle" },
          })
        : p.fetch(input, init)) as typeof globalThis.fetch;

    await expect(deleteInstanceData(INSTANCE, garbled)).resolves.toEqual({
      keptFolder: INSTANCE,
      keptReleases: false,
      keptDocuments: [],
    });

    expect(await p.urls()).toEqual([
      ROOT,
      `${ROOT}solid-memo/`,
      INSTANCE,
      `${INSTANCE}catalog.ttl`,
      `${INSTANCE}decks/`,
      `${INSTANCE}decks/deck-1.ttl`,
      `${INSTANCE}decks/deck-2-0f3a.ttl`,
      `${INSTANCE}reviews/`,
      `${INSTANCE}reviews/deck-1.ttl`,
    ]);

    // A catalog the pod would not serve is no reason to delete less: the delete fails, to be tried again.
    const refused = pod((method, url) =>
      method === "GET" && url === `${INSTANCE}catalog.ttl` ? 500 : null,
    );
    await seedInstance(refused);
    await expect(deleteInstanceData(INSTANCE, refused.fetch)).rejects.toMatchObject({
      statusCode: 500,
    });
    expect(refused.deleted).toEqual([]);
  });
});
