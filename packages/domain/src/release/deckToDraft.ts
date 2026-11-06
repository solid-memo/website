// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { DistractorV1, DraftDeckV1 } from "@solid-memo/vocab/types.generated";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { agentUrlsOf } from "../agentRecord.ts";
import { AppError } from "../appError.ts";
import { cardToRecord, deckAgents, distractorToRecord } from "../deckRecord.ts";
import type { Card, Deck, DeckDirection } from "../deck.ts";
import { HASHED_CHARACTERS, isIriPastBound } from "../pathKeys.ts";
import { blankDraft, licenseType, type DraftNode, type ReleaseDraft } from "./releaseDraft.ts";

const DIRECTIONS: Record<DeckDirection, DraftDeckV1["studyDirection"]> = {
  "front-to-back": SM.frontToBack as DraftDeckV1["studyDirection"],
  "back-to-front": SM.backToFront as DraftDeckV1["studyDirection"],
  bidirectional: SM.bidirectional as DraftDeckV1["studyDirection"],
};

/**
 * A deck of the user's pod as the draft of a first release, at `url`
 * (docs/studio.md, Drafts): what a release says and the deck does too,
 * nothing that is the learner's own.
 *
 * - **Kept:** its title, description, license (typed a
 *   dcterms:LicenseDocument, as a release's is), direction, themes and
 *   keywords, each in the languages it states (a release's text is
 *   language-tagged; untagged text from an old format is left out), and
 *   every card, retired ones too, with
 *   its wrong options, under its own id.
 * - **Left behind:** where its cards and review states are kept, its own
 *   study caps, its place among the user's groups, a course's progress,
 *   and its statement of what it is a copy of. A deck copied from a
 *   release names that release (`prov:wasDerivedFrom`), which is no
 *   source of the new one: it is offered as what the deck is based on
 *   (`basedOn`), to start the next version of instead.
 * - **Its authors** become agents of the release (`#agent-<name>`), its
 *   creators; the first of them its publisher. One whose IRI is longer
 *   than a term may be is refused (termTooLong), as the draft's write
 *   would refuse it, before the draft's ids are keyed by it.
 * - **Like a new release** it is version 1 of a series of its own, with
 *   its Turtle distribution (blankDraft), made `now`, nothing published
 *   before it, and about education (EDUC) besides its own themes.
 */
export function deckToDraft(
  deck: Deck,
  cards: readonly Card[],
  url: string,
  now: string,
): { draft: ReleaseDraft; basedOn?: string } {
  const agents = deckAgents(deck, agentUrlsOf(url, deck.authors));
  const creators = agents.map((agent) => agent.url);
  if (creators.some(isIriPastBound)) {
    throw new AppError("termTooLong", { limit: HASHED_CHARACTERS });
  }
  const fragment = (iri: string) => iri.slice(url.length + 1);
  const taken = [
    ...creators.map(fragment),
    ...cards.flatMap((card) => [
      card.id,
      ...(card.distractors ?? []).map((distractor) => distractor.id),
    ]),
  ];
  const blank = blankDraft({ url, course: false, title: stated(deck.title), now, taken });
  const description = stated(deck.description ?? {});
  const draft: ReleaseDraft = {
    ...blank,
    root: {
      ...blank.root,
      ...(Object.keys(description).length === 0 ? {} : { description }),
      ...(deck.license === undefined ? {} : { license: deck.license }),
      ...(creators.length === 0 ? {} : { publisher: creators[0] }),
      creator: creators,
      studyDirection: DIRECTIONS[deck.direction],
      theme: [...new Set([...(deck.themes ?? []), ...blank.root.theme])],
      keyword: stated(deck.keywords ?? {}),
    },
    agents: agents.map((agent) => ({ id: fragment(agent.url), data: agent.record })),
    cards: cards.map((card) => ({ id: card.id, data: cardToRecord(card, card.createdAt, url) })),
    distractors: distractorNodes(cards),
    // Its license, typed as a release's is (setLicense).
    triples: deck.license === undefined ? [] : [licenseType(deck.license)],
  };
  return deck.sourceUrl === undefined ? { draft } : { draft, basedOn: deck.sourceUrl };
}

/**
 * The cards' distractors as draft nodes, one per id however many cards
 * name it (as a pod an earlier app wrote may have two name one): each is
 * made once, not once for each card.
 */
function distractorNodes(cards: readonly Card[]): DraftNode<DistractorV1>[] {
  const nodes = new Map<string, DraftNode<DistractorV1>>();
  for (const card of cards)
    for (const distractor of card.distractors ?? [])
      if (!nodes.has(distractor.id))
        nodes.set(distractor.id, { id: distractor.id, data: distractorToRecord(distractor) });
  return [...nodes.values()];
}

/** Text in a stated language: untagged text ("") left out. */
function stated<T extends Readonly<Record<string, unknown>>>(text: T): T {
  return Object.fromEntries(Object.entries(text).filter(([language]) => language !== "")) as T;
}
