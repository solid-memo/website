import type { Card, Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import type { Session } from "@solid-memo/domain/session";

/** What the Studio's tests share: a user, two instances, and decks and cards in the first. */
export const session: Session = { webId: "https://alice.example/profile/card#me" };

export const instanceA: Instance = { url: "https://pod.example/solid-memo/a/", name: "Deck set A" };
export const instanceB: Instance = { url: "https://pod.example/solid-memo/b/", name: "Deck set B" };

export function makeDeck(id: string, title: Deck["title"]): Deck {
  return {
    id,
    url: `${instanceA.url}catalog.ttl#${id}`,
    title,
    cardsDocumentUrl: `${instanceA.url}decks/${id}.ttl`,
    reviewsDocumentUrl: `${instanceA.url}reviews/${id}.ttl`,
    direction: "front-to-back",
    createdAt: "2026-09-21T10:00:00.000Z",
    formatVersion: 3,
    authors: [],
  };
}

export function makeCard(deck: Deck, id: string, retired = false): Card {
  return {
    id,
    url: `${deck.cardsDocumentUrl}#${id}`,
    front: { en: id },
    back: { en: id },
    createdAt: "2026-09-21T10:00:00.000Z",
    formatVersion: 3,
    ...(retired ? { retired: true as const } : {}),
  };
}
