import { AppError } from "./appError";
import type { Card, CardContent, StudyDirection } from "./deck";
import { sameContent } from "./libraryUpgrade";
import { reviewKeyOf, type ReviewKey, type ReviewState } from "./review";

/**
 * The Studio's move and copy of cards from one deck to another of the
 * same instance (docs/studio.md): planned here, written by the
 * application, the target first.
 */

/** Copy the cards (the source keeps them), or move them (the source loses them once the target has them). */
export type TransferMode = "copy" | "move";

export interface TransferOptions {
  mode: TransferMode;
  /** The cards' review states go with them; else they start in the target as new. */
  keepProgress: boolean;
}

/** A card as the target's cards document is to hold it: its content, id, creation time and retirement. */
export type TransferredCard = CardContent & { id: string; createdAt: string; retired?: true };

/** One card transferred: its id in the source, its id in the target, and whether the target had it already. */
export interface CardTransferred {
  from: string;
  to: string;
  /**
   * The target holds the card already, under `to` (an earlier attempt
   * wrote it, and stopped before the source lost it): it is not written
   * again.
   */
  present: boolean;
}

/**
 * A transfer planned: the cards it takes, those the source no longer
 * has (`missing`), and the writes it makes, of the target's documents
 * then, for a move, of the source's.
 */
export interface CardTransferPlan {
  cards: CardTransferred[];
  missing: string[];
  target: { save: TransferredCard[]; reviewSaves: ReviewState[]; reviewRemovals: ReviewKey[] };
  source: { remove: string[]; reviewRemovals: ReviewKey[] };
}

const DIRECTIONS: readonly StudyDirection[] = ["front-to-back", "back-to-front"];

/**
 * What moving or copying the cards of `ids` from the `source` deck's
 * cards to the `target` deck's does, each with the review states
 * (`sourceStates`, `targetStates`) of its deck.
 *
 * A card keeps its id when the target's cards document has no subject
 * of that id, nor of its distractors'. Otherwise it is given the first
 * free id of `<id>-2`, `<id>-3`…, its distractors renumbered after it
 * (`<new id>-d1`, `-d2`… in their order), as nextDistractorId names a
 * card's. The ids are tried in that order, and the source's cards in
 * theirs, so a plan made again names the same ids: a card the target
 * holds already under the id it would get, saying the same
 * (sameContent), is `present`, and is not written again. So a transfer
 * stopped half way is finished by making it again.
 *
 * The target's cards document keeps its own links: the cards written
 * there are its deck's, and hold only what this app knows of a card
 * (a move drops the triples another app put on it). With `keepProgress`, a card's review states go
 * with it, under its id in the target, where they are written naming the
 * card there (sm:reviewOf); a card present in the target
 * keeps a state it has there. Without, a card new to the target starts
 * as new there, a state left at its id removed. A move then removes the
 * cards from the source, with their states (every SM-2 state of them,
 * read or not, when written: UseCases.transferCards); a copy leaves the
 * source as it is. The states are those read, joined to their cards by
 * sm:reviewOf (domain/reviewRecord.ts): another scheduler's are never
 * among them, and stay where they are. The answer log is not the plan's: past answers keep naming the
 * cards in the source (docs/data-model.md).
 *
 * Refuses a transfer to the source itself (cardTransferSameDeck).
 */
export function planCardTransfer(
  source: { url: string; cards: readonly Card[]; states: readonly ReviewState[] },
  target: { url: string; cards: readonly Card[]; states: readonly ReviewState[] },
  ids: readonly string[],
  { mode, keepProgress }: TransferOptions,
): CardTransferPlan {
  if (source.url === target.url) throw new AppError("cardTransferSameDeck");
  const chosen = new Set(ids);
  const byId = new Map(target.cards.map((card) => [card.id, card]));
  const used = new Set(target.cards.flatMap((card) => [card.id, ...(card.distractors ?? []).map((distractor) => distractor.id)]));
  const claimed = new Set<string>();
  const sourceStates = new Map(source.states.map((state) => [reviewKeyOf(state), state]));
  const targetStates = new Set(target.states.map(reviewKeyOf));
  const plan: CardTransferPlan = {
    cards: [],
    missing: [...chosen].filter((id) => !source.cards.some((card) => card.id === id)),
    target: { save: [], reviewSaves: [], reviewRemovals: [] },
    source: { remove: [], reviewRemovals: [] },
  };
  for (const card of source.cards) {
    if (!chosen.has(card.id)) continue;
    const { to, written, present } = placeIn(card, byId, used, claimed);
    plan.cards.push({ from: card.id, to, present });
    if (!present) plan.target.save.push(written);
    for (const direction of DIRECTIONS) {
      const state = sourceStates.get(reviewKeyOf({ cardId: card.id, direction }));
      const key: ReviewKey = { cardId: to, direction };
      const held = targetStates.has(reviewKeyOf(key));
      if (keepProgress && state !== undefined && !(present && held)) {
        plan.target.reviewSaves.push({ ...state, ...key });
      } else if (!present && held) {
        plan.target.reviewRemovals.push(key);
      }
      if (mode === "move" && state !== undefined) plan.source.reviewRemovals.push({ cardId: card.id, direction });
    }
    if (mode === "move") plan.source.remove.push(card.id);
  }
  return plan;
}

/**
 * Where the card goes in the target: the first id of `<id>`, `<id>-2`…
 * free there (its distractors' too), or holding the card already and
 * not claimed by another card of the plan. The ids it takes are added
 * to `used`, a card it is present as to `claimed`, so the next card
 * goes elsewhere: two cards saying the same are never both present at
 * one id.
 */
function placeIn(
  card: Card,
  byId: ReadonlyMap<string, Card>,
  used: Set<string>,
  claimed: Set<string>,
): { to: string; written: TransferredCard; present: boolean } {
  for (let n = 1; ; n++) {
    const to = n === 1 ? card.id : `${card.id}-${n}`;
    const written = asWritten(card, to);
    const there = byId.get(to);
    if (there !== undefined && !claimed.has(to) && sameContent(there, written)) {
      claimed.add(to);
      return { to, written, present: true };
    }
    const taken = [to, ...(written.distractors ?? []).map((distractor) => distractor.id)];
    if (taken.every((id) => !used.has(id))) {
      for (const id of taken) used.add(id);
      return { to, written, present: false };
    }
  }
}

/** The card as the target is to hold it under `id`: its distractors renumbered after it when its id changes. */
function asWritten(card: Card, id: string): TransferredCard {
  const { url: _url, formatVersion: _formatVersion, ...kept } = card;
  if (id === card.id || card.distractors === undefined) return { ...kept, id };
  return { ...kept, id, distractors: card.distractors.map((distractor, i) => ({ ...distractor, id: `${id}-d${i + 1}` })) };
}
