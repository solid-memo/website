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

/**
 * A field as CSV writes it: quoted when it holds a comma or a quote.
 * Text keeps letters, combining marks, whatever Unicode counts as a
 * number (\p{N}) and printable ASCII other than a space; all else is
 * percent-encoded, a semicolon and "|" too. A spreadsheet starts a new
 * cell at its own list separator, which depends on the system's language
 * (";" or the Arabic semicolon, say), and at a line break, and the quotes
 * a comma calls for don't hold there, as they open mid-cell. Every text
 * column is a URL, a fixed term or a date, so the text stays readable as
 * an address.
 * Text that then starts with "=", "+", "-" or "@" gets a "'" in front, so
 * that a spreadsheet, reading any such separator, has no cell of it that
 * starts as a formula. A number is written as it is: it comes from a
 * numeric field of the answer, never from text, so a negative one (an
 * offset west of UTC) stays a number.
 */
function field(value: string | number | undefined): string {
  if (value === undefined) return "";
  const text =
    typeof value === "number"
      ? String(value)
      : value
          .replace(/\p{Cs}/gu, "\ufffd")
          .replace(/[^!-~\p{L}\p{M}\p{N}]|[;|]/gu, encodeURIComponent)
          .replace(/^[=+@-]/, "'$&");
  return /[",]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
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
