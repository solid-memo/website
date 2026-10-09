import { describe, expect, it } from "vitest";
import type { Answer } from "./answer";
import type { Deck } from "./deck";
import type { DeckTree } from "./deckTree";
import {
  decodeGuestMergeNote,
  encodeGuestMergeNote,
  GUEST_INSTANCE_URL,
  GUEST_ORIGIN,
  GUEST_WEBID,
  graftOfGuestTree,
  guestDeckStamp,
  guestMergeKey,
  guestMergePlan,
  isGuestUrl,
  mentionsGuest,
  mergedAnswer,
  mergedDeck,
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
    expect(suggestedGuestLocation("https://pod.example")).toBe("https://pod.example/solid-memo/main/");
    expect(suggestedGuestLocation("https://pod.example/")).toBe("https://pod.example/solid-memo/main/");
  });
});

describe("adding a guest's study to an instance", () => {
  it("plans each guest deck with the instance's decks from the same library release", () => {
    const copied = deck("deck-g1", GUEST_INSTANCE_URL, { sourceUrl: RELEASE });
    const own = deck("deck-g2");
    const theirs = deck("deck-t1", TARGET, { sourceUrl: RELEASE });
    const other = deck("deck-t2", TARGET, { sourceUrl: "https://solid-memo.com/decks/capitals/v2.ttl" });
    expect(guestMergePlan([copied, own], [theirs, other, deck("deck-t3", TARGET)])).toEqual({
      decks: [
        { deck: copied, sameRelease: [theirs] },
        { deck: own, sameRelease: [] },
      ],
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
    expect(mergedAnswer(recalled, to)).toEqual({ ...recalled, id: "answer-1-deck-n", deckUrl: to.url, cardUrl: `${to.cardsDocumentUrl}#q-1` });
    // Added to another deck, the same answer is an entry of its own; to the same deck, the same entry.
    expect(mergedAnswer(answer, deck("deck-m", TARGET)).id).toBe("answer-1-deck-m");
    expect(mergedAnswer(answer, to)).toEqual(mergedAnswer(answer, to));
  });

  it("stamps a guest's deck with its entry and its documents' versions, its chapters in any order", () => {
    const versionOf = (url: string) => (url.includes("/decks/") ? '"c1"' : "");
    const course = deck("deck-g1", GUEST_INSTANCE_URL, { completedChapters: [`${RELEASE}#ch-2`, `${RELEASE}#ch-1`] });
    const stamp = guestDeckStamp(course, versionOf);
    expect(JSON.parse(stamp)).toEqual({
      entry: { ...course, completedChapters: [`${RELEASE}#ch-1`, `${RELEASE}#ch-2`] },
      cards: '"c1"',
      reviews: "",
    });
    expect(guestDeckStamp({ ...course, completedChapters: [`${RELEASE}#ch-1`, `${RELEASE}#ch-2`] }, versionOf)).toBe(stamp);
    expect(guestDeckStamp({ ...course, title: { en: "Renamed" } }, versionOf)).not.toBe(stamp);
    expect(guestDeckStamp(course, () => '"c2"')).not.toBe(stamp);
    expect(JSON.parse(guestDeckStamp(deck("deck-g2"), versionOf)).entry).not.toHaveProperty("completedChapters");
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
          children: [{ kind: "deck", deck: b }, { kind: "group", group: { url: "x", title: { sv: "Tomt" } }, children: [] }],
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
          { kind: "group", group: { url: `${TARGET}catalog.ttl#group-2`, title: { sv: "Tomt" } }, children: [] },
        ],
      },
    ]);
    expect(named).toEqual([`${GUEST_INSTANCE_URL}catalog.ttl#group-1`, "x"]);
    expect(graftOfGuestTree({ readOnly: false, children: [{ kind: "deck", deck: a }] }, added, newGroup)).toEqual([]);
  });

  it("finds the guest's pod named anywhere in a value", () => {
    expect(mentionsGuest([{ a: 1, b: [null, { c: `${GUEST_ORIGIN}x` }] }])).toBe(true);
    expect(mentionsGuest({ a: 1, b: [null, true, "https://pod.example/"] })).toBe(false);
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
