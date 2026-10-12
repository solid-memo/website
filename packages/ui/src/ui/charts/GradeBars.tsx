// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { AnswerButtons, GradeGroup } from "@solid-memo/domain/studyPatterns";
import { useI18n } from "../i18n";
import { Inspector } from "./Inspector";
import { usePoint } from "./usePoint";

/** The answer buttons, in order, with the words the study screen gives them. */
export const GRADE_GROUPS = [
  ["again", "study.minimal.again"],
  ["hard", "study.minimal.hard"],
  ["good", "study.minimal.good"],
  ["easy", "study.minimal.easy"],
] as const;

/**
 * The answer buttons pressed (gradeGroupsOf) for first answers and for
 * young and mature reviews: a bar each, its four steps of the green as
 * wide as their shares, Again the lightest; a kind with no answers has
 * an empty bar. Pointing at a step says its share; the table gives every
 * count. Each bar is a tab stop, its steps a Left or Right apart.
 */
export function GradeBars({ buttons }: { buttons: AnswerButtons }) {
  const { t, formatPercent } = useI18n();
  const { pointed, keyed, point, keyDown, hintId } = usePoint<string>();
  const kinds = [
    ["introductions", t("statistics.buttonsFirst")],
    ["young", t("statistics.youngShort")],
    ["mature", t("statistics.matureShort")],
  ] as const;
  const totalOf = (kind: keyof AnswerButtons) =>
    GRADE_GROUPS.reduce((total, [group]) => total + buttons[kind][group], 0);
  const cell = (kind: keyof AnswerButtons, group: GradeGroup) => {
    const count = buttons[kind][group];
    return count === 0
      ? "0"
      : t("statistics.buttonCell", { count, percent: formatPercent(count / totalOf(kind)) });
  };
  const textOf = (key: string) => {
    const [kind, group] = key.split(" ") as [keyof AnswerButtons, GradeGroup];
    const count = buttons[kind][group];
    return t("statistics.buttonDetail", {
      kind: kinds.find(([name]) => name === kind)![1],
      button: t(GRADE_GROUPS.find(([name]) => name === group)![1]),
      percent: formatPercent(count / totalOf(kind)),
      count,
    });
  };
  return (
    <figure class="grade-bars">
      <figcaption>{t("statistics.buttons")}</figcaption>
      <p class="chart-note hint">{t("statistics.buttonsNote")}</p>
      <ul class="maturity-legend hint" aria-hidden="true">
        {GRADE_GROUPS.map(([group, key]) => (
          <li key={group}>
            <span class={`maturity-swatch grade-${group}`} />
            {t(key)}
          </li>
        ))}
      </ul>
      <div class="grade-rows">
        {kinds.map(([kind, name]) => (
          <div key={kind} class="grade-row">
            <span class="grade-kind" aria-hidden="true">
              {name}
            </span>
            <div
              class="grade-bar"
              role="img"
              aria-describedby={hintId}
              aria-label={t("statistics.buttonsLabel", {
                kind: name,
                counts: GRADE_GROUPS.map(([group, key]) =>
                  t("statistics.buttonCount", { button: t(key), count: buttons[kind][group] }),
                ).join(", "),
              })}
              tabIndex={totalOf(kind) > 0 ? 0 : undefined}
              onKeyDown={keyDown(
                GRADE_GROUPS.filter(([group]) => buttons[kind][group] > 0).map(
                  ([group]) => `${kind} ${group}`,
                ),
              )}
            >
              {GRADE_GROUPS.filter(([group]) => buttons[kind][group] > 0).map(([group]) => (
                <span
                  key={group}
                  class={`grade-segment grade-${group}${pointed === `${kind} ${group}` ? " pointed" : ""}`}
                  style={{ flexGrow: buttons[kind][group] }}
                  data-part={`${kind} ${group}`}
                  onPointerEnter={() => point(`${kind} ${group}`)}
                  onClick={() => point(`${kind} ${group}`)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <Inspector
        id={hintId}
        text={pointed === null ? null : textOf(pointed)}
        prompt={t("statistics.pointAtButton")}
        keyed={keyed}
      />
      <details class="chart-table">
        <summary>{t("statistics.showTable")}</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">{t("statistics.answers")}</th>
              {GRADE_GROUPS.map(([group, key]) => (
                <th key={group} scope="col">
                  {t(key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {kinds.map(([kind, name]) => (
              <tr key={kind}>
                <th scope="row">{name}</th>
                {GRADE_GROUPS.map(([group]) => (
                  <td key={group}>{cell(kind, group)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
