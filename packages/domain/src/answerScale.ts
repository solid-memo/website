// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ReviewQuality } from "./review";

/**
 * How a session asks for the grade: the full SM-2 0–5 scale, or a minimal
 * Again / Hard / Good / Easy set that maps onto it.
 */
export type AnswerScale = "sm2" | "minimal";

export const ANSWER_SCALES: readonly AnswerScale[] = ["sm2", "minimal"];

export function isAnswerScale(value: unknown): value is AnswerScale {
  return ANSWER_SCALES.includes(value as AnswerScale);
}

export type MinimalAnswer = "again" | "hard" | "good" | "easy";

/**
 * The SM-2 quality each minimal answer records. Again covers 0–1 and Hard
 * 2–3 in spirit, but SM-2 needs one value: Again records 1 (0 and 1
 * schedule identically), and Hard records 3 — the lowest *passing* grade.
 * Recording 2 would make Hard a lapse, indistinguishable from Again.
 */
export const MINIMAL_ANSWER_QUALITY: Readonly<Record<MinimalAnswer, ReviewQuality>> = {
  again: 1,
  hard: 3,
  good: 4,
  easy: 5,
};

export const MINIMAL_ANSWERS: readonly MinimalAnswer[] = ["again", "hard", "good", "easy"];

export const SM2_QUALITIES: readonly ReviewQuality[] = [0, 1, 2, 3, 4, 5];
