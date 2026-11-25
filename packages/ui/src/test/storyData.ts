// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Card, Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import illustrationUrl from "../assets/illustration.svg";

/**
 * Data the stories share (docs/storybook.md#writing-a-story): an
 * instance on a made-up pod, decks in the scripts the app shows (Latin,
 * Japanese, Korean, Arabic, right to left), and their cards. Nothing
 * here is read from or written to a pod.
 */

/**
 * A picture for a card: the app's own illustration, at its web address
 * on the Storybook's site. A card shows only a picture at an http(s)
 * address (isHttpUrl), and this one is fetched from nowhere else.
 */
export const storyPictureUrl = new URL(illustrationUrl, location.href).href;

/** An instance, on a pod at an address that reaches nothing. */
export const storyInstance: Instance = {
  url: "https://pod.example/solid-memo/study/",
  name: "My study",
};

/** A deck of the story instance, its documents where the app keeps them. */
export function storyDeck(id: string, title: Deck["title"], more: Partial<Deck> = {}): Deck {
  return {
    id,
    url: `${storyInstance.url}catalog.ttl#${id}`,
    title,
    cardsDocumentUrl: `${storyInstance.url}decks/${id}.ttl`,
    reviewsDocumentUrl: `${storyInstance.url}reviews/${id}.ttl`,
    direction: "front-to-back",
    createdAt: "2026-09-21T10:00:00.000Z",
    formatVersion: 1,
    authors: [],
    ...more,
  };
}

/** A card of a deck, its front and back in the language each is in ("" for none). */
export function storyCard(
  deck: Deck,
  id: string,
  front: Card["front"],
  back: Card["back"],
  more: Partial<Card> = {},
): Card {
  return {
    id,
    url: `${deck.cardsDocumentUrl}#${id}`,
    front,
    back,
    createdAt: "2026-09-21T10:00:00.000Z",
    formatVersion: 1,
    ...more,
  };
}

/** Japanese kanji, front to back. */
export const kanjiDeck = storyDeck("kanji", { en: "Kanji N5", sv: "Kanji N5" });

/** Korean words, both ways. */
export const koreanDeck = storyDeck(
  "korean",
  { en: "Korean everyday words", ko: "한국어 생활 단어" },
  { direction: "bidirectional" },
);

/** Arabic words: card text that runs right to left. */
export const arabicDeck = storyDeck("arabic", { en: "Arabic greetings", ar: "تحيات عربية" });

/** A deck whose title is long enough to wrap. */
export const longTitleDeck = storyDeck("long", {
  en: "The capitals, rivers and mountain ranges of every country in Europe, with their flags",
});

/** The story decks, in the order a list shows them. */
export const storyDecks: Deck[] = [kanjiDeck, koreanDeck, arabicDeck, longTitleDeck];

/** Cards of the kanji deck. */
export const kanjiCards: Card[] = [
  storyCard(kanjiDeck, "water", { "": "水" }, { en: "water" }),
  storyCard(kanjiDeck, "fire", { "": "火" }, { en: "fire" }),
  storyCard(kanjiDeck, "tree", { "": "木" }, { en: "tree" }),
];

/** A card of the Arabic deck, its front right to left. */
export const arabicCard: Card = storyCard(arabicDeck, "hello", { ar: "مرحبا" }, { en: "Hello" });
