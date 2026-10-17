// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GradeBasis, ReviewUndo, UseCases } from "@solid-memo/application/useCases";
import type { ResponseTimes } from "@solid-memo/domain/answer";
import type { Deck, Prompt } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import {
  reviewKeyOf,
  type ReviewKey,
  type ReviewQuality,
  type ReviewState,
} from "@solid-memo/domain/review";
import { interleave, repeatsInSession, requeueCard } from "@solid-memo/domain/scheduling";
import { ErrorMessage } from "./ErrorMessage";
import { Loading } from "./Loading";
import { StudyScreen } from "./StudyScreen";
import { useClock } from "./courseLinks";
import { useDeckRelease } from "./deckRelease";
import { deckHref } from "./router";
import { useI18n } from "./i18n";

/** A study session as it stands. */
interface Session {
  prompts: Prompt[];
  position: number;
  /** The last answer put its card back to come round again. */
  putBack: boolean;
  /** The last answer was just undone. */
  undone: boolean;
  /** The states the session's answers and undos left its prompts in, by review key (reviewKeyOf). */
  states: ReadonlyMap<string, ReviewState | null>;
  /** What undoing the last answer takes, and the session as it was before it; null: nothing to undo. */
  last: { undo: ReviewUndo; before: Session } | null;
}

/**
 * Owns one study session. The queue is fetched once when the session
 * starts and then walked in order; answering a card badly puts it back
 * into the remainder (never as the very next card unless it is the only
 * one left). The session covers today's due prompts and the new ones
 * within the daily budget, the new spread among the due, today and each
 * answer by the screen's time (useClock), keeping how long it took
 * (StudyScreen). Each answer is graded with the preferences the queue
 * was built with (recordReview's `known`), so they are not read again
 * for it. The deck's cached queue is
 * dropped when the session ends, however it is left. Its deck links to
 * the deck's page, or to `deckLink` when given. A deck copied from a
 * release says where a mistake in the cards it has of the release is
 * reported (UseCases.reportPlace).
 *
 * The last answer can be undone while the session lasts, one step back:
 * its prompt's state and its answer in the log go (useCases.undoReview),
 * and the session is as it was before it, its card up again and a copy
 * a low grade put back gone. Each grade shows the interval it gives,
 * from the prompt's state: as the queue brought the deck's states when
 * the session began, then as its answers and undos left it.
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

  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    if (session !== null || queueQuery.data === undefined) return;
    const { due, newPrompts } = queueQuery.data;
    setSession({
      prompts: interleave(due, newPrompts),
      position: 0,
      putBack: false,
      undone: false,
      states: new Map(),
      last: null,
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
    mutationFn: (args: {
      prompt: Prompt;
      quality: ReviewQuality;
      times: ResponseTimes;
      known: GradeBasis;
    }) =>
      useCases.recordReview(
        instance.url,
        deck,
        args.prompt,
        args.quality,
        now(),
        args.times,
        args.known,
      ),
    onMutate: (): void => undoMutation.reset(),
    onSuccess: ({ state, undo }, { prompt, quality }) => {
      answered.current++;
      keepState(state, state);
      setSession((current) => {
        const before = { ...current!, last: null };
        const next = current!.position + 1;
        const states = new Map(current!.states).set(reviewKeyOf(state), state);
        const last = { undo, before };
        if (!repeatsInSession(quality)) {
          return { ...before, position: next, putBack: false, undone: false, states, last };
        }
        const done = current!.prompts.slice(0, next);
        const remaining = current!.prompts.slice(next);
        return {
          prompts: [...done, ...requeueCard(remaining, prompt, random)],
          position: next,
          putBack: true,
          undone: false,
          states,
          last,
        };
      });
    },
  });

  const undoMutation = useMutation({
    mutationFn: (undo: ReviewUndo) => useCases.undoReview(instance.url, deck, undo),
    onMutate: (): void => answerMutation.reset(),
    onSuccess: (before, undo) => {
      keepState(undo.key, before);
      setSession((current) => ({ ...current!.last!.before, putBack: false, undone: true }));
    },
  });

  /** A prompt's state as an answer or an undo left it, for the screens that show it. */
  function keepState(key: ReviewKey, state: ReviewState | null) {
    queryClient.setQueryData(
      ["reviews", deck.reviewsDocumentUrl, key.cardId, key.direction],
      state,
    );
  }

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

  const { prompts, position, putBack, undone, states, last } = session;
  const prompt = position < prompts.length ? prompts[position] : null;
  const key =
    prompt === null ? "" : reviewKeyOf({ cardId: prompt.card.id, direction: prompt.direction });
  const busy = answerMutation.isPending || undoMutation.isPending;
  return (
    <StudyScreen
      deckName={readerText(deck.title)}
      deckLang={readerLang(deck.title)}
      deckHref={deckLink}
      report={report}
      prompt={prompt}
      state={
        states.has(key)
          ? states.get(key)
          : (queueQuery.data!.states.find((state) => reviewKeyOf(state) === key) ?? null)
      }
      position={position + 1}
      total={prompts.length}
      putBack={putBack}
      undone={undone}
      answerScale={answerScale}
      busy={busy}
      error={errorText(answerMutation.error ?? undoMutation.error)}
      onAnswer={(quality, times) =>
        answerMutation.mutate({
          prompt: prompt!,
          quality,
          times,
          known: { prefs: queueQuery.data!.prefs },
        })
      }
      onUndo={last === null ? undefined : () => undoMutation.mutate(last.undo)}
      onExit={() => void handleExit()}
    />
  );
}
