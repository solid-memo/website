// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { WelcomeBack as Welcome } from "@solid-memo/domain/statistics";
import { useI18n } from "./i18n";
import { FlameIcon } from "./icons";

/** The notes on a streak to keep, one a day in turn, so a learner who keeps coming back reads a new one. */
const STREAK_NOTES = ["makeIt", "counting", "waiting", "oneSession"] as const;
/** The notes once a streak has lapsed, in turn as well. */
const LAPSED_NOTES = ["start", "fresh", "dayOne", "record", "ready"] as const;

/**
 * The day's note: on the record when one more day ties or beats it, else
 * the day's turn of the others, picked by the study day and not at
 * random, so it stays put as the list reads again and changes the next day.
 */
function useWelcomeNote() {
  const { t } = useI18n();
  return ({ streak, longestStreak, dayNumber }: Welcome) => {
    if (streak === 0) {
      const note = LAPSED_NOTES[dayNumber % LAPSED_NOTES.length]!;
      return t(`today.welcome.lapsed.${note}`, { count: longestStreak });
    }
    if (streak + 1 === longestStreak) {
      return t("today.welcome.tieRecord", { longest: longestStreak });
    }
    if (streak === longestStreak) return t("today.welcome.newRecord");
    const note = STREAK_NOTES[dayNumber % STREAK_NOTES.length]!;
    return t(`today.welcome.${note}`, { count: streak, next: streak + 1 });
  };
}

/**
 * A word of welcome back in the today strip's place, before the day's
 * first answer: the streak that studying today keeps, and a note on it;
 * once the streak has lapsed, a gentle note to start a new one. Then
 * how many cards are left to study today, once every deck's count is
 * known (`left`), and about how many minutes they will take, once that
 * is known too (`minutesLeft`), so it ends in something to do.
 */
export function WelcomeBack({
  welcome,
  left,
  minutesLeft,
}: {
  welcome: Welcome;
  /** The cards to study today in every deck, due and new; none while unknown. */
  left?: number;
  /** About how many minutes they will take (expectedTimeToday); none while unknown. */
  minutesLeft?: number;
}) {
  const { t } = useI18n();
  const note = useWelcomeNote();
  const todo =
    left === undefined || left === 0
      ? []
      : [
          t("today.stillDue", { count: left }),
          ...(minutesLeft === undefined ? [] : [t("today.timeLeft", { count: minutesLeft })]),
        ];
  return (
    <aside class="today-strip" aria-label={t("today.welcome.heading")}>
      <FlameIcon />
      <div>
        <p>
          {welcome.streak === 0 ? (
            note(welcome)
          ) : (
            <>
              <strong class="streak-count">
                {t("today.streakCount", { count: welcome.streak })}
              </strong>{" "}
              <span class="streak-note">{note(welcome)}</span>
            </>
          )}
        </p>
        {todo.length === 0 ? null : <p class="today-numbers">{todo.join(" · ")}</p>}
      </div>
    </aside>
  );
}
