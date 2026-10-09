import { agentToRecord, agentUrlOf } from "./agentRecord";
import { directionOfConcept, conceptOfDirection } from "./concepts";
import { defaultDeckDescriptionText, distributionUrlOf, TURTLE_MEDIA_TYPE } from "./dcat";
import { isEmptyText, type Card, type CardContent, type Deck, type Distractor } from "./deck";
import type { LibraryCard, LibraryDeckContent } from "./library";
import { copyKeywords, noKeywords } from "./keywords";
import type { AgentV1, CardV5, DeckV6, DistractorV1, DistributionV1, LibraryDeckV5 } from "@solid-memo/vocab/types.generated";
import { fragmentIdOf } from "./subjectUrl";

/**
 * Decks and cards between their latest shape records and the domain
 * models (see docs/shapes.md). Reading takes the version the pod stored,
 * which the model keeps for the migration plan; writing always produces
 * the latest record. A deck's creators are agent nodes in the record and
 * "Name <email>" strings in the model: `authorOf` names an agent.
 */

export type AuthorOf = (agentUrl: string) => string;

export function deckFromRecord(
  url: string,
  storedVersion: number,
  data: DeckV6,
  authorOf: AuthorOf,
): Deck {
  return {
    id: fragmentIdOf(url),
    url,
    title: data.title,
    cardsDocumentUrl: data.cardsDocument,
    reviewsDocumentUrl: data.reviewsDocument,
    createdAt: data.created ?? "",
    ...(data.modified === undefined ? {} : { modifiedAt: data.modified }),
    formatVersion: storedVersion,
    direction: directionOfConcept(data.studyDirection)!,
    authors: data.creator.map(authorOf),
    ...(data.license === undefined ? {} : { license: data.license }),
    description: data.description,
    ...(data.source === undefined ? {} : { sourceUrl: data.source }),
    ...(data.theme.length === 0 ? {} : { themes: [...data.theme] }),
    ...(noKeywords(data.keyword) ? {} : { keywords: copyKeywords(data.keyword) }),
    ...(data.newCardsPerDay === undefined ? {} : { newCardsPerDay: data.newCardsPerDay }),
    ...(data.maxReviewsPerDay === undefined ? {} : { maxReviewsPerDay: data.maxReviewsPerDay }),
  };
}

/** The deck as its latest record; a deck that states no description gets the default one. */
export function deckToRecord(deck: Deck): DeckV6 {
  return {
    title: deck.title,
    description: deck.description ?? defaultDeckDescriptionText(deck.title),
    ...(deck.createdAt === "" ? {} : { created: deck.createdAt }),
    ...(deck.modifiedAt === undefined ? {} : { modified: deck.modifiedAt }),
    creator: deck.authors.map((author) => agentUrlOf(deck.url, author)),
    ...(deck.license === undefined ? {} : { license: deck.license }),
    studyDirection: conceptOfDirection(deck.direction),
    theme: deck.themes ?? [],
    keyword: deck.keywords ?? {},
    distribution: [distributionUrlOf(deck.url)],
    cardsDocument: deck.cardsDocumentUrl,
    reviewsDocument: deck.reviewsDocumentUrl,
    ...(deck.sourceUrl === undefined ? {} : { source: deck.sourceUrl }),
    ...(deck.newCardsPerDay === undefined ? {} : { newCardsPerDay: deck.newCardsPerDay }),
    ...(deck.maxReviewsPerDay === undefined ? {} : { maxReviewsPerDay: deck.maxReviewsPerDay }),
  };
}

/** The agent nodes a deck's record names as its creators, one per author. */
export function deckAgents(deck: Deck): { url: string; record: AgentV1 }[] {
  const agents = new Map<string, AgentV1>();
  for (const author of deck.authors) {
    agents.set(agentUrlOf(deck.url, author), agentToRecord(author));
  }
  return [...agents].map(([url, record]) => ({ url, record }));
}

/** The deck's distribution: its cards document, in Turtle. */
export function deckDistribution(deck: Deck): { url: string; record: DistributionV1 } {
  return {
    url: distributionUrlOf(deck.url),
    record: { accessUrl: deck.cardsDocumentUrl, mediaType: TURTLE_MEDIA_TYPE },
  };
}

/**
 * The content of a card record, with the distractors it names as the
 * document has them (the reader resolves them: a record holds only their
 * IRIs); null when a side has neither text nor a picture — the one rule
 * of the card shape a record cannot carry.
 */
export function cardContentFromRecord(data: CardV5, distractors: readonly Distractor[] = []): CardContent | null {
  const front = data.front ?? {};
  const back = data.back ?? {};
  if (isEmptyText(front) && data.frontImage === undefined) return null;
  if (isEmptyText(back) && data.backImage === undefined) return null;
  return {
    front,
    back,
    ...(data.frontImage === undefined ? {} : { frontImageUrl: data.frontImage }),
    ...(data.backImage === undefined ? {} : { backImageUrl: data.backImage }),
    ...(data.frontImageDescription === undefined ? {} : { frontImageDescription: data.frontImageDescription }),
    ...(data.backImageDescription === undefined ? {} : { backImageDescription: data.backImageDescription }),
    ...(data.frontNote === undefined ? {} : { frontNote: data.frontNote }),
    ...(data.backLabel === undefined ? {} : { backLabel: data.backLabel }),
    ...(data.backNote === undefined ? {} : { backNote: data.backNote }),
    ...(distractors.length === 0 ? {} : { distractors }),
    ...(data.textFormat === undefined ? {} : { textFormat: data.textFormat }),
  };
}

export function cardFromRecord(
  url: string,
  storedVersion: number,
  data: CardV5,
  distractors: readonly Distractor[] = [],
): Card | null {
  const content = cardContentFromRecord(data, distractors);
  if (content === null) return null;
  return {
    id: fragmentIdOf(url),
    url,
    ...content,
    createdAt: data.created ?? "",
    formatVersion: storedVersion,
    ...retiredOf(data),
  };
}

/** A card of a library release; null as for cardContentFromRecord. */
export function libraryCardFromRecord(
  url: string,
  storedVersion: number,
  data: CardV5,
  distractors: readonly Distractor[] = [],
): LibraryCard | null {
  const content = cardContentFromRecord(data, distractors);
  if (content === null) return null;
  return { id: fragmentIdOf(url), ...content, formatVersion: storedVersion, ...retiredOf(data) };
}

function retiredOf(data: CardV5): { retired?: true } {
  return data.deprecated === true ? { retired: true } : {};
}

/**
 * Empty text, a missing picture, picture description, label or note leave
 * their fields out, as does a card in use its retirement. Its distractors
 * are named as subjects of `documentUrl`, the document that holds the
 * card; distractorToRecord writes each.
 */
export function cardToRecord(card: CardContent & { retired?: true }, createdAt: string, documentUrl: string): CardV5 {
  return {
    ...(isEmptyText(card.front) ? {} : { front: card.front }),
    ...(isEmptyText(card.back) ? {} : { back: card.back }),
    ...(card.frontImageUrl === undefined ? {} : { frontImage: card.frontImageUrl }),
    ...(card.backImageUrl === undefined ? {} : { backImage: card.backImageUrl }),
    ...(card.frontImageDescription === undefined ? {} : { frontImageDescription: card.frontImageDescription }),
    ...(card.backImageDescription === undefined ? {} : { backImageDescription: card.backImageDescription }),
    ...(card.frontNote === undefined ? {} : { frontNote: card.frontNote }),
    ...(card.backLabel === undefined ? {} : { backLabel: card.backLabel }),
    ...(card.backNote === undefined ? {} : { backNote: card.backNote }),
    ...(createdAt === "" ? {} : { created: createdAt }),
    ...(card.retired === true ? { deprecated: true } : {}),
    distractor: (card.distractors ?? []).map((distractor) => `${documentUrl}#${distractor.id}`),
    ...(card.textFormat === undefined ? {} : { textFormat: card.textFormat }),
  };
}

/**
 * A distractor subject's content; null when its text is empty. A retired
 * one (owl:deprecated true) is kept, marked so: it is never offered
 * (choicesOf), but its id stays the card's, for a learner's answers may
 * name it and an editor may restore it.
 */
export function distractorFromRecord(url: string, data: DistractorV1): Distractor | null {
  if (isEmptyText(data.text)) return null;
  return {
    id: fragmentIdOf(url),
    text: data.text,
    ...(data.note === undefined || isEmptyText(data.note) ? {} : { note: data.note }),
    ...(data.deprecated === true ? { retired: true } : {}),
  };
}

/** A distractor as its record: one in use states no retirement. */
export function distractorToRecord(distractor: Distractor): DistractorV1 {
  return {
    text: distractor.text,
    ...(distractor.note === undefined ? {} : { note: distractor.note }),
    ...(distractor.retired === true ? { deprecated: true } : {}),
  };
}

export function libraryDeckFromRecord(
  url: string,
  storedVersion: number,
  data: LibraryDeckV5,
  cards: LibraryCard[],
  authorOf: AuthorOf,
): LibraryDeckContent {
  return {
    url,
    title: data.title,
    formatVersion: storedVersion,
    authors: data.creator.map(authorOf),
    ...(data.license === undefined ? {} : { license: data.license }),
    description: data.description,
    direction: directionOfConcept(data.studyDirection)!,
    version: data.version,
    seriesUrl: data.inSeries,
    ...(data.versionNotes === undefined ? {} : { versionNotes: data.versionNotes }),
    ...(data.modified === undefined ? {} : { modifiedAt: data.modified }),
    themes: [...data.theme],
    keywords: copyKeywords(data.keyword),
    cards,
  };
}
