// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * The line under a chart: the day pointed at, or how to point at one.
 * Not a live region: sweeping the pointer over the grid would read out
 * every day crossed, and the table below says the same to everyone.
 */
export function Inspector({ text, prompt }: { text: string | null; prompt: string }) {
  return <p class="chart-inspector hint">{text ?? prompt}</p>;
}
