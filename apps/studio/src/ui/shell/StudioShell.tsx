import type { ComponentChildren } from "preact";
import { useCallback, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { Instance } from "@solid-memo/domain/instance";
import { useI18n } from "@solid-memo/ui/i18n";
import { MAIN_ID } from "@solid-memo/ui/SkipLink";
import { DraftWaiting, useDraftSaving, type EditorReport } from "../draftEditor";
import { studioRouteToHash, type StudioRoute } from "../router";
import { KeyHelp } from "./KeyHelp";
import { DENSITIES, rememberPrefs, studioPrefs, type StudioPrefs } from "./prefs";
import { nextRegion, sectionRoute, type Section } from "./shortcuts";
import { ScreenKeys, useShortcuts } from "./useShortcuts";
import "../studio.css";

/**
 * The Studio's workspace around its screens: the site header as one
 * row, with a way back to Solid Memo; the main content, which scrolls
 * on its own; and a status bar, with the open instance, whether the
 * open draft is saved, how densely the Studio is laid out, and its keys.
 * Its stylesheet (studio.css) holds only while it is shown, under
 * `data-surface="studio"` on the page's root: Solid Memo shares the page.
 *
 * It listens for the Studio's keys (useShortcuts, docs/studio.md): `?`
 * shows them all (KeyHelp), `/` goes to the screen's filter (the field
 * whose `aria-keyshortcuts` is "/"), F6 and Shift+F6 go from region to
 * region (each a `data-region`), and the `g` chords go to a section
 * (`onGo`). The screens' own keys come first (ScreenKeys).
 */
export function StudioShell({
  banner,
  backHref,
  instance,
  draftUrl,
  onGo,
  children,
}: {
  /** What the site header shows first (the top bar and the masthead). */
  banner?: ComponentChildren;
  /** Solid Memo, at the open instance's decks when there is one. */
  backHref: string;
  instance: Instance | null;
  /** The draft the route names, if it does. */
  draftUrl: string | null;
  /** Goes to a section, as a link would (a `g` chord). */
  onGo: (route: StudioRoute) => void;
  /** The main content. */
  children: ComponentChildren;
}) {
  const { t } = useI18n();
  const [prefs, setPrefs] = useState<StudioPrefs>(() => studioPrefs());
  const waiting = useWaiting();
  const [help, setHelp] = useState(false);
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
        const regions = [...document.querySelectorAll<HTMLElement>("[data-region]")];
        nextRegion(regions, document.activeElement, shortcut === "nextRegion" ? 1 : -1)!.focus();
        return true;
      }
      default: {
        const route = sectionRoute(shortcut.slice("go.".length) as Section, instance?.url ?? null);
        if (route === null) return false;
        // Already there, it adds no Back stop, as a link to the page shown does not.
        if (studioRouteToHash(route) !== window.location.hash) onGo(route);
        return true;
      }
    }
  });

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
        {banner}
        <p class="header-link">
          <a href={backHref}>{t("studio.backToApp")}</a>
        </p>
      </header>
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
