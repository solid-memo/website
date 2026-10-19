// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, it } from "vitest";
import {
  CARD_FEATURES,
  CARD_FIELDS,
  CARD_PAGE_SIZES,
  CARD_SORTS,
  CARD_STATES,
  DEFAULT_CARD_QUERY,
  UNSTATED,
  type CardQuery,
} from "@solid-memo/domain/cardQuery";
import { DECK_COLUMNS } from "@solid-memo/domain/deckTable";
import { DRAFT_CARD_FILTERS } from "@solid-memo/domain/release/draftOutline";
import { CHECK_POLICIES, RELEASE_FIELDS } from "@solid-memo/domain/release/releaseCheck";
import { STUDIO_PATH, isStudioHash, parseHash, studioHref } from "@solid-memo/ui/router";
import { hashParams } from "@solid-memo/ui/routerCore";
import {
  CARD_TABS,
  DRAFT_CARD_COLUMNS,
  parseStudioHash,
  studioRouteToHash,
  type StudioRoute,
} from "./router";
import { HOME_VIEWS } from "./shell/views";

const INSTANCE = "https://pod.example/solid-memo/main/";
const DECK = "https://pod.example/solid-memo/main/catalog.ttl#deck-1";
const OTHER_DECK = "https://pod.example/solid-memo/main/catalog.ttl#deck-2";
const CARD = "https://pod.example/solid-memo/main/decks/deck-1.ttl#card-1";
const DRAFT = "https://pod.example/solid-memo/main/drafts/solid/v1/release.ttl";

/** The workbench's queries: one for each parameter, and each of its values a list names. */
const QUERIES: CardQuery[] = [
  { ...DEFAULT_CARD_QUERY, text: "hus" },
  ...CARD_FIELDS.filter((field) => field !== DEFAULT_CARD_QUERY.field).map((field) => ({
    ...DEFAULT_CARD_QUERY,
    field,
  })),
  { ...DEFAULT_CARD_QUERY, lang: "sv" },
  { ...DEFAULT_CARD_QUERY, lang: UNSTATED },
  ...CARD_STATES.map((state) => ({ ...DEFAULT_CARD_QUERY, state })),
  ...CARD_FEATURES.map((has) => ({ ...DEFAULT_CARD_QUERY, has })),
  ...CARD_SORTS.map((key) => ({ ...DEFAULT_CARD_QUERY, sort: { key, descending: false } })),
  { ...DEFAULT_CARD_QUERY, sort: { key: "due", descending: true } },
  { ...DEFAULT_CARD_QUERY, page: 2 },
  ...CARD_PAGE_SIZES.filter((size) => size !== DEFAULT_CARD_QUERY.size).map((size) => ({
    ...DEFAULT_CARD_QUERY,
    size,
  })),
];

/** A route of each screen, and one for each optional parameter's values. */
const ROUTES: StudioRoute[] = [
  { screen: "instances" },
  { screen: "home", instanceUrl: INSTANCE },
  { screen: "home", instanceUrl: INSTANCE, deckUrl: DECK },
  ...HOME_VIEWS.filter((show) => show !== "all").map(
    (show): StudioRoute => ({ screen: "home", instanceUrl: INSTANCE, show }),
  ),
  { screen: "home", instanceUrl: INSTANCE, view: { filter: "kanji" } },
  ...DECK_COLUMNS.map(
    (column): StudioRoute => ({
      screen: "home",
      instanceUrl: INSTANCE,
      view: { filter: "", sort: { column, descending: false } },
    }),
  ),
  {
    screen: "home",
    instanceUrl: INSTANCE,
    view: { filter: "", sort: { column: "due", descending: true } },
  },
  { screen: "groups", instanceUrl: INSTANCE },
  { screen: "cards", deckUrl: DECK },
  ...QUERIES.map((query): StudioRoute => ({ screen: "cards", deckUrl: DECK, query })),
  { screen: "card", deckUrl: DECK, cardUrl: CARD },
  ...CARD_TABS.filter((tab) => tab !== "content").map(
    (tab): StudioRoute => ({ screen: "card", deckUrl: DECK, cardUrl: CARD, tab }),
  ),
  { screen: "card", deckUrl: DECK, cardUrl: CARD, field: "back" },
  // Beside a card, the workbench's query says where to look as `in`.
  {
    screen: "card",
    deckUrl: DECK,
    cardUrl: CARD,
    query: { ...DEFAULT_CARD_QUERY, text: "hus", field: "back", state: "due" },
  },
  { screen: "schedule", deckUrl: DECK },
  { screen: "about", deckUrl: DECK },
  { screen: "instance", instanceUrl: INSTANCE },
  { screen: "health", instanceUrl: INSTANCE },
  { screen: "health", instanceUrl: INSTANCE, deckUrl: DECK },
  { screen: "library", instanceUrl: INSTANCE },
  { screen: "transfer", instanceUrl: INSTANCE },
  { screen: "transfer", instanceUrl: INSTANCE, deckUrls: [DECK, OTHER_DECK] },
  { screen: "drafts", instanceUrl: INSTANCE },
  { screen: "releases", instanceUrl: INSTANCE },
  { screen: "graph", instanceUrl: INSTANCE },
  { screen: "graph", instanceUrl: INSTANCE, node: `${DECK}` },
  { screen: "draft", draftUrl: DRAFT },
  ...(["title", "description", "outline"] as const).map(
    (field): StudioRoute => ({ screen: "draft", draftUrl: DRAFT, field }),
  ),
  { screen: "chapter", draftUrl: DRAFT, chapter: "ch-pods" },
  ...(["title", "description", "steps", "review"] as const).map(
    (field): StudioRoute => ({ screen: "chapter", draftUrl: DRAFT, chapter: "ch-pods", field }),
  ),
  { screen: "step", draftUrl: DRAFT, step: "ch-pods-1" },
  ...(["theory", "questions"] as const).map(
    (field): StudioRoute => ({ screen: "step", draftUrl: DRAFT, step: "ch-pods-1", field }),
  ),
  { screen: "question", draftUrl: DRAFT, card: "q-1" },
  ...(
    [
      "front",
      "back",
      "backLabel",
      "frontNote",
      "backNote",
      "distractors",
      "distractor:q-1-d1",
    ] as const
  ).map((field): StudioRoute => ({ screen: "question", draftUrl: DRAFT, card: "q-1", field })),
  { screen: "draftCards", draftUrl: DRAFT },
  ...DRAFT_CARD_FILTERS.map(
    (filter): StudioRoute => ({ screen: "draftCards", draftUrl: DRAFT, filter }),
  ),
  { screen: "draftCards", draftUrl: DRAFT, language: "sv" },
  ...DRAFT_CARD_COLUMNS.map(
    (key): StudioRoute => ({
      screen: "draftCards",
      draftUrl: DRAFT,
      sort: { key, descending: false },
    }),
  ),
  { screen: "draftCards", draftUrl: DRAFT, sort: { key: "front", descending: true } },
  { screen: "draftCards", draftUrl: DRAFT, page: 2 },
  { screen: "check", draftUrl: DRAFT },
  ...CHECK_POLICIES.filter((policy) => policy !== "pod").map(
    (policy): StudioRoute => ({ screen: "check", draftUrl: DRAFT, policy }),
  ),
  { screen: "preview", draftUrl: DRAFT },
  { screen: "diff", draftUrl: DRAFT },
  { screen: "release", draftUrl: DRAFT },
  ...RELEASE_FIELDS.map((field): StudioRoute => ({ screen: "release", draftUrl: DRAFT, field })),
  { screen: "trial", draftUrl: DRAFT },
  { screen: "trial", draftUrl: DRAFT, chapter: "ch-pods" },
  { screen: "trial", draftUrl: DRAFT, chapter: "ch-pods", review: true },
];

/**
 * Solid Memo Studio's hash routes, part of the app's public API
 * (docs/releasing.md#the-public-api): people bookmark and share them.
 * For each screen, the hash it opens at, with each of its optional
 * parameters' values; Home's also as the redirect from the Studio's old
 * address makes it, and as Solid Memo links to it. Each is checked to
 * parse back to the route it was made from, and to be one Solid Memo
 * leaves to the Studio. A line that goes, a screen moved or a parameter
 * renamed or no longer read, is a breaking change, which
 * `npm run check:breaking` holds to a commit that says so.
 */
it("keeps api/routes/studio.txt to the hashes the Studio opens", async () => {
  const opened = (hash: string, route: StudioRoute) => {
    expect(parseStudioHash(hash)).toEqual(route);
    expect(isStudioHash(hash)).toBe(true);
    expect(parseHash(hash)).toBeNull();
    return hash;
  };
  const home: StudioRoute = { screen: "home", instanceUrl: INSTANCE };
  expect(studioHref(INSTANCE)).toBe(studioRouteToHash(home));
  const lines = [
    ...ROUTES.map((route) => opened(studioRouteToHash(route), route)),
    opened(`#${STUDIO_PATH}/${hashParams({ instance: INSTANCE })}`, home),
  ];
  await expect(`${lines.sort().join("\n")}\n`).toMatchFileSnapshot(
    "../../../../api/routes/studio.txt",
  );
});
