// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { type QueryClient, queryOptions, skipToken } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import { withDeckReport, type DeckHealth } from "@solid-memo/domain/deckHealth";
import type { InstanceGraph } from "@solid-memo/domain/instanceGraph";
import { instanceUrlOfDeck } from "@solid-memo/domain/instanceLayout";
import type { StudyPreferences } from "@solid-memo/domain/preferences";
import {
  readWhole,
  type CheckPolicy,
  type ReleaseCheck,
} from "@solid-memo/domain/release/releaseCheck";
import type { ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import type { ValidationReport } from "@solid-memo/domain/validation";
import { deckTextCheck } from "@solid-memo/ui/markdownCache";
import type { MarkdownProblem } from "@solid-memo/ui/MarkdownEditing";
import { queries as sharedQueries } from "@solid-memo/ui/queries";
import { markdownCheckOf, revisionOf } from "./draftVersions";
import { queryKeys } from "./queryKeys";

/** The text check the decks' healths of the instance last checked share (textCheckOf). */
let sharedText: { instanceUrl: string; text: ReturnType<typeof deckTextCheck> } | undefined;

/**
 * The text check of the instance's decks' healths (deckTextCheck): one
 * for them all, so a text many decks hold is read once, and what a
 * cards document many decks name holds is found once for them all
 * (domain/deckHealth.ts). Made anew for another instance, so what it
 * remembers is only the last instance's.
 */
function textCheckOf(instanceUrl: string): ReturnType<typeof deckTextCheck> {
  if (sharedText?.instanceUrl !== instanceUrl) sharedText = { instanceUrl, text: deckTextCheck() };
  return sharedText.text;
}

/**
 * Every cached read the Studio's screens make (docs/architecture.md#query-keys):
 * those it shares with Solid Memo's screens (@solid-memo/ui/queries), and
 * its own, each defined once with its key, the use case that fills it
 * and how long what it read stays fresh. A screen adds only what is its
 * own (`enabled`, `select`, `placeholderData`).
 */
export const queries = {
  ...sharedQueries,

  /**
   * The instance's copies of library releases (UseCases.listLibraryUpdates):
   * one read of the library's index for every deck. Its key is under the
   * instance's decks, so whatever reads them afresh (an upgrade, a deck
   * removed) reads this afresh too. The index changes only with the site,
   * so it is not read again on its own.
   */
  libraryUpdates: (useCases: Pick<UseCases, "listLibraryUpdates">, instanceUrl: string) =>
    queryOptions({
      queryKey: queryKeys.libraryUpdates(instanceUrl),
      queryFn: () => useCases.listLibraryUpdates(instanceUrl),
      staleTime: Infinity,
    }),
  /**
   * A deck's health (UseCases.checkDeck), the Markdown read by the markdown
   * package. Its key is under the instance's check, so what reads that
   * afresh reads this afresh too; with the cards document, so an upgraded
   * deck is checked anew. A badge does not check it again on its own (as
   * the instance's check is not): "Check again" and opening the deck's
   * health do. What it finds is put in the
   * instance's check too (withDeckReport), which holds the deck
   * (useDataCheck): a deck found mended is let go, and one found broken
   * is held, without the whole instance being checked again. Only a check
   * still current is put there: one canceled as the deck is checked
   * anew ("Check again", say) read the pod before, and would hold a deck
   * mended. Read `afresh`, as its health screen reads it, its documents
   * are read too, not taken from what another deck's check found of them
   * (forgetDeckCheck).
   */
  deckHealth: (
    useCases: Pick<UseCases, "checkDeck" | "forgetDeckCheck">,
    queryClient: QueryClient,
    instanceUrl: string,
    deck: Deck,
    { afresh = false }: { afresh?: boolean } = {},
  ) =>
    queryOptions({
      queryKey: queryKeys.deckHealth(instanceUrl, deck.url, deck.cardsDocumentUrl),
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        if (afresh) useCases.forgetDeckCheck(instanceUrl, deck);
        const health = await useCases.checkDeck(instanceUrl, deck, textCheckOf(instanceUrl));
        if (signal.aborted) return health;
        queryClient.setQueryData<ValidationReport>(
          queryKeys.instanceCheck(instanceUrl),
          (report) => report && withDeckReport(report, deck, health.report),
        );
        return health;
      },
      staleTime: Infinity,
    }),
  /** What a deck's check (deckHealth) found, from the cache only: never checked here. No deck (null), nothing. */
  foundDeckHealth: (deck: Deck | null) =>
    queryOptions<DeckHealth<MarkdownProblem>>({
      queryKey:
        deck === null
          ? queryKeys.validation(null)
          : queryKeys.deckHealth(instanceUrlOfDeck(deck.url), deck.url, deck.cardsDocumentUrl),
      queryFn: skipToken,
    }),
  /**
   * A deck's cards, as Home's table reads them in turns (listCardsInTurn).
   * The read kept is the very one read, not a copy shared with the one
   * before it (structural sharing): it stays frozen, so its count is
   * counted once (activeCountOf).
   */
  deckTableCards: (useCases: Pick<UseCases, "listCardsInTurn">, deck: Deck) =>
    queryOptions({
      queryKey: queryKeys.deckTableCards(deck.cardsDocumentUrl),
      queryFn: ({ signal }: { signal: AbortSignal }) => useCases.listCardsInTurn(deck, signal),
      structuralSharing: false,
    }),
  /** An instance's catalog, as its about screen edits it. */
  catalog: (useCases: Pick<UseCases, "readCatalog">, instanceUrl: string) =>
    queryOptions({
      queryKey: queryKeys.catalog(instanceUrl),
      queryFn: () => useCases.readCatalog(instanceUrl),
    }),
  /** An instance's answer log. */
  answerLog: (useCases: Pick<UseCases, "loadAnswerLog">, instanceUrl: string) =>
    queryOptions({
      queryKey: queryKeys.answerLog(instanceUrl),
      queryFn: () => useCases.loadAnswerLog(instanceUrl),
    }),
  /**
   * A deck's insight, read with the instance's preferences (none yet:
   * nothing). The preferences and the deck's own pace are in the key: an
   * insight read under another cap or study day is not shown as this
   * one's.
   */
  deckInsight: (
    useCases: Pick<UseCases, "deckInsight">,
    instanceUrl: string,
    deck: Deck,
    preferences: StudyPreferences | undefined,
  ) =>
    queryOptions({
      queryKey: queryKeys.deckInsight(deck.url, deck.maxReviewsPerDay, preferences),
      queryFn:
        preferences === undefined
          ? skipToken
          : () => useCases.deckInsight(instanceUrl, deck, new Date(), preferences),
    }),
  /**
   * An instance's graph, as `webId` reads it, saying how many documents it
   * has read as it goes (`onProgress`). It reads every document Solid
   * Memo keeps in the instance, so it is not read again as the window
   * takes the focus.
   */
  instanceGraph: (
    useCases: Pick<UseCases, "readInstanceGraph">,
    instanceUrl: string,
    webId: string,
    onProgress: (read: number, total: number) => void,
  ) =>
    queryOptions({
      queryKey: queryKeys.instanceGraph(instanceUrl, webId),
      queryFn: () => useCases.readInstanceGraph(instanceUrl, webId, { onProgress }),
      refetchOnWindowFocus: false,
    }),
  /** An instance's graph as instanceGraph read it, from the cache only: never read here. */
  foundInstanceGraph: (instanceUrl: string, webId: string) =>
    queryOptions<InstanceGraph>({
      queryKey: queryKeys.instanceGraph(instanceUrl, webId),
      queryFn: skipToken,
    }),

  /** An instance's drafts. */
  releaseDrafts: (useCases: Pick<UseCases, "listReleaseDrafts">, instanceUrl: string) =>
    queryOptions({
      queryKey: queryKeys.releaseDrafts(instanceUrl),
      queryFn: () => useCases.listReleaseDrafts(instanceUrl),
    }),
  /**
   * A draft, as every screen that reads it asks for it: the editors
   * (useDraftEditor), the workspace and a trial. The draft on screen holds
   * changes not yet written: it is read afresh only when asked. The draft
   * kept is the very one an edit made, not a copy shared with the one
   * before it (structural sharing), so the next edit finds its layout
   * known (changedDocuments). No draft (null), nothing.
   */
  releaseDraft: (useCases: Pick<UseCases, "getReleaseDraft">, draftUrl: string | null) =>
    queryOptions({
      queryKey: queryKeys.releaseDraft(draftUrl ?? ""),
      queryFn: draftUrl === null ? skipToken : () => useCases.getReleaseDraft(draftUrl),
      staleTime: Infinity,
      structuralSharing: false,
    }),
  /**
   * The domain's rules of the draft for the policy, the shapes left out; the
   * last version's while a newer one is checked (not another draft's, nor
   * another policy's: the workspace's check goes from draft to draft). A
   * check with a part unread is stale at once, so it is made again when its
   * screen opens again or the window is focused. No draft (null), no check.
   * Once a version is checked, the checks of the other versions that no
   * screen shows go: the editor makes a version for each change, and each
   * check holds all its problems.
   */
  releaseCheck: (
    useCases: Pick<UseCases, "checkReleaseDraft">,
    queryClient: QueryClient,
    draft: ReleaseDraft | null,
    policy: CheckPolicy,
  ) => {
    const revision = draft === null ? 0 : revisionOf(draft);
    return queryOptions<ReleaseCheck>({
      queryKey: queryKeys.releaseCheck(draft?.url, policy, revision),
      queryFn:
        draft === null
          ? skipToken
          : async () => {
              const found = await useCases.checkReleaseDraft(
                draft,
                markdownCheckOf(draft.url),
                policy,
              );
              queryClient.removeQueries({
                queryKey: queryKeys.releaseChecks(),
                type: "inactive",
                predicate: (query) => query.queryKey[3] !== revision,
              });
              return found;
            },
      placeholderData: (previous, previousQuery) =>
        previousQuery?.queryKey[1] === draft?.url && previousQuery?.queryKey[2] === policy
          ? previous
          : undefined,
      staleTime: (query) =>
        query.state.data === undefined || readWhole(query.state.data) ? Infinity : 0,
    });
  },
  /** What the shapes say of a version of a draft (`asked`), checked once; nothing until one is asked of. */
  releaseShapes: (
    useCases: Pick<UseCases, "checkReleaseDraft">,
    asked: ReleaseDraft | null,
    policy: CheckPolicy,
  ) =>
    queryOptions({
      queryKey: queryKeys.releaseShapes(asked?.url, policy, asked === null ? 0 : revisionOf(asked)),
      queryFn:
        asked === null
          ? skipToken
          : async () =>
              (
                await useCases.checkReleaseDraft(asked, markdownCheckOf(asked.url), policy, {
                  shapes: true,
                })
              ).shapes!,
      staleTime: Infinity,
    }),
  /** What a version of a draft changes from the release before it, worked out once. */
  releaseDiff: (useCases: Pick<UseCases, "diffReleaseDraft">, draft: ReleaseDraft) =>
    queryOptions({
      queryKey: queryKeys.releaseDiff(draft.url, revisionOf(draft)),
      queryFn: () => useCases.diffReleaseDraft(draft),
      staleTime: Infinity,
    }),
  /** The releases an instance published. */
  publishedReleases: (useCases: Pick<UseCases, "listPublishedReleases">, instanceUrl: string) =>
    queryOptions({
      queryKey: queryKeys.publishedReleases(instanceUrl),
      queryFn: () => useCases.listPublishedReleases(instanceUrl),
    }),
  /** Whether a release is public; none (undefined), nothing. */
  releasePublic: (useCases: Pick<UseCases, "isReleasePublic">, releaseUrl: string | undefined) =>
    queryOptions({
      queryKey: queryKeys.releasePublic(releaseUrl ?? ""),
      queryFn: releaseUrl === undefined ? skipToken : () => useCases.isReleasePublic(releaseUrl),
    }),
};
