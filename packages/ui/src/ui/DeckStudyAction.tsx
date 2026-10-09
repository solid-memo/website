import { useQuery } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import { CheckIcon } from "./icons";
import { LoadingDots } from "./Loading";
import { useI18n } from "./i18n";

/**
 * What a deck-list row offers for its deck today, with how much is left
 * ("12 to review"). Nothing is offered unless there is something to
 * do: when the deck is done for the day, a hint says so beside a green
 * tick. While the queue is first being fetched a skeleton stands where
 * that hint will be and a loader where the action will be, so an empty
 * row never reads as "done".
 */
export function DeckStudyAction({
  deckName,
  queue,
  loading,
  onStudy,
}: {
  deckName: string;
  /** How many prompts today's queue holds; undefined while unknown (loading or unreadable). */
  queue: { dueCount: number; newCount: number } | undefined;
  /** The queue is being fetched and nothing is known yet. */
  loading: boolean;
  /** Start today's session over the deck. */
  onStudy: () => void;
}) {
  const { t } = useI18n();
  if (queue === undefined) {
    return loading ? (
      <>
        <span class="hint study-skeleton" aria-hidden="true" />
        {/* Read when browsing the row; not a status, as one a row would only clutter the list. */}
        <span class="study-loading">
          <LoadingDots />
          <span class="visually-hidden">{t("deckStudyAction.checking")}</span>
        </span>
      </>
    ) : null;
  }
  const total = queue.dueCount + queue.newCount;
  if (total === 0) {
    return (
      <>
        <span class="hint">{t("deckStudyAction.done")}</span>
        <span class="hint study-done">
          <CheckIcon />
        </span>
      </>
    );
  }
  return (
    <>
      <span class="hint study-counts">{t("common.toReview", { count: total })}</span>
      <button
        class="primary"
        aria-label={t("deckStudyAction.studyLabel", { deck: deckName })}
        onClick={onStudy}
      >
        {t("deckStudyAction.studyButton")}
      </button>
    </>
  );
}

/**
 * A deck's study counts for its deck-list row. Under the deck's queue
 * key, so whatever drops the queue drops them too; fresh for a little
 * while, so counts fetched while the instance is checked (Workspace)
 * serve the list that follows.
 */
export function studyCountsQuery(useCases: UseCases, instanceUrl: string, deck: Deck) {
  return {
    queryKey: ["studyQueue", deck.url, "counts"],
    queryFn: () => useCases.getStudyCounts(instanceUrl, deck, new Date()),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  };
}

/** Owns one deck's counts query for its deck-list row. */
export function DeckStudyActionContainer({
  useCases,
  instance,
  deck,
  onStudy,
}: {
  useCases: UseCases;
  instance: Instance;
  deck: Deck;
  onStudy: () => void;
}) {
  const { readerText } = useI18n();
  const queueQuery = useQuery(studyCountsQuery(useCases, instance.url, deck));

  return (
    <DeckStudyAction
      deckName={readerText(deck.title)}
      queue={queueQuery.data}
      loading={queueQuery.isPending}
      onStudy={onStudy}
    />
  );
}
