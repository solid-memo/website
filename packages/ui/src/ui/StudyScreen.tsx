// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useId, useLayoutEffect, useRef, useState } from "preact/hooks";
import {
  MINIMAL_ANSWER_QUALITY,
  MINIMAL_ANSWERS,
  SM2_QUALITIES,
  type AnswerScale,
  type MinimalAnswer,
} from "@solid-memo/domain/answerScale";
import type { ResponseTimes } from "@solid-memo/domain/answer";
import { promptSides, type Prompt } from "@solid-memo/domain/deck";
import type { ReportPlace } from "@solid-memo/domain/mistakeReport";
import type { ReviewQuality } from "@solid-memo/domain/review";
import { CardFace } from "./CardFace";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n, type I18n, type ErrorText } from "./i18n";
import { inDataRegion } from "./Markdown";
import { ReportMistake } from "./ReportMistake";
import { useStopwatch } from "./stopwatch";

function qualityLabel(quality: ReviewQuality, t: I18n["t"]): string {
  switch (quality) {
    case 0:
      return t("study.quality.blackout");
    case 1:
      return t("study.quality.wrong");
    case 2:
      return t("study.quality.almost");
    case 3:
      return t("study.quality.hard");
    case 4:
      return t("study.quality.good");
    case 5:
      return t("study.quality.easy");
  }
}

function minimalLabel(answer: MinimalAnswer, t: I18n["t"]): string {
  switch (answer) {
    case "again":
      return t("study.minimal.again");
    case "hard":
      return t("study.minimal.hard");
    case "good":
      return t("study.minimal.good");
    case "easy":
      return t("study.minimal.easy");
  }
}

/**
 * The grading buttons a scale shows, in display order, each with the key
 * that presses it: an SM-2 grade's own number, so "0 — Blackout" is 0, and
 * on the minimal scale 1 to 4 from Again to Easy.
 */
function answerButtons(
  scale: AnswerScale,
  t: I18n["t"],
): { label: string; quality: ReviewQuality; key: string }[] {
  return scale === "minimal"
    ? MINIMAL_ANSWERS.map((answer, index) => ({
        label: minimalLabel(answer, t),
        quality: MINIMAL_ANSWER_QUALITY[answer],
        key: String(index + 1),
      }))
    : SM2_QUALITIES.map((quality) => ({
        label: qualityLabel(quality, t),
        quality,
        key: String(quality),
      }));
}

/**
 * A study session, card by card (StudyCard). A card of a release, in a
 * deck copied from it, says where a mistake in it is reported (`report`):
 * a deck the learner wrote has none, and nor has a card they added.
 *
 * A cram (`cram`, CramContainer) is headed as one and says, the whole
 * session, that nothing in it is recorded; its end says so too, and
 * offers to cram the same cards again.
 */
export function StudyScreen({
  deckName,
  deckLang,
  deckHref,
  report,
  prompt,
  intervals,
  position,
  total,
  putBack,
  undone,
  answerScale,
  busy,
  error,
  onAnswer,
  onUndo,
  onExit,
  cram,
}: {
  deckName: string;
  /** The language the deck's name is in, when not the page's (readerLang). */
  deckLang?: string;
  /** URL of the deck's page; its name links there. */
  deckHref: string;
  /**
   * Where a mistake in the deck's release is reported, the release, and
   * the ids of its cards, the only ones reported; none for a deck from
   * no release, or while it is read.
   */
  report?: { place: ReportPlace; releaseUrl: string; cardIds: ReadonlySet<string> };
  /** null when the session is finished. */
  prompt: Prompt | null;
  /**
   * The interval each grade would give the prompt, in days, as the
   * scheduler that sets the due days works it out (previewIntervals);
   * undefined while unknown, when none is shown.
   */
  intervals?: Readonly<Record<ReviewQuality, number>>;
  /** 1-based position of the current prompt. */
  position: number;
  /** Prompts in the session, including repeats of failed ones. */
  total: number;
  /** The last answer put its card back to come round again this session. */
  putBack: boolean;
  /** The last answer was just undone. */
  undone?: boolean;
  answerScale: AnswerScale;
  busy: boolean;
  error: ErrorText | null;
  /** A grade given, with how long recalling and grading took (StudyCard). */
  onAnswer: (quality: ReviewQuality, times: ResponseTimes) => void;
  /** Take back the session's last answer; absent when there is none to. */
  onUndo?: () => void;
  onExit: () => void;
  /** A cram, which records nothing, and how it starts over; absent for a study session. */
  cram?: { onAgain: () => void };
}) {
  const { t, tx } = useI18n();
  const noticeId = useId();
  const endRef = useRef<HTMLParagraphElement>(null);
  const finished = prompt === null;

  // The grade that ends the session unmounts the card and the focus with
  // it, so the focus goes to the message saying the session is over.
  useLayoutEffect(() => {
    if (finished) endRef.current!.focus();
  }, [finished]);

  // U, Ctrl+Z or Cmd+Z undoes, wherever the focus is on the screen: the
  // card's own keys skip any pressed with Ctrl or Meta. U is the key where
  // U is, too, so it works with an input method on (a Korean one gives
  // "ㅕ"); Z is the letter, where each layout has it.
  function onKeyDown(event: KeyboardEvent) {
    if (onUndo === undefined || busy || event.altKey || inDataRegion(event.target as Element))
      return;
    const key = event.key.toLowerCase();
    const command = event.ctrlKey || event.metaKey;
    if (command ? key !== "z" || event.shiftKey : key !== "u" && event.code !== "KeyU") return;
    event.preventDefault();
    onUndo();
  }

  const endButton = (
    <button class={finished ? "primary" : undefined} onClick={onExit} disabled={busy}>
      {t("study.endSession")}
    </button>
  );
  // A quiet button, as undoing is the exception: most answers stand.
  const undoButton = onUndo !== undefined && (
    <div class="study-undo">
      {/* Only aria-disabled while busy, as the grades are: pressed, it
          keeps the focus if undoing fails. */}
      <button
        onClick={() => {
          if (!busy) onUndo();
        }}
        aria-disabled={busy}
        aria-keyshortcuts="U Control+Z Meta+Z"
      >
        {t("study.undo")}
      </button>
      <p class="hint study-keys">{t("study.keys.undo")}</p>
    </div>
  );

  const progress = t("study.position", { position, total });
  const said = putBack ? t("study.putBack") : undone ? t("study.undone") : null;
  const end =
    cram === undefined
      ? t(total === 0 ? "study.nothingToday" : "study.finished")
      : t(total === 0 ? "cram.nothing" : "cram.finished");
  return (
    <section onKeyDown={onKeyDown}>
      <header>
        <h2>
          {tx(cram === undefined ? "study.heading" : "cram.heading", {
            deck: (
              <a href={deckHref} lang={deckLang}>
                {deckName}
              </a>
            ),
          })}
        </h2>
        {/* At the end it is the next step, under the end message. */}
        {!finished && endButton}
      </header>
      {/* There all along, and said once, as the description of the first
          question, where the focus goes when a cram begins. */}
      {cram !== undefined && (
        <p class="hint" id={noticeId}>
          {t("cram.notice")}
        </p>
      )}
      {/* One status line, mounted for the whole session so screen readers
          hear each change: the position, a card put back and an answer
          undone. It is the only
          place that says the position; the focused question does not. */}
      <p class="hint" role="status">
        {finished ? null : said === null ? progress : `${progress}. ${said}`}
      </p>
      {/* The end is said by taking the focus, outside the status line, so
          it is heard once. */}
      {finished && (
        <>
          <p ref={endRef} tabIndex={-1}>
            {end}
          </p>
          <div class="study-end">
            {endButton}
            {cram !== undefined && total > 0 && (
              <button onClick={cram.onAgain}>{t("cram.again")}</button>
            )}
            {undoButton}
          </div>
        </>
      )}
      {prompt !== null && (
        <StudyCard
          key={position}
          prompt={prompt}
          describedBy={cram !== undefined && position === 1 ? noticeId : undefined}
          intervals={intervals}
          answerScale={answerScale}
          busy={busy}
          onAnswer={onAnswer}
        />
      )}
      {prompt !== null && report !== undefined && report.cardIds.has(prompt.card.id) && (
        <ReportMistake
          place={report.place}
          releaseUrl={report.releaseUrl}
          cardId={prompt.card.id}
        />
      )}
      {!finished && undoButton}
      <ErrorMessage error={error} />
    </section>
  );
}

/**
 * The card being studied: the side asked up, the other side under a
 * Reveal button. Keyed by the caller so the reveal state resets on every
 * new prompt.
 *
 * The focus follows the card, as Reveal and the grade buttons go away
 * once pressed: to the question when a card comes up, and to the answer
 * once revealed, the grades a Tab after it (or after its picture's
 * button, when it has a picture). Neither is named, so a screen reader
 * reads the card's text on taking the focus; the position is said by the
 * status line. The question is described by `describedBy`, when given.
 *
 * While the focus is in the card, Space reveals and a grade's key answers,
 * as a hint under the card says. The keys work only there, so they never
 * catch typing or a screen reader's own keys elsewhere on the page, nor
 * on a link or a code block or table in the card's text (inDataRegion),
 * where Space scrolls or follows as it would anywhere.
 * A grade button is never focused itself, so a repeated key press cannot
 * grade by accident. While an answer saves, the buttons are only
 * aria-disabled, so the one pressed keeps the focus if saving fails.
 *
 * Under each grade is the interval it gives, unless it is unknown:
 * extra text the grade's name leaves out, read as its description.
 *
 * A grade comes with how long the learner took (useStopwatch): to
 * recall, from the card shown to Reveal, and to grade, from Reveal to
 * the grade (to the last grade pressed, when saving failed before).
 */
function StudyCard({
  prompt,
  describedBy,
  intervals,
  answerScale,
  busy,
  onAnswer,
}: {
  prompt: Prompt;
  /** The id of what the question is described by. */
  describedBy: string | undefined;
  intervals: Readonly<Record<ReviewQuality, number>> | undefined;
  answerScale: AnswerScale;
  busy: boolean;
  onAnswer: (quality: ReviewQuality, times: ResponseTimes) => void;
}) {
  const { t } = useI18n();
  const [revealed, setRevealed] = useState(false);
  const stopwatch = useStopwatch();
  const recallMillis = useRef(0);
  const { question, answer } = promptSides(prompt);
  const questionRef = useRef<HTMLDivElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);
  const gradePromptId = useId();
  const intervalId = useId();
  const buttons = answerButtons(answerScale, t);

  function reveal() {
    recallMillis.current = stopwatch.read();
    stopwatch.restart();
    setRevealed(true);
  }

  function grade(quality: ReviewQuality) {
    onAnswer(quality, { recallMillis: recallMillis.current, gradeMillis: stopwatch.read() });
  }

  function onKeyDown(event: KeyboardEvent) {
    if (
      busy ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      inDataRegion(event.target as Element)
    )
      return;
    if (!revealed) {
      // Space on Reveal itself already presses it.
      if (event.key !== " " || (event.target as Element).closest("button")) return;
      event.preventDefault();
      reveal();
      return;
    }
    const pressed = buttons.find((button) => button.key === event.key);
    if (pressed === undefined) return;
    event.preventDefault();
    grade(pressed.quality);
  }

  useLayoutEffect(() => {
    questionRef.current!.focus();
  }, []);
  useLayoutEffect(() => {
    if (revealed) answerRef.current!.focus();
  }, [revealed]);

  return (
    <div class="practice-card" onKeyDown={onKeyDown}>
      <div ref={questionRef} class="study-face" tabIndex={-1} aria-describedby={describedBy}>
        <CardFace {...question} note={revealed ? question.note : undefined} role="question" />
      </div>
      {revealed ? (
        <>
          <div ref={answerRef} class="study-face" tabIndex={-1}>
            <CardFace {...answer} role="answer" />
          </div>
          <p id={gradePromptId} class="grade-prompt">
            {t("study.gradePrompt")}
          </p>
          <div
            role="group"
            aria-labelledby={gradePromptId}
            class={`quality-buttons${answerScale === "minimal" ? " minimal" : ""}`}
          >
            {buttons.map(({ label, quality, key }) => (
              <button
                key={label}
                data-grade={quality}
                aria-keyshortcuts={key}
                aria-label={intervals === undefined ? undefined : label}
                aria-describedby={intervals === undefined ? undefined : `${intervalId}-${quality}`}
                onClick={() => {
                  if (!busy) grade(quality);
                }}
                aria-disabled={busy}
              >
                {label}
                {intervals !== undefined && (
                  <span id={`${intervalId}-${quality}`} class="grade-interval">
                    {t("study.interval", { count: intervals[quality] })}
                  </span>
                )}
              </button>
            ))}
          </div>
          <p class="hint study-keys">
            {t("study.keys.grade", {
              first: buttons[0]!.key,
              last: buttons[buttons.length - 1]!.key,
            })}
          </p>
        </>
      ) : (
        <>
          <button
            onClick={() => {
              if (!busy) reveal();
            }}
            aria-disabled={busy}
            aria-keyshortcuts="Space"
          >
            {t("study.reveal")}
          </button>
          <p class="hint study-keys">{t("study.keys.reveal")}</p>
        </>
      )}
    </div>
  );
}
