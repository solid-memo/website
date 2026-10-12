// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * The line under a chart: the day pointed at, or how to point at one.
 * Not a live region: sweeping the pointer over the grid would read out
 * every day crossed, and the table below says the same to everyone. A
 * point reached by the keyboard (`keyed`) is said once more in a status
 * line no one sees, so a screen reader reads each step out. The chart
 * names the line (`id`) as its description, so its prompt says how to
 * step through it.
 */
export function Inspector({
  id,
  text,
  prompt,
  keyed,
}: {
  id: string;
  text: string | null;
  prompt: string;
  keyed: boolean;
}) {
  return (
    <>
      <p id={id} class="chart-inspector hint">
        {text ?? prompt}
      </p>
      <p class="visually-hidden" role="status">
        {keyed ? text : null}
      </p>
    </>
  );
}
