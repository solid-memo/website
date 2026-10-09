import { describe, expect, it } from "vitest";
import { deleteInstanceData } from "./instanceData";
import { createLocalPod } from "./localPod";
import { createMemoryResourceStore } from "./memoryResourceStore";
import { createSolidDocumentBackups } from "./solidDocumentBackups";

const ROOT = "https://pod.example/";
const INSTANCE = `${ROOT}solid-memo/main/`;
const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";

/** A pod in memory, every DELETE recorded; `fail` answers a request (by method and URL) with a status instead. */
function pod(fail: (method: string, url: string) => number | null = () => null) {
  const store = createMemoryResourceStore();
  let etags = 0;
  const local = createLocalPod({ root: ROOT, store, newEtag: () => `"e${++etags}"` });
  const deleted: string[] = [];
  const fetch = (async (input, init) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const status = fail(method, url);
    if (status !== null) return new Response("refused", { status });
    const response = await local(input, init);
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
  it("deletes an instance that holds only what Solid Memo wrote, folder and all: the decks' documents first, the catalogue after them, meta.ttl last", async () => {
    const p = pod();
    await p.put(`${ROOT}profile/card`, `<#me> a <http://xmlns.com/foaf/0.1/Person> .`);
    await seedInstance(p);

    await expect(deleteInstanceData(INSTANCE.slice(0, -1), p.fetch)).resolves.toEqual({ keptFolder: null });

    expect(p.deleted).toEqual([
      `${INSTANCE}decks/deck-1.ttl`,
      `${INSTANCE}reviews/deck-1.ttl`,
      `${INSTANCE}decks/deck-2-0f3a.ttl`,
      `${INSTANCE}history/2026-09.ttl`,
      `${INSTANCE}history/2026-10.ttl`,
      `${INSTANCE}preferences.ttl`,
      `${INSTANCE}digest.ttl`,
      `${INSTANCE}catalog.ttl`,
      `${INSTANCE}decks/`,
      `${INSTANCE}reviews/`,
      `${INSTANCE}history/`,
      `${INSTANCE}meta.ttl`,
      INSTANCE,
    ]);
    expect(await p.urls()).toEqual([ROOT, `${ROOT}profile/`, `${ROOT}profile/card`, `${ROOT}solid-memo/`]);
  });

  it("deletes the instance's backups with it, as their manifests name what they hold", async () => {
    const p = pod();
    await seedInstance(p);
    const backups = createSolidDocumentBackups({ fetch: p.fetch });
    await backups.create({
      folder: `${INSTANCE}backups/20261009T100000Z-0f3a1b2c/`,
      of: INSTANCE,
      createdAt: "2026-10-09T10:00:00.000Z",
      instanceUrl: INSTANCE,
      documents: [`${INSTANCE}meta.ttl`, `${INSTANCE}decks/deck-1.ttl`],
    });
    await expect(deleteInstanceData(INSTANCE, p.fetch)).resolves.toEqual({ keptFolder: null });
    expect(p.deleted).toEqual(
      expect.arrayContaining([
        `${INSTANCE}backups/20261009T100000Z-0f3a1b2c/decks/deck-1.ttl.orig`,
        `${INSTANCE}backups/20261009T100000Z-0f3a1b2c/manifest.ttl`,
        `${INSTANCE}backups/`,
      ]),
    );
    // Before meta.ttl, the last of the documents.
    expect(p.deleted.indexOf(`${INSTANCE}backups/`)).toBeLessThan(p.deleted.indexOf(`${INSTANCE}meta.ttl`));
    expect((await p.urls()).filter((url) => url.startsWith(INSTANCE))).toEqual([]);
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
      await p.put(url, url.endsWith(".ttl") ? `<#note> <#says> "kept" .` : "kept", url.endsWith(".ttl") ? "text/turtle" : "text/plain");
    }

    await expect(deleteInstanceData(INSTANCE, p.fetch)).resolves.toEqual({ keptFolder: INSTANCE });

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

  it("follows the catalogue only to documents below the folder, never to the folder's own documents or a container", async () => {
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

    await expect(deleteInstanceData(INSTANCE, p.fetch)).resolves.toEqual({ keptFolder: INSTANCE });

    expect(await p.exists(elsewhere)).toBe(true);
    expect(await p.exists(`${INSTANCE}attachments/kept.ttl`)).toBe(true);
    // Each document once, meta.ttl last, after the containers emptied of Solid Memo's.
    expect(p.deleted.filter((url) => url === `${INSTANCE}decks/deck-1.ttl`)).toHaveLength(1);
    expect(p.deleted.slice(-1)).toEqual([`${INSTANCE}meta.ttl`]);
    expect(await p.exists(`${INSTANCE}meta.ttl`)).toBe(false);
  });

  it("counts what is already gone as deleted, so a delete that failed part-way can be done again", async () => {
    const p = pod();
    await expect(deleteInstanceData(INSTANCE, p.fetch)).resolves.toEqual({ keptFolder: null });
    await p.put(`${INSTANCE}meta.ttl`, `<#it> a <${SM}Instance> .`);
    await expect(deleteInstanceData(INSTANCE, p.fetch)).resolves.toEqual({ keptFolder: null });
    expect(await p.urls()).toEqual([ROOT, `${ROOT}solid-memo/`]);

    // Gone between the question and the delete (the pod answers the DELETE with 404): counted as deleted, the rest goes on.
    const raced = pod((method, url) => (method === "DELETE" && url === `${INSTANCE}digest.ttl` ? 404 : null));
    await raced.put(`${INSTANCE}digest.ttl`, `<#receipt-catalog.ttl> a <${SM}DocumentReceipt> .`);
    await raced.put(`${INSTANCE}meta.ttl`, `<#it> a <${SM}Instance> .`);
    await expect(deleteInstanceData(INSTANCE, raced.fetch)).resolves.toEqual({ keptFolder: INSTANCE });
    expect(await raced.urls()).toEqual([ROOT, `${ROOT}solid-memo/`, INSTANCE, `${INSTANCE}digest.ttl`]);
  });

  it("stops at a delete the pod refuses, leaving meta.ttl, so the instance still attaches and the delete can be retried", async () => {
    const p = pod((method, url) => (method === "DELETE" && url === `${INSTANCE}history/2026-10.ttl` ? 403 : null));
    await seedInstance(p);

    await expect(deleteInstanceData(INSTANCE, p.fetch)).rejects.toMatchObject({ statusCode: 403 });

    expect(await p.exists(`${INSTANCE}meta.ttl`)).toBe(true);
    expect(await p.exists(`${INSTANCE}catalog.ttl`)).toBe(true);
    expect(await p.exists(`${INSTANCE}decks/deck-1.ttl`)).toBe(false);
  });

  it("keeps a folder that gains something between its listing and its delete, and fails on a listing it cannot read", async () => {
    const raced = pod((method, url) => (method === "DELETE" && url === INSTANCE ? 409 : null));
    await seedInstance(raced);
    await expect(deleteInstanceData(INSTANCE, raced.fetch)).resolves.toEqual({ keptFolder: INSTANCE });

    const unreadable = pod((method, url) => (method === "GET" && url === `${INSTANCE}reviews/` ? 500 : null));
    await seedInstance(unreadable);
    await expect(deleteInstanceData(INSTANCE, unreadable.fetch)).rejects.toMatchObject({ statusCode: 500 });
    expect(await unreadable.exists(`${INSTANCE}meta.ttl`)).toBe(true);

    const undeletable = pod((method, url) => (method === "DELETE" && url === `${INSTANCE}decks/` ? 403 : null));
    await seedInstance(undeletable);
    await expect(deleteInstanceData(INSTANCE, undeletable.fetch)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("keeps a catalogue it cannot read, and the decks' documents it names, and deletes the rest", async () => {
    const p = pod();
    await seedInstance(p);
    // As another app might have written it: served as Turtle, but not Turtle.
    const garbled = (async (input, init) =>
      String(input) === `${INSTANCE}catalog.ttl` && (init?.method ?? "GET") === "GET"
        ? new Response("this is <not Turtle", { status: 200, headers: { "Content-Type": "text/turtle" } })
        : p.fetch(input, init)) as typeof globalThis.fetch;

    await expect(deleteInstanceData(INSTANCE, garbled)).resolves.toEqual({ keptFolder: INSTANCE });

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

    // A catalogue the pod would not serve is no reason to delete less: the delete fails, to be tried again.
    const refused = pod((method, url) => (method === "GET" && url === `${INSTANCE}catalog.ttl` ? 500 : null));
    await seedInstance(refused);
    await expect(deleteInstanceData(INSTANCE, refused.fetch)).rejects.toMatchObject({ statusCode: 500 });
    expect(refused.deleted).toEqual([]);
  });
});
