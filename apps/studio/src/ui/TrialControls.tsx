// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useMemo, useState } from "preact/hooks";
import type { LangText } from "@solid-memo/domain/langText";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n } from "@solid-memo/ui/i18n";
import { OUTLINE_LIMIT } from "./DraftOutline";

/** Most days a trial is moved ahead at once. */
export const MOST_DAYS = 3650;

/**
 * The trial's controls (docs/studio.md, The trial): for a course, its
 * page and a chapter to open (as a learner who completed those before
 * it); answers given at once, all right or all wrong, to what is asked
 * now (`answerHint` says what); the days the trial's clock is moved
 * ahead, and more of them. While one of them runs, `busy`, none can be
 * used; `error` is why the last one failed. The chapter select lists
 * the first OUTLINE_LIMIT chapters, and as many more each time the user
 * asks, with the chapter in view (`current`) wherever it is.
 */
export function TrialControls({
  coursePage,
  chapters,
  current,
  answerHint,
  days,
  busy,
  error,
  onJump,
  onAnswerAll,
  onAdvance,
}: {
  /** The course's page in the trial; null for a deck. */
  coursePage: string | null;
  /** A course's chapters, each by its id and title; none for a deck. */
  chapters: readonly { id: string; title: LangText }[];
  /** The chapter in view, by its id, if any. */
  current?: string | undefined;
  /** What the answers go to; null when nothing is asked now (a course finished). */
  answerHint: "course" | "deck" | null;
  days: number;
  busy: boolean;
  error: unknown;
  onJump: (chapter: string) => void;
  onAnswerAll: (correct: boolean) => void;
  onAdvance: (days: number) => void;
}) {
  const { t, errorText, readerText } = useI18n();
  const [ahead, setAhead] = useState(1);
  const [count, setCount] = useState(OUTLINE_LIMIT);
  const [picked, setPicked] = useState<string | null>(null);
  const listed = useMemo(() => {
    const shown = chapters.slice(0, count);
    const at = current === undefined ? -1 : chapters.findIndex((one) => one.id === current);
    if (at >= count) shown.push(chapters[at]!);
    return { shown, more: chapters.length - shown.length };
  }, [chapters, count, current]);

  return (
    <section class="trial-controls" aria-labelledby="trial-controls">
      <h3 id="trial-controls">{t("studio.trial.controls")}</h3>
      <fieldset disabled={busy}>
        {coursePage !== null && (
          <>
            <p>
              <a href={coursePage}>{t("studio.trial.coursePage")}</a>
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                onJump(
                  (event.currentTarget.elements.namedItem("chapter") as HTMLSelectElement).value,
                );
              }}
            >
              <label>
                {t("studio.trial.chapter")}
                <select
                  name="chapter"
                  value={picked ?? current}
                  onChange={(event) => setPicked(event.currentTarget.value)}
                >
                  {listed.shown.map((one) => (
                    <option key={one.id} value={one.id}>
                      {readerText(one.title)}
                    </option>
                  ))}
                </select>
              </label>{" "}
              {listed.more > 0 && (
                <>
                  <button type="button" onClick={() => setCount((was) => was + OUTLINE_LIMIT)}>
                    {t("studio.question.moreChapters", {
                      count: Math.min(listed.more, OUTLINE_LIMIT),
                    })}
                  </button>{" "}
                </>
              )}
              <button type="submit">{t("studio.trial.jump")}</button>
              <span class="hint"> {t("studio.trial.jumpHint")}</span>
            </form>
          </>
        )}
        {answerHint !== null && (
          <p>
            {t(answerHint === "course" ? "studio.trial.answersCourse" : "studio.trial.answersDeck")}{" "}
            <button type="button" onClick={() => onAnswerAll(true)}>
              {t("studio.trial.allRight")}
            </button>{" "}
            <button type="button" onClick={() => onAnswerAll(false)}>
              {t("studio.trial.allWrong")}
            </button>
          </p>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onAdvance(ahead);
          }}
        >
          <label>
            {t("studio.trial.days")}{" "}
            <input
              type="number"
              min={1}
              max={MOST_DAYS}
              required
              value={ahead}
              onInput={(event) => setAhead(event.currentTarget.valueAsNumber)}
            />
          </label>{" "}
          <button type="submit">{t("studio.trial.advance")}</button>
        </form>
      </fieldset>
      <p role="status">
        {busy
          ? t("studio.trial.working")
          : days === 0
            ? t("studio.trial.today")
            : t("studio.trial.ahead", { count: days })}
      </p>
      {error ? <ErrorMessage error={errorText(error)} /> : null}
    </section>
  );
}
