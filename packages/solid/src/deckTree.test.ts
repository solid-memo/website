import { describe, expect, it, vi } from "vitest";
import type { Deck } from "@solid-memo/domain/deck";
import { decksOf, nodeId, type DeckTree, type TreeNode } from "@solid-memo/domain/deckTree";
import { createSolidDeckRepository } from "./solidDeckRepository";
import { fakePod } from "./testing/fakePod";
import type { WriteCheck } from "./writeCheck";

const INSTANCE = "https://pod.example/solid-memo/main/";
const CATALOG = `${INSTANCE}catalog.ttl`;
const ROOT = `${CATALOG}#catalog`;
const at = (id: string) => `${CATALOG}#${id}`;
const PREFIXES = `@prefix sm: <https://solid-memo.com/ns/vocab/v1.ttl#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .
`;

const deckTtl = (id: string) => `<#${id}> a sm:Deck, dcat:Dataset ; sm:formatVersion 6 ;
  dcterms:title "${id}"@en ; dcterms:description "Flashcards: ${id}."@en ; sm:studyDirection sm:frontToBack ;
  sm:cardsDocument <${INSTANCE}decks/${id}.ttl> ; sm:reviewsDocument <${INSTANCE}reviews/${id}.ttl> .
`;

/** A pod whose instance has a catalogue of decks a, b and c, and whatever else is given. */
async function podWith(extra = "") {
  const pod = fakePod();
  await pod.put(
    CATALOG,
    `${PREFIXES}<#catalog> a dcat:Catalog ; dcterms:title "Main" ; dcterms:description "My decks." ;
      dcterms:publisher <https://pod.example/profile/card#me> ; dcat:dataset <#a>, <#b>, <#c> .
    ${deckTtl("a")}${deckTtl("b")}${deckTtl("c")}${extra}`,
  );
  return pod;
}

function repositoryOn(fetch: typeof globalThis.fetch, checkWrite?: WriteCheck) {
  return createSolidDeckRepository({
    fetch,
    now: () => new Date("2026-10-06T10:00:00.000Z"),
    randomId: () => "new",
    ...(checkWrite === undefined ? {} : { checkWrite }),
  });
}

/** A tree as ids: a deck's, or a group's with its children's. */
function shape(nodes: readonly TreeNode[]): unknown[] {
  return nodes.map((node) => (node.kind === "deck" ? node.deck.id : { [node.group.url.split("#")[1]!]: shape(node.children) }));
}

const writes = (pod: ReturnType<typeof fakePod>) => pod.requests.filter((request) => request.method !== "GET");
const group = { url: at("group-1"), title: { en: "Languages" } };

describe("the deck tree in the pod", () => {
  it("is empty without a catalog document, and as the document states it otherwise", async () => {
    const pod = fakePod();
    expect(await repositoryOn(pod.fetch).readDeckTree(INSTANCE)).toEqual({ children: [], readOnly: false });
    const arranged = await podWith(
      `<#catalog> dcat:catalog <#group-1> .
       <#group-1> a sm:DeckGroup, dcat:Catalog ; sm:formatVersion 1 ; dcterms:title "Languages"@en ;
         dcterms:description "Deck group: Languages."@en ; dcterms:publisher <https://pod.example/profile/card#me> ;
         dcat:dataset <#c>, <#a> ; sm:position 1 .
       <#a> sm:position 1 . <#c> sm:position 0 . <#b> sm:position 0 .`,
    );
    const tree = await repositoryOn(arranged.fetch).readDeckTree(INSTANCE);
    expect(shape(tree.children)).toEqual(["b", { "group-1": ["c", "a"] }]);
  });

  it("is edited in one checked write of the groups and the catalogue, If-Match the read, and reads back as written", async () => {
    const pod = await podWith();
    const checkWrite = vi.fn<WriteCheck>(async () => undefined);
    const repository = repositoryOn(pod.fetch, checkWrite);
    const written = await repository.editDeckTree(INSTANCE, { kind: "combine", dragged: at("c"), target: at("a"), group });
    expect(shape(written.children)).toEqual([{ "group-1": ["a", "c"] }, "b"]);
    expect(writes(pod)).toEqual([expect.objectContaining({ method: "PATCH", url: CATALOG, ifMatch: '"v1"', status: 205 })]);
    // The decks whose positions changed are not checked: only what a shape owns.
    expect(checkWrite).toHaveBeenCalledWith(expect.anything(), [group.url, ROOT]);
    expect(await repository.readDeckTree(INSTANCE)).toEqual(written);

    const moved = await repository.editDeckTree(INSTANCE, { kind: "move", node: at("b"), to: { parent: group.url, after: null } });
    expect(shape(moved.children)).toEqual([{ "group-1": ["b", "a", "c"] }]);
    expect(await repository.readDeckTree(INSTANCE)).toEqual(moved);
  });

  it("writes nothing for an edit that changes nothing", async () => {
    const pod = await podWith();
    const repository = repositoryOn(pod.fetch);
    const tree = await repository.editDeckTree(INSTANCE, { kind: "removeGroup", group: group.url });
    expect(shape(tree.children)).toEqual(["a", "b", "c"]);
    await repository.editDeckTree(INSTANCE, { kind: "move", node: at("b"), to: { parent: null, after: at("a") } });
    expect(writes(pod)).toEqual([]);
    // Nor without a catalog document, where no edit can change anything.
    const empty = fakePod();
    await repositoryOn(empty.fetch).editDeckTree(INSTANCE, { kind: "removeGroup", group: group.url });
    expect(writes(empty)).toEqual([]);
  });

  it("applies the edit again to the document as it is when it changed meanwhile, keeping what changed", async () => {
    const pod = await podWith();
    const elsewhere = repositoryOn(pod.fetch);
    // Another tab adds a deck just before this one writes.
    let meanwhile: (() => Promise<unknown>) | null = () => elsewhere.createDeck(INSTANCE, { en: "Added elsewhere" });
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH" && meanwhile !== null) {
        const change = meanwhile;
        meanwhile = null;
        await change();
      }
      return pod.fetch(input, init);
    }) as typeof globalThis.fetch;
    const written = await repositoryOn(fetch).editDeckTree(INSTANCE, {
      kind: "combine",
      dragged: at("b"),
      target: at("a"),
      group,
    });
    expect(writes(pod).map((request) => request.status)).toEqual([205, 412, 205]);
    expect(shape(written.children)).toEqual([{ "group-1": ["a", "b"] }, "c", "deck-new"]);
    expect(await elsewhere.readDeckTree(INSTANCE)).toEqual(written);
  });

  it("gives up after three writes the pod refuses as changed, and at once on any other failure", async () => {
    const pod = await podWith();
    const repository = repositoryOn(pod.fetch);
    const edit = { kind: "combine" as const, dragged: at("b"), target: at("a"), group };
    for (let i = 0; i < 3; i++) pod.failNext("PATCH", CATALOG, 412);
    await expect(repository.editDeckTree(INSTANCE, edit)).rejects.toMatchObject({ code: "changedElsewhere" });
    expect(writes(pod)).toHaveLength(3);
    pod.clearRequests();
    pod.failNext("PATCH", CATALOG, 500);
    await expect(repository.editDeckTree(INSTANCE, edit)).rejects.toThrow();
    expect(writes(pod)).toHaveLength(1);
  });

  it("is not changed when a newer app arranged it, nor when the edit no longer fits", async () => {
    const pod = await podWith(`<#group-2> a sm:DeckGroup ; sm:formatVersion 2 .`);
    const repository = repositoryOn(pod.fetch);
    expect((await repository.readDeckTree(INSTANCE)).readOnly).toBe(true);
    await expect(repository.editDeckTree(INSTANCE, { kind: "removeGroup", group: at("group-2") })).rejects.toMatchObject({
      code: "deckTreeTooNew",
    });
    const plain = await podWith();
    await expect(
      repositoryOn(plain.fetch).editDeckTree(INSTANCE, { kind: "rename", group: group.url, title: { en: "X" } }),
    ).rejects.toMatchObject({ code: "deckTreeChanged" });
    expect([...writes(pod), ...writes(plain)]).toEqual([]);
  });

  it("loses a removed deck from its group, in the same write", async () => {
    const pod = await podWith();
    const repository = repositoryOn(pod.fetch);
    const tree: DeckTree = await repository.editDeckTree(INSTANCE, { kind: "combine", dragged: at("b"), target: at("a"), group });
    const a = decksOf(tree.children).find((deck) => deck.id === "a") as Deck;
    pod.clearRequests();
    await repository.removeDeck(a);
    expect(writes(pod).filter((request) => request.url === CATALOG)).toHaveLength(1);
    const after = await repository.readDeckTree(INSTANCE);
    expect(shape(after.children)).toEqual([{ "group-1": ["b"] }, "c"]);
    expect(pod.triples(CATALOG)!.some((triple) => triple.includes(`<${a.url}>`))).toBe(false);
    expect(after.children.map(nodeId)).toEqual([group.url, at("c")]);
  });
});
