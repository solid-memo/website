// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { DistractorV1, DraftDeckV1 } from "@solid-memo/vocab/types.generated";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { agentUrlsOf, type AgentHolder } from "../agentRecord.ts";
import { AppError } from "../appError.ts";
import { cardToRecord, deckAgents, distractorToRecord } from "../deckRecord.ts";
import type { Card, Deck, DeckDirection } from "../deck.ts";
import { HASHED_CHARACTERS, isIriPastBound } from "../pathKeys.ts";
import { draftContainerOf } from "./draftLayout.ts";
import { isDraftsPlaceOnward } from "./releasePlace.ts";
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
 * - **One id, one subject:** a deck keeps its agents in its catalog and
 *   its cards and wrong options in its cards document, while a draft
 *   names all of them in one, so an author's node is never a card's or
 *   a wrong option's id (the next node agentUrlsOf gives, as for a node
 *   another author holds), and a wrong option an earlier version left at
 *   a card's id gets an id of its own (`<id>-2`, …), which the cards
 *   naming it name. Else one would replace the other when the draft is
 *   written (GHSA-w96m-f3jj-jcmw).
 * - **Its IRIs in the draft's container, or at its default places**
 *   (where it or a next version of it is published unless the creator
 *   chooses another folder, isDraftsPlaceOnward) are left out: its
 *   license, a theme, a card's picture, with what the picture shows,
 *   its text format or what it is about. The deck was made before the
 *   draft, so such an IRI is no part of it, yet read back it would name
 *   one of the draft's documents or subjects, and published there it
 *   would name the release itself: a license of itself, or a statement
 *   the draft could not publish (GHSA-qh9m-2c96-5rr2).
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
  const container = draftContainerOf(url);
  const isDraftsOwn = (iri: string) => iri.startsWith(container) || isDraftsPlaceOnward(url, iri);
  const license =
    deck.license === undefined || isDraftsOwn(deck.license) ? undefined : deck.license;
  const placed = apartFromCards(cards);
  const ids = new Set(
    placed.flatMap((card) => [
      card.id,
      ...(card.distractors ?? []).map((distractor) => distractor.id),
    ]),
  );
  // A card's or a wrong option's node holds no author, nor is one written over it.
  const holderAt = (iri: string): AgentHolder =>
    !isIriPastBound(iri) && ids.has(iri.slice(url.length + 1)) ? "unreadable" : null;
  const agents = deckAgents(deck, agentUrlsOf(url, deck.authors, holderAt));
  const creators = agents.map((agent) => agent.url);
  if (creators.some(isIriPastBound)) {
    throw new AppError("termTooLong", { limit: HASHED_CHARACTERS });
  }
  const fragment = (iri: string) => iri.slice(url.length + 1);
  const taken = [...creators.map(fragment), ...ids];
  const blank = blankDraft({ url, course: false, title: stated(deck.title), now, taken });
  const description = stated(deck.description ?? {});
  const draft: ReleaseDraft = {
    ...blank,
    root: {
      ...blank.root,
      ...(Object.keys(description).length === 0 ? {} : { description }),
      ...(license === undefined ? {} : { license }),
      ...(creators.length === 0 ? {} : { publisher: creators[0] }),
      creator: creators,
      studyDirection: DIRECTIONS[deck.direction],
      theme: [
        ...new Set([
          ...(deck.themes ?? []).filter((theme) => !isDraftsOwn(theme)),
          ...blank.root.theme,
        ]),
      ],
      keyword: stated(deck.keywords ?? {}),
    },
    agents: agents.map((agent) => ({ id: fragment(agent.url), data: agent.record })),
    cards: placed.map((card) => ({
      id: card.id,
      data: cardToRecord(placedCard(card, isDraftsOwn), card.createdAt, url),
    })),
    distractors: distractorNodes(placed),
    // Its license, typed as a release's is (setLicense).
    triples: license === undefined ? [] : [licenseType(license)],
  };
  return deck.sourceUrl === undefined ? { draft } : { draft, basedOn: deck.sourceUrl };
}

/**
 * The cards with every wrong option at a card's id (one subject an
 * earlier version typed both) at an id of its own instead: `<id>-2`,
 * `<id>-3`, … the first that is no card's or wrong option's, the same
 * for every card that names it.
 */
function apartFromCards(cards: readonly Card[]): readonly Card[] {
  const cardIds = new Set(cards.map((card) => card.id));
  const used = new Set([
    ...cardIds,
    ...cards.flatMap((card) => (card.distractors ?? []).map((distractor) => distractor.id)),
  ]);
  const renamed = new Map<string, string>();
  const idOf = (id: string): string => {
    if (!cardIds.has(id)) return id;
    let name = renamed.get(id);
    if (name === undefined) {
      name = `${id}-2`;
      for (let n = 3; used.has(name); n++) name = `${id}-${n}`;
      used.add(name);
      renamed.set(id, name);
    }
    return name;
  };
  return cards.map((card) =>
    card.distractors?.some((distractor) => cardIds.has(distractor.id))
      ? {
          ...card,
          distractors: card.distractors.map((distractor) => ({
            ...distractor,
            id: idOf(distractor.id),
          })),
        }
      : card,
  );
}

/** The card without an IRI `isDraftsOwn` says is the draft's: a picture goes with what it shows. */
function placedCard(card: Card, isDraftsOwn: (iri: string) => boolean): Card {
  const left = (iri: string | undefined) => iri !== undefined && isDraftsOwn(iri);
  const kept: Card = { ...card };
  if (left(card.frontImageUrl)) {
    delete kept.frontImageUrl;
    delete kept.frontImageDescription;
  }
  if (left(card.backImageUrl)) {
    delete kept.backImageUrl;
    delete kept.backImageDescription;
  }
  if (left(card.textFormat)) delete kept.textFormat;
  if (card.subjects !== undefined)
    kept.subjects = card.subjects.filter((subject) => !isDraftsOwn(subject));
  return kept;
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
