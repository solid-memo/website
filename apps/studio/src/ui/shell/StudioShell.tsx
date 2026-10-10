import type { ComponentChildren } from "preact";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { Instance } from "@solid-memo/domain/instance";
import { useI18n } from "@solid-memo/ui/i18n";
import { MAIN_ID } from "@solid-memo/ui/SkipLink";
import { DraftWaiting, useDraftSaving, type EditorReport } from "../draftEditor";
import { studioRouteToHash, type StudioRoute } from "../router";
import { ActivityLog, addActivity, useActivity, type ActivityEntry } from "./activity";
import { BottomDock, type DockTab, type WorkspaceProblems } from "./BottomDock";
import type { Command, ScreenCommand } from "./commandIndex";
import { CommandPalette } from "./CommandPalette";
import { HiddenColumns } from "./DataTable";
import { KeyHelp, Keys } from "./KeyHelp";
import { DENSITIES, rememberPrefs, studioPrefs, type StudioPrefs } from "./prefs";
import { keysOf, nextRegion, sectionRoute, type Section } from "./shortcuts";
import { ASIDE_WIDTH, DETAIL_WIDTH } from "./splitter";
import { Splitter } from "./Splitter";
import { ScreenCommands, useCommandRegistry } from "./useScreenCommands";
import { useMedia } from "./useMedia";
import { ScreenKeys, useShortcuts } from "./useShortcuts";
import { MEDIUM, NARROW, stepProblem, stepTab, type ContextTab } from "./workspaceLayout";
import "../studio.css";

const SIDEBAR_ID = "studio-sidebar";
const ASIDE_ID = "studio-aside";
const DOCK_ID = "studio-dock";

/** What the aside shows on the route: its name (the region's), and its content. */
export interface AsidePane {
  label: string;
  content: ComponentChildren;
  /**
   * The aside is the detail of the main content (a card beside its
   * deck's cards): shown while the route has it, as wide as its own
   * splitter makes it, and closed by going to the main content alone
   * (`onClose`, as the palette's command `closeLabel` does).
   */
  detail?: { closeLabel: string; onClose: () => void };
}

/**
 * The Studio's workspace around its screens: the site header, with a
 * button that shows or hides the sidebar, the open instance (`switcher`),
 * a button that opens the palette (CommandPalette) and a way back to
 * Solid Memo; the sidebar (`sidebar`, a `nav`), when an instance is
 * open; the main content, which scrolls on its own; the aside right of
 * it (`aside`: a course draft's outline, or a card beside its deck's
 * cards), as wide as its splitter makes it; the dock under them
 * (BottomDock), with the problems of the deck or draft shown
 * (`problems`) and the activity the screens tell of
 * (ActivityLog); and a status bar, with the open instance, whether the
 * open draft is saved, its problems, the dock's button, how densely the
 * Studio is laid out, and its keys. The device keeps the columns the
 * screens' tables hide (DataTable's HiddenColumns) with the rest of the
 * layout (prefs.ts). Its stylesheet (studio.css)
 * holds only while it is shown, under `data-surface="studio"` on the
 * page's root: Solid Memo shares the page.
 *
 * The sidebar is shown beside the main content until the user hides it,
 * which the device remembers (prefs.ts), as it remembers the aside's
 * and the dock's. On a narrow screen (NARROW) the sidebar is a drawer
 * over the page instead, closed until asked for, and closed again once
 * a link in it is followed, on a press outside it, on Escape, or by its
 * Close; so is the aside, at the page's right, on a screen not wide
 * (MEDIUM).
 *
 * It listens for the Studio's keys (useShortcuts, docs/studio.md):
 * Ctrl+K (or Cmd+K) opens the palette, with the screen's own commands
 * (useScreenCommands) and the shell's, `?` shows every key (KeyHelp),
 * `/` goes to the screen's filter (the field whose `aria-keyshortcuts`
 * is "/"), F6 and Shift+F6 go from region to region (each a
 * `data-region` shown), the `g` chords go to a section (`onGo`), Ctrl+B
 * shows or hides the sidebar, Ctrl+\ the aside (or closes the detail)
 * and Ctrl+J the dock, F8 and Shift+F8 go to the next problem's field
 * or the one before
 * (stepProblem), and `[`, `]` and 1 to 9 go to another of the context
 * tabs (`tabs`). The screens' own keys come first (ScreenKeys).
 */
export function StudioShell({
  banner,
  backHref,
  route,
  instances,
  instance,
  switcher,
  sidebar,
  tabs,
  draftUrl,
  aside,
  problems,
  onGo,
  children,
}: {
  /** What the site header shows first (the top bar and the masthead). */
  banner?: ComponentChildren;
  /** Solid Memo, at the open instance's decks when there is one. */
  backHref: string;
  /** The route shown; null while it is worked out. */
  route: StudioRoute | null;
  /** The user's instances, as read so far. */
  instances: readonly Instance[];
  instance: Instance | null;
  /** The open instance, to switch to another (InstanceSwitcher). */
  switcher?: ComponentChildren;
  /** What the sidebar holds (StudioSidebar); null for none, as on the instances. */
  sidebar: ComponentChildren | null;
  /** The context tabs of the deck or draft shown, to go between from the keyboard. */
  tabs: readonly ContextTab[];
  /** The draft the route names, if it does. */
  draftUrl: string | null;
  /** What the aside shows on the route; null for none. */
  aside: AsidePane | null;
  /** The problems of the deck or draft shown; null off their screens. */
  problems: WorkspaceProblems | null;
  /** Goes to a section or a tab, as a link would (a `g` chord, `]`). */
  onGo: (route: StudioRoute) => void;
  /** The main content. */
  children: ComponentChildren;
}) {
  const { t } = useI18n();
  const [prefs, setPrefs] = useState<StudioPrefs>(() => studioPrefs());
  const waiting = useWaiting();
  const [help, setHelp] = useState(false);
  const [palette, setPalette] = useState(false);
  // What the palette chose to do, done once it has closed and given the focus back.
  const [chosen, setChosen] = useState<(() => void) | null>(null);
  const screenCommands = useCommandRegistry();
  const narrow = useMedia(NARROW);
  const medium = useMedia(MEDIUM);
  const [drawer, setDrawer] = useState(false);
  const shown = sidebar !== null && (narrow ? drawer : prefs.sidebar);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const [asideDrawer, setAsideDrawer] = useState(false);
  const detail = aside?.detail;
  // A detail is as wide as its own splitter makes it.
  const width = detail === undefined ? ({ key: "asideWidth", size: ASIDE_WIDTH } as const) : ({ key: "detailWidth", size: DETAIL_WIDTH } as const);
  const asideShown = aside !== null && (detail !== undefined || (medium ? asideDrawer : prefs.aside));
  const asideToggleRef = useRef<HTMLButtonElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  // The dock is the open instance's, as the sidebar is.
  const docked = sidebar !== null;
  const [dockTab, setDockTab] = useState<DockTab>("problems");
  const activity = useActivityEntries();
  // The problem F8 went to last, by its place in the list.
  const lastProblem = useRef<number | null>(null);

  /** Goes where a link would; to the page shown, it adds no Back stop, as such a link does not. */
  function go(route: StudioRoute) {
    if (studioRouteToHash(route) !== window.location.hash) onGo(route);
  }

  function toggleSidebar() {
    if (narrow) setDrawer(!drawer);
    else choose({ ...prefs, sidebar: !prefs.sidebar });
  }

  function toggleAside() {
    if (detail !== undefined) detail.onClose();
    else if (medium) setAsideDrawer(!asideDrawer);
    else choose({ ...prefs, aside: !prefs.aside });
  }

  /** Hides the aside from its own button: the focus goes to the header's, which shows it again. */
  function hideAside() {
    toggleAside();
    asideToggleRef.current!.focus();
  }

  function toggleDock() {
    choose({ ...prefs, dock: !prefs.dock });
  }

  /** Shows the dock at its problems, as the status bar's count does. */
  function showProblems() {
    setDockTab("problems");
    if (!prefs.dock) choose({ ...prefs, dock: true });
  }

  /** Goes to the field of the next problem (`step` 1) or the one before (-1), as a link does. */
  function goToProblem(step: 1 | -1): boolean {
    const routes = problems?.routes ?? [];
    const at = stepProblem(routes.map(studioRouteToHash), window.location.hash, lastProblem.current, step);
    if (at === null) return false;
    lastProblem.current = at;
    go(routes[at]!);
    return true;
  }

  /** The shell's own commands in the palette, beside the screen's. */
  const shellCommands = (): ScreenCommand[] => [
    { id: "help", label: t("studio.palette.help"), keys: keysOf("help"), run: () => setHelp(true) },
    ...(sidebar === null ? [] : [{ id: "toggleSidebar", label: t("studio.keys.toggleSidebar"), keys: keysOf("toggleSidebar"), run: toggleSidebar }]),
    ...(aside === null
      ? []
      : [{ id: "toggleAside", label: detail?.closeLabel ?? t("studio.keys.toggleAside"), keys: keysOf("toggleAside"), run: toggleAside }]),
    ...(docked ? [{ id: "toggleDock", label: t("studio.keys.toggleDock"), keys: keysOf("toggleDock"), run: toggleDock }] : []),
  ];

  function chooseCommand(command: Command) {
    setPalette(false);
    if ("route" in command) go(command.route);
    else setChosen(() => command.run);
  }

  useEffect(() => {
    if (chosen === null) return;
    setChosen(null);
    chosen();
  }, [chosen]);

  const register = useShortcuts((shortcut) => {
    switch (shortcut) {
      case "palette":
        setPalette(true);
        return true;
      case "help":
        setHelp(true);
        return true;
      case "filter": {
        const filter = document.querySelector<HTMLElement>('main [aria-keyshortcuts="/"]');
        if (filter === null) return false;
        filter.focus();
        return true;
      }
      case "nextRegion":
      case "previousRegion": {
        const regions = [...document.querySelectorAll<HTMLElement>("[data-region]:not([hidden])")];
        nextRegion(regions, document.activeElement, shortcut === "nextRegion" ? 1 : -1)!.focus();
        return true;
      }
      case "toggleSidebar":
        if (sidebar === null) return false;
        toggleSidebar();
        return true;
      case "toggleAside":
        if (aside === null) return false;
        toggleAside();
        return true;
      case "toggleDock":
        if (!docked) return false;
        toggleDock();
        return true;
      case "nextProblem":
      case "previousProblem":
        return goToProblem(shortcut === "nextProblem" ? 1 : -1);
      case "previousTab":
      case "nextTab": {
        const tab = stepTab(tabs, shortcut === "nextTab" ? 1 : -1);
        if (tab === undefined) return false;
        go(tab.route);
        return true;
      }
      default: {
        if (shortcut.startsWith("tab.")) {
          const tab = tabs[Number(shortcut.slice("tab.".length)) - 1];
          if (tab === undefined) return false;
          go(tab.route);
          return true;
        }
        const route = sectionRoute(shortcut.slice("go.".length) as Section, instance?.url ?? null);
        if (route === null) return false;
        go(route);
        return true;
      }
    }
  });

  useDrawer(narrow && shown, sidebarRef, toggleRef, () => setDrawer(false));
  useDrawer(medium && asideShown, asideRef, asideToggleRef, () => setAsideDrawer(false));

  // Before the browser paints, so no frame shows the Studio in Solid Memo's layout, or at the density before.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-surface", "studio");
    return () => {
      root.removeAttribute("data-surface");
      root.removeAttribute("data-density");
    };
  }, []);

  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-density", prefs.density);
  }, [prefs.density]);

  // The aside beside the main content takes a column of the page's grid; as a drawer, it takes none.
  const asideBeside = asideShown && !medium;
  useLayoutEffect(() => {
    document.documentElement.toggleAttribute("data-aside", asideBeside);
    return () => document.documentElement.removeAttribute("data-aside");
  }, [asideBeside]);

  function choose(next: StudioPrefs) {
    setPrefs(next);
    rememberPrefs(next);
  }

  // The columns the screens' tables hide, as the device keeps them.
  const hiddenColumns: HiddenColumns = {
    hidden: (table) => new Set(prefs.hiddenColumns[table]),
    onHidden: (table, hidden) => choose({ ...prefs, hiddenColumns: { ...prefs.hiddenColumns, [table]: [...hidden] } }),
  };

  const dockShown = docked && prefs.dock;
  return (
    <ActivityLog.Provider value={activity.log}>
      <DraftWaiting.Provider value={waiting.report}>
        <header class="site-header" data-region tabIndex={-1}>
          {sidebar !== null && (
            <button
              ref={toggleRef}
              type="button"
              class="icon studio-sidebar-toggle"
              aria-label={t("studio.shell.sidebar")}
              title={t("studio.shell.sidebar")}
              aria-expanded={shown}
              aria-controls={SIDEBAR_ID}
              aria-keyshortcuts="Control+B"
              onClick={toggleSidebar}
            >
              <SidebarIcon />
            </button>
          )}
          {banner}
          {switcher}
          <button type="button" class="studio-search" aria-keyshortcuts="Control+K Meta+K" onClick={() => setPalette(true)}>
            <span>{t("studio.palette.button")}</span>
            <span class="studio-palette-keys" aria-hidden="true">
              <Keys keys="Ctrl+K" />
            </span>
          </button>
          <p class="header-link">
            <a href={backHref}>{t("studio.backToApp")}</a>
          </p>
          {aside !== null && detail === undefined && (
            <button
              ref={asideToggleRef}
              type="button"
              class="icon studio-sidebar-toggle studio-aside-toggle"
              aria-label={aside.label}
              title={aside.label}
              aria-expanded={asideShown}
              aria-controls={ASIDE_ID}
              aria-keyshortcuts={"Control+\\"}
              onClick={toggleAside}
            >
              <SidebarIcon right />
            </button>
          )}
        </header>
        {sidebar !== null && (
          <nav
            ref={sidebarRef}
            id={SIDEBAR_ID}
            class="studio-sidebar"
            aria-label={t("studio.shell.nav")}
            hidden={!shown}
            data-region
            tabIndex={-1}
            // A link followed, or Escape, closes the drawer; beside the page, the sidebar stays.
            onClick={(event) => {
              if (narrow && (event.target as Element).closest("a") !== null) setDrawer(false);
            }}
            onKeyDown={(event) => {
              if (!narrow || event.key !== "Escape") return;
              setDrawer(false);
              toggleRef.current!.focus();
            }}
          >
            {/* The drawer covers the header's button: it has a way to close of its own. */}
            {narrow && (
              <button
                type="button"
                class="studio-drawer-close"
                onClick={() => {
                  setDrawer(false);
                  toggleRef.current!.focus();
                }}
              >
                {t("studio.shell.close")}
              </button>
            )}
            {sidebar}
          </nav>
        )}
        <main id={MAIN_ID} tabIndex={-1} class="workspace" data-region>
          <ScreenKeys.Provider value={register}>
            <ScreenCommands.Provider value={screenCommands.register}>
              <HiddenColumns.Provider value={hiddenColumns}>{children}</HiddenColumns.Provider>
            </ScreenCommands.Provider>
          </ScreenKeys.Provider>
        </main>
        {aside !== null && (
          <aside
            ref={asideRef}
            id={ASIDE_ID}
            class="studio-aside"
            aria-label={aside.label}
            hidden={!asideShown}
            style={medium ? undefined : { width: `${prefs[width.key]}px` }}
            data-region
            tabIndex={-1}
            // As the sidebar's drawer: a link followed, or Escape, closes it.
            onClick={(event) => {
              if (medium && (event.target as Element).closest("a") !== null) setAsideDrawer(false);
            }}
            onKeyDown={(event) => {
              if (medium && event.key === "Escape") hideAside();
            }}
          >
            {!medium && (
              <Splitter
                label={t("studio.shell.resizeAside")}
                controls={ASIDE_ID}
                orientation="vertical"
                value={prefs[width.key]}
                size={width.size}
                onChange={(value) => choose({ ...prefs, [width.key]: value })}
              />
            )}
            <div class="studio-aside-bar">
              <p aria-hidden="true">{aside.label}</p>
              {detail === undefined ? (
                <button type="button" onClick={hideAside}>
                  {t("studio.shell.hide")}
                </button>
              ) : (
                <button type="button" aria-keyshortcuts={"Control+\\"} onClick={detail.onClose}>
                  {t("studio.shell.close")}
                </button>
              )}
            </div>
            <div class="studio-aside-content">{aside.content}</div>
          </aside>
        )}
        {dockShown && (
          <BottomDock
            id={DOCK_ID}
            height={prefs.dockHeight}
            onHeight={(dockHeight) => choose({ ...prefs, dockHeight })}
            tab={dockTab}
            onTab={setDockTab}
            problems={problems}
            activity={activity.entries}
            onClose={() => choose({ ...prefs, dock: false })}
          />
        )}
        <aside class="studio-status-bar" aria-label={t("studio.shell.status")} data-region tabIndex={-1}>
          {instance !== null && <p>{instance.name}</p>}
          {draftUrl !== null && <DraftSaveState draftUrl={draftUrl} reports={waiting.total} />}
          {problems?.count !== undefined && (
            <button
              type="button"
              class={problems.count > 0 ? "studio-problem-count" : undefined}
              aria-controls={dockShown ? DOCK_ID : undefined}
              onClick={showProblems}
            >
              {t("studio.shell.problems", { count: problems.count })}
            </button>
          )}
          {docked && (
            <button
              type="button"
              aria-expanded={dockShown}
              // It controls the dock only while there is one to control.
              aria-controls={dockShown ? DOCK_ID : undefined}
              aria-keyshortcuts="Control+J"
              onClick={toggleDock}
            >
              {t("studio.dock.label")}
            </button>
          )}
          <div class="studio-density" role="group" aria-label={t("studio.shell.density")}>
            {DENSITIES.map((density) => (
              <button
                key={density}
                type="button"
                aria-pressed={prefs.density === density}
                onClick={() => choose({ ...prefs, density })}
              >
                {t(`studio.shell.${density}`)}
              </button>
            ))}
          </div>
          <button type="button" aria-keyshortcuts="?" onClick={() => setHelp(true)}>
            {t("studio.keys.button")}
          </button>
        </aside>
        {help && <KeyHelp onClose={() => setHelp(false)} />}
        {palette && (
          <CommandPalette
            route={route}
            instances={instances}
            tabs={tabs}
            commands={[...screenCommands.commands(), ...shellCommands()]}
            onChoose={chooseCommand}
            onClose={() => setPalette(false)}
          />
        )}
      </DraftWaiting.Provider>
    </ActivityLog.Provider>
  );
}

/** A pane beside the page: the sidebar at its left, or (`right`) the aside at its right. */
function SidebarIcon({ right = false }: { right?: boolean }) {
  return (
    <svg
      class="icon"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d={right ? "M15 4v16" : "M9 4v16"} />
    </svg>
  );
}

/**
 * A pane as a drawer over the page, while it is open: the focus goes
 * into it, and a press outside it and its button (on the page under it,
 * say) closes it. A menu a button in it opened is laid over the page
 * (ActionsMenu), but is the pane's: a press there leaves it open.
 */
function useDrawer(open: boolean, paneRef: { current: HTMLElement | null }, buttonRef: { current: HTMLElement | null }, close: () => void) {
  useEffect(() => {
    if (!open) return;
    paneRef.current!.focus();
    const outside = (event: PointerEvent) => {
      const target = event.target as Element;
      const opener = target.closest('[role="menu"]')?.getAttribute("aria-labelledby");
      const inPane = (node: Node | null) => node !== null && paneRef.current!.contains(node);
      if (!inPane(target) && !inPane(opener ? document.getElementById(opener) : null) && !buttonRef.current!.contains(target)) close();
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [open]);
}

/** The activity the screens tell of (ActivityLog), the last first, a line said again counted (addActivity), and how they tell it. */
function useActivityEntries() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const next = useRef(0);
  // One function for the page's life, as the editors' report is.
  const log = useCallback((text: string) => {
    const id = next.current++;
    setEntries((before) => addActivity(before, text, new Date(), id));
  }, []);
  return { entries, log };
}

/**
 * Whether the open draft's changes are all written. Its screen says so
 * as they are, and why one failed; the activity, each time they are all
 * written, or one failed.
 */
function DraftSaveState({ draftUrl, reports }: { draftUrl: string; reports: EditorReport }) {
  const { t } = useI18n();
  const saving = useDraftSaving(draftUrl, reports);
  useActivity(saving !== "saving" && saving, () => t(`studio.shell.${saving}`));
  return <p>{t(`studio.shell.${saving}`)}</p>;
}

/** What the draft editors report (DraftWaiting), each under its own key, and all of them together. */
function useWaiting() {
  const reports = useRef(new Map<object, EditorReport>());
  const [total, setTotal] = useState<EditorReport>({ waiting: 0, failed: false });
  // One function for the page's life, so the editors are not rendered afresh with each report.
  const report = useCallback((editor: object, report: EditorReport) => {
    if (report.waiting === 0 && !report.failed) reports.current.delete(editor);
    else reports.current.set(editor, report);
    const all = [...reports.current.values()];
    setTotal({ waiting: all.reduce((sum, one) => sum + one.waiting, 0), failed: all.some((one) => one.failed) });
  }, []);
  return { report, total };
}
