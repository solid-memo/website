// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { CheckPolicy } from "@solid-memo/domain/release/releaseCheck";
import { queryKeys as sharedKeys } from "@solid-memo/ui/queryKeys";

/**
 * Every query key the Studio's screens cache (docs/architecture.md#query-keys):
 * those it shares with Solid Memo's screens (@solid-memo/ui/queryKeys),
 * and its own, built on them where they sit under one. A key whose first
 * items are another's sits under it: invalidating or removing the
 * shorter key reaches it too, as each one's comment says.
 */
export const queryKeys = {
  ...sharedKeys,

  /** The library's newer releases of an instance's copies: under decks, so whatever refreshes them refreshes it too. */
  libraryUpdates: (instanceUrl: string) => [...sharedKeys.decks(instanceUrl), "libraryUpdates"],
  /** A deck's health, as of its cards document: under the instance's check (validation), so checking it again checks the deck. */
  deckHealth: (instanceUrl: string, deckUrl: string, cardsDocumentUrl: string) => [
    ...sharedKeys.validation(instanceUrl),
    "deck",
    deckUrl,
    cardsDocumentUrl,
  ],
  /** An instance's catalog, as its about screen edits it. */
  catalog: (instanceUrl: string) => ["catalog", instanceUrl],
  /** An instance's answer log. */
  answerLog: (instanceUrl: string) => ["answerLog", instanceUrl],
  /** A deck's insight, as of its cap and the preferences it was read with. */
  deckInsight: (deckUrl: string, maxReviewsPerDay: number | undefined, preferences: unknown) => [
    "deckInsight",
    deckUrl,
    maxReviewsPerDay,
    preferences,
  ],
  /** An instance's graph, as `webId` reads it. */
  instanceGraph: (instanceUrl: string, webId: string) => ["instanceGraph", instanceUrl, webId],

  /** An instance's drafts: the sidebar and the drafts screen share it. */
  releaseDrafts: (instanceUrl: string) => ["releaseDrafts", instanceUrl],
  /** A draft: its screens, and the workspace's trail, share it. */
  releaseDraft: (draftUrl: string) => ["releaseDraft", draftUrl],
  /** The mutation key of a draft's writes, whichever screen made them. */
  releaseDraftWrites: (draftUrl: string) => ["editReleaseDraft", draftUrl],
  /** The rules' check of one version (revision) of a draft for a policy. */
  releaseCheck: (draftUrl: string | undefined, policy: CheckPolicy, revision: number) => [
    "releaseCheck",
    draftUrl,
    policy,
    revision,
  ],
  /** The shapes' check of one version (revision) of a draft for a policy. */
  releaseShapes: (draftUrl: string | undefined, policy: CheckPolicy, revision: number) => [
    "releaseShapes",
    draftUrl,
    policy,
    revision,
  ],
  /** What one version (revision) of a draft changes from the release before it. */
  releaseDiff: (draftUrl: string, revision: number) => ["releaseDiff", draftUrl, revision],
  /** The releases an instance published. */
  publishedReleases: (instanceUrl: string) => ["publishedReleases", instanceUrl],
  /** Whether a release is public. */
  releasePublic: (releaseUrl: string) => ["releasePublic", releaseUrl],
};
