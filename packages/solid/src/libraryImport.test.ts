/**
 * A deck imported from the library, end to end, through the app's own use
 * cases and Solid adapters wired as in main.tsx (docs/deck-library.md): the
 * library publishes its releases at library deck format 4 or 5 and their
 * cards at the format each was frozen at; an import writes the user's
 * copy at the formats this app writes (deck 6, card 5), its text exactly
 * the release's, keywords included, and every write is checked against
 * those shapes. The pod is a local one.
 */
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { VOCAB_ROOT } from "@solid-memo/vocab/tooling/root";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/sources";
import { LATEST_VERSION } from "@solid-memo/vocab/types.generated";
import { createUseCases } from "@solid-memo/application/useCases";
import type { ResourceStore } from "@solid-memo/application/ports";
import type { LibraryDeck } from "@solid-memo/domain/library";
import { createLocalPod } from "./localPod";
import { createMemoryResourceStore } from "./memoryResourceStore";
import { createShaclShapeValidator } from "./shaclShapeValidator";
import { createSolidDeckLibrary } from "./solidDeckLibrary";
import { createSolidDeckRepository } from "./solidDeckRepository";
import { createSolidInstanceRepository } from "./solidInstanceRepository";
import { createSolidPreferencesRepository } from "./solidPreferencesRepository";
import { createSolidReviewStateRepository } from "./solidReviewStateRepository";
import { createSolidWebIdDocumentRepository } from "./solidWebIdDocumentRepository";

const POD = "https://alice.example/";
const ALICE = { webId: `${POD}profile/card#me` };
const SITE = "https://solid-memo.com/";
const RELEASE = `${SITE}decks/capitals/v2.ttl`;
/** A release of library deck format 5: its keywords tagged with their language. */
const TAGGED_RELEASE = `${SITE}decks/capitals/v3.ttl`;
const KEYWORD = "http://www.w3.org/ns/dcat#keyword";
const SM_NS = "https://solid-memo.com/ns/vocab/v1.ttl#";
const DCTERMS = "http://purl.org/dc/terms/";

/**
 * The cards of a format-4 release (the release document is the deck
 * fixture): tagged sides, sides that do not say their language, a note
 * in two languages, a described picture, and a card frozen at format 3.
 */
const CARDS = `
<#se>
    a solid-memo:Card ;
    solid-memo:front "Sweden"@en ,
                     "Sverige"@sv ;
    solid-memo:back "Stockholm"@en ,
                    "Stockholm"@sv ;
    solid-memo:formatVersion 4 .

<#no>
    a solid-memo:Card ;
    solid-memo:front "Norway" ;
    solid-memo:frontNote "Independent since 1905."@en ,
                         "Självständigt sedan 1905."@sv ;
    solid-memo:backLabel "Capital"@en ;
    solid-memo:back "Oslo" ;
    solid-memo:formatVersion 4 .

<#q12418>
    a solid-memo:Card ;
    solid-memo:frontImage <https://upload.wikimedia.org/wikipedia/commons/e/ec/Mona_Lisa.jpg> ;
    solid-memo:frontImageDescription "A painted portrait of a woman with folded hands"@en ,
                                     "Ett målat porträtt av en kvinna med knäppta händer"@sv ;
    solid-memo:back "Mona Lisa — Leonardo da Vinci, 1500s"@en ;
    solid-memo:formatVersion 4 .

<#dk>
    a solid-memo:Card ;
    solid-memo:front "Denmark" ;
    solid-memo:frontNote "A kingdom."@en ;
    solid-memo:back "Copenhagen" ;
    solid-memo:formatVersion 3 .
`;

/** Every RDF document of a store, as N-Triples lines. */
async function everyTriple(store: ResourceStore): Promise<string[]> {
  const lines: string[] = [];
  for (const url of await store.urls()) {
    const resource = await store.get(url);
    if (resource?.kind === "rdf") lines.push(...resource.triples);
  }
  return lines;
}

/** A document the app reads: a library release (a fixture), or a shape document as the site publishes it. */
const siteFetch: typeof fetch = async (input) => {
  const url = String(input instanceof Request ? input.url : input);
  const body =
    url === RELEASE
      ? `${await readFile(`${VOCAB_ROOT}fixtures/deck/v4/valid/library-release.ttl`, "utf8")}${CARDS}`
      : url === TAGGED_RELEASE
        ? `${await readFile(`${VOCAB_ROOT}fixtures/library-deck/v5/valid/library-release.ttl`, "utf8")}${CARDS}`
        : undefined;
  if (body === undefined) return shapesFetch(url);
  const response = new Response(body, { headers: { "content-type": "text/turtle" } });
  Object.defineProperty(response, "url", { value: url });
  return response;
};

async function app() {
  const store = createMemoryResourceStore();
  const podFetch = createLocalPod({ root: POD, store, newEtag: () => `"${crypto.randomUUID()}"` });
  await podFetch(`${POD}profile/card`, {
    method: "PUT",
    headers: { "Content-Type": "text/turtle" },
    body: `<#me> <http://xmlns.com/foaf/0.1/name> "Alice" ; <http://www.w3.org/ns/pim/space#storage> <${POD}> .`,
  });
  const shapeValidator = createShaclShapeValidator({ fetch: podFetch, shapesFetch: siteFetch, ...SHAPE_SOURCES });
  const checkWrite = shapeValidator.checkSubjects;
  const ids = { now: () => new Date(), randomId: () => crypto.randomUUID() };
  const useCases = createUseCases({
    sessionGateway: undefined as never,
    storageGateway: undefined as never,
    deckLibrary: createSolidDeckLibrary({ fetch: siteFetch, indexUrl: `${SITE}decks/index.ttl` }),
    webIdDocumentRepository: createSolidWebIdDocumentRepository({ fetch: podFetch }),
    instanceRepository: createSolidInstanceRepository({ fetch: podFetch, checkWrite, ...ids }),
    deckRepository: createSolidDeckRepository({ fetch: podFetch, checkWrite, ...ids }),
    preferencesRepository: createSolidPreferencesRepository({ fetch: podFetch, checkWrite }),
    reviewStateRepository: createSolidReviewStateRepository({ fetch: podFetch, checkWrite }),
    shapeValidator,
    repairRepository: undefined as never,
    instanceCopier: undefined as never,
    documentBackups: undefined as never,
  });
  return { useCases, store };
}

describe("a deck imported from the library", () => {
  it("is written at deck format 6 and card format 5 from a format-4 release, its text exactly the release's", { timeout: 30_000 }, async () => {
    // Releases are frozen: a format-4 release is read as it was published.
    expect(LATEST_VERSION.libraryDeck).toBe(5);
    const { useCases, store } = await app();
    const instance = await useCases.createInstance(ALICE, { containerUrl: `${POD}solid-memo/`, name: "Main", registrationTarget: "private" });

    const deck = await useCases.importLibraryDeck(instance.url, { url: RELEASE } as LibraryDeck);

    expect(deck).toMatchObject({ formatVersion: 6, sourceUrl: RELEASE, title: { en: "Capitals", sv: "Huvudstäder" }, keywords: { "": ["capitals"] } });
    const [listed] = await useCases.listDecks(instance.url);
    expect(listed).toMatchObject({ formatVersion: 6, title: { en: "Capitals", sv: "Huvudstäder" }, keywords: { "": ["capitals"] } });
    const cards = await useCases.listCards(listed!);
    expect(cards.map((card) => [card.id, card.formatVersion]).sort()).toEqual([
      ["dk", 5],
      ["no", 5],
      ["q12418", 5],
      ["se", 5],
    ]);
    expect((await useCases.validateInstance(instance.url)).conforms).toBe(true);
    expect(await useCases.planMigration(instance.url)).toMatchObject({ deckCount: 0, cardCount: 0 });

    // The text is the release's, triple for triple: nothing tagged, nothing dropped, nothing invented.
    const triples = await everyTriple(store);
    const card = (id: string) => `<${listed!.cardsDocumentUrl}#${id}>`;
    expect(triples).toEqual(
      expect.arrayContaining([
        `<${listed!.url}> <${DCTERMS}title> "Capitals"@en .`,
        `<${listed!.url}> <${DCTERMS}title> "Huvudstäder"@sv .`,
        `<${listed!.url}> <${DCTERMS}description> "Capitals of the world."@en .`,
        `<${listed!.url}> <${DCTERMS}description> "Världens huvudstäder."@sv .`,
        // The release's keyword states no language, and none is guessed.
        `<${listed!.url}> <${KEYWORD}> "capitals" .`,
        `${card("se")} <${SM_NS}front> "Sweden"@en .`,
        `${card("se")} <${SM_NS}front> "Sverige"@sv .`,
        `${card("se")} <${SM_NS}back> "Stockholm"@en .`,
        `${card("se")} <${SM_NS}back> "Stockholm"@sv .`,
        `${card("no")} <${SM_NS}front> "Norway" .`,
        `${card("no")} <${SM_NS}back> "Oslo" .`,
        `${card("no")} <${SM_NS}frontNote> "Independent since 1905."@en .`,
        `${card("no")} <${SM_NS}frontNote> "Självständigt sedan 1905."@sv .`,
        `${card("no")} <${SM_NS}backLabel> "Capital"@en .`,
        `${card("q12418")} <${SM_NS}frontImageDescription> "A painted portrait of a woman with folded hands"@en .`,
        `${card("q12418")} <${SM_NS}frontImageDescription> "Ett målat porträtt av en kvinna med knäppta händer"@sv .`,
        `${card("q12418")} <${SM_NS}back> "Mona Lisa — Leonardo da Vinci, 1500s"@en .`,
        `${card("dk")} <${SM_NS}front> "Denmark" .`,
        `${card("dk")} <${SM_NS}back> "Copenhagen" .`,
        `${card("dk")} <${SM_NS}frontNote> "A kingdom."@en .`,
      ]),
    );
    expect(triples).toContain(`<${listed!.url}> <${SM_NS}formatVersion> "6"^^<http://www.w3.org/2001/XMLSchema#integer> .`);
    for (const subject of ["se", "no", "q12418", "dk"].map(card)) {
      expect(triples, subject).toContain(`${subject} <${SM_NS}formatVersion> "5"^^<http://www.w3.org/2001/XMLSchema#integer> .`);
    }
    const texts = (subject: string, predicate: string) =>
      triples.filter((line) => line.startsWith(`${subject} <${predicate}> "`)).length;
    expect(texts(`<${listed!.url}>`, `${DCTERMS}title`)).toBe(2);
    expect(texts(`<${listed!.url}>`, KEYWORD)).toBe(1);
    expect(texts(card("se"), `${SM_NS}front`)).toBe(2);
    expect(texts(card("no"), `${SM_NS}front`)).toBe(1);
    expect(texts(card("dk"), `${SM_NS}frontNote`)).toBe(1);
  });

  it("copies a format-5 release's keywords with their language tags", { timeout: 30_000 }, async () => {
    const { useCases, store } = await app();
    const instance = await useCases.createInstance(ALICE, { containerUrl: `${POD}solid-memo/`, name: "Main", registrationTarget: "private" });

    const deck = await useCases.importLibraryDeck(instance.url, { url: TAGGED_RELEASE } as LibraryDeck);

    expect(deck.keywords).toEqual({ en: ["capitals", "countries"], sv: ["huvudstäder", "länder"] });
    const [listed] = await useCases.listDecks(instance.url);
    expect(listed!.keywords).toEqual({ en: ["capitals", "countries"], sv: ["huvudstäder", "länder"] });
    expect((await useCases.validateInstance(instance.url)).conforms).toBe(true);
    const keywords = (await everyTriple(store)).filter((line) => line.startsWith(`<${listed!.url}> <${KEYWORD}> `)).sort();
    expect(keywords).toEqual([
      `<${listed!.url}> <${KEYWORD}> "capitals"@en .`,
      `<${listed!.url}> <${KEYWORD}> "countries"@en .`,
      `<${listed!.url}> <${KEYWORD}> "huvudstäder"@sv .`,
      `<${listed!.url}> <${KEYWORD}> "länder"@sv .`,
    ]);
  });
});
