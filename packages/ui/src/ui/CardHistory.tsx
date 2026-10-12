// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useId } from "preact/hooks";
import { isRecalled, type Answer } from "@solid-memo/domain/answer";
import { chainIndexOf, isRepeat } from "@solid-memo/domain/answerChain";
import { isMarkdown, type Card, type Deck, type StudyDirection } from "@solid-memo/domain/deck";
import type { ReviewState } from "@solid-memo/domain/review";
import { studyDayOf } from "@solid-memo/domain/scheduling";
import { gradeGroupOf } from "@solid-memo/domain/studyPatterns";
import { fragmentIdOf } from "@solid-memo/domain/subjectUrl";
import { DataLine } from "./DataText";
import { useI18n } from "./i18n";
import { GRADE_GROUPS } from "./charts/GradeBars";

const BOTH: readonly StudyDirection[] = ["front-to-back", "back-to-front"];

/**
 * A card's history on its page, for the learner: where it stands now in
 * each direction it has been studied (its interval, when it is due, and
 * the study day it was first studied on), then every answer to it
 * (`answers`, newest first, as UseCases.cardAnswers gives them) as a
 * table: the study day, which way when the card has been asked both
 * ways, what kind of answer it was (a first one, a review, one again the
 * same day, or a course question), the button pressed or whether the
 * option chosen was right (naming the wrong one), and the interval it
 * gave. A card not studied yet says so.
 */
export function CardHistory({
  deck,
  card,
  answers,
  states,
  dayBoundaryHour,
}: {
  deck: Deck;
  card: Card;
  answers: readonly Answer[];
  /** The deck's review states: the card's are found among them. */
  states: readonly ReviewState[];
  /** The hour a study day begins, as the answers' days were counted. */
  dayBoundaryHour: number;
}) {
  const { t, tx, formatDate, directionLabel } = useI18n();
  const headingId = useId();
  const own = BOTH.flatMap((direction) =>
    states.filter((state) => state.cardId === card.id && state.direction === direction),
  );
  const index = chainIndexOf(answers);
  const ways =
    deck.direction === "bidirectional" ||
    new Set([...own, ...answers].map(({ direction }) => direction)).size > 1;
  const markdown = isMarkdown(card.textFormat);
  const kindOf = (answer: Answer) =>
    answer.mode === "multiple-choice"
      ? t("card.historyCourse")
      : isRepeat(answer, index)
        ? t("card.historyRepeat")
        : answer.priorIntervalDays === undefined
          ? t("card.historyFirst")
          : t("card.historyReview");
  const given = (answer: Answer) => {
    if (answer.mode !== "multiple-choice")
      return t(GRADE_GROUPS.find(([group]) => group === gradeGroupOf(answer.grade))![1]);
    if (isRecalled(answer)) return t("card.historyRight");
    const id =
      answer.chosenDistractor === undefined ? undefined : fragmentIdOf(answer.chosenDistractor);
    const option = card.distractors?.find((distractor) => distractor.id === id);
    return option === undefined
      ? t("card.historyWrong")
      : tx("card.historyWrongOption", {
          option: <DataLine text={option.text} markdown={markdown} />,
        });
  };
  return (
    <section class="statistics card-history" aria-labelledby={headingId}>
      <h3 id={headingId}>{t("card.historyHeading")}</h3>
      {own.length === 0 && answers.length === 0 ? (
        <p class="hint">{t("card.historyNone")}</p>
      ) : (
        <>
          {own.map((state) => (
            <div key={state.direction} class="card-standing">
              {ways && <h4>{directionLabel(state.direction)}</h4>}
              <dl class="facts">
                <dt>{t("card.historyInterval")}</dt>
                <dd>{t("statistics.dayCount", { count: state.intervalDays })}</dd>
                <dt>{t("card.historyDue")}</dt>
                <dd>{formatDate(state.due)}</dd>
                <dt>{t("card.historyFirstStudied")}</dt>
                <dd>{formatDate(studyDayOf(new Date(state.firstReviewedAt), dayBoundaryHour))}</dd>
              </dl>
            </div>
          ))}
          <p class="hint">{t("card.historyHint")}</p>
          {answers.length > 0 && (
            <div
              class="table-scroll"
              role="region"
              aria-labelledby={`${headingId}-answers`}
              tabIndex={0}
            >
              <table class="deck-statistics">
                <caption id={`${headingId}-answers`}>{t("card.historyAnswers")}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t("statistics.day")}</th>
                    {ways && <th scope="col">{t("card.historyDirection")}</th>}
                    <th scope="col">{t("card.historyKind")}</th>
                    <th scope="col">{t("card.historyAnswer")}</th>
                    <th scope="col">{t("card.historyNext")}</th>
                  </tr>
                </thead>
                <tbody>
                  {answers.map((answer) => (
                    <tr key={answer.id}>
                      <th scope="row">{formatDate(answer.studyDay)}</th>
                      {ways && <td>{directionLabel(answer.direction)}</td>}
                      <td>{kindOf(answer)}</td>
                      <td>{given(answer)}</td>
                      <td>{t("statistics.dayCount", { count: answer.nextIntervalDays })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
