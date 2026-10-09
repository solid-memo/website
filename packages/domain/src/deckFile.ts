import { CARD_FORMAT_VERSION, DECK_FORMAT_VERSION, type Card, type Deck } from "./deck";
import { catalogUrlOf, documentsInUse, ensureTrailingSlash } from "./instanceLayout";
import { shown } from "./langText";
import type { ReviewState } from "./review";

/**
 * A deck as a file (docs/studio.md#import-and-export): the deck's entry,
 * its cards with their wrong options and, when asked, its review states,
 * in Turtle or JSON-LD. An export holds the deck's triples as the pod
 * has them, at the pod's IRIs. An import reads the file with this app's
 * mappers, older formats brought up to date, and writes a new deck of
 * the instance from it.
 */

export type DeckFileFormat = "turtle" | "jsonld";

export const DECK_FILE_FORMATS: readonly DeckFileFormat[] = ["turtle", "jsonld"];

/** Each format's media type, and the extension of the files it is written to. */
export const DECK_FILE_TYPES: Readonly<Record<DeckFileFormat, { mediaType: string; extension: string }>> = {
  turtle: { mediaType: "text/turtle", extension: ".ttl" },
  jsonld: { mediaType: "application/ld+json", extension: ".jsonld" },
};

/** What the file picker offers: both formats, by extension and media type. */
export const DECK_FILE_ACCEPT = ".ttl,.jsonld,.json,text/turtle,application/ld+json";

/**
 * Where a file is taken to be, for the relative IRIs it holds: a file has
 * no address of its own. `.invalid` is never anyone's host.
 */
export const DECK_FILE_BASE = "https://file.solid-memo.invalid/";

/** How a deck is exported: its format, and whether its review states (and a course's progress) go with it. */
export interface DeckFileOptions {
  format: DeckFileFormat;
  withProgress: boolean;
}

/** A subject read from a file in an older format, brought up to this app's. */
export interface FormatUpgrade {
  kind: "deck" | "card" | "reviewState";
  subject: string;
  from: number;
  to: number;
}

/** What a deck file holds, read with this app's mappers. */
export interface DeckFileContent {
  /** The deck, as the file states it: its URLs the file's own. */
  deck: Deck;
  /** Its cards: those of its cards document that the file holds. */
  cards: Card[];
  /** The review states of its reviews document, of the cards it holds; absent when the file holds none. */
  reviews?: ReviewState[];
  /** The subjects in an older format, brought up to date as they were read. */
  upgraded: FormatUpgrade[];
  /** The subjects of a deck's kinds this app could not read, or that belong to none of the deck's documents: left out. */
  dropped: string[];
}

/** A deck file the user opened: its name, its format and what it holds. */
export interface DeckFile {
  name: string;
  format: DeckFileFormat;
  content: DeckFileContent;
}

/** The format of a file: by its extension, else JSON-LD when it starts as JSON does, else Turtle. */
export function deckFileFormatOf(name: string, text: string): DeckFileFormat {
  const lower = name.toLowerCase();
  if (lower.endsWith(".jsonld") || lower.endsWith(".json")) return "jsonld";
  if (lower.endsWith(".ttl")) return "turtle";
  return /^\s*[[{]/.test(text) ? "jsonld" : "turtle";
}

/** The base a file's relative IRIs are resolved against: DECK_FILE_BASE, then its name. */
export function deckFileBaseOf(name: string): string {
  return `${DECK_FILE_BASE}${encodeURIComponent(name)}`;
}

/**
 * The name a deck is saved under: its title (in English, else its first
 * language) as lower-case letters, digits and dashes, accents dropped,
 * then the format's extension; "deck" when nothing of the title is left.
 */
export function deckFileName(deck: Deck, format: DeckFileFormat): string {
  const slug = shown(deck.title)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 60)
    .replace(/^-+|-+$/g, "");
  return `${slug === "" ? "deck" : slug}${DECK_FILE_TYPES[format].extension}`;
}

/**
 * A deck id this app gives: `deck-`, then letters, digits, `-` and `_`.
 * No other subject of the catalog document has one: not `#catalog`, a
 * group (`#group-…`) or an agent (`#agent-…`).
 */
const DECK_ID = /^deck-[A-Za-z0-9_-]+$/;

/**
 * The deck a file's deck becomes in the instance, with its cards and,
 * with `withProgress`, its review states and a course's completed
 * chapters (none without). It keeps the file's id, so a deck exported
 * and removed comes back at the same URLs, and the answers the log
 * keeps of it name it again; unless the instance has a deck by that id,
 * or one using a document of that name, or the id or its distribution's
 * (`<id>-cards`, distributionUrlOf) is a deck's or a distribution's
 * subject already, or the id is none this app would give: then it gets
 * `freshId`. Its documents are the instance's
 * own (`decks/<id>.ttl`, `reviews/<id>.ttl`). Cards keep their ids,
 * their creation times and whether they are retired. A deck the file
 * says nothing of the creation of is created `now`.
 */
export function importedDeck(
  instanceUrl: string,
  content: DeckFileContent,
  {
    withProgress,
    decks,
    freshId,
    now,
  }: { withProgress: boolean; decks: readonly Deck[]; freshId: string; now: string },
): { deck: Deck; cards: Card[]; reviews: ReviewState[] } {
  const base = ensureTrailingSlash(instanceUrl);
  const documentsOf = (id: string) => [`${base}decks/${id}.ttl`, `${base}reviews/${id}.ttl`];
  const used = documentsInUse(decks);
  // The catalog's subjects of the decks: each deck's own, and its distribution's.
  const subjects = new Set(decks.flatMap((deck) => [deck.id, `${deck.id}-cards`]));
  const file = content.deck;
  const free =
    DECK_ID.test(file.id) &&
    !subjects.has(file.id) &&
    !subjects.has(`${file.id}-cards`) &&
    !documentsOf(file.id).some((url) => used.has(url));
  const id = free ? file.id : freshId;
  const [cardsDocumentUrl, reviewsDocumentUrl] = documentsOf(id) as [string, string];
  const { completedChapters, ...rest } = file;
  const deck: Deck = {
    ...rest,
    id,
    url: `${catalogUrlOf(base)}#${id}`,
    cardsDocumentUrl,
    reviewsDocumentUrl,
    createdAt: file.createdAt === "" ? now : file.createdAt,
    formatVersion: DECK_FORMAT_VERSION,
    ...(withProgress && completedChapters !== undefined ? { completedChapters } : {}),
  };
  const cards = content.cards.map(
    (card): Card => ({ ...card, url: `${cardsDocumentUrl}#${card.id}`, formatVersion: CARD_FORMAT_VERSION }),
  );
  return { deck, cards, reviews: withProgress ? (content.reviews ?? []) : [] };
}

/** Whether the file holds progress the import can keep: review states, or a course's completed chapters. */
export function hasProgress(content: DeckFileContent): boolean {
  return (content.reviews?.length ?? 0) > 0 || (content.deck.completedChapters?.length ?? 0) > 0;
}
