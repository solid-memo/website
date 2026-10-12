// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Answer } from "./answer";

/**
 * The answer log as a CSV file (RFC 4180), for the learner to keep or
 * open in a spreadsheet: a row an answer, oldest first, with what the log
 * holds of it. The column names are the log's own terms, in English
 * whatever the page's language, so a file reads the same anywhere. Pure.
 */

/** The columns, in order. */
export const ANSWER_CSV_COLUMNS = [
  "answered_at",
  "study_day",
  "deck",
  "card",
  "direction",
  "grade",
  "mode",
  "prior_interval_days",
  "next_interval_days",
  "chosen_distractor",
  "recall_millis",
  "grade_millis",
  "prior_due",
  "utc_offset_minutes",
] as const;

/** A field as CSV writes it: quoted when it holds a comma, a quote or a line break. */
function field(value: string | number | undefined): string {
  const text = value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** The answers given, oldest first (by time, then id), as CSV with a header row; lines end in CRLF. */
export function answersCsv(answers: readonly Answer[]): string {
  const rows = [...answers]
    .sort((a, b) => a.answeredAt.localeCompare(b.answeredAt) || a.id.localeCompare(b.id))
    .map((answer) =>
      [
        answer.answeredAt,
        answer.studyDay,
        answer.deckUrl,
        answer.cardUrl,
        answer.direction,
        answer.grade,
        answer.mode ?? "recall",
        answer.priorIntervalDays,
        answer.nextIntervalDays,
        answer.chosenDistractor,
        answer.recallMillis,
        answer.gradeMillis,
        answer.priorDue,
        answer.utcOffsetMinutes,
      ]
        .map(field)
        .join(","),
    );
  return [ANSWER_CSV_COLUMNS.join(","), ...rows].map((row) => `${row}\r\n`).join("");
}
