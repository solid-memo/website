// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ComponentChildren } from "preact";
import { useId, useRef } from "preact/hooks";
import { useI18n } from "./i18n";
import {
  STATISTICS_RANGES,
  STATISTICS_VIEWS,
  type StatisticsRange,
  type StatisticsView,
} from "./router";

/** The ranges, with the words the picker gives them. */
const RANGE_NAMES = {
  "30d": "statistics.range30d",
  "90d": "statistics.range90d",
  "12m": "statistics.range12m",
  all: "statistics.rangeAll",
} as const;

/** The tabs, with their names. */
const VIEW_NAMES = {
  overview: "statistics.tabOverview",
  activity: "statistics.tabActivity",
  memory: "statistics.tabMemory",
  cards: "statistics.tabCards",
} as const;

/** A change of the statistics' range or tab. */
export interface StatisticsChange {
  range?: StatisticsRange;
  view?: StatisticsView;
}

/**
 * The statistics page, of the instance or of one deck: its heading, the
 * range the figures are of, and its tabs (Overview, Activity, Memory,
 * Cards) over the tab shown, `children`. The tabs are links to their
 * own address (`hrefOf`), so one opens in a new tab as any link does; a
 * plain click, or the arrow keys, Home and End among them, changes the
 * tab in place (`onChange`), as a change of range does.
 */
export function StatisticsScreen({
  range,
  view,
  hrefOf,
  onChange,
  children,
}: {
  range: StatisticsRange;
  view: StatisticsView;
  hrefOf: (change: StatisticsChange) => string;
  onChange: (change: StatisticsChange) => void;
  children: ComponentChildren;
}) {
  const { t } = useI18n();
  const id = useId();
  const tabs = useRef<(HTMLAnchorElement | null)[]>([]);
  const tabId = (one: StatisticsView) => `${id}-tab-${one}`;
  const panelId = `${id}-panel`;
  const keyTargets: Record<string, (at: number) => number> = {
    ArrowRight: (at) => (at + 1) % STATISTICS_VIEWS.length,
    ArrowLeft: (at) => (at + STATISTICS_VIEWS.length - 1) % STATISTICS_VIEWS.length,
    Home: () => 0,
    End: () => STATISTICS_VIEWS.length - 1,
  };
  const onKeyDown = (event: KeyboardEvent) => {
    const target = keyTargets[event.key];
    if (target === undefined) return;
    event.preventDefault();
    const to = target(STATISTICS_VIEWS.indexOf(view));
    tabs.current[to]!.focus();
    onChange({ view: STATISTICS_VIEWS[to]! });
  };
  return (
    <section class="statistics" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>{t("statistics.heading")}</h2>
      <label class="statistics-range">
        {t("statistics.range")}
        <select
          value={range}
          onInput={(event) => onChange({ range: event.currentTarget.value as StatisticsRange })}
        >
          {STATISTICS_RANGES.map((one) => (
            <option key={one} value={one}>
              {t(RANGE_NAMES[one])}
            </option>
          ))}
        </select>
      </label>
      {/* On a phone the tabs scroll in their own strip, not the page. */}
      <div class="statistics-tabs" role="tablist" aria-label={t("statistics.tabs")}>
        {STATISTICS_VIEWS.map((one, index) => (
          <a
            key={one}
            ref={(element) => {
              tabs.current[index] = element;
            }}
            id={tabId(one)}
            role="tab"
            href={hrefOf({ view: one })}
            aria-selected={one === view}
            aria-controls={panelId}
            tabIndex={one === view ? 0 : -1}
            onClick={(event) => {
              // A click to open it elsewhere (a new tab, a window) is the browser's.
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
              event.preventDefault();
              onChange({ view: one });
            }}
            onKeyDown={onKeyDown}
          >
            {t(VIEW_NAMES[one])}
          </a>
        ))}
      </div>
      <div id={panelId} class="statistics-panel" role="tabpanel" aria-labelledby={tabId(view)}>
        {children}
      </div>
    </section>
  );
}
