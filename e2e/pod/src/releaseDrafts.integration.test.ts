// @vitest-environment node
/**
 * The drafts of releases (docs/studio.md#drafts) against a real Solid
 * server, at the size of the library's largest course (17 chapters, 193
 * steps, 466 cards, 1,398 distractors): its next version made a draft in
 * the instance, a document per chapter, within a time budget; opened,
 * knowing what the release published; edited, one write a document;
 * compared with the release it follows, the card it retires retired in a
 * learner's copy too, nothing lost; and edited again when a document changed elsewhere, keeping that change;
 * checked as the instance's check checks it; deleted, documents, folders
 * and link. A draft whose link on the catalogue is raced every time is
 * taken back whole. An instance deleted with a draft in it leaves nothing. The
 * course is read with its text made ASCII: an edit of a draft is a
 * PATCH, which Community Solid Server's in-memory store cuts a document
 * short after when it holds text beyond ASCII (docs/testing.md).
 */
import { describe, expect, inject, it } from "vitest";
import { SHAPE_SOURCES, shapesFetch, SITE } from "@solid-memo/vocab/tooling/sources";
import { createUseCases } from "@solid-memo/application/useCases";
import { draftContainerOf, draftDocuments, draftDocumentUrl } from "@solid-memo/domain/release/draftLayout";
import { routedFetch } from "@solid-memo/solid/routedFetch";
import { createShaclShapeValidator } from "@solid-memo/solid/shaclShapeValidator";
import { createSolidDeckRepository } from "@solid-memo/solid/solidDeckRepository";
import { createSolidInstanceRepository } from "@solid-memo/solid/solidInstanceRepository";
import { createSolidPreferencesRepository } from "@solid-memo/solid/solidPreferencesRepository";
import { createSolidReleaseDraftRepository } from "@solid-memo/solid/solidReleaseDraftRepository";
import { createSolidReviewStateRepository } from "@solid-memo/solid/solidReviewStateRepository";
import { createSolidWebIdDocumentRepository } from "@solid-memo/solid/solidWebIdDocumentRepository";
import { ETAG_OUTLIVES_EDITS, etagMarksEveryEdit, preconditionsOf } from "./serverTraits";

const SERVERS = inject("solidServers");
const COURSE = `${SITE}decks/solid-fundamentals/v1.ttl`;

/** How long each step may take at the course's size, on any server tested. */
const BUDGET = { create: 30_000, open: 10_000, edit: 10_000, diff: 10_000, delete: 20_000 };

/** A page of the app as createAppUseCases wires it, every pod request through `fetch`, the library read from this repository. */
function page(podFetch: typeof globalThis.fetch = fetch) {
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
    repairRepository: undefined as never,
    instanceCopier: undefined as never,
    ruleset: "e2e-rules",
    releaseDraftRepository: createSolidReleaseDraftRepository({
      fetch: podFetch,
      releaseFetch: routedFetch({ origin: SITE, local: shapesFetch, remote: podFetch }),
      checkWrite,
    }),
  });
}

/** A user with a private type index and an instance, in a fresh folder of the server. */
async function seed(server: string) {
  const base = new URL(`drafts-${crypto.randomUUID()}/`, server).href;
  const webId = `${base}profile/card.ttl#me`;
  const typeIndex = `${base}settings/privateTypeIndex.ttl`;
  const put = async (url: string, body: string) => {
    const response = await fetch(url, { method: "PUT", headers: { "content-type": "text/turtle" }, body });
    if (!response.ok) throw new Error(`Seeding ${url}: ${response.status}`);
  };
  await put(`${base}profile/card.ttl`, `<#me> <http://www.w3.org/ns/solid/terms#privateTypeIndex> <${typeIndex}> .`);
  await put(typeIndex, `<> a <http://www.w3.org/ns/solid/terms#TypeIndex>, <http://www.w3.org/ns/solid/terms#UnlistedDocument> .`);
  const session = { webId };
  const instance = await page().createInstance(session, { containerUrl: `${base}main/`, name: "Main", registrationTarget: "private" });
  return { session, instance };
}

/** How long `work` took, in milliseconds, with what it gave. */
async function timed<T>(work: () => Promise<T>): Promise<{ took: number; value: T }> {
  const start = performance.now();
  const value = await work();
  return { took: performance.now() - start, value };
}

describe.each(SERVERS)("drafts of releases on $name", ({ url: server }) => {
  it("drafts, opens, edits and deletes the next version of a 466-card course, each within its budget", { timeout: 300_000 }, async () => {
    const { instance } = await seed(server);
    const useCases = page();

    const created = await timed(() => useCases.createReleaseDraft(instance.url, { kind: "nextVersionOf", url: COURSE }));
    expect(created.took).toBeLessThan(BUDGET.create);
    const summary = created.value!.draft;
    expect(summary).toMatchObject({ name: "solid-fundamentals", version: 2, course: true, readable: true });
    expect(await useCases.listReleaseDrafts(instance.url)).toEqual([summary]);

    const opened = await timed(() => useCases.getReleaseDraft(summary.url));
    expect(opened.took).toBeLessThan(BUDGET.open);
    const draft = opened.value;
    expect(draft.cards).toHaveLength(466);
    expect(draft.chapters).toHaveLength(17);
    expect(draft.root).toMatchObject({ version: "2", prev: COURSE });
    expect(Object.keys(draft.published.ids)).toHaveLength(466 + 17 + 193 + 1398);

    const [card] = draft.cards;
    const edited = await timed(() => useCases.editReleaseDraft(summary.url, [{ kind: "retire", of: "card", id: card!.id }]));
    expect(edited.took).toBeLessThan(BUDGET.edit);
    expect(edited.value.ok).toBe(true);
    expect((await useCases.getReleaseDraft(summary.url)).cards.find((node) => node.id === card!.id)!.data.deprecated).toBe(true);
    // Against the release it follows: one card retired, which a learner's copy retires too, losing nothing.
    const compared = await timed(async () => useCases.diffReleaseDraft(await useCases.getReleaseDraft(summary.url)));
    expect(compared.took).toBeLessThan(BUDGET.diff);
    const diff = compared.value!;
    expect(diff.problems).toEqual([]);
    expect(diff.diff.subjects).toEqual([{ kind: "card", id: card!.id, status: "retired" }]);
    expect(diff.upgrade.plan!.retire.map((one) => one.id)).toEqual([card!.id]);
    expect(diff.upgrade.lost).toEqual({ cards: [], chapters: [] });
    // What an earlier release published is retired, never deleted.
    await expect(useCases.editReleaseDraft(summary.url, [{ kind: "delete", of: "card", id: card!.id }])).resolves.toEqual({
      ok: false,
      refusal: { refused: "published", of: "card", id: card!.id },
    });

    // A document per chapter, besides the release's (and the cards no chapter asks, where there are any).
    const documents = new Set([...draftDocuments(draft).values()].map((document) => draftDocumentUrl(summary.url, document)));
    expect(documents.size).toBeGreaterThanOrEqual(18);
    const check = await useCases.validateInstance(instance.url);
    expect(check.documents.filter((document) => document.url.includes("/drafts/")).map((document) => document.url).sort()).toEqual([...documents].sort());
    expect(check.conforms).toBe(true);

    const deleted = await timed(() => useCases.deleteReleaseDraft(summary));
    expect(deleted.took).toBeLessThan(BUDGET.delete);
    expect(await useCases.listReleaseDrafts(instance.url)).toEqual([]);
    expect((await fetch(draftContainerOf(summary.url), { method: "HEAD" })).status).toBe(404);
  });

  it("makes an edit again on the draft as it is when a document changed elsewhere since it was read, keeping that change", { timeout: 120_000 }, async (context) => {
    if (!(await preconditionsOf(server)).edits) context.skip("this server ignores If-Match, so a change made elsewhere cannot be detected");
    // The change is made in the same second as the read, which such a server's ETag does not tell apart.
    if (!(await etagMarksEveryEdit(server))) context.skip(ETAG_OUTLIVES_EDITS);
    const { instance } = await seed(server);
    const made = await page().createReleaseDraft(instance.url, { kind: "blankCourse", title: { en: "Solid" } });
    const draftUrl = made!.draft.url;
    await page().editReleaseDraft(draftUrl, [
      { kind: "addChapter", id: "ch-a", text: { title: { en: "A" } } },
      { kind: "addStep", id: "ch-a-1", chapter: "ch-a" },
      { kind: "addCard", id: "q-a-1a", card: { front: { en: "Q" }, back: { en: "A" } } },
      { kind: "addQuestion", card: "q-a-1a", place: { kind: "step", step: "ch-a-1" } },
    ]);
    const chapter = `${draftContainerOf(draftUrl)}chapter-ch-a.ttl`;
    // Another tab writes the chapter's document just as this edit is about to.
    let raced = false;
    const racing: typeof globalThis.fetch = async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      if (!raced && url === chapter && init?.method === "PUT") {
        raced = true;
        await page().editReleaseDraft(draftUrl, [{ kind: "editStep", id: "ch-a-1", text: { theory: { en: "Written elsewhere" } } }]);
      }
      return fetch(input, init);
    };
    const edit = await page(racing).editReleaseDraft(draftUrl, [{ kind: "editCard", id: "q-a-1a", card: { front: { en: "Q?" }, back: { en: "A" } } }]);
    expect(edit.ok).toBe(true);
    expect(raced).toBe(true);
    const read = await page().getReleaseDraft(draftUrl);
    expect(read.steps[0]!.data.theory).toEqual({ en: "Written elsewhere" });
    expect(read.cards[0]!.data.front).toEqual({ en: "Q?" });
  });

  it("leaves no draft behind when its link on the catalogue keeps being raced, nor takes another name", { timeout: 120_000 }, async (context) => {
    if (!(await preconditionsOf(server)).edits) context.skip("this server ignores If-Match, so a change made elsewhere cannot be detected");
    if (!(await etagMarksEveryEdit(server))) context.skip(ETAG_OUTLIVES_EDITS);
    const { instance } = await seed(server);
    const catalog = `${instance.url}catalog.ttl`;
    // Another tab makes a draft of its own just before each write of the catalogue: every attempt to link this one is refused.
    let raced = 0;
    const racing: typeof globalThis.fetch = async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      const method = init?.method ?? "GET";
      if (url === catalog && method !== "GET" && method !== "HEAD") {
        raced++;
        await page().createReleaseDraft(instance.url, { kind: "blankDeck", title: { en: `Other ${raced}` } });
      }
      return fetch(input, init);
    };
    await expect(page(racing).createReleaseDraft(instance.url, { kind: "blankCourse", title: { en: "Solid" } })).rejects.toMatchObject({
      code: "changedElsewhere",
    });
    expect(raced).toBe(3);
    // The other tab's drafts alone: none under this one's name, nor the next.
    const drafts = await page().listReleaseDrafts(instance.url);
    expect(drafts.map((draft) => draft.name).sort()).toEqual(["other-1", "other-2", "other-3"]);
    for (const name of ["solid", "solid-2"]) {
      expect((await fetch(`${instance.url}drafts/${name}/v1/release.ttl`, { method: "HEAD" })).status).toBe(404);
    }
    expect((await page().validateInstance(instance.url)).conforms).toBe(true);
  });

  it("leaves nothing of an instance deleted with a draft in it", { timeout: 120_000 }, async () => {
    const { session, instance } = await seed(server);
    const useCases = page();
    await useCases.createReleaseDraft(instance.url, { kind: "blankCourse", title: { en: "Solid" } });
    await useCases.createReleaseDraft(instance.url, { kind: "blankDeck", title: { en: "Words" } });
    await expect(useCases.deleteInstance(session, instance)).resolves.toEqual({ keptFolder: null, keptReleases: false });
    expect((await fetch(instance.url, { method: "HEAD" })).status).toBe(404);
  });
});
