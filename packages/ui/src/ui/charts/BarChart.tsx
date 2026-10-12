// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ComponentChildren } from "preact";
import { Inspector } from "./Inspector";
import { usePoint } from "./usePoint";

/** One bar of a BarChart: its key, its figures (one a series), and what it holds, in words. */
export interface Bar {
  key: string;
  values: readonly number[];
  text: string;
}

/** A series of a BarChart with more than one: its words in the legend, and its step of the green, 1 lightest to 4. */
export interface BarSeries {
  label: string;
  step: 1 | 2 | 3 | 4;
}

/**
 * Figures as bars on one baseline, scaled to the largest, then the line
 * that says what a bar holds when it is pointed at (or tapped), or how
 * to point at one (`prompt`), then `children`: the same figures as a
 * table, for whoever cannot see the chart. A bar of several series
 * stacks them, the first at the bottom, or (`grouped`) stands them side
 * by side; a legend then names them. `ticks`, when given, name the bars
 * under them. The bars are one tab stop; Left and Right step along them.
 */
export function BarChart({
  caption,
  label,
  bars,
  series = [],
  grouped = false,
  ticks,
  prompt,
  children,
}: {
  caption: string;
  /** The chart's text alternative. */
  label: string;
  bars: readonly Bar[];
  series?: readonly BarSeries[];
  grouped?: boolean;
  ticks?: readonly string[];
  prompt: string;
  children: ComponentChildren;
}) {
  const { pointed, keyed, point, keyDown, hintId } = usePoint<string>();
  const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
  const most = Math.max(
    1,
    ...bars.map(({ values }) => (grouped ? Math.max(...values) : sum(values))),
  );
  const width = 8;
  const gap = 2;
  const height = 64;
  const count = bars.length;
  const scaled = (value: number) => (value === 0 ? 0 : Math.max(2, (value / most) * (height - 4)));
  // Each figure's rectangle in a bar: side by side, or stacked, the bar as tall as its total.
  const partsOf = (values: readonly number[], x: number) => {
    if (grouped) {
      const part = (width - (values.length - 1)) / values.length;
      return values.map((value, j) => ({
        x: x + j * (part + 1),
        width: part,
        y: height - scaled(value),
        height: scaled(value),
      }));
    }
    const total = sum(values);
    const tall = scaled(total);
    let top = height;
    return values.map((value) => {
      const part = total === 0 ? 0 : (value / total) * tall;
      top -= part;
      // A unit of the surface between a part and the one above it.
      const gapAbove = top - (height - tall) > 0.01 ? 1 : 0;
      return { x, width, y: top + gapAbove, height: Math.max(0, part - gapAbove) };
    });
  };
  return (
    <figure class="bar-chart">
      <figcaption>{caption}</figcaption>
      {series.length > 1 && (
        <ul class="bar-legend hint">
          {series.map((one) => (
            <li key={one.label}>
              <span class={`bar-swatch bar-step-${one.step}`} />
              {one.label}
            </li>
          ))}
        </ul>
      )}
      <svg
        viewBox={`0 0 ${count * (width + gap)} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-describedby={hintId}
        aria-label={label}
        tabindex={0}
        onKeyDown={keyDown(bars.map(({ key }) => key))}
      >
        <line
          class="baseline"
          x1="0"
          x2={count * (width + gap)}
          y1={height - 0.5}
          y2={height - 0.5}
        />
        {bars.map(({ key, values }, i) => (
          <g key={key} data-bar={key} onPointerEnter={() => point(key)} onClick={() => point(key)}>
            <rect class="bar-hit" x={i * (width + gap)} y="0" width={width + gap} height={height} />
            {partsOf(values, i * (width + gap)).map(
              (part, j) =>
                part.height > 0 && (
                  <rect
                    key={j}
                    class={`bar${series.length > 1 ? ` bar-step-${series[j]!.step}` : ""}${key === pointed ? " pointed" : ""}`}
                    x={part.x}
                    y={part.y}
                    width={part.width}
                    height={part.height}
                    rx={series.length > 1 && !grouped ? 0 : 2}
                  />
                ),
            )}
          </g>
        ))}
      </svg>
      {ticks !== undefined && (
        <span class="bar-ticks hint" aria-hidden="true">
          {ticks.map((tick, i) => (
            <span key={i}>{tick}</span>
          ))}
        </span>
      )}
      <Inspector
        id={hintId}
        text={bars.find((bar) => bar.key === pointed)?.text ?? null}
        prompt={prompt}
        keyed={keyed}
      />
      {children}
    </figure>
  );
}
