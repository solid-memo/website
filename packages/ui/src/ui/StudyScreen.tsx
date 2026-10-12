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
import type { ReviewQuality } from "@solid-memo/domain/review";
import { CardFace } from "./CardFace";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n, type I18n, type ErrorText } from "./i18n";
import { inDataRegion } from "./Markdown";
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

export function StudyScreen({
  deckName,
  deckLang,
  deckHref,
  prompt,
  position,
  total,
  putBack,
  answerScale,
  busy,
  error,
  onAnswer,
  onExit,
}: {
  deckName: string;
  /** The language the deck's name is in, when not the page's (readerLang). */
  deckLang?: string;
  /** URL of the deck's page; its name links there. */
  deckHref: string;
  /** null when the session is finished. */
  prompt: Prompt | null;
  /** 1-based position of the current prompt. */
  position: number;
  /** Prompts in the session, including repeats of failed ones. */
  total: number;
  /** The last answer put its card back to come round again this session. */
  putBack: boolean;
  answerScale: AnswerScale;
  busy: boolean;
  error: ErrorText | null;
  /** A grade given, with how long recalling and grading took (StudyCard). */
  onAnswer: (quality: ReviewQuality, times: ResponseTimes) => void;
  onExit: () => void;
}) {
  const { t, tx } = useI18n();
  const endRef = useRef<HTMLParagraphElement>(null);
  const finished = prompt === null;

  // The grade that ends the session unmounts the card and the focus with
  // it, so the focus goes to the message saying the session is over.
  useLayoutEffect(() => {
    if (finished) endRef.current!.focus();
  }, [finished]);

  const progress = t("study.position", { position, total });
  return (
    <section>
      <header>
        <h2>
          {tx("study.heading", {
            deck: (
              <a href={deckHref} lang={deckLang}>
                {deckName}
              </a>
            ),
          })}
        </h2>
        <button onClick={onExit} disabled={busy}>
          {t("study.endSession")}
        </button>
      </header>
      {/* One status line, mounted for the whole session so screen readers
          hear each change: the position and a card put back. It is the only
          place that says the position; the focused question does not. */}
      <p class="hint" role="status">
        {finished ? null : putBack ? `${progress}. ${t("study.putBack")}` : progress}
      </p>
      {/* The end is said by taking the focus, outside the status line, so
          it is heard once. */}
      {finished && (
        <p ref={endRef} tabIndex={-1}>
          {total === 0 ? t("study.nothingToday") : t("study.finished")}
        </p>
      )}
      {prompt !== null && (
        <StudyCard
          key={position}
          prompt={prompt}
          answerScale={answerScale}
          busy={busy}
          onAnswer={onAnswer}
        />
      )}
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
 * status line.
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
 * A grade comes with how long the learner took (useStopwatch): to
 * recall, from the card shown to Reveal, and to grade, from Reveal to
 * the grade (to the last grade pressed, when saving failed before).
 */
function StudyCard({
  prompt,
  answerScale,
  busy,
  onAnswer,
}: {
  prompt: Prompt;
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
      <div ref={questionRef} class="study-face" tabIndex={-1}>
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
                onClick={() => {
                  if (!busy) grade(quality);
                }}
                aria-disabled={busy}
              >
                {label}
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
