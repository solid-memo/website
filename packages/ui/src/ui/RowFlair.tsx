// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useEffect, useRef, useState } from "preact/hooks";

/** What a deck-list row has completed: every card of its deck learned, or the whole of its course. */
export type Completion = "deck" | "course";

/**
 * The large star, near the row's end and cut off by its edge: how wide
 * (`size`, in rem), how far from the row's end (`end`, in rem), its
 * tilt (`tilt`, in degrees) and how far below the row's middle (`down`,
 * in rem).
 */
interface BigStar {
  size: number;
  end: number;
  tilt: number;
  down: number;
}

/**
 * A small star: where it sits along the room the large star leaves
 * (`x`, a share of it), on which line (`edge`: near the top or the
 * bottom), how wide at most (`size`, in rem) and its tilt (`tilt`, in
 * degrees).
 */
interface SmallStar {
  x: number;
  edge: "top" | "bottom";
  size: number;
  tilt: number;
}

interface Layout {
  big: BigStar;
  small: readonly SmallStar[];
  /**
   * How wide a small star may be, as a share of the room the large star
   * leaves: neighbors take turns on the top and bottom lines, and none
   * grows wider than the gap to the next on its line, so no two stars
   * overlap at any row width.
   */
  fit: number;
}

const big = (size: number, end: number, tilt: number, down: number): BigStar => ({
  size,
  end,
  tilt,
  down,
});
const small = (x: number, edge: SmallStar["edge"], size: number, tilt: number): SmallStar => ({
  x,
  edge,
  size,
  tilt,
});

/**
 * A deck whose every card is learned: one large star and five small
 * ones, laid out a little differently from one row to the next, so a
 * list of learned decks is not one pattern over and over.
 */
const DECK_LAYOUTS: readonly Layout[] = [
  {
    big: big(5.5, 4.2, -14, 0.6),
    small: [
      small(0.05, "top", 1.5, -12),
      small(0.27, "bottom", 1.75, 20),
      small(0.47, "top", 1.3, 8),
      small(0.68, "bottom", 1.6, -18),
      small(0.88, "top", 1.4, 14),
    ],
    fit: 0.2,
  },
  {
    big: big(6, 5.4, 10, -0.8),
    small: [
      small(0.08, "bottom", 1.7, 10),
      small(0.28, "top", 1.4, -20),
      small(0.5, "bottom", 1.5, 16),
      small(0.7, "top", 1.75, -6),
      small(0.9, "bottom", 1.3, 22),
    ],
    fit: 0.2,
  },
  {
    big: big(5.2, 3.8, -6, 1),
    small: [
      small(0.04, "top", 1.3, 18),
      small(0.25, "bottom", 1.5, -8),
      small(0.46, "top", 1.75, 12),
      small(0.66, "bottom", 1.35, -22),
      small(0.87, "top", 1.6, 6),
    ],
    fit: 0.2,
  },
  {
    big: big(6.2, 6.2, 18, 0),
    small: [
      small(0.06, "bottom", 1.45, -16),
      small(0.26, "top", 1.7, 12),
      small(0.49, "bottom", 1.35, -4),
      small(0.69, "top", 1.5, 20),
      small(0.9, "bottom", 1.7, -10),
    ],
    fit: 0.2,
  },
];

/** A finished course: a larger star, beside the row's Study button, and seven small ones. */
const COURSE_LAYOUTS: readonly Layout[] = [
  {
    big: big(7, 7.6, -14, 0.6),
    small: [
      small(0.04, "top", 1.5, 10),
      small(0.18, "bottom", 1.75, -16),
      small(0.32, "top", 1.4, 20),
      small(0.46, "bottom", 1.6, -8),
      small(0.6, "top", 1.75, 14),
      small(0.74, "bottom", 1.35, -20),
      small(0.88, "top", 1.6, 6),
    ],
    fit: 0.13,
  },
  {
    big: big(7.6, 9, 10, -0.8),
    small: [
      small(0.05, "bottom", 1.6, -10),
      small(0.19, "top", 1.4, 18),
      small(0.33, "bottom", 1.75, -6),
      small(0.47, "top", 1.5, 22),
      small(0.61, "bottom", 1.4, -14),
      small(0.75, "top", 1.75, 8),
      small(0.89, "bottom", 1.5, -18),
    ],
    fit: 0.13,
  },
  {
    big: big(6.8, 8.2, -6, 1),
    small: [
      small(0.03, "top", 1.75, -20),
      small(0.17, "bottom", 1.4, 12),
      small(0.31, "top", 1.6, -4),
      small(0.45, "bottom", 1.5, 16),
      small(0.59, "top", 1.35, -12),
      small(0.73, "bottom", 1.75, 20),
      small(0.87, "top", 1.45, -8),
    ],
    fit: 0.13,
  },
];

/** How long after the row comes into view the first small star lands, and the time between one and the next, in seconds. */
const FIRST_DELAY = 0.15;
const STEP = 0.08;

/**
 * Whether the element has come into view, which it then stays: at once
 * where the browser cannot tell (no IntersectionObserver).
 */
function useSeen(ref: { current: Element | null }): boolean {
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (seen) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(ref.current!);
    return () => observer.disconnect();
  }, [seen]);
  return seen;
}

/**
 * The decoration of a completed deck-list row, a watermark of stars
 * behind its text and out of the pointer's way: one large star near the
 * row's end, cut off by its edge, and small stars over the rest of the
 * row, none overlapping another. The `variant` picks one of a few
 * layouts, so neighboring rows differ. Hidden until the row comes into
 * view, when the row's gold washes in, the large star lands with a
 * bounce, the small ones bounce in after it from left to right, and a
 * glimmer sweeps across the row (style.css, .row-flair); it then rests,
 * the stars in place. Decoration only: the row says what it completed in
 * words.
 */
export function RowFlair({ completion, variant }: { completion: Completion; variant: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useSeen(ref);
  const layouts = completion === "course" ? COURSE_LAYOUTS : DECK_LAYOUTS;
  const { big: star, small: stars, fit } = layouts[variant % layouts.length]!;
  // The room the large star takes from the row's end, a tilted star's corners included.
  const reserve = star.end + star.size * 1.1;
  return (
    <span
      ref={ref}
      class={seen ? "row-flair seen" : "row-flair"}
      style={`--reserve: ${reserve.toFixed(2)}rem; --fit: ${fit}`}
      aria-hidden="true"
    >
      <span
        class="row-star big"
        style={`--size: ${star.size}rem; --end: ${star.end}rem; --tilt: ${star.tilt}deg; --down: ${star.down}rem; --delay: 0s`}
      />
      {stars.map(({ x, edge, size, tilt }, at) => (
        <span
          key={at}
          class={`row-star ${edge}`}
          style={`--x: ${x}; --size: ${size}rem; --tilt: ${tilt}deg; --delay: ${(FIRST_DELAY + at * STEP).toFixed(2)}s`}
        />
      ))}
    </span>
  );
}
