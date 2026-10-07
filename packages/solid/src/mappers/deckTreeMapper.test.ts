import { describe, expect, it } from "vitest";
import {
  getInteger,
  getSolidDataset,
  getStringWithLocale,
  getThing,
  getUrl,
  getUrlAll,
  type SolidDataset,
} from "@inrupt/solid-client";
import { applyDeckTreeEdit, buildTree, treeChanges, type DeckTreeEdit } from "@solid-memo/domain/deckTree";
import { turtleFetch } from "@solid-memo/shacl/testing/turtle";
import { toStoredLayout, withTreeChanges } from "./deckTreeMapper";
import { DCAT, DCTERMS, SM } from "../vocab";

const CATALOG = "https://pod.example/solid-memo/a/catalog.ttl";
const ROOT = `${CATALOG}#catalog`;
const ME = "https://pod.example/profile/card#me";
const at = (id: string) => `${CATALOG}#${id}`;

const PREFIXES = `@prefix sm: <https://solid-memo.com/ns/vocab/v1.ttl#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .
`;

const deckTtl = (id: string, extra = "") => `<#${id}> a sm:Deck, dcat:Dataset ; sm:formatVersion 6 ;
  dcterms:title "${id}"@en ; dcterms:description "Flashcards: ${id}."@en ; sm:studyDirection sm:frontToBack ;
  sm:cardsDocument <https://pod.example/solid-memo/a/decks/${id}.ttl> ;
  sm:reviewsDocument <https://pod.example/solid-memo/a/reviews/${id}.ttl> ${extra}.
`;

const groupTtl = (id: string, title: string, members: string, extra = "", version = 1) => `<#${id}> a sm:DeckGroup, dcat:Catalog ;
  sm:formatVersion ${version} ; dcterms:title "${title}"@en ; dcterms:description "Deck group: ${title}."@en ;
  dcterms:publisher <${ME}> ${members} ${extra}.
`;

const rootTtl = (groups = "", publisher = `dcterms:publisher <${ME}> ;`) =>
  `<#catalog> a dcat:Catalog ; dcterms:title "Main" ; dcterms:description "My decks." ; ${publisher} dcat:dataset <#a>, <#b>, <#c> ${groups}.\n`;

function document(turtle: string): Promise<SolidDataset> {
  return getSolidDataset(CATALOG, { fetch: turtleFetch(PREFIXES + turtle) });
}

/** The document an edit leaves, as the repository writes it. */
function edited(dataset: SolidDataset, edit: DeckTreeEdit) {
  const stored = toStoredLayout(dataset, CATALOG);
  const after = applyDeckTreeEdit(buildTree(stored), edit);
  return { ...withTreeChanges(dataset, CATALOG, treeChanges(stored, after)), after };
}

const ids = (dataset: SolidDataset) =>
  JSON.parse(
    JSON.stringify(buildTree(toStoredLayout(dataset, CATALOG)).children, (key, value) =>
      key === "deck" ? value.id : key === "group" ? value.url.split("#")[1] : value,
    ),
  );

describe("toStoredLayout", () => {
  it("reads the decks in document order with their positions, the groups it can read, and the catalogue's groups", async () => {
    const dataset = await document(
      rootTtl("; dcat:catalog <#group-x>, <#group-odd>") +
        deckTtl("a", "; sm:position 1 ") +
        deckTtl("b") +
        deckTtl("c", "; sm:position 0 ") +
        groupTtl("group-x", "Languages", "; dcat:dataset <#b>", "; sm:position 2 ") +
        // Another app's group without a description: not one this app can read.
        `<#group-odd> a sm:DeckGroup, dcat:Catalog ; dcterms:title "Odd"@en ; dcat:dataset <#a> .\n`,
    );
    const layout = toStoredLayout(dataset, CATALOG);
    expect(layout.decks.map((deck) => deck.id)).toEqual(["a", "b", "c"]);
    expect([...layout.deckPositions]).toEqual([
      [at("a"), 1],
      [at("c"), 0],
    ]);
    expect(layout.groups).toEqual([
      { group: { url: at("group-x"), title: { en: "Languages" } }, decks: [at("b")], groups: [], position: 2 },
    ]);
    expect(layout.rootGroups).toEqual([at("group-x"), at("group-odd")]);
    expect(layout.readOnly).toBe(false);
  });

  it("is read-only when a group is in a newer format, whether it can be read or not", async () => {
    const newer = await document(rootTtl() + groupTtl("group-x", "X", "", "", 2));
    expect(toStoredLayout(newer, CATALOG).readOnly).toBe(true);
    const unreadable = await document(rootTtl() + `<#group-y> a sm:DeckGroup ; sm:formatVersion 2 .\n`);
    expect(toStoredLayout(unreadable, CATALOG)).toMatchObject({ groups: [], readOnly: true });
  });

  it("lists no top-level groups without a catalogue", async () => {
    expect(toStoredLayout(await document(deckTtl("a")), CATALOG)).toMatchObject({ rootGroups: [], groups: [] });
  });
});

describe("withTreeChanges", () => {
  it("writes a new group in its format, published by the catalogue's publisher, listed by the catalogue, its members in order", async () => {
    const dataset = await document(rootTtl() + deckTtl("a") + deckTtl("b") + deckTtl("c"));
    const group = { url: at("group-1"), title: { sv: "Språk" } };
    const { dataset: written, subjects, after } = edited(dataset, { kind: "combine", dragged: at("c"), target: at("a"), group });
    expect(subjects).toEqual([group.url, ROOT]);
    const thing = getThing(written, group.url)!;
    expect(getStringWithLocale(thing, DCTERMS.title, "sv")).toBe("Språk");
    expect(getStringWithLocale(thing, DCTERMS.description, "sv")).toBe("Kortleksgrupp: Språk.");
    expect(getUrl(thing, DCTERMS.publisher)).toBe(ME);
    expect(getUrlAll(thing, DCAT.dataset)).toEqual([at("a"), at("c")]);
    expect(getInteger(thing, SM.position)).toBe(0);
    expect(getUrlAll(getThing(written, ROOT)!, DCAT.catalog)).toEqual([group.url]);
    // The catalogue still lists every deck.
    expect(getUrlAll(getThing(written, ROOT)!, DCAT.dataset)).toHaveLength(3);
    expect(getInteger(getThing(written, at("c"))!, SM.position)).toBe(1);
    expect(getInteger(getThing(written, at("b"))!, SM.position)).toBe(1);
    expect(buildTree(toStoredLayout(written, CATALOG))).toEqual(after);
  });

  it("renames a group, giving it the default description for its new name unless the user wrote one", async () => {
    const dataset = await document(
      rootTtl("; dcat:catalog <#group-x>, <#group-y>") +
        deckTtl("a") +
        deckTtl("b") +
        deckTtl("c") +
        groupTtl("group-x", "Old", "; dcat:dataset <#a>", "; sm:position 0 ") +
        `<#group-y> a sm:DeckGroup, dcat:Catalog ; sm:formatVersion 1 ; dcterms:title "Y"@en ;
          dcterms:description "Mine, all mine."@en ; dcterms:publisher <https://other.example/#me> ; dcat:dataset <#b> .\n`,
    );
    const first = edited(dataset, { kind: "rename", group: at("group-x"), title: { en: "New" } });
    expect(first.subjects).toEqual([at("group-x"), ROOT]);
    const x = getThing(first.dataset, at("group-x"))!;
    expect(getStringWithLocale(x, DCTERMS.description, "en")).toBe("Deck group: New.");
    expect(getUrlAll(x, DCAT.dataset)).toEqual([at("a")]);
    expect(getInteger(x, SM.position)).toBe(0);
    const y = getThing(edited(dataset, { kind: "rename", group: at("group-y"), title: { en: "Why" } }).dataset, at("group-y"))!;
    expect(getStringWithLocale(y, DCTERMS.description, "en")).toBe("Mine, all mine.");
    // A group keeps its own publisher.
    expect(getUrl(y, DCTERMS.publisher)).toBe("https://other.example/#me");
    // A group without a position gets none from a rename.
    expect(getInteger(y, SM.position)).toBeNull();
  });

  it("drops a negative position, which the shape does not allow, when it writes the group", async () => {
    const dataset = await document(
      rootTtl("; dcat:catalog <#group-x>") + deckTtl("a") + deckTtl("b") + deckTtl("c") +
        groupTtl("group-x", "X", "; dcat:dataset <#a>", "; sm:position -1 "),
    );
    expect(toStoredLayout(dataset, CATALOG).groups[0]).not.toHaveProperty("position");
    const renamed = edited(dataset, { kind: "rename", group: at("group-x"), title: { en: "Y" } }).dataset;
    expect(getInteger(getThing(renamed, at("group-x"))!, SM.position)).toBeNull();
  });

  it("keeps a member link to a dataset or catalogue it cannot read, or elsewhere, and drops one to what is gone", async () => {
    const dataset = await document(
      rootTtl("; dcat:catalog <#group-x>, <#group-odd>, <#group-bare>, <#gone>, <https://elsewhere.example/c#g>") +
        deckTtl("a") +
        deckTtl("b") +
        deckTtl("c") +
        groupTtl(
          "group-x",
          "X",
          `; dcat:dataset <#a>, <#broken>, <#gone-deck>, <#group-odd>, <https://elsewhere.example/d#d> ;
           dcat:catalog <#b>, <#group-odd>, <#group-bare>, <#gone-group>`,
        ) +
        // A deck that does not fit its shape, and groups that do not fit their own, one not even typed a catalogue.
        `<#broken> a sm:Deck, dcat:Dataset .\n<#group-odd> a sm:DeckGroup, dcat:Catalog ; dcterms:title "Odd"@en .\n` +
        `<#group-bare> a sm:DeckGroup .\n`,
    );
    const { dataset: written } = edited(dataset, { kind: "rename", group: at("group-x"), title: { en: "Y" } });
    const x = getThing(written, at("group-x"))!;
    expect(getUrlAll(x, DCAT.dataset).sort()).toEqual([at("a"), at("broken"), "https://elsewhere.example/d#d"].sort());
    expect(getUrlAll(x, DCAT.catalog)).toEqual([at("group-odd"), at("group-bare")]);
    // The catalogue's list of groups is left alone until the top level changes.
    expect(getUrlAll(getThing(written, ROOT)!, DCAT.catalog)).toHaveLength(5);

    const removed = edited(dataset, { kind: "removeGroup", group: at("group-x") }).dataset;
    expect(getUrlAll(getThing(removed, ROOT)!, DCAT.catalog).sort()).toEqual(
      [at("group-odd"), at("group-bare"), "https://elsewhere.example/c#g"].sort(),
    );
    // The group that cannot be read is not written.
    expect(getThing(removed, at("group-odd"))).toEqual(getThing(dataset, at("group-odd")));
  });

  it("removes a group, its members taking its place, and moves a group, writing its position", async () => {
    const dataset = await document(
      rootTtl("; dcat:catalog <#group-x>") +
        deckTtl("a") +
        deckTtl("b") +
        deckTtl("c") +
        groupTtl("group-x", "X", "; dcat:dataset <#a>, <#b>", "; sm:position 0 "),
    );
    const removed = edited(dataset, { kind: "removeGroup", group: at("group-x") });
    expect(getThing(removed.dataset, at("group-x"))).toBeNull();
    expect(getUrlAll(getThing(removed.dataset, ROOT)!, DCAT.catalog)).toEqual([]);
    expect(removed.subjects).toEqual([ROOT]);
    expect(ids(removed.dataset)).toEqual([
      { kind: "deck", deck: "a" },
      { kind: "deck", deck: "b" },
      { kind: "deck", deck: "c" },
    ]);

    const moved = edited(dataset, { kind: "move", node: at("group-x"), to: { parent: null, after: at("c") } });
    expect(moved.subjects).toEqual([at("group-x"), ROOT]);
    expect(getInteger(getThing(moved.dataset, at("group-x"))!, SM.position)).toBe(1);
    expect(getUrlAll(getThing(moved.dataset, at("group-x"))!, DCAT.dataset)).toEqual([at("a"), at("b")]);
    expect(getInteger(getThing(moved.dataset, at("c"))!, SM.position)).toBe(0);
  });

  it("needs the catalogue and its publisher for a new group, and a URL the document does not have yet", async () => {
    const group = { url: at("group-1"), title: { en: "G" } };
    const combine: DeckTreeEdit = { kind: "combine", dragged: at("b"), target: at("a"), group };
    const withoutPublisher = await document(rootTtl("", "") + deckTtl("a") + deckTtl("b"));
    expect(() => edited(withoutPublisher, combine)).toThrow("Deck groups need the catalogue");
    const withoutCatalogue = await document(deckTtl("a") + deckTtl("b"));
    expect(() => edited(withoutCatalogue, combine)).toThrow("Deck groups need the catalogue");
    const taken = await document(rootTtl() + deckTtl("a") + deckTtl("b") + `<#group-1> dcterms:title "Something else" .\n`);
    expect(() => edited(taken, combine)).toThrow("already in the catalog document");
  });

  it("needs the catalogue only to list a group at the top level", async () => {
    const dataset = await document(
      deckTtl("a") + deckTtl("b") + groupTtl("group-x", "X", "; dcat:dataset <#a>", "; sm:position 0 "),
    );
    expect(() => edited(dataset, { kind: "move", node: at("group-x"), to: { parent: null, after: at("b") } })).toThrow(
      "Deck groups need the catalogue",
    );
    // Decks alone are arranged without one, and nothing is checked: a deck's position is no shape's.
    const decks = await document(deckTtl("a") + deckTtl("b"));
    const moved = edited(decks, { kind: "move", node: at("b"), to: { parent: null, after: null } });
    expect(moved.subjects).toEqual([]);
    expect(getInteger(getThing(moved.dataset, at("b"))!, SM.position)).toBe(0);
  });
});
