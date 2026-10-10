import type { DistractorV1, DraftDeckV1 } from "@solid-memo/vocab/types.generated";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { agentToRecord, agentUrlOf } from "../agentRecord.ts";
import { cardToRecord, distractorToRecord } from "../deckRecord.ts";
import type { Card, Deck, DeckDirection } from "../deck.ts";
import { blankDraft, type DraftNode, type ReleaseDraft } from "./releaseDraft.ts";

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
 * - **Kept:** its title, description, licence, direction, themes and
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
 *   creators; the first of them its publisher.
 * - **Like a new release** it is version 1 of a series of its own, with
 *   its Turtle distribution (blankDraft), made `now`, nothing published
 *   before it.
 */
export function deckToDraft(deck: Deck, cards: readonly Card[], url: string, now: string): { draft: ReleaseDraft; basedOn?: string } {
  const agents = new Map(deck.authors.map((author) => [agentUrlOf(url, author), agentToRecord(author)]));
  const creators = [...agents.keys()];
  const fragment = (iri: string) => iri.slice(url.length + 1);
  const taken = [...creators.map(fragment), ...cards.flatMap((card) => [card.id, ...(card.distractors ?? []).map((distractor) => distractor.id)])];
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
      theme: deck.themes ?? [],
      keyword: stated(deck.keywords ?? {}),
    },
    agents: [...agents].map(([iri, data]) => ({ id: fragment(iri), data })),
    cards: cards.map((card) => ({ id: card.id, data: cardToRecord(card, card.createdAt, url) })),
    distractors: cards.flatMap((card) =>
      (card.distractors ?? []).map((distractor): DraftNode<DistractorV1> => ({ id: distractor.id, data: distractorToRecord(distractor) })),
    ),
  };
  return deck.sourceUrl === undefined ? { draft } : { draft, basedOn: deck.sourceUrl };
}

/** Text in a stated language: untagged text ("") left out. */
function stated<T extends Readonly<Record<string, unknown>>>(text: T): T {
  return Object.fromEntries(Object.entries(text).filter(([language]) => language !== "")) as T;
}
