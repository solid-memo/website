// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * A subject copied into another document starts from what its source
 * says (carriedTo), through the deck and review state repositories over
 * a pod in memory: what the app does not know of a card or a state goes
 * with it (docs/data-model.md "Write discipline").
 */
import { describe, expect, it } from "vitest";
import type { Deck } from "@solid-memo/domain/deck";
import type { ReviewState } from "@solid-memo/domain/review";
import { getThing, setThing, toRdfJsDataset } from "./client/rdf";
import { carriedTo } from "./records";
import { createSolidDeckRepository } from "./solidDeckRepository";
import { createSolidInstanceCopier } from "./solidInstanceCopier";
import { createSolidReviewStateRepository } from "./solidReviewStateRepository";
import { datasetOfTurtle } from "./testing/datasets";
import { fakePod } from "./testing/fakePod";
import { SM, SM_NS } from "./vocab";

const INSTANCE = "https://pod.example/solid-memo/main/";
const OTHER = "https://other.example/ns#";

const deckOf = (id: string): Deck => ({
  id,
  url: `${INSTANCE}catalog.ttl#${id}`,
  title: { en: id },
  cardsDocumentUrl: `${INSTANCE}decks/${id}.ttl`,
  reviewsDocumentUrl: `${INSTANCE}reviews/${id}.ttl`,
  createdAt: "2026-01-01T00:00:00.000Z",
  formatVersion: 6,
  direction: "front-to-back",
  authors: [],
});
const source = deckOf("source");
const target = deckOf("target");

const state = (cardId: string): ReviewState => ({
  cardId,
  direction: "front-to-back",
  easeFactor: 2.5,
  intervalDays: 1,
  repetitions: 1,
  due: "2026-10-31",
  firstReviewedAt: "2026-10-30T08:00:00.000Z",
  lastReviewedAt: "2026-10-30T08:00:00.000Z",
  formatVersion: 2,
});

/** A pod, its repositories, and what was asked of it as no one. */
function app() {
  const pod = fakePod();
  const asNoOne: string[] = [];
  const publicFetch: typeof fetch = (input, init) => {
    asNoOne.push(String(input));
    return pod.fetch(input, init);
  };
  const now = () => new Date("2026-11-10T12:00:00.000Z");
  const decks = createSolidDeckRepository({
    fetch: pod.fetch,
    publicFetch,
    now,
    randomId: () => "id",
  });
  const reviews = createSolidReviewStateRepository({
    fetch: pod.fetch,
    publicFetch,
    randomId: () => "id",
  });
  return { pod, decks, reviews, asNoOne };
}

const noted = (subject: string) => `<${subject}> <${OTHER}note> "kept" .`;

describe("carriedTo", () => {
  it("says what the source says at another address, each value as it is, but for what cannot be carried", async () => {
    const from = "https://pod.example/a.ttl#one";
    const dataset = await datasetOfTurtle(
      "https://pod.example/a.ttl",
      `<#one> a <${OTHER}Thing> ;
        <${OTHER}note> "kept", "behållen"@sv, 3 ;
        <${OTHER}link> <https://pod.example/b>, <http://[x> ;
        <${OTHER}left> "out" ;
        <${OTHER}nested> [ <${OTHER}note> "in the source's document" ] .`,
    );
    const to = "https://pod.example/b.ttl#two";
    const carried = carriedTo(getThing(dataset, from)!, to, [`${OTHER}left`]);
    const written = await datasetOfTurtle("https://pod.example/b.ttl", "");
    expect(carried.url).toBe(to);
    const lines = [...(toRdfJsDataset(setThing(written, carried)) as Iterable<unknown>)].map(
      (quad) => {
        const { predicate, object } = quad as {
          predicate: { value: string };
          object: { termType: string; value: string; language?: string };
        };
        return `${predicate.value.replace(OTHER, "")} ${object.termType} ${object.value} ${object.language ?? ""}`.trim();
      },
    );
    expect(lines.sort()).toEqual([
      `http://www.w3.org/1999/02/22-rdf-syntax-ns#type NamedNode ${OTHER}Thing`,
      "link NamedNode https://pod.example/b",
      "note Literal 3",
      "note Literal behållen sv",
      "note Literal kept",
    ]);
  });
});

describe("a card copied from another deck", () => {
  const sourceCards = `
    <#one> a <${SM.Card}> ; <${SM.front}> "One"@en ; <${SM.back}> "Ett"@sv ;
      <${SM.formatVersion}> 7 ; <${SM.fromRelease}> <https://library.example/v1.ttl> ;
      <${SM.distractor}> <#wrong> ; <${OTHER}note> "kept" .
    <#wrong> a <${SM.Distractor}> ; <${SM.distractorText}> "Två"@sv ;
      <${SM.formatVersion}> 1 ; <${OTHER}note> "kept" .`;
  const card = {
    id: "one-2",
    front: { en: "One" },
    back: { sv: "Ett" },
    distractors: [{ id: "one-2-d1", text: { sv: "Två" } }],
  };
  const ids = { "one-2": "one", "one-2-d1": "wrong" };

  it("takes what its source says beyond what the app knows, its distractors too, but not the source's links", async () => {
    const { pod, decks, asNoOne } = app();
    await pod.put(source.cardsDocumentUrl, sourceCards);
    await decks.applyCardChanges(
      target,
      { save: [card, { id: "new", front: { en: "New" }, back: { sv: "Ny" } }], remove: [] },
      { carried: { deck: source, ids } },
    );
    const written = pod.triples(target.cardsDocumentUrl)!;
    const at = (id: string) => `${target.cardsDocumentUrl}#${id}`;
    expect(written).toContain(noted(at("one-2")));
    expect(written).toContain(noted(at("one-2-d1")));
    // A card that is no copy has only what the app writes of it.
    expect(written).not.toContain(noted(at("new")));
    // The release the source's card came from and the wrong option it names there stay the source's.
    expect(written.filter((line) => line.includes(SM.fromRelease))).toEqual([]);
    expect(written.filter((line) => line.includes(`<${SM.distractor}>`))).toEqual([
      `<${at("one-2")}> <${SM.distractor}> <${at("one-2-d1")}> .`,
    ]);
    expect(asNoOne).toEqual([]);
  });

  it("reads a source outside the pod as no one, and leaves a subject the target holds as it is", async () => {
    const { pod, decks, asNoOne } = app();
    await pod.put(source.cardsDocumentUrl, sourceCards);
    await pod.put(
      target.cardsDocumentUrl,
      `<> <http://purl.org/dc/terms/isPartOf> <${target.url}> .
       <#one-2> a <${SM.Card}> ; <${SM.front}> "Mine"@en ; <${SM.back}> "Min"@sv ; <${SM.formatVersion}> 7 .`,
    );
    await decks.applyCardChanges(
      target,
      { save: [{ ...card, distractors: [] }], remove: [] },
      { carried: { deck: source, asNoOne: true, ids } },
    );
    expect(asNoOne).toEqual([source.cardsDocumentUrl]);
    expect(pod.triples(target.cardsDocumentUrl)).not.toContain(
      noted(`${target.cardsDocumentUrl}#one-2`),
    );
  });

  it("writes the card as the app knows it when the source's document is gone", async () => {
    const { pod, decks } = app();
    await decks.applyCardChanges(
      target,
      { save: [card], remove: [] },
      { carried: { deck: source, ids } },
    );
    expect(pod.triples(target.cardsDocumentUrl)!.filter((line) => line.includes(OTHER))).toEqual(
      [],
    );
  });
});

describe("a review state copied from another deck", () => {
  const sourceReviews = `
    <#one> a <${SM.ReviewState}> ; <${SM.easeFactor}> 2.5 ; <${SM.intervalDays}> 1 ;
      <${SM.repetitions}> 1 ; <${SM.due}> "2026-10-31" ;
      <${SM.firstReviewedAt}> "2026-10-30T08:00:00.000Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> ;
      <${SM.lastReviewedAt}> "2026-10-30T08:00:00.000Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> ;
      <${SM.reviewOf}> <../decks/source.ttl#one> ; <${SM.reviewDirection}> <${SM.frontToBack}> ;
      <${SM.scheduler}> <${SM.sm2}> ; <${SM.formatVersion}> 2 ; <${OTHER}note> "kept" .`;
  const ids = { "one-2": "one", "two-2": "two" };

  it("takes what its source says beyond what the app knows, and names its card in the target", async () => {
    const { pod, reviews, asNoOne } = app();
    await pod.put(source.reviewsDocumentUrl, sourceReviews);
    await reviews.applyReviewChanges(target, {
      // The source holds a state of "one"; none of "two", and "three" is no copy.
      save: [state("one-2"), state("two-2"), state("three")],
      remove: [],
      carried: { deck: source, ids },
    });
    const written = pod.triples(target.reviewsDocumentUrl)!;
    const at = (id: string) => `${target.reviewsDocumentUrl}#${id}`;
    expect(written.filter((line) => line.includes(OTHER))).toEqual([noted(at("one-2"))]);
    expect(written).toContain(
      `<${at("one-2")}> <${SM.reviewOf}> <${target.cardsDocumentUrl}#one-2> .`,
    );
    expect(asNoOne).toEqual([]);
  });

  it("reads a source outside the pod as no one, and writes the states as the app knows them when it is gone", async () => {
    const { pod, reviews, asNoOne } = app();
    await reviews.applyReviewChanges(target, {
      save: [state("one-2")],
      remove: [],
      carried: { deck: source, asNoOne: true, ids },
    });
    expect(asNoOne).toEqual([source.reviewsDocumentUrl]);
    expect(pod.triples(target.reviewsDocumentUrl)!.filter((line) => line.includes(OTHER))).toEqual(
      [],
    );
  });
});

describe("namesLaterTerm", () => {
  const url = `${INSTANCE}decks/a.ttl`;
  const card = `<#c> a <${SM.Card}> ; <${SM.front}> "A term: ${SM_NS}later"@en`;

  /** A pod that says what each document is, as a server does on a HEAD. */
  function copier(documents: Record<string, { type?: string; body: string }>) {
    const fetch: typeof globalThis.fetch = async (input) => {
      const document = documents[String(input)];
      return document === undefined
        ? new Response(null, { status: 404 })
        : Object.defineProperty(
            new Response(document.body, {
              headers: document.type === undefined ? {} : { "Content-Type": document.type },
            }),
            "url",
            { value: String(input) },
          );
    };
    return createSolidInstanceCopier({ fetch });
  }
  const turtle = (body: string) => ({ type: "text/turtle", body });

  it("says whether a document uses a term of the vocabulary this app does not know, as a property, a class or a concept", async () => {
    for (const later of [
      `${card} ; <${SM_NS}laterNote> "x" .`,
      `${card} . <#t> a <${SM_NS}LaterThing> .`,
      `${card} . <#s> a <${SM.ReviewState}> ; <${SM.scheduler}> <${SM_NS}laterScheduler> .`,
    ]) {
      expect(await copier({ [url]: turtle(later) }).namesLaterTerm(url)).toBe(true);
    }
    // Text that spells one, another vocabulary's terms and this app's own are none.
    const known = `${card} ; <${OTHER}note> "x" ; <${SM.fromRelease}> <${OTHER}release> .`;
    expect(await copier({ [url]: turtle(known) }).namesLaterTerm(url)).toBe(false);
  });

  it("does not look at a file that is not Turtle, and fails when the resource cannot be read", async () => {
    const files = copier({
      [`${INSTANCE}a.png`]: { type: "image/png", body: `${SM_NS}later` },
      [`${INSTANCE}b`]: { body: "" },
    });
    expect(await files.namesLaterTerm(`${INSTANCE}a.png`)).toBe(false);
    expect(await files.namesLaterTerm(`${INSTANCE}b`)).toBe(false);
    await expect(files.namesLaterTerm(url)).rejects.toThrow(`url: ${url}\nstatus: 404`);
  });
});
