import { useState } from "preact/hooks";
import type { StudyDirection } from "@solid-memo/domain/deck";
import type { ReviewState } from "@solid-memo/domain/review";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n, type ErrorText } from "@solid-memo/ui/i18n";

/** A card in one direction: its review state, if it has been studied so, and whether the deck studies it so now. */
export interface CardDirectionSchedule {
  direction: StudyDirection;
  state: ReviewState | null;
  studied: boolean;
}

/** What was last done on the tab, for its status line. */
export type ScheduleEditMade = { kind: "reset"; direction: StudyDirection } | { kind: "reschedule"; direction: StudyDirection; due: string };

/**
 * The card inspector's schedule tab: the card's review state in each
 * direction the deck studies it (and in one it no longer does, while a
 * state is kept there), as Solid Memo's scheduler sees it: when it is
 * due, its interval, ease and repetitions, and when it was first and
 * last reviewed. A direction never studied says so.
 *
 * A state can be given another due day (`onReschedule`), the day it has
 * to start with, or forgotten (`onReset`) once the user confirms: the
 * card is then new in that direction. Its answers stay in the history
 * either way. The status line says what was done (`done`).
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
      {directions.map(({ direction, state, studied }) => (
        <section key={direction} aria-labelledby={`schedule-${direction}`}>
          <h3 id={`schedule-${direction}`}>{directionLabel(direction)}</h3>
          {!studied && <p class="hint">{t("studio.schedule.notStudiedSo")}</p>}
          {state === null ? (
            <p>{t("studio.schedule.new")}</p>
          ) : (
            <DirectionState state={state} busy={busy} onReset={() => onReset(direction)} onReschedule={(due) => onReschedule(direction, due)} />
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
  busy,
  onReset,
  onReschedule,
}: {
  state: ReviewState;
  busy: boolean;
  onReset: () => void;
  onReschedule: (due: string) => void;
}) {
  const { t, locale, formatDate } = useI18n();
  const [due, setDue] = useState(state.due);
  const instant = (iso: string) => new Date(iso).toLocaleString(locale, { dateStyle: "long", timeStyle: "short" });
  const id = `due-${state.direction}`;
  return (
    <>
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
      <form
        class="studio-reschedule"
        onSubmit={(event) => {
          event.preventDefault();
          onReschedule(due);
        }}
      >
        <label for={id}>{t("studio.schedule.dueLabel")}</label>
        <input id={id} type="date" value={due} required disabled={busy} onInput={(event) => setDue(event.currentTarget.value)} />
        <button type="submit" disabled={busy}>
          {t("studio.schedule.reschedule")}
        </button>
      </form>
      <p class="actions">
        <button
          type="button"
          class="danger"
          disabled={busy}
          onClick={() => {
            if (window.confirm(t("studio.schedule.resetConfirm"))) onReset();
          }}
        >
          {t("studio.schedule.reset")}
        </button>
      </p>
    </>
  );
}
