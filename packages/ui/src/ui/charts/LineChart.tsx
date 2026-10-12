// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ComponentChildren } from "preact";
import { Inspector } from "./Inspector";
import { usePoint } from "./usePoint";

/** One line of a LineChart: a value a point, null where it has none (a gap in the line). */
export interface LineSeries {
  /** Names the series in the legend's words and, as `line-<name>`, in the styles (its tint and dash). */
  name: string;
  label: string;
  values: readonly (number | null)[];
}

/**
 * One or two lines over evenly spaced points, on one scale from 0 up to
 * `max`. Pointing at a point puts a guide through
 * it and a dot on each line there, and says what it holds; a point of a
 * line with no neighbor is drawn as a dot of its own. With two lines a
 * legend names them, each by its own stroke. The plot is one tab stop;
 * Left and Right step along the points.
 */
export function LineChart({
  name,
  caption,
  label,
  note,
  keys,
  series,
  max,
  formatValue,
  formatKey,
  textAt,
  prompt,
  table,
}: {
  name: string;
  caption: string;
  label: string;
  note: string;
  keys: readonly string[];
  series: readonly LineSeries[];
  /** The scale's top, above 0. */
  max: number;
  formatValue: (value: number) => string;
  formatKey: (key: string) => string;
  textAt: (index: number) => string;
  prompt: string;
  table: ComponentChildren;
}) {
  const { pointed, keyed, point, keyDown, hintId } = usePoint<string>();
  // Kept by key, so a change of the points (a shorter range) cannot leave it past their end.
  const pointedAt = pointed === null ? -1 : keys.indexOf(pointed);
  const width = 300;
  const height = 100;
  const step = keys.length === 1 ? width : width / (keys.length - 1);
  const xOf = (i: number) => (keys.length === 1 ? width / 2 : i * step);
  const yOf = (value: number) => height - 2 - (value / max) * (height - 4);
  const at = (i: number, value: number) => `${xOf(i)},${yOf(value)}`;
  // The runs of points with a value: a line each, or a dot when one long.
  const runsOf = (values: readonly (number | null)[]) =>
    values
      .reduce<number[][]>((runs, value, i) => {
        if (value === null) return runs;
        if (i > 0 && values[i - 1] !== null) runs.at(-1)!.push(i);
        else runs.push([i]);
        return runs;
      }, [])
      .map((run) =>
        run.length === 1
          ? `M${at(run[0]!, values[run[0]!]!)}h0`
          : `M${run.map((i) => at(i, values[i]!)).join("L")}`,
      );
  return (
    <figure class={`line-chart ${name}`}>
      <figcaption>{caption}</figcaption>
      <p class="chart-note hint">{note}</p>
      {series.length > 1 && (
        <ul class="line-legend hint">
          {series.map((line) => (
            <li key={line.name}>
              <svg class="line-key" viewBox="0 0 24 8" aria-hidden="true">
                <line class={`line line-${line.name}`} x1="1" x2="23" y1="4" y2="4" />
              </svg>
              {line.label}
            </li>
          ))}
        </ul>
      )}
      <div class="line-plot">
        <span class="line-axis hint" aria-hidden="true">
          <span>{formatValue(max)}</span>
          <span>{formatValue(0)}</span>
        </span>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          role="img"
          aria-describedby={hintId}
          aria-label={label}
          tabindex={0}
          onKeyDown={keyDown(keys)}
        >
          <line class="gridline" x1="0" x2={width} y1={yOf(max)} y2={yOf(max)} />
          <line class="baseline" x1="0" x2={width} y1={yOf(0)} y2={yOf(0)} />
          {pointedAt !== -1 && (
            <line class="crosshair" x1={xOf(pointedAt)} x2={xOf(pointedAt)} y1="0" y2={height} />
          )}
          {series.map((line) =>
            runsOf(line.values).map((d) => (
              <path
                key={`${line.name} ${d}`}
                class={`line line-${line.name}${d.endsWith("h0") ? " lone" : ""}`}
                d={d}
              />
            )),
          )}
          {pointedAt !== -1 &&
            series.map((line) => {
              const value = line.values[pointedAt]!;
              return value === null ? null : (
                <path
                  key={line.name}
                  class={`line-point line-${line.name}`}
                  d={`M${at(pointedAt, value)}h0`}
                />
              );
            })}
          {keys.map((key, i) => (
            <rect
              key={key}
              class="bar-hit"
              data-point={key}
              x={xOf(i) - step / 2}
              y="0"
              width={step}
              height={height}
              onPointerEnter={() => point(key)}
              onClick={() => point(key)}
            />
          ))}
        </svg>
        <span class="line-keys hint" aria-hidden="true">
          <span>{formatKey(keys[0]!)}</span>
          {keys.length > 1 && <span>{formatKey(keys.at(-1)!)}</span>}
        </span>
      </div>
      <Inspector
        id={hintId}
        text={pointedAt === -1 ? null : textAt(pointedAt)}
        prompt={prompt}
        keyed={keyed}
      />
      {table}
    </figure>
  );
}
