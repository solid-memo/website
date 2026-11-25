// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { agentUrlOf } from "../../../agentRecord";
import { conceptOfDirection } from "../../../concepts";
import { defaultDeckDescription, EDUCATION_THEME } from "../../../dcat";
import { libraryPublisherUrlOf, librarySeriesUrlOf } from "../../../libraryLayout";
import { documentUrlOf } from "../../../subjectUrl";
import type { MigrationStep } from "../step";

/**
 * A library document from before releases, read as release 1 of its
 * deck: what the library's first release of it is. It is placed in its
 * deck's series, published by the library, given the education theme
 * and its own file as its distribution; the sources it was drawn from
 * move from dcterms:source (which DCAT keeps for datasets) to
 * prov:wasDerivedFrom. Otherwise as for a pod deck.
 */
export const LIBRARY_DECK_2_TO_3: MigrationStep<"libraryDeck", 2, 3> = {
  shape: "libraryDeck",
  from: 2,
  to: 3,
  up: ({ direction, creator, description, source, ...data }, { subject }) => ({
    ...data,
    description: description ?? defaultDeckDescription(data.title),
    creator: creator.map((author) => agentUrlOf(subject, author)),
    publisher: libraryPublisherUrlOf(subject),
    studyDirection: conceptOfDirection(direction),
    theme: [EDUCATION_THEME],
    keyword: [],
    language: [],
    version: "1",
    inSeries: librarySeriesUrlOf(subject),
    isVersionOf: librarySeriesUrlOf(subject),
    distribution: [`${documentUrlOf(subject)}#turtle`],
    wasDerivedFrom: source,
  }),
};
