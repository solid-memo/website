import { SM } from "@solid-memo/vocab/vocab.generated";
import { agentUrlOf } from "./agentRecord";
import { distributionUrlOf } from "./dcat";
import { activeCards, isMarkdown, type Card, type CardContent, type CardTextPart, type Deck } from "./deck";
import { unlikeRelease } from "./deckLanguages";
import type { FieldRuleName } from "./release/markdownFields";
import type { MarkdownFinding } from "./release/problems";
import { reviewKeyOf } from "./reviewRecord";
import { documentUrlOf, fragmentIdOf } from "./subjectUrl";
import { summarize, type ValidationReport } from "./validation";

/**
 * Everything wrong with one deck, for the Studio's health screen
 * (docs/studio.md): what the shape check found in its entry and its
 * documents, the card sides that do not state their language, cards
 * that say the same, and text in Markdown that would not show as its
 * author meant. Each problem in a card names where in it, so the screen
 * can link to that field of the card inspector. The Markdown check and
 * the plain text of Markdown are the markdown package's, which the
 * caller passes in: the domain reads no Markdown.
 */

/** Where in a card a problem is: a text of its content, one of its wrong options (its text or its note), or its review state. */
export type CardPlace =
  | { tab: "content"; part?: CardTextPart }
  | { tab: "distractors"; distractor: string; part?: "text" | "note" }
  | { tab: "schedule" };

/** A card, and where in it a problem is. */
export interface CardSpot {
  card: Card;
  place: CardPlace;
}

/** What reads a deck's text in Markdown: its plain text, and what would not show as meant in a field held to a rule. */
export interface DeckTextCheck<F extends MarkdownFinding> {
  plain: (text: string) => string;
  check: (text: string, rule: FieldRuleName) => readonly F[];
}

/** A finding of the Markdown check in one language's text of a card. */
export interface CardMarkdownProblem<F extends MarkdownFinding> extends CardSpot {
  /** The text's language tag, "" when it states none. */
  language: string;
  finding: F;
}

export interface DeckHealth<F extends MarkdownFinding = MarkdownFinding> {
  /** The shape check of the deck's entry (its distribution and its authors) in the catalog, and of its cards and reviews documents. */
  report: ValidationReport;
  /**
   * The fronts and backs that do not state their language, of the cards
   * the user may settle (unlikeRelease); null when the release the deck
   * was copied from could not be read, so which those are is not known.
   */
  unstated: CardSpot[] | null;
  /** Cards in use that say the same, each group in the deck's order (duplicateCardsOf). */
  duplicates: Card[][];
  markdown: CardMarkdownProblem<F>[];
}

/** The text predicates of a card, by the part of its content they hold. */
const PARTS: ReadonlyMap<string, CardTextPart> = new Map([
  [SM.front, "front"],
  [SM.back, "back"],
  [SM.frontImageDescription, "frontImageDescription"],
  [SM.frontNote, "frontNote"],
  [SM.backImageDescription, "backImageDescription"],
  [SM.backLabel, "backLabel"],
  [SM.backNote, "backNote"],
]);

/** The parts of a card the deck health reads Markdown in, and the rule each is held to (as the card editor holds them). */
const MARKDOWN_PARTS: readonly { part: CardTextPart; rule: (card: CardContent) => FieldRuleName }[] = [
  { part: "front", rule: () => "side" },
  { part: "back", rule: (card) => ((card.distractors?.length ?? 0) > 0 ? "option" : "side") },
  { part: "backLabel", rule: () => "side" },
  { part: "frontNote", rule: () => "prose" },
  { part: "backNote", rule: () => "prose" },
];

/**
 * The part of the report about one deck of the instance (`report`, as
 * the instance's check gives it): in the catalog, the deck's entry, its
 * distribution and its authors' agent nodes (as the deck is written);
 * its cards and reviews documents whole.
 */
export function deckReport(report: ValidationReport, deck: Deck): ValidationReport {
  const own = ownSubjectUrls(deck);
  const catalog = documentUrlOf(deck.url);
  const documents = report.documents.flatMap((document) =>
    document.url === catalog
      ? [{ ...document, subjects: document.subjects.filter((subject) => own.has(subject.url)) }]
      : document.url === deck.cardsDocumentUrl || document.url === deck.reviewsDocumentUrl
        ? [document]
        : [],
  );
  return summarize(report.instanceUrl, documents);
}

/** The deck's subjects in the catalog: its entry, its distribution and its authors' agent nodes. */
function ownSubjectUrls(deck: Deck): Set<string> {
  return new Set([deck.url, distributionUrlOf(deck.url), ...deck.authors.map((author) => agentUrlOf(deck.url, author))]);
}

/**
 * The instance's check (`report`) with its part about one deck (as
 * deckReport takes it) in place of what a later check of the deck
 * found (`part`), so a deck checked again is held, or let go, by what
 * that check found, without the whole instance being checked again.
 * Each document of `part` takes the place of the same one in `report`,
 * where it was: the catalog only in the deck's subjects (an unchanged
 * catalog comes back with none, its own all conforming). A document
 * `part` does not hold stays as it was; one `report` did not hold (a
 * deck made since it was made) comes at the end.
 */
export function withDeckReport(report: ValidationReport, deck: Deck, part: ValidationReport): ValidationReport {
  const own = ownSubjectUrls(deck);
  const catalog = documentUrlOf(deck.url);
  const fresh = new Map(part.documents.map((document) => [document.url, document]));
  const documents = report.documents.map((document) => {
    const update = fresh.get(document.url);
    if (update === undefined) return document;
    if (update.url !== catalog) return update;
    return { ...update, subjects: [...document.subjects.filter((subject) => !own.has(subject.url)), ...update.subjects] };
  });
  const known = new Set(report.documents.map((document) => document.url));
  return summarize(report.instanceUrl, [...documents, ...part.documents.filter((document) => !known.has(document.url))]);
}

/**
 * The card a subject of the deck's documents is about, and where in it
 * the predicate `path` points: a card's text, a wrong option of it, or
 * its review state; null for any other subject (the deck's entry, one
 * the deck has no card for).
 */
export function cardSpotOf(deck: Deck, cards: readonly Card[], subjectUrl: string, path?: string): CardSpot | null {
  const document = documentUrlOf(subjectUrl);
  const id = fragmentIdOf(subjectUrl);
  if (document === deck.reviewsDocumentUrl) {
    const card = cards.find((each) => each.id === reviewKeyOf(id).cardId);
    return card === undefined ? null : { card, place: { tab: "schedule" } };
  }
  if (document !== deck.cardsDocumentUrl) return null;
  const card = cards.find((each) => each.id === id);
  if (card !== undefined) {
    const part = path === undefined ? undefined : PARTS.get(path);
    return { card, place: part === undefined ? { tab: "content" } : { tab: "content", part } };
  }
  const owner = cards.find((each) => each.distractors?.some((distractor) => distractor.id === id));
  if (owner === undefined) return null;
  const part = path === SM.distractorText ? "text" : path === SM.distractorNote ? "note" : undefined;
  return { card: owner, place: { tab: "distractors", distractor: id, ...(part === undefined ? {} : { part }) } };
}

/** A side's texts as compared: each language's plain text, white space collapsed, in the order of their tags; then its picture. */
function sideKey(text: Readonly<Record<string, string>>, image: string | undefined, plain: (text: string) => string): string {
  const texts = Object.entries(text)
    .map(([tag, value]) => [tag, plain(value).replace(/\s+/g, " ").trim()])
    .sort(([a], [b]) => (a! < b! ? -1 : 1));
  return JSON.stringify([texts, image ?? null]);
}

/**
 * The deck's cards in use that say the same: the same front and the same
 * back, as plain text (`plain` gives that of a card in Markdown), in the
 * same languages, white space aside, and the same pictures. Case counts:
 * "May" and "may" differ. Each group holds two or more cards, in the
 * deck's order, and the groups come in the order of their first card.
 */
export function duplicateCardsOf(cards: readonly Card[], plain: (text: string) => string): Card[][] {
  const groups = new Map<string, Card[]>();
  for (const card of activeCards(cards)) {
    const read = isMarkdown(card.textFormat) ? plain : (text: string) => text;
    const key = sideKey(card.front, card.frontImageUrl, read) + sideKey(card.back, card.backImageUrl, read);
    groups.set(key, [...(groups.get(key) ?? []), card]);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

/**
 * What `check` finds in the text of the deck's cards in use written in
 * Markdown, each language's, in the order of the cards and of their
 * fields, as the card editor hints at it: the sides and the label held
 * to the rule of a side (the back to an option's, when the card has
 * wrong options), the notes to prose's, and each wrong option's text to
 * an option's and its note to prose's. A text with no words is skipped.
 */
export function cardMarkdownProblems<F extends MarkdownFinding>(
  cards: readonly Card[],
  check: DeckTextCheck<F>["check"],
): CardMarkdownProblem<F>[] {
  const problems: CardMarkdownProblem<F>[] = [];
  const add = (card: Card, place: CardPlace, text: Readonly<Record<string, string>> | undefined, rule: FieldRuleName) => {
    for (const [language, value] of Object.entries(text ?? {})) {
      if (value.trim() === "") continue;
      for (const finding of check(value, rule)) problems.push({ card, place, language, finding });
    }
  };
  for (const card of activeCards(cards).filter((each) => isMarkdown(each.textFormat))) {
    for (const { part, rule } of MARKDOWN_PARTS) add(card, { tab: "content", part }, card[part], rule(card));
    for (const distractor of card.distractors ?? []) {
      add(card, { tab: "distractors", distractor: distractor.id, part: "text" }, distractor.text, "option");
      add(card, { tab: "distractors", distractor: distractor.id, part: "note" }, distractor.note, "prose");
    }
  }
  return problems;
}

/**
 * The fronts and backs that do not state their language (untagged, ""),
 * of the cards the user may settle: all but those still as the release
 * the deck was copied from has them (`release`; see unlikeRelease).
 */
export function unstatedSides(cards: readonly Card[], release: readonly (CardContent & { id: string })[] = []): CardSpot[] {
  return unlikeRelease(cards, release).flatMap((card) =>
    (["front", "back"] as const).filter((side) => "" in card[side]).map((part) => ({ card, place: { tab: "content" as const, part } })),
  );
}

/**
 * A deck's health, from what the instance's check found (`report`, made
 * of its documents at least), its cards, and the cards of the release it
 * was copied from (`release`: none for a deck not copied; undefined when
 * that release could not be read).
 */
export function deckHealth<F extends MarkdownFinding>(
  deck: Deck,
  report: ValidationReport,
  cards: readonly Card[],
  release: readonly (CardContent & { id: string })[] | undefined,
  text: DeckTextCheck<F>,
): DeckHealth<F> {
  return {
    report: deckReport(report, deck),
    unstated: release === undefined ? null : unstatedSides(cards, release),
    duplicates: duplicateCardsOf(cards, text.plain),
    markdown: cardMarkdownProblems(cards, text.check),
  };
}

/**
 * How many problems a deck's health counts, as its badge says: each
 * violation of a shape (warnings aside), each side whose language is
 * not stated, each group of cards that say the same, and each finding
 * in text written in Markdown.
 */
export function healthProblemCount(health: DeckHealth<MarkdownFinding>): number {
  return health.report.violationCount + (health.unstated?.length ?? 0) + health.duplicates.length + health.markdown.length;
}
