import { agentUrlOf } from "../../../agentRecord";
import { conceptOfDirection } from "../../../concepts";
import { defaultDeckDescription, distributionUrlOf } from "../../../dcat";
import type { MigrationStep } from "../step";

/**
 * Deck format 3 makes a deck a DCAT dataset: the study direction becomes
 * a SKOS concept, a description is required (a deck without one gets the
 * default), creators become foaf:Agent nodes beside the deck, and the
 * cards document is named as the deck's distribution.
 */
export const DECK_2_TO_3: MigrationStep<"deck", 2, 3> = {
  shape: "deck",
  from: 2,
  to: 3,
  up: ({ direction, creator, description, ...data }, { subject }) => ({
    ...data,
    description: description ?? defaultDeckDescription(data.title),
    creator: creator.map((author) => agentUrlOf(subject, author)),
    studyDirection: conceptOfDirection(direction),
    theme: [],
    keyword: [],
    distribution: [distributionUrlOf(subject)],
  }),
};
