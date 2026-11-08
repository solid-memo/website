// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import type { Answer } from "./answer";
import type { Card, Deck, Distractor } from "./deck";
import type { DeckTree } from "./deckTree";
import type { LibraryDeckContent } from "./library";
import type { FsrsSnapshot, FsrsState, ReviewSnapshot, ReviewState, ReviewStates } from "./review";
import { rebaseDraft } from "./release/releaseToDraft";
import { card as draftCard, courseDraft } from "./testing/releaseDraft";
import {
  addressesGuest,
  cardFitsDeck,
  linksGuestPod,
  decodeGuestMergeNote,
  draftAddressesGuest,
  encodeGuestMergeNote,
  GUEST_INSTANCE_URL,
  GUEST_ORIGIN,
  GUEST_WEBID,
  graftOfGuestTree,
  guestDeckStamp,
  guestMergeKey,
  guestMergePlan,
  isGuestPodIri,
  isGuestUrl,
  mergedAnswer,
  mergedDeck,
  movedCard,
  suggestedGuestLocation,
} from "./guest";

const TARGET = "https://pod.example/solid-memo/main/";
const RELEASE = "https://solid-memo.com/decks/capitals/v1.ttl";

function deck(id: string, instanceUrl = GUEST_INSTANCE_URL, extra: Partial<Deck> = {}): Deck {
  return {
    id,
    url: `${instanceUrl}catalog.ttl#${id}`,
    title: { en: id },
    cardsDocumentUrl: `${instanceUrl}decks/${id}.ttl`,
    reviewsDocumentUrl: `${instanceUrl}reviews/${id}.ttl`,
    createdAt: "2026-10-01T10:00:00.000Z",
    formatVersion: 5,
    direction: "front-to-back",
    authors: [],
    ...extra,
  };
}

describe("guest", () => {
  it("keeps the WebID and the instance in the guest's pod", () => {
    expect(isGuestUrl(GUEST_WEBID)).toBe(true);
    expect(isGuestUrl(GUEST_INSTANCE_URL)).toBe(true);
    expect(new URL(GUEST_ORIGIN).hostname.endsWith(".invalid")).toBe(true);
  });

  it("tells guest URLs from any other", () => {
    expect(isGuestUrl("https://pod.example/solid-memo/")).toBe(false);
  });

  it("suggests keeping a guest's study as a new instance where a first instance goes", () => {
    expect(suggestedGuestLocation("https://pod.example")).toBe(
      "https://pod.example/solid-memo/main/",
    );
    expect(suggestedGuestLocation("https://pod.example/")).toBe(
      "https://pod.example/solid-memo/main/",
    );
  });
});

describe("adding a guest's study to an instance", () => {
  it("plans each guest deck with the instance's decks from the same library release", () => {
    const copied = deck("deck-g1", GUEST_INSTANCE_URL, { sourceUrl: RELEASE });
    const own = deck("deck-g2");
    const theirs = deck("deck-t1", TARGET, { sourceUrl: RELEASE });
    const other = deck("deck-t2", TARGET, {
      sourceUrl: "https://solid-memo.com/decks/capitals/v2.ttl",
    });
    expect(guestMergePlan([copied, own], [theirs, other, deck("deck-t3", TARGET)], 2)).toEqual({
      decks: [
        { deck: copied, sameRelease: [theirs] },
        { deck: own, sameRelease: [] },
      ],
      drafts: 2,
    });
  });

  it("makes a guest deck a new deck of the instance, everything it says kept but its id, documents and format", () => {
    const guest = deck("deck-g1", GUEST_INSTANCE_URL, {
      sourceUrl: RELEASE,
      completedChapters: [`${RELEASE}#ch-1`],
      newCardsPerDay: 5,
    });
    expect(mergedDeck(guest, TARGET.slice(0, -1), "deck-n", 6)).toEqual({
      ...guest,
      id: "deck-n",
      url: `${TARGET}catalog.ttl#deck-n`,
      cardsDocumentUrl: `${TARGET}decks/deck-n.ttl`,
      reviewsDocumentUrl: `${TARGET}reviews/deck-n.ttl`,
      formatVersion: 6,
    });
  });

  it("names an answer's deck, card and wrong option in the deck it was added as, by the same fragment ids", () => {
    const from = deck("deck-g1");
    const to = deck("deck-n", TARGET);
    const answer: Answer = {
      id: "answer-1",
      deckUrl: from.url,
      cardUrl: `${from.cardsDocumentUrl}#q-1`,
      direction: "front-to-back",
      grade: 1,
      answeredAt: "2026-10-01T10:00:00.000Z",
      studyDay: "2026-10-01",
      nextIntervalDays: 1,
      mode: "multiple-choice",
      chosenDistractor: `${from.cardsDocumentUrl}#q-1-d1`,
    };
    expect(mergedAnswer(answer, to)).toEqual({
      ...answer,
      id: "answer-1-deck-n",
      deckUrl: to.url,
      cardUrl: `${to.cardsDocumentUrl}#q-1`,
      chosenDistractor: `${to.cardsDocumentUrl}#q-1-d1`,
    });
    const { mode: _mode, chosenDistractor: _chosen, ...recalled } = answer;
    expect(mergedAnswer(recalled, to)).toEqual({
      ...recalled,
      id: "answer-1-deck-n",
      deckUrl: to.url,
      cardUrl: `${to.cardsDocumentUrl}#q-1`,
    });
    // Added to another deck, the same answer is an entry of its own; to the same deck, the same entry.
    expect(mergedAnswer(answer, deck("deck-m", TARGET)).id).toBe("answer-1-deck-m");
    expect(mergedAnswer(answer, to)).toEqual(mergedAnswer(answer, to));
  });

  it("leaves out a wrong option whose IRI in the deck it was added as would be too long, not the answer", () => {
    const from = deck("deck-g1");
    const to = deck("deck-n", `${TARGET}${"p".repeat(200)}/`);
    // Fits under the guest's address, not under the longer one of the deck it is added as.
    const id = "d".repeat(16_383 - 2 - from.cardsDocumentUrl.length - 1);
    const answer: Answer = {
      id: "answer-1",
      deckUrl: from.url,
      cardUrl: `${from.cardsDocumentUrl}#q-1`,
      direction: "front-to-back",
      grade: 1,
      answeredAt: "2026-10-01T10:00:00.000Z",
      studyDay: "2026-10-01",
      nextIntervalDays: 1,
      mode: "multiple-choice",
      chosenDistractor: `${from.cardsDocumentUrl}#${id}`,
    };
    const { chosenDistractor: _chosen, ...rest } = answer;
    expect(mergedAnswer(answer, to)).toEqual({
      ...rest,
      id: "answer-1-deck-n",
      deckUrl: to.url,
      cardUrl: `${to.cardsDocumentUrl}#q-1`,
    });
  });

  it("adds a card only when its IRI, and its review states' longest, can be written in the deck it was added as", () => {
    const from = deck("deck-g1");
    const to = deck("deck-n", `${TARGET}${"p".repeat(200)}/`);
    // The longest name a card's states take: its FSRS-6 state from back to front.
    const room = 16_383 - 2 - "@back-to-front@fsrs6".length - 1;
    const fits = "c".repeat(room - from.reviewsDocumentUrl.length);

    expect(cardFitsDeck("q-1", to)).toBe(true);
    expect(cardFitsDeck(fits, from)).toBe(true);
    expect(cardFitsDeck(fits, to)).toBe(false);
    // Its own IRI fits; that of its FSRS-6 state from back to front does not.
    expect(cardFitsDeck(`${fits}c`, from)).toBe(false);
    expect(cardFitsDeck("q 1", to)).toBe(false);
  });

  it("adds a card without a wrong option whose IRI in the deck it was added as would be too long", () => {
    const from = deck("deck-g1");
    const to = deck("deck-n", `${TARGET}${"p".repeat(200)}/`);
    // Fits under the guest's address, not under the longer one of the deck it is added as.
    const long: Distractor = {
      id: "d".repeat(16_383 - 2 - from.cardsDocumentUrl.length - 1),
      text: { en: "Oslo" },
    };
    const short: Distractor = { id: "wrong-1", text: { en: "Bergen" } };
    const card: Pick<Card, "id" | "front" | "back" | "distractors"> = {
      id: "q-1",
      front: { en: "Sweden" },
      back: { en: "Stockholm" },
    };

    expect(movedCard({ ...card, distractors: [short, long] }, to.cardsDocumentUrl)).toEqual({
      ...card,
      distractors: [short],
    });
    expect(movedCard({ ...card, distractors: [long] }, to.cardsDocumentUrl)).toEqual(card);
    const whole = { ...card, distractors: [short] };
    expect(movedCard(whole, to.cardsDocumentUrl)).toBe(whole);
    expect(movedCard(card, to.cardsDocumentUrl)).toBe(card);
    expect(movedCard({ ...card, distractors: [long] }, from.cardsDocumentUrl)).toEqual({
      ...card,
      distractors: [long],
    });
  });

  it("keeps an answer's response times, prior due day and offset from UTC as they were", () => {
    const from = deck("deck-g1");
    const to = deck("deck-n", TARGET);
    const timed: Answer = {
      id: "answer-1",
      deckUrl: from.url,
      cardUrl: `${from.cardsDocumentUrl}#q-1`,
      direction: "front-to-back",
      grade: 4,
      answeredAt: "2026-10-01T10:00:00.000Z",
      studyDay: "2026-10-01",
      priorIntervalDays: 1,
      nextIntervalDays: 6,
      recallMillis: 3_100,
      gradeMillis: 700,
      priorDue: "2026-09-30",
      utcOffsetMinutes: 120,
    };
    expect(mergedAnswer(timed, to)).toMatchObject({
      recallMillis: 3_100,
      gradeMillis: 700,
      priorDue: "2026-09-30",
      utcOffsetMinutes: 120,
    });
  });

  it("stamps a guest's deck with its entry and its documents' versions, its chapters in any order", () => {
    const versionOf = (url: string) => (url.includes("/decks/") ? '"c1"' : "");
    const course = deck("deck-g1", GUEST_INSTANCE_URL, {
      completedChapters: [`${RELEASE}#ch-2`, `${RELEASE}#ch-1`],
    });
    const stamp = guestDeckStamp(course, versionOf);
    expect(JSON.parse(stamp)).toEqual({
      entry: { ...course, completedChapters: [`${RELEASE}#ch-1`, `${RELEASE}#ch-2`] },
      cards: '"c1"',
      reviews: "",
    });
    expect(
      guestDeckStamp(
        { ...course, completedChapters: [`${RELEASE}#ch-1`, `${RELEASE}#ch-2`] },
        versionOf,
      ),
    ).toBe(stamp);
    expect(guestDeckStamp({ ...course, title: { en: "Renamed" } }, versionOf)).not.toBe(stamp);
    expect(guestDeckStamp(course, () => '"c2"')).not.toBe(stamp);
    expect(JSON.parse(guestDeckStamp(deck("deck-g2"), versionOf)).entry).not.toHaveProperty(
      "completedChapters",
    );
  });

  it("makes the guest's groups new around the decks added, in the guest's order, leaving out decks not added", () => {
    const [a, b, c] = [deck("a"), deck("b"), deck("c")];
    const tree: DeckTree = {
      readOnly: false,
      children: [
        { kind: "deck", deck: a },
        {
          kind: "group",
          group: { url: `${GUEST_INSTANCE_URL}catalog.ttl#group-1`, title: { en: "Languages" } },
          children: [
            { kind: "deck", deck: b },
            { kind: "group", group: { url: "x", title: { sv: "Tomt" } }, children: [] },
          ],
        },
        { kind: "deck", deck: c },
      ],
    };
    const added = new Map([
      [a.url, deck("a2", TARGET)],
      [b.url, deck("b2", TARGET)],
    ]);
    let n = 0;
    const named: string[] = [];
    const newGroup = (group: { url: string }) => {
      named.push(group.url);
      return `${TARGET}catalog.ttl#group-${++n}`;
    };
    expect(graftOfGuestTree(tree, added, newGroup)).toEqual([
      { kind: "deck", url: `${TARGET}catalog.ttl#a2` },
      {
        kind: "group",
        group: { url: `${TARGET}catalog.ttl#group-1`, title: { en: "Languages" } },
        children: [
          { kind: "deck", url: `${TARGET}catalog.ttl#b2` },
          {
            kind: "group",
            group: { url: `${TARGET}catalog.ttl#group-2`, title: { sv: "Tomt" } },
            children: [],
          },
        ],
      },
    ]);
    expect(named).toEqual([`${GUEST_INSTANCE_URL}catalog.ttl#group-1`, "x"]);
    expect(
      graftOfGuestTree({ readOnly: false, children: [{ kind: "deck", deck: a }] }, added, newGroup),
    ).toEqual([]);
  });

  it("finds the guest's pod named by an address anywhere in a value", () => {
    expect(addressesGuest([{ a: 1, b: [null, { c: `${GUEST_ORIGIN}x` }] }])).toBe(true);
    expect(addressesGuest({ a: 1, b: [null, true, "https://pod.example/"] })).toBe(false);
  });

  it("finds the guest's pod however its URL is spelled, by the origin it parses to", () => {
    for (const text of [
      `See <${GUEST_ORIGIN}decks/x.ttl>.`,
      "[card](HTTPS://Guest.Solid-Memo.Invalid/x)",
      "https://guest.solid-memo.invalid",
      "https://guest.solid-memo.invalid:443/x",
      "https://someone@guest.solid-memo.invalid/",
      "https://guest%2Esolid-memo.invalid/",
      `https://${GUEST_ORIGIN}`,
      "https:guest.solid-memo.invalid/x",
      "https:/guest.solid-memo.invalid/x",
      "https:\\\\guest.solid-memo.invalid/x",
      "https://guest.solid-\tmemo.invalid/x",
    ])
      expect(addressesGuest({ frontImageUrl: text })).toBe(true);
    for (const text of [
      "https://evil.example/?next=guest.solid-memo.invalid/",
      "https://guest.solid-memo.invalid.example/",
      "https://guest.solid-memo.invalid:8443/",
      "http://guest.solid-memo.invalid/",
      "https://[",
      "guest.solid-memo.invalid",
    ])
      expect(addressesGuest({ frontImageUrl: text })).toBe(false);
    expect(isGuestPodIri("HTTPS://GUEST.solid-memo.invalid:443/x")).toBe(true);
    expect(isGuestPodIri("https://pod.example/")).toBe(false);
    expect(isGuestPodIri("guest.solid-memo.invalid")).toBe(false);
  });

  it("leaves the text a reader reads out: a card or deck may name the guest's pod in words (GHSA-22fh-2823-783x)", () => {
    const named = { en: `What is ${GUEST_ORIGIN}? And HTTPS://GUEST.solid-memo.invalid:443?` };
    const content = {
      front: named,
      back: named,
      frontImageDescription: named,
      frontLabel: named,
      frontNote: named,
      backImageDescription: named,
      backLabel: named,
      backNote: named,
      distractors: [{ id: "d1", text: named, note: named }],
      subjects: ["https://www.wikidata.org/entity/Q1"],
    };
    const ownDeck = deck("deck-1", TARGET, {
      description: named,
      keywords: { en: [GUEST_ORIGIN] },
      authors: [GUEST_ORIGIN],
      title: named,
    });
    expect(addressesGuest([ownDeck, [content], { sm2: [], fsrs: [] }])).toBe(false);
    expect(addressesGuest([ownDeck, [{ ...content, subjects: [`${GUEST_ORIGIN}x`] }]])).toBe(true);
    expect(
      addressesGuest([{ ...ownDeck, sourceUrl: "HTTPS://GUEST.solid-memo.invalid:443/r" }]),
    ).toBe(true);
  });

  it("skips as reader text exactly the fields that are, in a deck, a card, a wrong option and a review state", () => {
    // Every field, true when it is text for the reader: a field added to one of these types fails to typecheck until it is placed here.
    const deckFields: Record<keyof Deck, boolean> = {
      id: false,
      url: false,
      title: true,
      cardsDocumentUrl: false,
      reviewsDocumentUrl: false,
      createdAt: false,
      modifiedAt: false,
      formatVersion: false,
      direction: false,
      authors: true,
      license: false,
      description: true,
      sourceUrl: false,
      themes: false,
      keywords: true,
      newCardsPerDay: false,
      maxReviewsPerDay: false,
      completedChapters: false,
      course: false,
      cardLanguage: false,
      pictureHosts: false,
    };
    const cardFields: Record<keyof Card, boolean> = {
      id: false,
      url: false,
      createdAt: false,
      formatVersion: false,
      retired: false,
      fromRelease: false,
      front: true,
      back: true,
      frontImageUrl: false,
      frontImageDescription: true,
      frontLabel: true,
      frontNote: true,
      backImageUrl: false,
      backImageDescription: true,
      backLabel: true,
      backNote: true,
      distractors: false,
      textFormat: false,
      subjects: false,
    };
    const distractorFields: Record<keyof Distractor, boolean> = {
      id: false,
      text: true,
      note: true,
      retired: false,
    };
    const stateFields: Record<
      keyof ReviewState | keyof FsrsState | keyof ReviewSnapshot | keyof FsrsSnapshot,
      boolean
    > = {
      cardId: false,
      direction: false,
      easeFactor: false,
      intervalDays: false,
      repetitions: false,
      stability: false,
      difficulty: false,
      due: false,
      firstReviewedAt: false,
      lastReviewedAt: false,
      formatVersion: false,
      previous: false,
    };
    const statesFields: Record<keyof ReviewStates, boolean> = { sm2: false, fsrs: false };
    for (const fields of [deckFields, cardFields, distractorFields, stateFields, statesFields])
      for (const [field, readerText] of Object.entries(fields))
        expect(addressesGuest({ [field]: `${GUEST_ORIGIN}x` }), field).toBe(!readerText);
  });

  it("finds outside data that links to the guest's pod, but not by its own places, which an import gives anew (GHSA-hc3p-fpwj-fvjp)", () => {
    const own = {
      id: "deck-1",
      url: `${GUEST_INSTANCE_URL}catalog.ttl#deck-1`,
      cardsDocumentUrl: `${GUEST_INSTANCE_URL}decks/deck-1.ttl`,
      reviewsDocumentUrl: `${GUEST_INSTANCE_URL}reviews/deck-1.ttl`,
      title: { en: `About ${GUEST_ORIGIN}` },
    };
    const card = { id: "c1", url: `${GUEST_INSTANCE_URL}decks/deck-1.ttl#c1`, front: { en: "Q" } };
    expect(linksGuestPod([own, [card], [{ cardId: "c1" }]])).toBe(false);
    expect(addressesGuest([own])).toBe(true);
    for (const link of [
      { frontImageUrl: `${GUEST_ORIGIN}p.png` },
      { backImageUrl: "HTTPS://GUEST.solid-memo.invalid:443/p.png" },
      { subjects: [`${GUEST_ORIGIN}a`] },
    ])
      expect(linksGuestPod([own, [{ ...card, ...link }]]), JSON.stringify(link)).toBe(true);
    for (const link of [
      { license: `${GUEST_ORIGIN}l` },
      { themes: [`${GUEST_ORIGIN}t`] },
      { sourceUrl: `${GUEST_ORIGIN}r.ttl` },
      { seriesUrl: `${GUEST_ORIGIN}r.ttl#series` },
    ])
      expect(linksGuestPod({ ...own, ...link }), JSON.stringify(link)).toBe(true);
  });

  it("skips in a release only its own address and the text the reader reads, which may name the guest's pod (GHSA-hc3p-fpwj-fvjp)", () => {
    // Every field, true when it is skipped: a field added to a release fails to typecheck until it is placed here.
    const releaseFields: Record<keyof LibraryDeckContent, boolean> = {
      url: true,
      title: true,
      formatVersion: false,
      authors: true,
      license: false,
      description: true,
      direction: false,
      version: false,
      seriesUrl: false,
      versionNotes: true,
      modifiedAt: false,
      themes: false,
      keywords: true,
      cards: false,
      isCourse: false,
      contact: false,
    };
    for (const [field, skipped] of Object.entries(releaseFields))
      expect(linksGuestPod({ [field]: `${GUEST_ORIGIN}x` }), field).toBe(!skipped);
    const notes = `Pictures no longer at ${GUEST_ORIGIN}p.png, see HTTPS://GUEST.solid-memo.invalid:443`;
    expect(linksGuestPod({ versionNotes: notes, cards: [{ id: "c1", front: { en: "Q" } }] })).toBe(
      false,
    );
    for (const link of [
      { license: `${GUEST_ORIGIN}l` },
      { cards: [{ id: "c1", frontImageUrl: `${GUEST_ORIGIN}p.png` }] },
      { cards: [{ id: "c1", subjects: [`${GUEST_ORIGIN}a`] }] },
    ])
      expect(linksGuestPod({ versionNotes: notes, ...link }), JSON.stringify(link)).toBe(true);
  });

  it("finds a draft that links to the guest's pod, but not one whose text names it", () => {
    const text = `See ${GUEST_ORIGIN} and HTTPS://GUEST.solid-memo.invalid:443`;
    const draft = courseDraft();
    const worded = { ...draft, cards: [{ id: "c9", data: draftCard(text) }] };
    expect(draftAddressesGuest(draft)).toBe(false);
    expect(draftAddressesGuest(worded)).toBe(false);
    expect(
      draftAddressesGuest(rebaseDraft(draft, `${GUEST_INSTANCE_URL}drafts/x/v1/release.ttl`)),
    ).toBe(true);
    expect(
      draftAddressesGuest({ ...draft, root: { ...draft.root, prev: `${GUEST_ORIGIN}r.ttl` } }),
    ).toBe(true);
    const triple = draft.triples[0]!;
    expect(
      draftAddressesGuest({ ...draft, triples: [{ ...triple, predicate: `${GUEST_ORIGIN}p` }] }),
    ).toBe(true);
  });

  it("keeps a note of a deck or group added, per guest's and instance, and reads back only a note it wrote", () => {
    expect(guestMergeKey(`${GUEST_INSTANCE_URL}catalog.ttl#deck-1`, TARGET.slice(0, -1))).toBe(
      `${GUEST_INSTANCE_URL}catalog.ttl#deck-1 added to ${TARGET}`,
    );
    const note = { url: `${TARGET}catalog.ttl#deck-n`, stamp: '"1"\n"2"' };
    expect(decodeGuestMergeNote(encodeGuestMergeNote(note))).toEqual(note);
    expect(decodeGuestMergeNote(null)).toBeNull();
    expect(decodeGuestMergeNote("{")).toBeNull();
    expect(decodeGuestMergeNote("null")).toBeNull();
    expect(decodeGuestMergeNote(JSON.stringify({ url: 1, stamp: "" }))).toBeNull();
    expect(decodeGuestMergeNote(JSON.stringify({ url: "x" }))).toBeNull();
  });
});
