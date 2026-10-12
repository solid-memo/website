// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useId, useState } from "preact/hooks";

/** How far a key moves along a chart's points, or null for a key that does not move. */
function stepOf(key: string, across: number): number | null {
  switch (key) {
    case "ArrowRight":
      return across;
    case "ArrowLeft":
      return -across;
    case "ArrowDown":
      return across > 1 ? 1 : null;
    case "ArrowUp":
      return across > 1 ? -1 : null;
    default:
      return null;
  }
}

/**
 * The point of a chart pointed at, by pointer, tap or keyboard. The
 * chart (one tab stop) takes `keyDown`: Left and Right step `across`
 * points, so a calendar with a week a column steps a week, while Up and
 * Down step a single point, but only when `across` is above 1; Home and
 * End go to the first and the last point, and Escape lets go. With
 * nothing pointed, Left, Up and End start at the last point and the
 * other keys at the first; a step past either end stays put. `keyed`
 * says the keyboard pointed last, so only then is the point read out:
 * sweeping the pointer stays quiet. A key pressed with Alt, Control
 * or Meta is left to the browser (Alt+Left goes back a page), and a
 * pointed value no longer among `points` counts as nothing pointed.
 * `hintId` names the line under the chart, which the chart gives as its
 * description, so a screen reader says the keys work on reaching it.
 */
export function usePoint<T>() {
  const [pointed, setPointed] = useState<T | null>(null);
  const [keyed, setKeyed] = useState(false);
  const hintId = useId();
  const point = (at: T) => {
    setPointed(at);
    setKeyed(false);
  };
  const keyDown =
    (points: readonly T[], across = 1) =>
    (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "Escape" && pointed !== null) {
        event.preventDefault();
        setPointed(null);
        setKeyed(false);
        return;
      }
      const at = pointed === null ? -1 : points.indexOf(pointed);
      const last = points.length - 1;
      const step = stepOf(event.key, across);
      let next: number;
      if (event.key === "Home") next = 0;
      else if (event.key === "End") next = last;
      else if (step === null) return;
      else if (at === -1) next = step < 0 ? last : 0;
      else next = at + step < 0 || at + step > last ? at : at + step;
      event.preventDefault();
      setPointed(points[next]!);
      setKeyed(true);
    };
  return { pointed, keyed, point, keyDown, hintId };
}
