import { describe, expect, it, vi } from "vitest";
import { createLocalPod } from "./localPod";
import { createMemoryResourceStore } from "./memoryResourceStore";
import { createSolidDocumentBackups } from "./solidDocumentBackups";
import { readBackupIn } from "./backupData";

const POD = "https://pod.example/";
const MAIN = `${POD}solid-memo/main/`;
const FOLDER = `${MAIN}backups/20261009T100000Z-0f3a1b2c/`;
const CARDS = `${MAIN}decks/deck-1.ttl`;
const META = `${MAIN}meta.ttl`;
const CATALOG = `${MAIN}catalog.ttl`;
const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";

async function pod() {
  let etags = 0;
  const store = createMemoryResourceStore();
  const fetch = createLocalPod({ root: POD, store, newEtag: () => `"e${++etags}"` });
  const put = (url: string, body: string, type = "text/turtle") =>
    fetch(url, { method: "PUT", headers: { "Content-Type": type }, body });
  await put(CARDS, `<#se> a <${SM}Card> ; <${SM}front> "Sweden" ; <${SM}back> "Stockholm" .`);
  await put(META, `<#it> a <${SM}Instance> ; <http://purl.org/dc/terms/title> "Main" .`);
  const checkWrite = vi.fn(async () => undefined);
  const backups = createSolidDocumentBackups({ fetch, checkWrite });
  const text = async (url: string) => (await fetch(url)).text();
  return { fetch, store, put, backups, checkWrite, text };
}

describe("the document backups", () => {
  it("copy each document there is into the folder, with a manifest naming them and the version each was copied at", async () => {
    const { backups, checkWrite, text, fetch } = await pod();
    const copied = vi.fn();
    const backup = await backups.create(
      { folder: FOLDER, of: MAIN, createdAt: "2026-10-09T10:00:00.000Z", instanceUrl: MAIN, documents: [META, CARDS, CATALOG] },
      copied,
    );
    const metaVersion = (await fetch(META, { method: "HEAD" })).headers.get("ETag")!;
    expect(backup).toEqual({
      url: FOLDER,
      of: MAIN,
      createdAt: "2026-10-09T10:00:00.000Z",
      entries: [
        { document: META, copy: `${FOLDER}meta.ttl`, versionBackedUp: metaVersion },
        { document: CARDS, copy: `${FOLDER}decks/deck-1.ttl`, versionBackedUp: expect.stringMatching(/^"e\d+"$/) },
        { document: CATALOG },
      ],
    });
    expect(copied).toHaveBeenCalledTimes(3);
    // The copy holds the document's triples, its IRIs as they were.
    expect(await text(`${FOLDER}decks/deck-1.ttl`)).toContain(`<${CARDS}#se> <${SM}back> "Stockholm"`);
    expect(checkWrite).toHaveBeenCalledWith(expect.anything(), [
      `${FOLDER}manifest.ttl#it`,
      `${FOLDER}manifest.ttl#entry-1`,
      `${FOLDER}manifest.ttl#entry-2`,
      `${FOLDER}manifest.ttl#entry-3`,
    ]);
    await expect(backups.read(FOLDER)).resolves.toEqual(backup);
    await expect(backups.list(MAIN)).resolves.toEqual([backup]);
  });

  it("name the release a deck was at in a library upgrade's backup", async () => {
    const { backups } = await pod();
    const release = "https://solid-memo.com/decks/capitals/v1.ttl";
    const backup = await backups.create({
      folder: FOLDER,
      of: `${CATALOG}#deck-1`,
      createdAt: "2026-10-09T10:00:00.000Z",
      instanceUrl: MAIN,
      documents: [CARDS],
      release,
    });
    expect(backup.release).toBe(release);
    await expect(backups.read(FOLDER)).resolves.toEqual(backup);
  });

  it("never write a backup where one is", async () => {
    const { backups } = await pod();
    const args = { folder: FOLDER, of: MAIN, createdAt: "2026-10-09T10:00:00.000Z", instanceUrl: MAIN, documents: [META] };
    await backups.create(args);
    await expect(backups.create(args)).rejects.toMatchObject({ code: "createdElsewhere" });
  });

  it("note the version an update left a document at, and say so when the backup is gone", async () => {
    const { backups, fetch } = await pod();
    const backup = await backups.create({ folder: FOLDER, of: MAIN, createdAt: "2026-10-09T10:00:00.000Z", instanceUrl: MAIN, documents: [META, CARDS] });
    await backups.noteUpdated(backup, CARDS, '"later"');
    expect((await backups.read(FOLDER))!.entries[1]).toEqual({ ...backup.entries[1], versionUpdated: '"later"' });
    await expect(backups.noteUpdated(backup, `${MAIN}other.ttl`, '"x"')).rejects.toMatchObject({ code: "backupGone" });
    await fetch(`${FOLDER}manifest.ttl`, { method: "DELETE" });
    await expect(backups.noteUpdated(backup, CARDS, '"later"')).rejects.toMatchObject({ code: "backupGone" });
    await expect(backups.read(FOLDER)).resolves.toBeNull();
  });

  it("put a document back while it is at the version given, and delete one the update created", async () => {
    const { backups, put, text, fetch } = await pod();
    const backup = await backups.create({ folder: FOLDER, of: MAIN, createdAt: "2026-10-09T10:00:00.000Z", instanceUrl: MAIN, documents: [CARDS, CATALOG] });
    await put(CARDS, `<#se> a <${SM}Card> ; <${SM}front> "Sweden" ; <${SM}back> "Stockholm" ; <${SM}formatVersion> 5 .`);
    await put(CATALOG, `<#catalog> a <http://www.w3.org/ns/dcat#Catalog> .`);
    const updated = await backups.versionOf(CARDS);
    await expect(backups.putBack(backup.entries[0]!, '"stale"')).rejects.toMatchObject({ code: "changedElsewhere" });
    await backups.putBack(backup.entries[0]!, updated!);
    expect(await text(CARDS)).not.toContain("formatVersion");
    expect(await text(CARDS)).toContain(`<${CARDS}#se> <${SM}back> "Stockholm"`);
    await backups.putBack(backup.entries[1]!, (await backups.versionOf(CATALOG))!);
    expect((await fetch(CATALOG)).status).toBe(404);
    await expect(backups.versionOf(CATALOG)).resolves.toBeNull();
  });

  it("check a version that is no ETag before putting a document back, and report a write the pod refuses", async () => {
    const answers: Response[] = [];
    const fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) =>
      init?.method === undefined ? new Response("x", { headers: { "Last-Modified": "then" } }) : answers.shift()!,
    );
    const backups = createSolidDocumentBackups({ fetch });
    const entry = { document: CATALOG };
    await expect(backups.putBack(entry, "Last-Modified: now")).rejects.toMatchObject({ code: "changedElsewhere" });
    answers.push(new Response(null, { status: 204 }));
    await backups.putBack(entry, "Last-Modified: then");
    expect(new Headers(fetch.mock.calls.at(-1)![1]!.headers).get("If-Match")).toBeNull();
    answers.push(new Response(null, { status: 412 }));
    await expect(backups.putBack(entry, '"e1"')).rejects.toMatchObject({ code: "changedElsewhere" });
    answers.push(new Response(null, { status: 500 }));
    await expect(backups.putBack(entry, '"e1"')).rejects.toMatchObject({ code: "addFailed" });
  });

  it("remove what a backup holds and its folders, the backups folder too once empty, keeping another app's file", async () => {
    const { backups, put, fetch, store } = await pod();
    const first = await backups.create({ folder: FOLDER, of: MAIN, createdAt: "2026-10-09T10:00:00.000Z", instanceUrl: MAIN, documents: [META, CARDS] });
    const second = await backups.create({
      folder: `${MAIN}backups/20261010T100000Z-0f3a1b2c/`,
      of: `${MAIN}catalog.ttl#deck-1`,
      createdAt: "2026-10-10T10:00:00.000Z",
      instanceUrl: MAIN,
      documents: [CARDS],
    });
    // Newest first; a folder without a manifest, or with one that is not Turtle, is no backup.
    await put(`${MAIN}backups/stray/notes.txt`, "mine", "text/plain");
    await put(`${MAIN}backups/odd/manifest.ttl`, "not turtle", "text/plain");
    await expect(backups.list(MAIN)).resolves.toEqual([second, first]);
    await put(`${FOLDER}decks/notes.txt`, "another app's", "text/plain");
    await expect(backups.remove(first)).resolves.toEqual({ keptFolder: FOLDER });
    expect((await fetch(`${FOLDER}meta.ttl`)).status).toBe(404);
    expect((await fetch(`${FOLDER}manifest.ttl`)).status).toBe(404);
    expect((await fetch(`${FOLDER}decks/notes.txt`)).status).toBe(200);
    await expect(backups.remove(second)).resolves.toEqual({ keptFolder: null });
    expect((await fetch(`${MAIN}backups/`)).status).toBe(200);
    await fetch(`${MAIN}backups/stray/notes.txt`, { method: "DELETE" });
    await fetch(`${MAIN}backups/stray/`, { method: "DELETE" });
    await fetch(`${MAIN}backups/odd/manifest.ttl`, { method: "DELETE" });
    await fetch(`${MAIN}backups/odd/`, { method: "DELETE" });
    await fetch(`${FOLDER}decks/notes.txt`, { method: "DELETE" });
    await expect(backups.remove(first)).resolves.toEqual({ keptFolder: null });
    expect((await store.urls()).filter((url) => url.includes("/backups/"))).toEqual([]);
    await expect(backups.list(MAIN)).resolves.toEqual([]);
  });

  it("remove nested folders deepest first, and remove a backup even when its backups/ folder cannot be", async () => {
    const { backups, put, fetch } = await pod();
    await put(`${MAIN}reviews/deep/deck-1.ttl`, `<#s> a <${SM}ReviewState> .`);
    const backup = await backups.create({
      folder: FOLDER,
      of: MAIN,
      createdAt: "2026-10-09T10:00:00.000Z",
      instanceUrl: MAIN,
      documents: [CARDS, `${MAIN}reviews/deep/deck-1.ttl`],
    });
    const deleted: string[] = [];
    const refusing = createSolidDocumentBackups({
      fetch: async (input, init) => {
        if (init?.method === "DELETE" && String(input) === `${MAIN}backups/`) return new Response(null, { status: 500 });
        if (init?.method === "DELETE") deleted.push(String(input));
        return fetch(input, init);
      },
    });
    await expect(refusing.remove(backup)).resolves.toEqual({ keptFolder: null });
    expect(deleted.slice(-4)).toEqual([`${FOLDER}reviews/deep/`, `${FOLDER}reviews/`, `${FOLDER}decks/`, FOLDER]);
  });

  it("keep a copy's own access control, as an instance's documents may have one", async () => {
    const acls = new Map<string, string>();
    const fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const href = String(url);
      const method = init?.method ?? "GET";
      if (method === "HEAD") return new Response(null, { headers: { Link: `<${href.split("/").pop()}.acl>; rel="acl"` } });
      if (method === "PUT") {
        acls.set(href, String(init?.body));
        return new Response(null, { status: 201 });
      }
      if (href === `${CARDS}.acl`) {
        return new Response(`<#owner> <http://www.w3.org/ns/auth/acl#accessTo> <${CARDS}> .`, { headers: { "Content-Type": "text/turtle" } });
      }
      return new Response(`<#se> a <${SM}Card> .`, { headers: { "Content-Type": "text/turtle", ETag: '"e1"' } });
    });
    const backups = createSolidDocumentBackups({ fetch });
    await backups.create({ folder: FOLDER, of: MAIN, createdAt: "2026-10-09T10:00:00.000Z", instanceUrl: MAIN, documents: [CARDS] });
    expect(acls.get(`${FOLDER}decks/deck-1.ttl.acl`)).toContain(`<${FOLDER}decks/deck-1.ttl>`);
  });

  it("let a failed read stop the backup, writing nothing", async () => {
    const fetch = vi.fn(async () => new Response("down", { status: 503 }));
    const backups = createSolidDocumentBackups({ fetch });
    await expect(
      backups.create({ folder: FOLDER, of: MAIN, createdAt: "2026-10-09T10:00:00.000Z", instanceUrl: MAIN, documents: [CARDS] }),
    ).rejects.toThrow();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("read a backup's manifest through the shared reader", async () => {
    const { backups, fetch } = await pod();
    const backup = await backups.create({ folder: FOLDER, of: MAIN, createdAt: "2026-10-09T10:00:00.000Z", instanceUrl: MAIN, documents: [META] });
    await expect(readBackupIn(FOLDER, fetch)).resolves.toEqual(backup);
  });
});
