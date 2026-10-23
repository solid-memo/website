// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useEffect, useState } from "preact/hooks";
import { useQuery } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { promptsOf, type Deck, type Prompt } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import type { AnswerScale } from "@solid-memo/domain/answerScale";
import { effectiveAnswerScale } from "@solid-memo/domain/preferences";
import type { ReviewQuality } from "@solid-memo/domain/review";
import { repeatsInSession, requeueCard, shuffle } from "@solid-memo/domain/scheduling";
import { useCardProgress } from "./CardProgressContainer";
import { ErrorMessage } from "./ErrorMessage";
import { leechesOf } from "./HardestCards";
import { Loading } from "./Loading";
import { StudyScreen } from "./StudyScreen";
import { useReportTarget } from "./deckRelease";
import { deckHref } from "./router";
import { useI18n } from "./i18n";

/** A cram as it stands: the prompts it began with, and its walk through them. */
interface Cram {
  /** The leeches' prompts, as they were when the cram began; each start shuffles them afresh. */
  leeches: readonly Prompt[];
  prompts: Prompt[];
  position: number;
  /** The last answer put its card back to come round again. */
  putBack: boolean;
  /** The answer buttons the preferences asked for when the cram began. */
  answerScale: AnswerScale;
}

/** A cram of `leeches` from the start, in an order of `random`'s, on `answerScale`'s buttons. */
function startOf(leeches: readonly Prompt[], answerScale: AnswerScale, random: () => number): Cram {
  return { leeches, prompts: shuffle(leeches, random), position: 0, putBack: false, answerScale };
}

/**
 * A cram of a deck's leeches (leechesOf, from the cards' progress the
 * deck's page has read): each leech in each direction the deck is
 * studied in, shuffled, answered as in a study session (StudyScreen,
 * with the answer buttons the preferences ask for) and as often as the
 * learner likes, a low grade putting its card back as a study session
 * does. The cards are taken once, when the cram begins, and the progress
 * and the preferences are not read again after it (not on focus, nor
 * when a change elsewhere invalidates them), so nothing changes the
 * cards under the learner, and a read failing then cannot end the cram;
 * "Cram again" starts over with the same cards.
 *
 * Nothing is recorded: no answer is graded or logged, no study digest
 * is refreshed and no cached review state is touched, so no due date,
 * statistic or leech changes. A card stops being a leech only by being
 * studied. Hence no interval is shown for a grade, and nothing can be
 * undone. A deck copied from a release still says where a mistake in a
 * card is reported (useReportTarget), which only reads.
 */
export function CramContainer({
  useCases,
  instance,
  deck,
  onExit,
  random = Math.random,
}: {
  useCases: UseCases;
  instance: Instance;
  deck: Deck;
  onExit: () => void;
  /** Uniform [0, 1) source: the order of the cards, and where a failed card comes back. */
  random?: () => number;
}) {
  const { t, readerText, readerLang, errorText } = useI18n();
  const [cram, setCram] = useState<Cram | null>(null);
  // Read until the cram begins, and never after.
  const reading = cram === null;
  const progressQuery = useCardProgress(useCases, instance, deck, reading);
  const preferencesQuery = useQuery({
    queryKey: ["preferences", instance.url],
    queryFn: () => useCases.getPreferences(instance.url),
    enabled: reading,
  });
  const report = useReportTarget(useCases, deck);

  useEffect(() => {
    if (!reading || progressQuery.data === undefined || preferencesQuery.data === undefined) return;
    const leeches = leechesOf(progressQuery.data.decks).flatMap(({ hard }) =>
      promptsOf([hard.card], deck.direction),
    );
    setCram(startOf(leeches, effectiveAnswerScale(preferencesQuery.data), random));
  }, [reading, progressQuery.data, preferencesQuery.data]);

  function answer(quality: ReviewQuality) {
    setCram((current) => {
      const next = current!.position + 1;
      if (!repeatsInSession(quality)) return { ...current!, position: next, putBack: false };
      const done = current!.prompts.slice(0, next);
      const remaining = current!.prompts.slice(next);
      const prompt = current!.prompts[current!.position];
      return {
        ...current!,
        prompts: [...done, ...requeueCard(remaining, prompt, random)],
        position: next,
        putBack: true,
      };
    });
  }

  if (cram === null) {
    const error = progressQuery.error ?? preferencesQuery.error;
    if (error) return <ErrorMessage error={errorText(error)} />;
    return <Loading label={t("cram.preparing")} />;
  }

  const { prompts, position, putBack, answerScale } = cram;
  return (
    <StudyScreen
      deckName={readerText(deck.title)}
      deckLang={readerLang(deck.title)}
      deckHref={deckHref(instance.url, deck.url)}
      report={report}
      prompt={position < prompts.length ? prompts[position] : null}
      position={position + 1}
      total={prompts.length}
      putBack={putBack}
      answerScale={answerScale}
      busy={false}
      error={null}
      onAnswer={answer}
      onExit={onExit}
      cram={{ onAgain: () => setCram(startOf(cram.leeches, answerScale, random)) }}
    />
  );
}
