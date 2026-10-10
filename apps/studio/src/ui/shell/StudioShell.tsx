import type { ComponentChildren } from "preact";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { Instance } from "@solid-memo/domain/instance";
import { useI18n } from "@solid-memo/ui/i18n";
import { MAIN_ID } from "@solid-memo/ui/SkipLink";
import { DraftWaiting, useDraftSaving, type EditorReport } from "../draftEditor";
import { studioRouteToHash, type StudioRoute } from "../router";
import { KeyHelp } from "./KeyHelp";
import { DENSITIES, rememberPrefs, studioPrefs, type StudioPrefs } from "./prefs";
import { nextRegion, sectionRoute, type Section } from "./shortcuts";
import { ScreenKeys, useShortcuts } from "./useShortcuts";
import { NARROW, stepTab, type ContextTab } from "./workspaceLayout";
import "../studio.css";

const SIDEBAR_ID = "studio-sidebar";

/**
 * The Studio's workspace around its screens: the site header, with a
 * button that shows or hides the sidebar, the open instance (`switcher`)
 * and a way back to Solid Memo; the sidebar (`sidebar`, a `nav`), when
 * an instance is open; the main content, which scrolls on its own; and a
 * status bar, with the open instance, whether the open draft is saved,
 * how densely the Studio is laid out, and its keys. Its stylesheet
 * (studio.css) holds only while it is shown, under
 * `data-surface="studio"` on the page's root: Solid Memo shares the page.
 *
 * The sidebar is shown beside the main content until the user hides it,
 * which the device remembers (prefs.ts). On a narrow screen (NARROW) it
 * is a drawer over the page instead, closed until asked for, and closed
 * again once a link in it is followed, on a press outside it, or on
 * Escape.
 *
 * It listens for the Studio's keys (useShortcuts, docs/studio.md): `?`
 * shows them all (KeyHelp), `/` goes to the screen's filter (the field
 * whose `aria-keyshortcuts` is "/"), F6 and Shift+F6 go from region to
 * region (each a `data-region` shown), the `g` chords go to a section
 * (`onGo`), Ctrl+B shows or hides the sidebar, and `[`, `]` and 1 to 9
 * go to another of the context tabs (`tabs`). The screens' own keys come
 * first (ScreenKeys).
 */
export function StudioShell({
  banner,
  backHref,
  instance,
  switcher,
  sidebar,
  tabs,
  draftUrl,
  onGo,
  children,
}: {
  /** What the site header shows first (the top bar and the masthead). */
  banner?: ComponentChildren;
  /** Solid Memo, at the open instance's decks when there is one. */
  backHref: string;
  instance: Instance | null;
  /** The open instance, to switch to another (InstanceSwitcher). */
  switcher?: ComponentChildren;
  /** What the sidebar holds (StudioSidebar); null for none, as on the instances. */
  sidebar: ComponentChildren | null;
  /** The context tabs of the deck or draft shown, to go between from the keyboard. */
  tabs: readonly ContextTab[];
  /** The draft the route names, if it does. */
  draftUrl: string | null;
  /** Goes to a section or a tab, as a link would (a `g` chord, `]`). */
  onGo: (route: StudioRoute) => void;
  /** The main content. */
  children: ComponentChildren;
}) {
  const { t } = useI18n();
  const [prefs, setPrefs] = useState<StudioPrefs>(() => studioPrefs());
  const waiting = useWaiting();
  const [help, setHelp] = useState(false);
  const narrow = useNarrow();
  const [drawer, setDrawer] = useState(false);
  const shown = sidebar !== null && (narrow ? drawer : prefs.sidebar);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  /** Goes where a link would; to the page shown, it adds no Back stop, as such a link does not. */
  function go(route: StudioRoute) {
    if (studioRouteToHash(route) !== window.location.hash) onGo(route);
  }

  function toggleSidebar() {
    if (narrow) setDrawer(!drawer);
    else choose({ ...prefs, sidebar: !prefs.sidebar });
  }

  const register = useShortcuts((shortcut) => {
    switch (shortcut) {
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

  // The drawer opened, the focus goes into it; a press outside it (on the page under it, say) closes it.
  const drawerOpen = narrow && shown;
  useEffect(() => {
    if (!drawerOpen) return;
    sidebarRef.current!.focus();
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!sidebarRef.current!.contains(target) && !toggleRef.current!.contains(target)) setDrawer(false);
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [drawerOpen]);

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

  function choose(next: StudioPrefs) {
    setPrefs(next);
    rememberPrefs(next);
  }

  return (
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
        <p class="header-link">
          <a href={backHref}>{t("studio.backToApp")}</a>
        </p>
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
          {sidebar}
        </nav>
      )}
      <main id={MAIN_ID} tabIndex={-1} class="workspace" data-region>
        <ScreenKeys.Provider value={register}>{children}</ScreenKeys.Provider>
      </main>
      <aside class="studio-status-bar" aria-label={t("studio.shell.status")} data-region tabIndex={-1}>
        {instance !== null && <p>{instance.name}</p>}
        {draftUrl !== null && <DraftSaveState draftUrl={draftUrl} reports={waiting.total} />}
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
    </DraftWaiting.Provider>
  );
}

/** Three bars, the left one apart: the sidebar beside the page. */
function SidebarIcon() {
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
      <path d="M9 4v16" />
    </svg>
  );
}

/** Whether the screen is narrow (NARROW), as it changes. */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW).matches);
  useEffect(() => {
    const media = window.matchMedia(NARROW);
    const change = () => setNarrow(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  return narrow;
}

/** Whether the open draft's changes are all written. Its screen says so as they are, and why one failed. */
function DraftSaveState({ draftUrl, reports }: { draftUrl: string; reports: EditorReport }) {
  const { t } = useI18n();
  return <p>{t(`studio.shell.${useDraftSaving(draftUrl, reports)}`)}</p>;
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
