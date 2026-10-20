// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ComponentChildren } from "preact";
import { useId } from "preact/hooks";
import { useI18n } from "@solid-memo/ui/i18n";
import type { StudioRoute } from "../router";
import type { ActivityEntry } from "./activity";
import { clampSize, DOCK_HEIGHT, scaledPane } from "./splitter";
import { Splitter } from "./Splitter";

/** The dock's tabs, in their order. */
export type DockTab = "problems" | "activity";

export const DOCK_TABS: readonly DockTab[] = ["problems", "activity"];

/**
 * The problems of the deck or the draft shown, as the workspace found
 * them: how many (undefined while they are looked for), where each is
 * fixed (in the order listed: F8 goes from one to the next), and their
 * list, for the dock.
 */
export interface WorkspaceProblems {
  count: number | undefined;
  /** Of a draft: how many problems keep it from being published (none while it is checked, or of a deck). */
  blocking?: number;
  routes: readonly StudioRoute[];
  list: ComponentChildren;
}

/**
 * The dock under the main content (docs/studio.md, Layout), a region
 * of its own: its height set by a splitter above it, and two tabs. Problems
 * lists the problems of the deck or the draft shown (`problems`; a hint
 * elsewhere), each a link to where it is fixed; Activity, what the
 * Studio's screens said was done since the page was opened, the last
 * first, a line said again just after itself counted ("Draft saved
 * ×5"). Its tabs are a tablist: Left and Right go from one to the other.
 */
export function BottomDock({
  id,
  height,
  onHeight,
  tab,
  onTab,
  problems,
  activity,
  onClose,
}: {
  id: string;
  height: number;
  onHeight: (height: number) => void;
  tab: DockTab;
  onTab: (tab: DockTab) => void;
  problems: WorkspaceProblems | null;
  activity: readonly ActivityEntry[];
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const base = useId();
  // Within bounds as large as the text.
  const size = scaledPane(DOCK_HEIGHT);
  const shownHeight = clampSize(height, size);
  const tabId = (each: DockTab) => `${base}-${each}`;
  const panelId = `${base}-panel`;
  const label = (each: DockTab) =>
    each === "problems" && problems?.count !== undefined
      ? t("studio.dock.problemsCount", { count: problems.count })
      : t(`studio.dock.${each}`);

  function step(event: KeyboardEvent) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = DOCK_TABS[(DOCK_TABS.indexOf(tab) + 1) % DOCK_TABS.length]!;
    onTab(next);
    document.getElementById(tabId(next))!.focus();
  }

  return (
    <section
      id={id}
      class="studio-dock"
      aria-label={t("studio.dock.label")}
      data-region
      tabIndex={-1}
      style={{ height: `${shownHeight}px` }}
    >
      <Splitter
        label={t("studio.dock.resize")}
        controls={id}
        orientation="horizontal"
        value={shownHeight}
        size={size}
        onChange={onHeight}
      />
      <div class="studio-dock-bar">
        <div role="tablist" aria-label={t("studio.dock.label")}>
          {DOCK_TABS.map((each) => (
            <button
              key={each}
              id={tabId(each)}
              type="button"
              role="tab"
              aria-selected={each === tab}
              aria-controls={panelId}
              tabIndex={each === tab ? 0 : -1}
              onClick={() => onTab(each)}
              onKeyDown={step}
            >
              {label(each)}
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose}>
          {t("studio.shell.hide")}
        </button>
      </div>
      <div
        id={panelId}
        role="tabpanel"
        class="studio-dock-panel"
        aria-labelledby={tabId(tab)}
        tabIndex={0}
      >
        {tab === "activity" ? (
          activity.length === 0 ? (
            <p class="hint">{t("studio.dock.noActivity")}</p>
          ) : (
            <ol class="studio-activity">
              {activity.map((entry) => (
                <li key={entry.id}>
                  <time dateTime={entry.at.toISOString()}>
                    {entry.at.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
                  </time>{" "}
                  {entry.count === 1
                    ? entry.text
                    : t("studio.dock.repeated", { text: entry.text, count: entry.count })}
                </li>
              ))}
            </ol>
          )
        ) : problems === null ? (
          <p class="hint">{t("studio.dock.noProblemsHere")}</p>
        ) : (
          problems.list
        )}
      </div>
    </section>
  );
}
