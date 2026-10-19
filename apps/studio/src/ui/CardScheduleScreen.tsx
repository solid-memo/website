// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useState } from "preact/hooks";
import type { StudyDirection } from "@solid-memo/domain/deck";
import type { ReviewState } from "@solid-memo/domain/review";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n, type ErrorText } from "@solid-memo/ui/i18n";
import { useConfirm } from "./shell/ConfirmDialog";

/**
 * What FSRS-6 holds of a card in one direction, as the tab shows it:
 * its memory (stability in days, difficulty from 1 to 10, the chance of
 * recalling it now) and due day, and whether FSRS-6 sets the due days
 * (`sets`); or, while FSRS-6 sets them, that it has no up-to-date state
 * of the card, which is estimated from SM-2's at its next review.
 */
export type FsrsSchedule =
  | {
      kind: "memory";
      stability: number;
      difficulty: number;
      recall: number;
      due: string;
      sets: boolean;
    }
  | { kind: "estimated" };

/**
 * A card in one direction: its review state, if it has been studied so,
 * whether the deck studies it so now, and what FSRS-6 holds of it, when
 * the instance schedules with FSRS-6 or the card has an FSRS-6 state.
 */
export interface CardDirectionSchedule {
  direction: StudyDirection;
  state: ReviewState | null;
  studied: boolean;
  fsrs: FsrsSchedule | null;
}

/** What was last done on the tab, for its status line. */
export type ScheduleEditMade =
  | { kind: "reset"; direction: StudyDirection }
  | { kind: "reschedule"; direction: StudyDirection; due: string };

/**
 * The card inspector's schedule tab: the card's review state in each
 * direction the deck studies it (and in one it no longer does, while a
 * state is kept there): SM-2's, when it is due, its interval, ease and
 * repetitions, and when it was first and last reviewed; then, when
 * there is one (`fsrs`), FSRS-6's, its due day, stability, difficulty
 * and recall chance now, or that it is estimated at the next review,
 * with which of the two sets the due days. A direction never studied
 * says so.
 *
 * A state can be given another due day (`onReschedule`), the day it has
 * to start with (FSRS-6's when it sets the due days), or forgotten
 * (`onReset`) once the user confirms: the card is then new in that
 * direction. Its answers stay in the history either way. The status
 * line says what was done (`done`).
 */
export function CardScheduleScreen({
  directions,
  busy,
  done,
  error,
  onReset,
  onReschedule,
}: {
  directions: readonly CardDirectionSchedule[];
  busy: boolean;
  done: ScheduleEditMade | null;
  error: ErrorText | null;
  onReset: (direction: StudyDirection) => void;
  onReschedule: (direction: StudyDirection, due: string) => void;
}) {
  const { t, directionLabel, formatDate } = useI18n();
  return (
    <div class="studio-schedule">
      {directions.map(({ direction, state, studied, fsrs }) => (
        <section key={direction} aria-labelledby={`schedule-${direction}`}>
          <h3 id={`schedule-${direction}`}>{directionLabel(direction)}</h3>
          {!studied && <p class="hint">{t("studio.schedule.notStudiedSo")}</p>}
          {state === null ? (
            <p>{t("studio.schedule.new")}</p>
          ) : (
            <DirectionState
              state={state}
              fsrs={fsrs}
              busy={busy}
              onReset={() => onReset(direction)}
              onReschedule={(due) => onReschedule(direction, due)}
            />
          )}
        </section>
      ))}
      <p class="hint">{t("studio.schedule.hint")}</p>
      <p class="hint" role="status">
        {done === null
          ? ""
          : t(`studio.schedule.done.${done.kind}`, {
              direction: directionLabel(done.direction),
              ...(done.kind === "reschedule" ? { due: formatDate(done.due) } : {}),
            })}
      </p>
      <ErrorMessage error={error} />
    </div>
  );
}

/** One direction's state, and what can be done with it. */
function DirectionState({
  state,
  fsrs,
  busy,
  onReset,
  onReschedule,
}: {
  state: ReviewState;
  fsrs: FsrsSchedule | null;
  busy: boolean;
  onReset: () => void;
  onReschedule: (due: string) => void;
}) {
  const { t, locale, formatDate } = useI18n();
  const [due, setDue] = useState(fsrs?.kind === "memory" && fsrs.sets ? fsrs.due : state.due);
  const { ask, dialog } = useConfirm();
  const instant = (iso: string) =>
    new Date(iso).toLocaleString(locale, { dateStyle: "long", timeStyle: "short" });
  const id = `due-${state.direction}`;
  return (
    <>
      {fsrs !== null && <h4>{t("studio.schedule.sm2Heading")}</h4>}
      <dl class="facts">
        <dt>{t("studio.schedule.due")}</dt>
        <dd>{formatDate(state.due)}</dd>
        <dt>{t("studio.schedule.interval")}</dt>
        <dd>{t("studio.cards.days", { count: state.intervalDays })}</dd>
        <dt>{t("studio.schedule.ease")}</dt>
        <dd>{state.easeFactor.toFixed(2)}</dd>
        <dt>{t("studio.schedule.repetitions")}</dt>
        <dd>{state.repetitions}</dd>
        <dt>{t("studio.schedule.firstReviewed")}</dt>
        <dd>{instant(state.firstReviewedAt)}</dd>
        <dt>{t("studio.schedule.lastReviewed")}</dt>
        <dd>{instant(state.lastReviewedAt)}</dd>
      </dl>
      {fsrs !== null && <FsrsFacts fsrs={fsrs} />}
      <form
        class="studio-reschedule"
        onSubmit={(event) => {
          event.preventDefault();
          onReschedule(due);
        }}
      >
        <label for={id}>{t("studio.schedule.dueLabel")}</label>
        <input
          id={id}
          type="date"
          value={due}
          required
          disabled={busy}
          onInput={(event) => setDue(event.currentTarget.value)}
        />
        <button type="submit" disabled={busy}>
          {t("studio.schedule.reschedule")}
        </button>
      </form>
      <p class="actions">
        <button
          type="button"
          class="danger"
          disabled={busy}
          onClick={() =>
            ask({
              heading: t("studio.confirm.forgetDirection"),
              text: t("studio.schedule.resetConfirm"),
              action: t("studio.schedule.reset"),
              onConfirm: onReset,
            })
          }
        >
          {t("studio.schedule.reset")}
        </button>
      </p>
      {dialog}
    </>
  );
}

/** What FSRS-6 holds of the card this way, and which scheduler sets its due days. */
function FsrsFacts({ fsrs }: { fsrs: FsrsSchedule }) {
  const { t, formatDate, formatPercent } = useI18n();
  return (
    <>
      <h4>{t("studio.schedule.fsrsHeading")}</h4>
      {fsrs.kind === "estimated" ? (
        <p class="hint">{t("studio.schedule.fsrsEstimated")}</p>
      ) : (
        <>
          <dl class="facts">
            <dt>{t("studio.schedule.due")}</dt>
            <dd>{formatDate(fsrs.due)}</dd>
            <dt>{t("studio.schedule.stability")}</dt>
            <dd>{t("studio.cards.days", { count: Math.round(fsrs.stability * 10) / 10 })}</dd>
            <dt>{t("studio.schedule.difficulty")}</dt>
            <dd>
              {t("studio.schedule.difficultyValue", {
                value: Math.round(fsrs.difficulty * 10) / 10,
              })}
            </dd>
            <dt>{t("studio.schedule.recall")}</dt>
            <dd>{formatPercent(fsrs.recall)}</dd>
          </dl>
          <p class="hint">
            {t(fsrs.sets ? "studio.schedule.fsrsSets" : "studio.schedule.sm2Sets")}
          </p>
        </>
      )}
    </>
  );
}
