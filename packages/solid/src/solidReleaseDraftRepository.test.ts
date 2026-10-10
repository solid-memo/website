import { describe, expect, it, vi } from "vitest";
import { draftUrlOf } from "@solid-memo/domain/release/draftLayout";
import {
  applyDraftChanges,
  blankDraft,
  isRefusal,
  type DraftChange,
  type DraftNode,
  type ReleaseDraft,
} from "@solid-memo/domain/release/releaseDraft";
import { rebaseDraft } from "@solid-memo/domain/release/releaseToDraft";
import { nextVersionDraft } from "@solid-memo/domain/release/releaseVersion";
import { courseDraft, NOW } from "@solid-memo/domain/testing/releaseDraft";
import { DECKS, draftPod, INSTANCE, quadsOfTurtle, roundTrip, siteFetch } from "./testing/releaseDrafts";
import { createSolidReleaseDraftRepository, deleteDraftResources, draftDocumentsIn } from "./solidReleaseDraftRepository";

const DRAFT = draftUrlOf(INSTANCE, "solid", 1);
const CONTAINER = `${INSTANCE}drafts/solid/v1/`;
const CHAPTER_A = `${CONTAINER}chapter-ch-a.ttl`;
const CHAPTER_B = `${CONTAINER}chapter-ch-b.ttl`;
const CARDS = `${CONTAINER}cards.ttl`;
const CATALOG = `${INSTANCE}catalog.ttl`;
const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";

/** The course fixture as a draft of the instance. */
const course = (): ReleaseDraft => rebaseDraft(courseDraft(), DRAFT);

/** The draft with the changes made, which must be. */
function changed(draft: ReleaseDraft, ...changes: DraftChange[]): ReleaseDraft {
  const result = applyDraftChanges(draft, changes);
  if (isRefusal(result)) throw new Error(JSON.stringify(result));
  return result;
}

/** A draft whatever order its subjects were read in. */
function sorted(draft: ReleaseDraft) {
  const by = <T>(nodes: readonly DraftNode<T>[]) => [...nodes].sort((a, b) => (a.id < b.id ? -1 : 1));
  return {
    ...draft,
    agents: by(draft.agents),
    distributions: by(draft.distributions),
    chapters: by(draft.chapters),
    steps: by(draft.steps),
    cards: by(draft.cards),
    distractors: by(draft.distractors),
    triples: [...draft.triples].sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1)),
  };
}

/** The writes made since `from`, as method and URL with the precondition sent. */
function writes(pod: Awaited<ReturnType<typeof draftPod>>, from = 0) {
  return pod.requests
    .slice(from)
    .filter((request) => request.method !== "GET" && request.method !== "HEAD")
    .map((request) => `${request.method} ${request.url}${request.ifMatch !== null ? " If-Match" : ""}${request.ifNoneMatch === "*" ? " If-None-Match" : ""}`);
}

describe("create", () => {
  it("writes each document only where none is, the release document first, then links the draft from the catalogue", async () => {
    const pod = await draftPod({ checked: true });
    const summary = await pod.repository.create(INSTANCE, course());
    expect(summary).toEqual({ url: DRAFT, instanceUrl: INSTANCE, name: "solid", version: 1, readable: true, title: { en: "Solid" }, course: true });
    expect(writes(pod)).toEqual([
      `PUT ${DRAFT} If-None-Match`,
      `PUT ${CHAPTER_A} If-None-Match`,
      `PUT ${CHAPTER_B} If-None-Match`,
      `PUT ${CARDS} If-None-Match`,
      `PATCH ${CATALOG} If-Match`,
    ]);
    await expect(pod.repository.list(INSTANCE)).resolves.toEqual([summary]);
    await expect(pod.repository.documents(INSTANCE)).resolves.toEqual([CARDS, CHAPTER_A, CHAPTER_B, DRAFT]);
    const { draft } = await pod.repository.read(DRAFT);
    expect(sorted(draft)).toEqual(sorted(course()));
  });

  it("keeps a chapter with its steps, questions and their distractors, and the cards asked nowhere in the cards document", async () => {
    const pod = await draftPod();
    await pod.repository.create(INSTANCE, course());
    expect(await pod.text(CHAPTER_A)).toContain(`<${CHAPTER_A}#q-a-1a-d2>`);
    expect(await pod.text(CARDS)).toContain(`<${CARDS}#q-loose>`);
    expect(await pod.text(CHAPTER_A)).toContain(`<${DRAFT}>`);
  });

  it("refuses an instance with no catalogue, writing nothing", async () => {
    const pod = await draftPod();
    await pod.put(CATALOG, `<#other> a <http://www.w3.org/ns/dcat#Catalog> .`);
    await expect(pod.repository.create(INSTANCE, course())).rejects.toMatchObject({ code: "noCatalogToUpdate" });
    expect(writes(pod)).toEqual([]);
  });

  it("stops at a draft's place taken, having written nothing", async () => {
    const pod = await draftPod();
    await pod.put(DRAFT, `<#x> <${SM}y> "z" .`);
    await expect(pod.repository.create(INSTANCE, course())).rejects.toMatchObject({ code: "createdElsewhere" });
    expect(writes(pod)).toEqual([`PUT ${DRAFT} If-None-Match`]);
  });

  it("links the draft again when the catalogue changed meanwhile, a few times, and once only", async () => {
    const pod = await draftPod();
    pod.failNext("PATCH", CATALOG, 412);
    await pod.repository.create(INSTANCE, blankDraft({ url: DRAFT, course: false, title: { en: "A" }, now: NOW }));
    await expect(pod.repository.list(INSTANCE)).resolves.toHaveLength(1);
    const again = draftUrlOf(INSTANCE, "b", 1);
    for (let i = 0; i < 3; i++) pod.failNext("PATCH", CATALOG, 412);
    await expect(pod.repository.create(INSTANCE, blankDraft({ url: again, course: false, title: {}, now: NOW }))).rejects.toMatchObject({
      code: "changedElsewhere",
    });
    const text = await pod.text(CATALOG);
    expect(text.match(/releaseDraft/g)).toHaveLength(1);
    // The draft no catalogue links is taken back, its containers with it: nothing is left that nothing would delete.
    expect((await pod.urls()).filter((url) => url.startsWith(`${INSTANCE}drafts/b/`))).toEqual([]);
  });

  it("takes back what it wrote when a later document's place is taken, keeping that document", async () => {
    const pod = await draftPod();
    await pod.put(CHAPTER_B, `<#x> <${SM}y> "z" .`);
    await expect(pod.repository.create(INSTANCE, course())).rejects.toMatchObject({ code: "createdElsewhere", vars: { url: CHAPTER_B } });
    expect(writes(pod)).toEqual([
      `PUT ${DRAFT} If-None-Match`,
      `PUT ${CHAPTER_A} If-None-Match`,
      `PUT ${CHAPTER_B} If-None-Match`,
      `DELETE ${CHAPTER_A}`,
      `DELETE ${DRAFT}`,
    ]);
    expect(await pod.text(CHAPTER_B)).toContain(`<${SM}y>`);
  });

  it("throws the failure that stopped it even when what it wrote cannot be taken back", async () => {
    const pod = await draftPod();
    for (let i = 0; i < 3; i++) pod.failNext("PATCH", CATALOG, 412);
    pod.failNext("DELETE", CARDS, 500);
    await expect(pod.repository.create(INSTANCE, course())).rejects.toMatchObject({ code: "changedElsewhere" });
  });

  it("adds no second link to a draft the catalogue links already", async () => {
    const pod = await draftPod();
    await pod.put(CATALOG, `<#catalog> a <http://www.w3.org/ns/dcat#Catalog> ; <${SM}releaseDraft> <${DRAFT}> .`);
    await pod.repository.create(INSTANCE, course());
    expect(writes(pod).filter((write) => write.includes(CATALOG))).toEqual([]);
  });

  it("refuses to link a draft once the catalogue is gone", async () => {
    const pod = await draftPod();
    pod.failNext("PUT", DRAFT, null, async () => {
      await pod.local(CATALOG, { method: "DELETE" });
    });
    await expect(pod.repository.create(INSTANCE, course())).rejects.toMatchObject({ code: "noCatalogToUpdate" });
  });

  it("checks what the draft shapes describe before it is written", async () => {
    const pod = await draftPod({ checked: true });
    const draft = course();
    const broken = { ...draft, chapters: draft.chapters.map((node) => ({ ...node, data: { ...node.data, position: -1 } })) };
    await expect(pod.repository.create(INSTANCE, broken)).rejects.toMatchObject({ code: "dataNotConforming" });
  });
});

describe("list and documents", () => {
  it("follow only the catalogue's links to drafts of the instance, and list one that cannot be read as such", async () => {
    const pod = await draftPod();
    const gone = draftUrlOf(INSTANCE, "gone", 3);
    const empty = draftUrlOf(INSTANCE, "empty", 1);
    await pod.put(empty, `<#x> <${SM}y> "z" .`);
    await pod.put(
      CATALOG,
      `<#catalog> a <http://www.w3.org/ns/dcat#Catalog> ;
        <${SM}releaseDraft> <${gone}> , <${empty}> , <https://elsewhere.example/drafts/x/v1/release.ttl> , <decks/deck-1.ttl> .`,
    );
    expect(await pod.repository.list(INSTANCE)).toEqual([
      { url: gone, instanceUrl: INSTANCE, name: "gone", version: 3, readable: false, title: {}, course: false },
      { url: empty, instanceUrl: INSTANCE, name: "empty", version: 1, readable: false, title: {}, course: false },
    ]);
    await expect(pod.repository.documents(INSTANCE)).resolves.toEqual([empty]);
  });

  it("fail when a draft's folder cannot be read", async () => {
    const pod = await draftPod();
    await pod.repository.create(INSTANCE, course());
    pod.failNext("GET", CONTAINER, 500);
    await expect(pod.repository.documents(INSTANCE)).rejects.toThrow();
  });

  it("are none without a catalogue", async () => {
    const pod = await draftPod();
    await pod.local(CATALOG, { method: "DELETE" });
    await expect(pod.repository.list(INSTANCE)).resolves.toEqual([]);
    await pod.put(CATALOG, "");
    await expect(pod.repository.list(INSTANCE)).resolves.toEqual([]);
    await expect(pod.repository.documents(INSTANCE.slice(0, -1))).resolves.toEqual([]);
  });
});

describe("read", () => {
  it("is draftGone for a draft without its documents, or its root", async () => {
    const pod = await draftPod();
    await expect(pod.repository.read(DRAFT)).rejects.toMatchObject({ code: "draftGone" });
    await pod.put(CARDS, `<#x> <${SM}y> "z" .`);
    await expect(pod.repository.read(DRAFT)).rejects.toMatchObject({ code: "draftGone" });
    await pod.put(DRAFT, `<#x> <${SM}y> "z" .`);
    await expect(pod.repository.read(DRAFT)).rejects.toMatchObject({ code: "draftGone" });
  });

  it("reads again only what changed since the version given", async () => {
    const pod = await draftPod();
    await pod.repository.create(INSTANCE, course());
    const { draft, version } = await pod.repository.read(DRAFT);
    await expect(pod.repository.readSince(DRAFT, version)).resolves.toEqual({ unchanged: true });
    await expect(pod.repository.readSince(DRAFT, undefined)).resolves.toMatchObject({ unchanged: false, version });
    await pod.repository.applyChanges(draft, changed(draft, { kind: "retire", of: "card", id: "q-loose" }), version);
    const since = await pod.repository.readSince(DRAFT, version);
    expect(since.unchanged).toBe(false);
  });

  it("tells blank nodes of one document from another's", async () => {
    const pod = await draftPod();
    await pod.repository.create(INSTANCE, course());
    await pod.put(`${CHAPTER_A}`, `${await pod.text(CHAPTER_A)}\n<#q-a-1a> <https://p.example/sum> [ <https://p.example/v> "a" ] .`);
    await pod.put(`${CARDS}`, `${await pod.text(CARDS)}\n<#q-loose> <https://p.example/sum> [ <https://p.example/v> "b" ] .`);
    const { draft } = await pod.repository.read(DRAFT);
    const blanks = draft.triples.filter((triple) => triple.subject.startsWith("_:"));
    expect(new Set(blanks.map((triple) => triple.subject)).size).toBe(2);
  });
});

describe("applyChanges", () => {
  async function opened(options: { checked?: boolean } = {}) {
    const pod = await draftPod(options);
    await pod.repository.create(INSTANCE, course());
    const { draft, version } = await pod.repository.read(DRAFT);
    return { pod, draft, version, from: pod.requests.length };
  }

  it("writes one document for a change in it, whole, only if it is as it was read", async () => {
    const { pod, draft, version, from } = await opened({ checked: true });
    await pod.repository.applyChanges(draft, changed(draft, { kind: "editCard", id: "q-a-2a", card: { front: { en: "New?" }, back: { en: "Yes" } } }), version);
    expect(writes(pod, from)).toEqual([`PUT ${CHAPTER_A} If-Match`]);
    const { draft: read } = await pod.repository.read(DRAFT);
    expect(read.cards.find((node) => node.id === "q-a-2a")!.data).toEqual({ front: { en: "New?" }, back: { en: "Yes" }, distractor: [] });
  });

  it("moves a question and its distractors to the document of where it is asked now", async () => {
    const { pod, draft, version, from } = await opened({ checked: true });
    const after = changed(draft, { kind: "moveQuestion", card: "q-a-1a", place: { kind: "review", chapter: "ch-b" } });
    await pod.repository.applyChanges(draft, after, version);
    expect(writes(pod, from).sort()).toEqual([`PUT ${CHAPTER_A} If-Match`, `PUT ${CHAPTER_B} If-Match`]);
    expect(await pod.text(CHAPTER_B)).toContain(`<${CHAPTER_B}#q-a-1a-d1>`);
    expect(await pod.text(CHAPTER_A)).not.toContain("q-a-1a-d1");
    const { draft: read } = await pod.repository.read(DRAFT);
    expect(sorted(read)).toEqual(sorted(after));
  });

  it("writes a new chapter's document only where none is, and deletes one with nothing left, as it was read", async () => {
    const { pod, draft, version, from } = await opened();
    const after = changed(draft, { kind: "addChapter", id: "ch-c", text: { title: { en: "C" } } }, { kind: "delete", of: "chapter", id: "ch-b" });
    await pod.repository.applyChanges(draft, after, version);
    expect(writes(pod, from)).toEqual([`PUT ${CONTAINER}chapter-ch-c.ttl If-None-Match`, `DELETE ${CHAPTER_B} If-Match`]);
    expect(await pod.repository.documents(INSTANCE)).toEqual([CARDS, CHAPTER_A, `${CONTAINER}chapter-ch-c.ttl`, DRAFT]);
  });

  it("writes how the release was made as it is, beside the root's record", async () => {
    const { pod, draft, version, from } = await opened();
    const after = changed(
      draft,
      { kind: "setSource", iri: "https://source.example/", source: null },
      { kind: "setMeta", meta: { course: false } },
      { kind: "addCheckActivity", id: "review-1", activity: { check: "machine", label: "Checks", scope: "all", outcome: "fine", endedAt: NOW, language: "en" } },
    );
    await pod.repository.applyChanges(draft, after, version);
    expect(writes(pod, from)).toEqual([`PUT ${DRAFT} If-Match`]);
    const { draft: read } = await pod.repository.read(DRAFT);
    expect(sorted(read)).toEqual(sorted(after));
  });

  it("keeps what another app said in a document of the draft", async () => {
    const { pod } = await opened();
    await pod.put(CHAPTER_A, `${await pod.text(CHAPTER_A)}\n<#other> <https://other.example/says> "kept" .`);
    const { draft, version } = await pod.repository.read(DRAFT);
    await pod.repository.applyChanges(draft, changed(draft, { kind: "retire", of: "card", id: "q-a-2a" }), version);
    expect(await pod.text(CHAPTER_A)).toContain('"kept"');
  });

  it("writes a document whose blank nodes change whole", async () => {
    const { pod } = await opened();
    await pod.put(DRAFT, `${await pod.text(DRAFT)}\n<https://source.example/> <https://p.example/sum> [ <https://p.example/v> "a" ] .`);
    const { draft, version } = await pod.repository.read(DRAFT);
    const from = pod.requests.length;
    await pod.repository.applyChanges(draft, changed(draft, { kind: "setSource", iri: "https://source.example/", source: null }), version);
    expect(writes(pod, from)).toEqual([`PUT ${DRAFT} If-Match`]);
    expect(await pod.text(DRAFT)).not.toContain("https://p.example/v");
    const { draft: read } = await pod.repository.read(DRAFT);
    expect(read.triples.some((triple) => triple.subject.startsWith("_:"))).toBe(false);
  });

  it("puts blank nodes a changed subject names back in place", async () => {
    const { pod } = await opened();
    await pod.put(CARDS, `${await pod.text(CARDS)}\n<#q-loose> <https://p.example/sum> [ <https://p.example/v> "a" ] .`);
    const { draft, version } = await pod.repository.read(DRAFT);
    const blank = draft.triples.find((triple) => triple.subject.startsWith("_:"))!;
    const after = { ...draft, triples: draft.triples.map((triple) => (triple === blank ? { ...triple, object: { ...triple.object, value: "b" } } : triple)) };
    await pod.repository.applyChanges(draft, after, version);
    const text = await pod.text(CARDS);
    expect(text).toContain('"b"');
    expect(text).not.toContain('"a"');
    expect((await pod.repository.read(DRAFT)).draft.triples.filter((triple) => triple.subject.startsWith("_:"))).toHaveLength(1);
  });

  it("writes a blank node new to a document", async () => {
    const { pod, draft, version } = await opened();
    const after = {
      ...draft,
      triples: [
        ...draft.triples,
        { subject: "https://source.example/", predicate: "https://p.example/sum", object: { kind: "blank" as const, value: "new" } },
        { subject: "_:new", predicate: "https://p.example/v", object: { kind: "iri" as const, value: "https://p.example/x" } },
      ],
    };
    await pod.repository.applyChanges(draft, after, version);
    const { draft: read } = await pod.repository.read(DRAFT);
    expect(read.triples.filter((triple) => triple.subject.startsWith("_:")).map((triple) => triple.object)).toEqual([{ kind: "iri", value: "https://p.example/x" }]);
  });

  it("writes nothing more once a document changed elsewhere since it was read", async () => {
    const { pod, draft, version, from } = await opened();
    pod.failNext("PUT", CARDS, 412);
    await expect(
      pod.repository.applyChanges(draft, changed(draft, { kind: "retire", of: "card", id: "q-a-2a" }, { kind: "retire", of: "card", id: "q-loose" }), version),
    ).rejects.toMatchObject({ code: "changedElsewhere" });
    expect(writes(pod, from)).toEqual([`PUT ${CARDS} If-Match`]);
  });

  it("refuses to write over a subject a newer app wrote", async () => {
    const { pod } = await opened();
    await pod.put(CARDS, (await pod.text(CARDS)).replace(/(<[^>]*#q-loose>[^.]*?)<https:\/\/solid-memo.com\/ns\/vocab\/v1.ttl#formatVersion> "5"/, "$1<https://solid-memo.com/ns/vocab/v1.ttl#formatVersion> \"9\""));
    const text = await pod.text(CARDS);
    expect(text).toContain('"9"');
    const { draft, version } = await pod.repository.read(DRAFT);
    await expect(pod.repository.applyChanges(draft, changed(draft, { kind: "retire", of: "card", id: "q-loose" }), version)).rejects.toMatchObject({
      code: "writtenByNewerApp",
    });
  });

  it("refuses a draft not read, or read since at another version", async () => {
    const { pod, draft, version } = await opened();
    const after = changed(draft, { kind: "retire", of: "card", id: "q-loose" });
    await expect(pod.repository.applyChanges(draft, after, "another")).rejects.toMatchObject({ code: "changedElsewhere" });
    const { createSolidReleaseDraftRepository } = await import("./solidReleaseDraftRepository");
    await expect(createSolidReleaseDraftRepository({ fetch: pod.fetch }).applyChanges(draft, after, version)).rejects.toMatchObject({ code: "changedElsewhere" });
    await pod.repository.applyChanges(draft, after, version);
    await expect(pod.repository.applyChanges(draft, after, version)).rejects.toMatchObject({ code: "changedElsewhere" });
  });

  it("refuses an edit made from a read an edit made since overtook", async () => {
    const { pod, draft, version } = await opened();
    const second = await pod.repository.read(DRAFT);
    await pod.repository.applyChanges(second.draft, changed(second.draft, { kind: "retire", of: "card", id: "q-a-2a" }), second.version);
    const third = await pod.repository.read(DRAFT);
    await expect(pod.repository.applyChanges(draft, changed(draft, { kind: "retire", of: "card", id: "q-loose" }), version)).rejects.toMatchObject({
      code: "changedElsewhere",
    });
    // The newer read stays remembered: an edit made from it is written.
    await pod.repository.applyChanges(third.draft, changed(third.draft, { kind: "retire", of: "card", id: "q-loose" }), third.version);
    expect((await pod.repository.read(DRAFT)).draft.cards.filter((node) => node.data.deprecated === true).map((node) => node.id).sort()).toEqual(["q-a-2a", "q-loose"]);
  });
});

describe("assemble", () => {
  it("writes a first release at its address, starting its series, at library deck format 6", async () => {
    const pod = await draftPod();
    const draft = { ...course(), root: { ...course().root, releasedAs: "https://never.example/", modified: NOW } };
    await pod.repository.create(INSTANCE, draft);
    const target = `${INSTANCE}releases/solid/v1.ttl`;
    const turtle = await pod.repository.assemble(DRAFT, target, "2026-10-11T00:00:00.000Z");
    expect(turtle.startsWith(`@base <${target}> .`)).toBe(true);
    expect(turtle).toContain("solid-memo:formatVersion 6");
    expect(turtle).not.toContain("releasedAs");
    expect(turtle).not.toContain(CONTAINER);
    const quads = await quadsOfTurtle(turtle, target);
    const of = (subject: string, predicate: string) =>
      quads.filter((quad) => quad.subject.value === subject && quad.predicate.value.endsWith(predicate)).map((quad) => quad.object.value);
    expect(of(target, "issued")).toEqual(["2026-10-11T00:00:00.000Z"]);
    expect(of(target, "modified")).toEqual(["2026-10-11T00:00:00.000Z"]);
    expect(of(`${target}#series`, "#first")).toEqual([target]);
    expect(of(`${target}#series`, "#hasVersion")).toEqual([target]);
    expect(of(`${target}#series`, "title")).toEqual(["Solid"]);
    expect(of(`${target}#ch-a-1`, "isPartOf")).toEqual([`${target}#ch-a`]);
  });

  it("writes the next version of a release that describes its series, as the series' last and current", async () => {
    const pod = await draftPod();
    const v1 = `${INSTANCE}releases/solid/v1.ttl`;
    await pod.repository.create(INSTANCE, course());
    await pod.put(v1, await pod.repository.assemble(DRAFT, v1, NOW));
    const release = await createdRelease(pod, v1);
    const next = draftUrlOf(INSTANCE, "solid", 2);
    await pod.repository.create(INSTANCE, nextVersionDraft(release, next));
    const v2 = `${INSTANCE}releases/solid/v2.ttl`;
    const quads = await quadsOfTurtle(await pod.repository.assemble(next, v2, NOW), v2);
    const series = (predicate: string) => quads.filter((quad) => quad.subject.value === `${v1}#series` && quad.predicate.value.endsWith(predicate)).map((quad) => quad.object.value).sort();
    expect(series("#hasVersion")).toEqual([v1, v2]);
    expect(series("#last")).toEqual([v2]);
    expect(series("#hasCurrentVersion")).toEqual([v2]);
    expect(series("#first")).toEqual([v1]);
    expect(quads.filter((quad) => quad.subject.value === v1).map((quad) => quad.predicate.value.split(/[#/]/).at(-1)).sort()).toEqual(["title", "type", "version"]);
  });

  it("keeps blank nodes, and lists a release its series lists already once", async () => {
    const pod = await draftPod();
    const v1 = `${INSTANCE}releases/solid/v1.ttl`;
    const draft = course();
    await pod.repository.create(INSTANCE, {
      ...draft,
      triples: [
        ...draft.triples,
        { subject: `${DRAFT}#series`, predicate: "http://www.w3.org/ns/dcat#hasVersion", object: { kind: "iri", value: DRAFT } },
        { subject: "https://source.example/", predicate: "https://p.example/sum", object: { kind: "blank", value: "b0" } },
        { subject: "_:b0", predicate: "https://p.example/v", object: { kind: "literal", value: "a", language: "", datatype: "http://www.w3.org/2001/XMLSchema#string" } },
      ],
    });
    const turtle = await pod.repository.assemble(DRAFT, v1, NOW);
    expect(turtle).toContain('<https://p.example/sum> [ <https://p.example/v> "a" ]');
    const quads = await quadsOfTurtle(turtle, v1);
    expect(quads.filter((quad) => quad.predicate.value.endsWith("#hasVersion")).map((quad) => quad.object.value)).toEqual([v1]);
    expect(quads.filter((quad) => quad.predicate.value.endsWith("#first"))).toEqual([]);
  });

  it("makes the draft as it was at a version read, or says it changed since", async () => {
    const pod = await draftPod();
    await pod.repository.create(INSTANCE, course());
    const target = `${INSTANCE}releases/solid/v1.ttl`;
    const { draft, version } = await pod.repository.read(DRAFT);
    const turtle = await pod.repository.assemble(DRAFT, target, NOW, version);
    expect(turtle).toBe(await pod.repository.assemble(DRAFT, target, NOW));
    await pod.repository.applyChanges(draft, changed(draft, { kind: "retire", of: "card", id: "q-loose" }), version);
    await expect(pod.repository.assemble(DRAFT, target, NOW, version)).rejects.toMatchObject({ code: "changedElsewhere", vars: { url: DRAFT } });
  });

  it("leaves a series described elsewhere to where it is, and a release with none as it is", async () => {
    const pod = await draftPod();
    const elsewhere = { ...course(), root: { ...course().root, inSeries: "https://solid-memo.com/decks/index.ttl#solid" } };
    await pod.repository.create(INSTANCE, elsewhere);
    expect(await pod.repository.assemble(DRAFT, `${DECKS}solid/v1.ttl`, NOW)).not.toContain("DatasetSeries");
    const none = draftUrlOf(INSTANCE, "none", 1);
    const { inSeries: _series, ...root } = course().root;
    await pod.repository.create(INSTANCE, { ...rebaseDraft(course(), none), root: { ...rebaseDraft(course(), none).root, inSeries: undefined } as never });
    void root;
    expect(await pod.repository.assemble(none, `${DECKS}none/v1.ttl`, NOW)).not.toContain("DatasetSeries");
    await expect(pod.repository.assemble(draftUrlOf(INSTANCE, "missing", 1), `${DECKS}x/v1.ttl`, NOW)).rejects.toMatchObject({ code: "draftGone" });
  });
});

/** A release published in the pod, read as a release. */
async function createdRelease(pod: Awaited<ReturnType<typeof draftPod>>, url: string) {
  const { createSolidReleaseDraftRepository } = await import("./solidReleaseDraftRepository");
  return createSolidReleaseDraftRepository({ fetch: pod.fetch }).readRelease(url);
}

describe("readRelease and parseRelease", () => {
  it("read a library release as it states itself", async () => {
    const pod = await draftPod();
    const release = await pod.repository.readRelease(`${DECKS}getting-started/v1.ttl`);
    expect(release.course).toBe(true);
    expect(release.root.version).toBe("1");
  });

  it("refuse what is no release, or one newer than this app reads", async () => {
    const pod = await draftPod();
    const at = `${INSTANCE}releases/x/v1.ttl`;
    await expect(pod.repository.readRelease(`${DECKS}nothing/v1.ttl`)).rejects.toMatchObject({ code: "releaseUnreadable" });
    const read = createdRelease.bind(null, pod);
    await pod.put(at, `<#x> a <${SM}Card> .`);
    await expect(read(at)).rejects.toMatchObject({ code: "releaseUnreadable" });
    await pod.put(at, `<> a <${SM}Deck> ; <${SM}studyDirection> <${SM}frontToBack> ; <http://www.w3.org/ns/dcat#version> "beta" .`);
    await expect(read(at)).rejects.toMatchObject({ code: "releaseUnreadable" });
    await pod.put(at, `<> a <${SM}Deck> ; <${SM}studyDirection> <${SM}frontToBack> ; <${SM}formatVersion> 7 .`);
    await expect(read(at)).rejects.toMatchObject({ code: "libraryDeckTooNew" });
    await pod.put(at, `<> a <${SM}Deck> ; <${SM}studyDirection> <${SM}frontToBack> ; <${SM}formatVersion> 6 . <#c> a <${SM}Card> ; <${SM}formatVersion> 6 .`);
    await expect(read(at)).rejects.toMatchObject({ code: "libraryCardTooNew" });
  });

  it("read the document a release names its series and publisher in, once, as no one, and none for a release that describes them", async () => {
    const pod = await draftPod();
    const publicFetch = vi.fn(siteFetch);
    const releaseFetch = vi.fn(siteFetch);
    const repository = createSolidReleaseDraftRepository({ fetch: pod.fetch, releaseFetch, publicFetch });
    const release = await repository.readRelease(`${DECKS}getting-started/v1.ttl`);
    const linked = await repository.readLinked(release);
    expect(linked).toContainEqual({ subject: `${DECKS}index.ttl#solid-memo`, predicate: "http://xmlns.com/foaf/0.1/name", object: expect.objectContaining({ value: "Solid Memo" }) });
    expect(linked.filter((triple) => triple.subject === `${DECKS}index.ttl#solid-memo`)).toHaveLength(2);
    expect(publicFetch.mock.calls.map(([input]) => String(input))).toEqual([`${DECKS}index.ttl`]);
    expect(releaseFetch.mock.calls.map(([input]) => String(input))).not.toContain(`${DECKS}index.ttl`);
    await expect(repository.readLinked(course())).resolves.toEqual([]);
  });

  it("make the next version of a release whose linked documents cannot be read, without them, the release check finding what it lacks", async () => {
    const pod = await draftPod();
    const gone = (async () => new Response("gone", { status: 404 })) as typeof globalThis.fetch;
    const repository = createSolidReleaseDraftRepository({ fetch: pod.fetch, releaseFetch: siteFetch, publicFetch: gone });
    const read = await repository.readRelease(`${DECKS}getting-started/v1.ttl`);
    const release = { ...read, root: { ...read.root, publisher: "https://gone.example/profile/card#me" } };
    const linked = await repository.readLinked(release);
    expect(linked).toEqual([]);
    const url = draftUrlOf(INSTANCE, "getting-started", 2);
    await repository.create(INSTANCE, nextVersionDraft(release, url, linked));
    const { draft } = await repository.read(url);
    expect(draft.root).toMatchObject({ version: "2", publisher: "https://gone.example/profile/card#me", inSeries: `${DECKS}index.ttl#getting-started` });
    const found = (await pod.validator.validateRelease(draft, url)).map((problem) => ("field" in problem ? problem.field : undefined));
    expect(found).toEqual(expect.arrayContaining(["http://purl.org/dc/terms/publisher", "http://www.w3.org/ns/dcat#inSeries"]));
  }, 60_000);

  it("parse a release from a Turtle or JSON-LD file, at the address its root names", async () => {
    const pod = await draftPod();
    const turtle = await pod.repository.parseRelease(`<> a <${SM}Deck> ; <${SM}studyDirection> <${SM}frontToBack> .`, "turtle");
    expect(turtle.url).toBe("https://file.solid-memo.invalid/release.ttl");
    const jsonld = await pod.repository.parseRelease(
      JSON.stringify({ "@id": `${DECKS}capitals/v1.ttl`, "@type": `${SM}Deck`, [`${SM}studyDirection`]: { "@id": `${SM}frontToBack` } }),
      "jsonld",
    );
    expect(jsonld.url).toBe(`${DECKS}capitals/v1.ttl`);
  });

  it("refuse a file of no one release", async () => {
    const pod = await draftPod();
    for (const text of [
      `<#a> a <${SM}Card> .`,
      `<> a <${SM}Deck> . <https://x.example/> a <${SM}Deck> .`,
      `<#deck> a <${SM}Deck> .`,
      `<> a <${SM}Deck> ; <${SM}cardsDocument> <cards.ttl> .`,
      `<> a <${SM}Deck> .`,
      `<> a <${SM}Deck> ; <${SM}studyDirection> <${SM}frontToBack> ; <http://www.w3.org/ns/dcat#version> "1.0" .`,
      `<> a <${SM}Deck> ; <${SM}studyDirection> <${SM}frontToBack> ; <http://www.w3.org/ns/dcat#version> "0" .`,
    ]) {
      await expect(pod.repository.parseRelease(text, "turtle")).rejects.toMatchObject({ code: "notAReleaseFile" });
    }
    await expect(pod.repository.parseRelease(`<> a <${SM}Deck> ; <${SM}studyDirection> <${SM}frontToBack> ; <${SM}formatVersion> 9 .`, "turtle")).rejects.toMatchObject({
      code: "libraryDeckTooNew",
    });
  });
});

describe("delete", () => {
  it("deletes the draft's documents, its folders, then its link", async () => {
    const pod = await draftPod();
    await pod.repository.create(INSTANCE, course());
    const before = await pod.urls();
    const summary = (await pod.repository.list(INSTANCE))[0]!;
    await pod.repository.delete(summary);
    await expect(pod.repository.list(INSTANCE)).resolves.toEqual([]);
    expect((await pod.urls()).filter((url) => !before.includes(url))).toEqual([]);
    expect((await pod.urls()).some((url) => url.includes("/drafts/"))).toBe(false);
  });

  it("keeps what else is in its folder, and the folder", async () => {
    const pod = await draftPod();
    await pod.repository.create(INSTANCE, course());
    await pod.put(`${CONTAINER}notes.ttl`, `<#x> <${SM}y> "z" .`);
    await pod.repository.delete((await pod.repository.list(INSTANCE))[0]!);
    expect((await pod.urls()).filter((url) => url.includes("/drafts/"))).toEqual([
      `${INSTANCE}drafts/`,
      `${INSTANCE}drafts/solid/`,
      CONTAINER,
      `${CONTAINER}notes.ttl`,
    ]);
    await expect(draftDocumentsIn(DRAFT, pod.fetch)).resolves.toEqual([]);
  });

  it("deletes a draft the catalogue no longer links, or that has no catalogue", async () => {
    const pod = await draftPod();
    await pod.repository.create(INSTANCE, course());
    const summary = (await pod.repository.list(INSTANCE))[0]!;
    await pod.put(CATALOG, `<#catalog> a <http://www.w3.org/ns/dcat#Catalog> .`);
    const from = pod.requests.length;
    await pod.repository.delete(summary);
    expect(writes(pod, from).some((write) => write.includes(CATALOG))).toBe(false);
    await pod.repository.create(INSTANCE, course());
    await pod.local(CATALOG, { method: "DELETE" });
    await pod.repository.delete(summary);
    expect((await pod.urls()).some((url) => url.includes("/drafts/"))).toBe(false);
  });

  it("deletes nothing of a draft that is gone", async () => {
    const pod = await draftPod();
    await deleteDraftResources(DRAFT, pod.fetch);
    expect(writes(pod)).toEqual([]);
  });
});

describe("a library release made a draft and published again", () => {
  for (const path of ["getting-started/v1.ttl", "swedish-nouns/v1.ttl", "git-commands/v1.ttl"]) {
    it(`gives ${path} back, apart from what publishing sets`, { timeout: 30_000 }, async () => {
      const { release, assembled } = await roundTrip(await draftPod(), path);
      expect(assembled).toEqual(release);
    });
  }
});
