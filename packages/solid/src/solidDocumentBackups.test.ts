import { describe, expect, it, vi } from "vitest";
import type { BackupEntry } from "@solid-memo/domain/backup";
import { createLocalPod } from "./localPod";
import { createMemoryResourceStore } from "./memoryResourceStore";
import { createSolidDocumentBackups } from "./solidDocumentBackups";
import { readBackupIn } from "./backupData";
import { readDataset } from "./datasets";

const POD = "https://pod.example/";
const MAIN = `${POD}solid-memo/main/`;
const FOLDER = `${MAIN}backups/20261009T100000Z-0f3a1b2c/`;
const STAGING = `${FOLDER}staging/`;
const CARDS = `${MAIN}decks/deck-1.ttl`;
const META = `${MAIN}meta.ttl`;
const CATALOG = `${MAIN}catalog.ttl`;
const OUTSIDE = `${POD}elsewhere/cards.ttl`;
const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";
const NOW = "2026-10-09T10:00:00.000Z";

/**
 * A pod kept in memory, as the guest's is: Turtle kept as its statements,
 * served as N-Triples lines in the order they were written, and any other
 * file kept and served byte for byte.
 */
async function pod() {
  let etags = 0;
  const store = createMemoryResourceStore();
  const fetch = createLocalPod({ root: POD, store, newEtag: () => `"e${++etags}"` });
  const put = (url: string, body: BodyInit, type = "text/turtle") => fetch(url, { method: "PUT", headers: { "Content-Type": type }, body });
  await put(CARDS, `<#se> a <${SM}Card> ; <${SM}front> "Sweden" ; <${SM}back> "Stockholm" ; <${SM}image> <../pics/se.png> .`);
  await put(META, `<#it> a <${SM}Instance> ; <http://purl.org/dc/terms/title> "Main" .`);
  await put(OUTSIDE, `<#no> a <${SM}Card> ; <${SM}front> "Norway" .`);
  const checkWrite = vi.fn(async () => undefined);
  const backups = createSolidDocumentBackups({ fetch, checkWrite });
  const text = async (url: string) => (await fetch(url)).text();
  const create = (documents: string[], more: { release?: string; folder?: string } = {}) =>
    backups.create({ folder: FOLDER, of: MAIN, createdAt: NOW, instanceUrl: MAIN, documents, ...more });
  return { fetch, store, put, backups, checkWrite, text, create };
}

describe("the document backups", () => {
  it("keep each document's bytes, as the pod served them, in a file of the folder no pod takes for RDF, named in a manifest written first", async () => {
    const { backups, checkWrite, text, fetch, store } = await pod();
    const before = { meta: await text(META), cards: await text(CARDS) };
    const done = vi.fn();
    const backup = await backups.create(
      { folder: FOLDER, of: MAIN, createdAt: NOW, instanceUrl: MAIN, documents: [META, CARDS, CATALOG, OUTSIDE] },
      done,
    );
    const versionOf = async (url: string) => (await fetch(url)).headers.get("ETag")!;
    expect(backup).toEqual({
      url: FOLDER,
      of: MAIN,
      createdAt: NOW,
      entries: [
        { document: META, copy: `${FOLDER}meta.ttl.orig`, contentType: "text/turtle", versionBackedUp: await versionOf(META) },
        { document: CARDS, copy: `${FOLDER}decks/deck-1.ttl.orig`, contentType: "text/turtle", versionBackedUp: await versionOf(CARDS) },
        { document: CATALOG },
        { document: OUTSIDE, copy: `${FOLDER}elsewhere/4.orig`, contentType: "text/turtle", versionBackedUp: await versionOf(OUTSIDE) },
      ],
    });
    expect(done).toHaveBeenCalledTimes(4);
    // The bytes as they were, kept as no RDF.
    const kept = await fetch(`${FOLDER}decks/deck-1.ttl.orig`);
    expect(kept.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(await kept.text()).toBe(before.cards);
    expect(await text(`${FOLDER}meta.ttl.orig`)).toBe(before.meta);
    expect((await store.get(`${FOLDER}decks/deck-1.ttl.orig`))?.kind).toBe("file");
    expect(checkWrite).toHaveBeenCalledWith(expect.anything(), [
      `${FOLDER}manifest.ttl#it`,
      ...[1, 2, 3, 4].map((n) => `${FOLDER}manifest.ttl#entry-${n}`),
    ]);
    await expect(backups.read(FOLDER)).resolves.toEqual(backup);
    await expect(backups.list(MAIN)).resolves.toEqual([backup]);
  });

  it("name the release a deck was at in a library upgrade's backup", async () => {
    const { backups, create } = await pod();
    const release = "https://solid-memo.com/decks/capitals/v1.ttl";
    const backup = await create([CARDS], { release });
    expect(backup.release).toBe(release);
    await expect(backups.read(FOLDER)).resolves.toEqual(backup);
  });

  it("never write a backup, or a document's bytes, where something is", async () => {
    const { create, put } = await pod();
    await create([META]);
    await expect(create([META])).rejects.toMatchObject({ code: "createdElsewhere" });
    await put(`${MAIN}backups/other/meta.ttl.orig`, "someone's", "text/plain");
    await expect(create([META], { folder: `${MAIN}backups/other/` })).rejects.toMatchObject({ code: "createdElsewhere" });
  });

  it("stop when the pod does not keep the bytes as written, or refuses them", async () => {
    const { fetch } = await pod();
    const altering = createSolidDocumentBackups({
      fetch: async (input, init) => {
        const response = await fetch(input, init);
        return String(input).endsWith(".orig") && init?.method === undefined ? new Response(`${await response.text()} `) : response;
      },
    });
    await expect(
      altering.create({ folder: FOLDER, of: MAIN, createdAt: NOW, instanceUrl: MAIN, documents: [META, CARDS] }),
    ).rejects.toMatchObject({ code: "backupNotExact", vars: { url: META, copy: `${FOLDER}meta.ttl.orig` } });
    const losing = createSolidDocumentBackups({
      fetch: async (input, init) =>
        String(input).endsWith(".orig") && init?.method === undefined ? new Response(null, { status: 404 }) : fetch(input, init),
    });
    await expect(
      losing.create({ folder: `${MAIN}backups/b/`, of: MAIN, createdAt: NOW, instanceUrl: MAIN, documents: [META] }),
    ).rejects.toMatchObject({ code: "backupNotExact" });
    const refusing = createSolidDocumentBackups({
      fetch: async (input, init) =>
        String(input).endsWith(".orig") && init?.method === "PUT" ? new Response(null, { status: 507 }) : fetch(input, init),
    });
    await expect(
      refusing.create({ folder: `${MAIN}backups/c/`, of: MAIN, createdAt: NOW, instanceUrl: MAIN, documents: [META] }),
    ).rejects.toMatchObject({ code: "addFailed", vars: { url: `${MAIN}backups/c/meta.ttl.orig`, status: 507 } });
  });

  it("let a failed read stop the backup, writing nothing", async () => {
    const fetch = vi.fn(async () => new Response("down", { status: 503 }));
    const backups = createSolidDocumentBackups({ fetch });
    await expect(
      backups.create({ folder: FOLDER, of: MAIN, createdAt: NOW, instanceUrl: MAIN, documents: [CARDS] }),
    ).rejects.toMatchObject({ code: "cannotCheck" });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("give a document's bytes, and its working copy, the access the document has, as their own", async () => {
    const acls = new Map<string, string>();
    const fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const href = String(url);
      const method = init?.method ?? "GET";
      if (method === "HEAD") return new Response(null, { headers: { Link: `<${href.split("/").pop()}.acl>; rel="acl"` } });
      if (method === "PUT" && href.endsWith(".acl")) acls.set(href, String(init?.body));
      if (method === "PUT") return new Response(null, { status: 201 });
      if (href === `${CARDS}.acl`) {
        return new Response(`<#owner> <http://www.w3.org/ns/auth/acl#accessTo> <${CARDS}> .`, { headers: { "Content-Type": "text/turtle" } });
      }
      return new Response(`<#se> a <${SM}Card> .`, { headers: { "Content-Type": "text/turtle", ETag: '"e1"' } });
    });
    const backups = createSolidDocumentBackups({ fetch });
    const backup = await backups.create({ folder: FOLDER, of: MAIN, createdAt: NOW, instanceUrl: MAIN, documents: [CARDS] });
    expect(acls.get(`${FOLDER}decks/deck-1.ttl.orig.acl`)).toContain(`<${FOLDER}decks/deck-1.ttl.orig>`);
    await backups.stage(backup);
    expect(acls.get(`${STAGING}decks/deck-1.ttl.acl`)).toContain(`<${STAGING}decks/deck-1.ttl>`);
  });

  describe("the working copy", () => {
    it("is each document as backed up, every IRI of the instance (and of a document outside it) moved into staging/", async () => {
      const { create, backups, text, put, fetch } = await pod();
      const backup = await create([CARDS, CATALOG, OUTSIDE]);
      // Changed since: the working copy is of the document as backed up.
      await put(CARDS, `<#se> a <${SM}Card> ; <${SM}front> "Changed" .`);
      const staged = vi.fn();
      await backups.stage(backup, staged);
      expect(staged).toHaveBeenCalledTimes(3);
      const cards = await text(`${STAGING}decks/deck-1.ttl`);
      expect(cards).toContain(`<${STAGING}decks/deck-1.ttl#se> <${SM}front> "Sweden"`);
      // A relative IRI is read where the document is, then moved with the rest.
      expect(cards).toContain(`<${SM}image> <${STAGING}pics/se.png>`);
      expect(await text(`${STAGING}elsewhere/3.ttl`)).toContain(`<${STAGING}elsewhere/3.ttl#no> <${SM}front> "Norway"`);
      // A document there was none of has no working copy until the update writes one.
      expect((await fetch(`${STAGING}catalog.ttl`)).status).toBe(404);
      // Written only where nothing is.
      await expect(backups.stage(backup)).rejects.toMatchObject({ code: "createdElsewhere" });
    });

    it("cannot be made of bytes that are gone", async () => {
      const { create, backups, fetch } = await pod();
      const backup = await create([CARDS]);
      await fetch(`${FOLDER}decks/deck-1.ttl.orig`, { method: "DELETE" });
      await expect(backups.stage(backup)).rejects.toMatchObject({
        code: "backupFileGone",
        vars: { url: `${FOLDER}decks/deck-1.ttl.orig`, document: CARDS },
      });
    });

    it("is what a document is compared with, statement for statement, its IRIs read as the instance's", async () => {
      const { create, backups, put, fetch } = await pod();
      const backup = await create([CARDS, CATALOG]);
      const [cards, catalog] = backup.entries as [BackupEntry, BackupEntry];
      // No working copy yet: nothing to compare with.
      await expect(backups.sameAsStaged(backup, cards)).resolves.toBeNull();
      await backups.stage(backup);
      await expect(backups.sameAsStaged(backup, cards)).resolves.toBe(true);
      // Written alike in both, however each is written.
      await put(`${STAGING}decks/deck-1.ttl`, `<${STAGING}decks/deck-1.ttl#se> <${SM}front> "Sverige"@SV ; <${SM}n> 2.50 .`);
      await put(CARDS, `<#se> <${SM}n> 2.5 ; <${SM}front> "Sverige"@sv .`);
      await expect(backups.sameAsStaged(backup, cards)).resolves.toBe(true);
      await put(CARDS, `<#se> <${SM}front> "Norge"@sv ; <${SM}n> 2.5 .`);
      await expect(backups.sameAsStaged(backup, cards)).resolves.toBe(false);
      await fetch(CARDS, { method: "DELETE" });
      await expect(backups.sameAsStaged(backup, cards)).resolves.toBe(false);
      // One the update was to create, written in the copy and in place.
      await put(`${STAGING}catalog.ttl`, `<${STAGING}catalog.ttl#catalog> a <http://www.w3.org/ns/dcat#Catalog> .`);
      await put(CATALOG, `<#catalog> a <http://www.w3.org/ns/dcat#Catalog> .`);
      await expect(backups.sameAsStaged(backup, catalog)).resolves.toBe(true);
    });

    it("is deleted whole, and with its backup", async () => {
      const { create, backups, fetch, store } = await pod();
      const backup = await create([CARDS, META]);
      await backups.stage(backup);
      await backups.unstage(backup);
      expect((await fetch(STAGING)).status).toBe(404);
      expect((await fetch(`${FOLDER}decks/deck-1.ttl.orig`)).status).toBe(200);
      await backups.stage(backup);
      await expect(backups.remove(backup)).resolves.toEqual({ keptFolder: null });
      expect((await store.urls()).filter((url) => url.includes("/backups/"))).toEqual([]);
    });
  });

  describe("a document's state", () => {
    it("is as backed up while its bytes are those the backup holds, whatever its version says", async () => {
      const { create, backups, put, fetch } = await pod();
      const backup = await create([CARDS, CATALOG]);
      const [cards, catalog] = backup.entries as [BackupEntry, BackupEntry];
      await expect(backups.stateOf(cards)).resolves.toEqual({ version: cards.versionBackedUp, asBackedUp: true });
      const bytes = new Uint8Array(await (await fetch(CARDS)).arrayBuffer());
      await put(CARDS, `<#se> a <${SM}Card> .`);
      await expect(backups.stateOf(cards)).resolves.toEqual({ version: expect.stringMatching(/^"e\d+"$/), asBackedUp: false });
      // Written again as it was, at a new version.
      await put(CARDS, bytes);
      const again = await backups.stateOf(cards);
      expect(again.asBackedUp).toBe(true);
      expect(again.version).not.toBe(cards.versionBackedUp);
      await fetch(CARDS, { method: "DELETE" });
      await expect(backups.stateOf(cards)).resolves.toEqual({ version: null, asBackedUp: false });
      // One there was none of is as backed up while there is none still.
      await expect(backups.stateOf(catalog)).resolves.toEqual({ version: null, asBackedUp: true });
      await put(CATALOG, `<#catalog> a <http://www.w3.org/ns/dcat#Catalog> .`);
      await expect(backups.stateOf(catalog)).resolves.toEqual({ version: expect.stringMatching(/^"e\d+"$/), asBackedUp: false });
    });

    it("is told by its version where the backup lost its bytes", async () => {
      const { create, backups, put, fetch } = await pod();
      const backup = await create([CARDS]);
      const [cards] = backup.entries as [BackupEntry];
      await fetch(`${FOLDER}decks/deck-1.ttl.orig`, { method: "DELETE" });
      await expect(backups.stateOf(cards)).resolves.toEqual({ version: cards.versionBackedUp, asBackedUp: true });
      await put(CARDS, `<#se> a <${SM}Card> .`);
      await expect(backups.stateOf(cards)).resolves.toMatchObject({ asBackedUp: false });
    });

    it("is read whole once backed up, or checked: what the app read of the document before is forgotten", async () => {
      const { fetch: local } = await pod();
      const asked: (string | null)[] = [];
      const fetch: typeof globalThis.fetch = (input, init) => {
        if ((init?.method ?? "GET") === "GET" && String(input) === CARDS) asked.push(new Headers(init?.headers).get("If-None-Match"));
        return local(input, init);
      };
      const backups = createSolidDocumentBackups({ fetch });
      await readDataset(CARDS, fetch);
      await readDataset(CARDS, fetch);
      const backup = await backups.create({ folder: FOLDER, of: MAIN, createdAt: NOW, instanceUrl: MAIN, documents: [CARDS] });
      await readDataset(CARDS, fetch);
      await backups.stateOf(backup.entries[0]!);
      await readDataset(CARDS, fetch);
      // A server whose ETag outlives an edit made in the same second would answer "unchanged" to a read
      // asked with the ETag read before, which the update's writes are made from: they ask without.
      expect(asked).toEqual([null, '"e1"', null, null, null, null]);
    });
  });

  it("note the version an update left a document at, and say so when the backup is gone", async () => {
    const { backups, fetch, create } = await pod();
    const backup = await create([META, CARDS]);
    await backups.noteUpdated(backup, CARDS, '"later"');
    expect((await backups.read(FOLDER))!.entries[1]).toEqual({ ...backup.entries[1], versionUpdated: '"later"' });
    await expect(backups.noteUpdated(backup, `${MAIN}other.ttl`, '"x"')).rejects.toMatchObject({ code: "backupGone" });
    await fetch(`${FOLDER}manifest.ttl`, { method: "DELETE" });
    await expect(backups.noteUpdated(backup, CARDS, '"later"')).rejects.toMatchObject({ code: "backupGone" });
    await expect(backups.read(FOLDER)).resolves.toBeNull();
  });

  describe("putting a document back", () => {
    it("writes its bytes while it is at the version given, and deletes one the update created", async () => {
      const { backups, put, text, create } = await pod();
      const before = await text(CARDS);
      const backup = await create([CARDS, CATALOG]);
      const [cards, catalog] = backup.entries as [BackupEntry, BackupEntry];
      await put(CARDS, `<#se> a <${SM}Card> ; <${SM}front> "Sweden" ; <${SM}formatVersion> 5 .`);
      await put(CATALOG, `<#catalog> a <http://www.w3.org/ns/dcat#Catalog> .`);
      const updated = (await backups.versionOf(CARDS))!;
      await expect(backups.putBack(cards, '"stale"')).rejects.toMatchObject({ code: "changedElsewhere" });
      await backups.putBack(cards, updated);
      expect(await text(CARDS)).toBe(before);
      await backups.putBack(catalog, (await backups.versionOf(CATALOG))!);
      await expect(backups.versionOf(CATALOG)).resolves.toBeNull();
    });

    it("sends the bytes and the Content-Type as kept, If-Match the version, and refuses a pod that does not give them back", async () => {
      const sent: { method: string; headers: Headers; body: unknown }[] = [];
      const bytes = new Uint8Array([0x23, 0x20, 0xff, 0x0a]);
      let served = bytes;
      const fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        sent.push({ method: init?.method ?? "GET", headers: new Headers(init?.headers), body: init?.body });
        if (init?.method === "PUT") return new Response(null, { status: 205 });
        return new Response(String(url).endsWith(".orig") ? bytes : served, { headers: { ETag: '"e2"' } });
      });
      const backups = createSolidDocumentBackups({ fetch });
      const entry = { document: CARDS, copy: `${FOLDER}decks/deck-1.ttl.orig`, contentType: "text/turtle; charset=utf-8" };
      await backups.putBack(entry, '"e2"');
      const put = sent.find((request) => request.method === "PUT")!;
      expect(put.headers.get("If-Match")).toBe('"e2"');
      expect(put.headers.get("Content-Type")).toBe("text/turtle; charset=utf-8");
      expect(put.body).toEqual(bytes);
      served = new Uint8Array([0x23]);
      await expect(backups.putBack(entry, '"e2"')).rejects.toMatchObject({ code: "restoredNotExact", vars: { url: CARDS, copy: entry.copy } });
      // Kept without its Content-Type, the bytes go back as Turtle.
      served = bytes;
      await backups.putBack({ document: CARDS, copy: entry.copy }, '"e2"');
      expect(sent.filter((request) => request.method === "PUT").at(-1)!.headers.get("Content-Type")).toBe("text/turtle");
    });

    it("says it is not put back when the pod serves nothing there after", async () => {
      const fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) =>
        init?.method === "PUT"
          ? new Response(null, { status: 201 })
          : String(url).endsWith(".orig")
            ? new Response("x")
            : new Response(null, { status: 404 }),
      );
      const backups = createSolidDocumentBackups({ fetch });
      await expect(backups.putBack({ document: CARDS, copy: `${FOLDER}decks/deck-1.ttl.orig` }, '"e1"')).rejects.toMatchObject({
        code: "restoredNotExact",
      });
    });

    it("checks a version that is no ETag before putting a document back, and reports a write the pod refuses", async () => {
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
      expect(fetch.mock.calls.at(-1)![1]!.method).toBe("DELETE");
      answers.push(new Response(null, { status: 412 }));
      await expect(backups.putBack(entry, '"e1"')).rejects.toMatchObject({ code: "changedElsewhere" });
      answers.push(new Response(null, { status: 500 }));
      await expect(backups.putBack(entry, '"e1"')).rejects.toMatchObject({ code: "addFailed" });
    });

    it("cannot put back bytes that are gone", async () => {
      const { create, backups, fetch } = await pod();
      const backup = await create([CARDS]);
      await fetch(`${FOLDER}decks/deck-1.ttl.orig`, { method: "DELETE" });
      await expect(backups.putBack(backup.entries[0]!, backup.entries[0]!.versionBackedUp!)).rejects.toMatchObject({
        code: "backupFileGone",
      });
    });
  });

  it("remove what a backup holds and its folders, the backups folder too once empty, keeping another app's file", async () => {
    const { backups, put, fetch, store, create } = await pod();
    const first = await create([META, CARDS]);
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
    expect((await fetch(`${FOLDER}meta.ttl.orig`)).status).toBe(404);
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
    const { put, fetch, create } = await pod();
    await put(`${MAIN}reviews/deep/deck-1.ttl`, `<#s> a <${SM}ReviewState> .`);
    const backup = await create([CARDS, `${MAIN}reviews/deep/deck-1.ttl`]);
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

  it("hold no backup, and list none, whose manifest names a file outside its folder, as anyone who may write in the instance could leave one", async () => {
    const { backups, put, fetch } = await pod();
    const planted = `${MAIN}backups/20261009T110000Z-deadbeef/`;
    await put(
      `${planted}manifest.ttl`,
      `@prefix sm: <${SM}> . @prefix dcterms: <http://purl.org/dc/terms/> . @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
<#it> a sm:Backup ; sm:formatVersion 1 ; sm:backupOf <${MAIN}> ; dcterms:created "2026-10-09T11:00:00Z"^^xsd:dateTime .
<#entry-1> a sm:BackupEntry ; sm:formatVersion 1 ; sm:backedUpDocument <${META}> ;
    sm:backupCopy <${planted}../../decks/deck-1.ttl> ; sm:contentTypeBackedUp "text/turtle" ; sm:versionBackedUp "x" .`,
    );
    await expect(backups.read(planted)).resolves.toBeNull();
    await expect(backups.list(MAIN)).resolves.toEqual([]);
    expect((await fetch(CARDS)).status).toBe(200);
  });

  it("read a backup's manifest through the shared reader", async () => {
    const { fetch, create } = await pod();
    const backup = await create([META]);
    await expect(readBackupIn(FOLDER, fetch)).resolves.toEqual(backup);
  });
});
