// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * The pieces the statistics are shown with, gathered from `charts/`, a
 * module each: a number in a tile, an activity calendar, bar charts (of
 * what recent days held, of the weekdays, of new cards beside reviews by
 * week, of coming days, or of any figures), histograms of intervals and
 * eases, line charts of cards introduced and of recall by month, bars of
 * the answer buttons pressed and of how mature the cards are, and a line
 * under each chart that says what a day held when it is pointed at (or
 * tapped), with the same days as a table for whoever cannot see the
 * chart. All in one hue: more, a stronger green; where two series meet,
 * a step of the green each, told apart by a dash or a legend too.
 */
export {
  CoverageNote,
  FirstTryTile,
  onlyCourseAnswers,
  PeriodTiles,
  QuizTile,
  RecallTile,
  StatTile,
} from "./charts/StatTiles";
export { DayTable } from "./charts/DayTable";
export { ActivityCalendar, levelOf } from "./charts/ActivityCalendar";
export { BarChart, type Bar, type BarSeries } from "./charts/BarChart";
export { Histogram, SpreadCharts, useBinRanges } from "./charts/Histogram";
export { DayHeldBars } from "./charts/DayHeldBars";
export { WeekdayChart } from "./charts/WeekdayChart";
export { IntakeChart } from "./charts/IntakeChart";
export { ForecastBars } from "./charts/ForecastBars";
export type { LineSeries } from "./charts/LineChart";
export { IntroducedChart } from "./charts/IntroducedChart";
export { RecallChart } from "./charts/RecallChart";
export { GRADE_GROUPS, GradeBars } from "./charts/GradeBars";
export { MaturityBar } from "./charts/MaturityBar";
