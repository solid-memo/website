// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { ResponseTimes } from "@solid-memo/domain/answer";
import type { Deck, Prompt } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import type { ReviewQuality } from "@solid-memo/domain/review";
import { interleave, repeatsInSession, requeueCard } from "@solid-memo/domain/scheduling";
import { ErrorMessage } from "./ErrorMessage";
import { Loading } from "./Loading";
import { StudyScreen } from "./StudyScreen";
import { useClock } from "./courseLinks";
import { useDeckRelease } from "./deckRelease";
import { deckHref } from "./router";
import { useI18n } from "./i18n";

/**
 * Owns one study session. The queue is fetched once when the session
 * starts and then walked in order; answering a card badly puts it back
 * into the remainder (never as the very next card unless it is the only
 * one left). The session covers today's due prompts and the new ones
 * within the daily budget, the new spread among the due, today and each
 * answer by the screen's time (useClock), keeping how long it took
 * (StudyScreen). The deck's cached queue is
 * dropped when the session ends, however it is left. Its deck links to
 * the deck's page, or to `deckLink` when given. A deck copied from a
 * release says where a mistake in the cards it has of the release is
 * reported (UseCases.reportPlace).
 */
export function StudyContainer({
  useCases,
  instance,
  deck,
  onExit,
  deckLink = deckHref(instance.url, deck.url),
  random = Math.random,
}: {
  useCases: UseCases;
  instance: Instance;
  deck: Deck;
  onExit: () => void;
  deckLink?: string;
  /** Uniform [0, 1) source deciding where a failed card comes back. */
  random?: () => number;
}) {
  const { t, readerText, readerLang, errorText } = useI18n();
  const queryClient = useQueryClient();
  const now = useClock();

  const queueQuery = useQuery({
    queryKey: ["studyQueue", deck.url],
    queryFn: () => useCases.getStudyQueue(instance.url, deck, now()),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: "always",
  });

  const preferencesQuery = useQuery({
    queryKey: ["preferences", instance.url],
    queryFn: () => useCases.getPreferences(instance.url),
  });
  const answerScale = preferencesQuery.data?.answerScale ?? DEFAULT_PREFERENCES.answerScale;

  // Where a mistake in the deck's release is reported, and which cards are the release's:
  // read once, as a release never changes. A card the learner added is theirs to fix.
  const reportQuery = useQuery({
    queryKey: ["reportPlace", deck.sourceUrl],
    queryFn: () => useCases.reportPlace(deck.sourceUrl!),
    enabled: deck.sourceUrl !== undefined,
    staleTime: Infinity,
  });
  const release = useDeckRelease(useCases, deck);
  const report =
    reportQuery.data === undefined || release === null || release === undefined
      ? undefined
      : {
          place: reportQuery.data,
          releaseUrl: deck.sourceUrl!,
          cardIds: new Set(release.cards.map((card) => card.id)),
        };

  const [session, setSession] = useState<{
    prompts: Prompt[];
    position: number;
    /** The last answer put its card back to come round again. */
    putBack: boolean;
  } | null>(null);
  useEffect(() => {
    if (session !== null || queueQuery.data === undefined) return;
    const { due, newPrompts } = queueQuery.data;
    setSession({
      prompts: interleave(due, newPrompts),
      position: 0,
      putBack: false,
    });
  }, [session, queueQuery.data]);

  // A session that recorded answers ends by keeping the deck's schedule in the digest:
  // on exit, when the screen goes away, or (best effort) when the page is hidden.
  // What happens when the screen goes away is a layout effect's cleanup: Preact 11
  // runs those as the component unmounts, a plain effect's only after the next
  // frame, when the screen that replaced it (the deck list) has already shown.
  const answered = useRef(0);
  function keepSchedule() {
    if (answered.current === 0) return;
    answered.current = 0;
    void useCases.refreshStudyDigest(instance.url, deck).catch(() => undefined);
  }
  useLayoutEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden") keepSchedule();
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      keepSchedule();
    };
  }, [instance.url, deck.url]);

  const answerMutation = useMutation({
    mutationFn: (args: { prompt: Prompt; quality: ReviewQuality; times: ResponseTimes }) =>
      useCases.recordReview(instance.url, deck, args.prompt, args.quality, now(), args.times),
    onSuccess: (state, { prompt, quality }) => {
      answered.current++;
      queryClient.setQueryData(
        ["reviews", deck.reviewsDocumentUrl, state.cardId, state.direction],
        state,
      );
      setSession((current) => {
        const next = current!.position + 1;
        if (!repeatsInSession(quality)) {
          return { prompts: current!.prompts, position: next, putBack: false };
        }
        const done = current!.prompts.slice(0, next);
        const remaining = current!.prompts.slice(next);
        return {
          prompts: [...done, ...requeueCard(remaining, prompt, random)],
          position: next,
          putBack: true,
        };
      });
    },
  });

  useLayoutEffect(
    () => () => {
      queryClient.removeQueries({ queryKey: ["studyQueue", deck.url] });
    },
    [queryClient, deck.url],
  );

  async function handleExit() {
    keepSchedule();
    await queryClient.invalidateQueries({
      queryKey: ["reviews", deck.reviewsDocumentUrl],
    });
    onExit();
  }

  if (queueQuery.error) {
    return <ErrorMessage error={errorText(queueQuery.error)} />;
  }
  if (session === null) {
    return <Loading label={t("study.preparing")} />;
  }

  const { prompts, position, putBack } = session;
  const prompt = position < prompts.length ? prompts[position] : null;
  return (
    <StudyScreen
      deckName={readerText(deck.title)}
      deckLang={readerLang(deck.title)}
      deckHref={deckLink}
      report={report}
      prompt={prompt}
      position={position + 1}
      total={prompts.length}
      putBack={putBack}
      answerScale={answerScale}
      busy={answerMutation.isPending}
      error={errorText(answerMutation.error)}
      onAnswer={(quality, times) => answerMutation.mutate({ prompt: prompt!, quality, times })}
      onExit={() => void handleExit()}
    />
  );
}
