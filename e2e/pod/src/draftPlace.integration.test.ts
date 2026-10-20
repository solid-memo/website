// @vitest-environment node

// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * Where a draft's documents are, against a real Solid server
 * (docs/data-model.md, Drafts): a chapter's document is named after the
 * chapter's id, so a draft whose documents name a subject by an id no
 * draft can have (DRAFT_ID) is not opened, and a change that would give
 * one such an id is refused. Neither writes anything, inside the draft's
 * folder or outside it. Node's fetch resolves an address as a browser's
 * does before the request leaves, so the server sees where each request
 * really goes.
 */
import { describe, expect, inject, it } from "vitest";
import { draftContainerOf, draftUrlOf } from "@solid-memo/domain/release/draftLayout";
import type { ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { rebaseDraft } from "@solid-memo/domain/release/releaseToDraft";
import { courseDraft } from "@solid-memo/domain/testing/releaseDraft";
import { createSolidReleaseDraftRepository } from "@solid-memo/solid/solidReleaseDraftRepository";

const SERVERS = inject("solidServers");

/** An id that, as a chapter's document, names one outside the draft's folder and the instance. */
const ESCAPING_ID = "a/../../../../../elsewhere/x";

async function put(url: string, body: string): Promise<void> {
  const response = await fetch(url, {
    method: "PUT",
    headers: { "content-type": "text/turtle" },
    body,
  });
  if (!response.ok) throw new Error(`Seeding ${url}: ${response.status}`);
}

async function text(url: string): Promise<string> {
  return (await fetch(url, { headers: { accept: "text/turtle" } })).text();
}

/** The draft with its chapter `ch-a` named `id` instead. */
function chapterNamed(draft: ReleaseDraft, id: string): ReleaseDraft {
  return {
    ...draft,
    chapters: draft.chapters.map((node) => (node.id === "ch-a" ? { ...node, id } : node)),
  };
}

/** An instance with a catalog and the course fixture as its draft, every write recorded where it went. */
async function seed(server: string) {
  const base = new URL(`draft-place-${crypto.randomUUID()}/`, server).href;
  const instance = `${base}main/`;
  await put(`${instance}catalog.ttl`, `<#catalog> a <http://www.w3.org/ns/dcat#Catalog> .`);
  const writes: string[] = [];
  const recording = (async (input, init) => {
    const response = await fetch(input, init);
    const method = init?.method ?? "GET";
    if (method !== "GET" && method !== "HEAD") writes.push(`${method} ${response.url}`);
    return response;
  }) as typeof globalThis.fetch;
  const repository = createSolidReleaseDraftRepository({ fetch: recording });
  const draftUrl = draftUrlOf(instance, "solid", 1);
  await repository.create(instance, rebaseDraft(courseDraft(), draftUrl));
  const escaped = new URL(`${draftContainerOf(draftUrl)}chapter-${ESCAPING_ID}.ttl`).href;
  expect(escaped.startsWith(instance)).toBe(false);
  expect(escaped.startsWith(base)).toBe(true);
  writes.length = 0;
  return { repository, draftUrl, escaped, writes };
}

describe.each(SERVERS)("where a draft's documents are on $name", ({ url: server }) => {
  it("does not open a draft whose documents name a chapter by an id no draft can have", {
    timeout: 60_000,
  }, async () => {
    const { repository, draftUrl, escaped, writes } = await seed(server);
    const container = draftContainerOf(draftUrl);
    for (const name of ["release.ttl", "chapter-ch-a.ttl", "chapter-ch-b.ttl", "cards.ttl"]) {
      const url = `${container}${name}`;
      await put(url, (await text(url)).replaceAll("#ch-a>", `#${ESCAPING_ID}>`));
    }
    await expect(repository.read(draftUrl)).rejects.toMatchObject({
      code: "draftIdUnsupported",
      vars: { id: ESCAPING_ID },
    });
    expect(writes).toEqual([]);
    expect((await fetch(escaped)).status).toBe(404);
  });

  it("refuses a change that names a chapter by an id no draft can have, writing nothing", {
    timeout: 60_000,
  }, async () => {
    const { repository, draftUrl, escaped, writes } = await seed(server);
    const { draft, version } = await repository.read(draftUrl);
    await expect(
      repository.applyChanges(draft, chapterNamed(draft, ESCAPING_ID), version),
    ).rejects.toMatchObject({ code: "draftIdUnsupported" });
    expect(writes).toEqual([]);
    expect((await fetch(escaped)).status).toBe(404);
  });
});
