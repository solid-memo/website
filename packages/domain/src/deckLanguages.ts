import type { CardContent } from "./deck";
import { usualTag, type LangText } from "./langText";
import { untouched } from "./libraryUpgrade";

/**
 * What a deck's cards say of their languages: the tags they usually state
 * for each part, which the forms choose for new text when nothing else
 * says, and the text whose language the user is yet to settle.
 */
export interface DeckLanguages {
  /** The tag the fronts usually have; undefined when none states a language. */
  front?: string;
  /** The tag the backs usually have, likewise. */
  back?: string;
  /** The tag the user's own text — notes, labels, pictures' descriptions — usually has, likewise. */
  own?: string;
  /** How many fronts and backs are untagged (""): their language is not stated. */
  unstatedCounts: { front: number; back: number };
}

/** A card of the deck, with the id that ties a copy's card to its library release's. */
type DeckCard = CardContent & { id: string };

/** The parts of a card that hold the user's own text: notes, the label and the pictures' descriptions. */
function ownTexts(card: CardContent): LangText[] {
  return [card.frontNote, card.backLabel, card.backNote, card.frontImageDescription, card.backImageDescription].filter(
    (text) => text !== undefined,
  );
}

/**
 * The languages of a deck's cards. Every card is evidence of the tags the
 * deck uses, a card still as its library release has it too, for the
 * library states its cards' languages as truly as the user does. The
 * text to settle leaves out a card still as its library release has it
 * (`release`, the release the copy came from, for an imported deck), for
 * changing it would set the card apart from the library's, and a later
 * release would no longer update it.
 */
export function deckLanguages(cards: readonly DeckCard[], release: readonly DeckCard[] = []): DeckLanguages {
  const own = unlikeRelease(cards, release);
  const unstated = (side: "front" | "back") => own.filter((card) => "" in card[side]).length;
  const front = usualTag(cards.map((card) => card.front));
  const back = usualTag(cards.map((card) => card.back));
  const ownTag = usualTag(cards.flatMap(ownTexts));
  return {
    ...(front === undefined ? {} : { front }),
    ...(back === undefined ? {} : { back }),
    ...(ownTag === undefined ? {} : { own: ownTag }),
    unstatedCounts: { front: unstated("front"), back: unstated("back") },
  };
}

/**
 * The cards the user may settle the languages of: every card but one
 * still as its library release has it (`release`, the release an
 * imported deck was copied from), which is the library's to change; one
 * that only lost the release's text format too (see untouched), which
 * the next release brings back.
 */
export function unlikeRelease<T extends DeckCard>(cards: readonly T[], release: readonly DeckCard[] = []): T[] {
  const released = new Map(release.map((card) => [card.id, card]));
  return cards.filter((card) => {
    const theirs = released.get(card.id);
    return theirs === undefined || !untouched(card, theirs);
  });
}

/** The language the user says a deck's untagged fronts, and its untagged backs, are in. */
export interface StatedLanguages {
  front?: string;
  back?: string;
}

/**
 * The card with the language stated for its untagged ("") front and back
 * (`languages`), the text kept as it is; null when that changes nothing.
 * A side that states its language already is never touched, nor is one
 * mixing untagged and tagged text (no format allows that).
 */
export function withStatedLanguages<T extends CardContent>(card: T, languages: StatedLanguages): T | null {
  let changed = false;
  const stated = { ...card };
  for (const side of ["front", "back"] as const) {
    const tag = languages[side];
    const keys = Object.keys(card[side]);
    if (tag === undefined || keys.length !== 1 || keys[0] !== "") continue;
    stated[side] = { [tag]: card[side][""]! };
    changed = true;
  }
  return changed ? stated : null;
}

/** Whether the card's front or back has text that does not say its language (untagged, ""). */
export function hasUnstatedSide(card: CardContent): boolean {
  return "" in card.front || "" in card.back;
}

/** What of a deck's text the user is yet to settle the language of. */
export interface DeckLanguageIssues {
  /** How many card fronts and backs do not say their language. */
  unstated: number;
}

/**
 * Whether any of a deck's cards' text is yet to have its language stated
 * (`languages`, see deckLanguages); null when every side states it. The
 * same words under several languages are not an issue: they are text in
 * each of those languages.
 */
export function deckLanguageIssues(languages: DeckLanguages): DeckLanguageIssues | null {
  const unstated = languages.unstatedCounts.front + languages.unstatedCounts.back;
  return unstated === 0 ? null : { unstated };
}
