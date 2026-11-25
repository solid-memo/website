// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { WebIdDocument } from "@solid-memo/domain/webIdDocument";

/** The WebID of the stories' learner. */
export const storyWebId = "https://pod.example/alice/profile/card#me";

/** A profile with a name, links, a language-tagged text and a blank node. */
export const storyWebIdDocument: WebIdDocument = {
  url: "https://pod.example/alice/profile/card",
  subjects: [
    {
      url: storyWebId,
      properties: [
        {
          predicate: "http://xmlns.com/foaf/0.1/name",
          values: [
            {
              type: "literal",
              value: "Alice",
              dataType: "http://www.w3.org/2001/XMLSchema#string",
            },
          ],
        },
        {
          predicate: "http://www.w3.org/ns/pim/space#storage",
          values: [{ type: "iri", value: "https://pod.example/alice/" }],
        },
        {
          predicate: "http://www.w3.org/ns/solid/terms#oidcIssuer",
          values: [{ type: "iri", value: "https://pod.example/" }],
        },
        {
          predicate: "http://www.w3.org/2006/vcard/ns#note",
          values: [
            { type: "langString", value: "Learning Japanese, one kanji a day", language: "en" },
            { type: "langString", value: "Lär sig japanska, en kanji om dagen", language: "sv" },
            { type: "blankNode", value: "_:b0" },
          ],
        },
      ],
    },
    {
      url: "https://pod.example/alice/profile/card",
      properties: [
        {
          predicate: "http://xmlns.com/foaf/0.1/primaryTopic",
          values: [{ type: "iri", value: storyWebId }],
        },
      ],
    },
  ],
};
