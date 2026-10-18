// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * The pieces of the statistics' charts that the Studio's deck insight
 * shows too: a number in a tile, a bar chart of any figures, and the
 * histograms of intervals and eases with the ranges they are binned in.
 * The statistics screen imports each from `charts/`, a module each.
 */
export { StatTile } from "./charts/StatTiles";
export { BarChart } from "./charts/BarChart";
export { Histogram, useBinRanges } from "./charts/Histogram";
