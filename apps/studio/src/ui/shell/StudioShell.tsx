import type { ComponentChildren } from "preact";
import { useCallback, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { Instance } from "@solid-memo/domain/instance";
import { useI18n } from "@solid-memo/ui/i18n";
import { MAIN_ID } from "@solid-memo/ui/SkipLink";
import { DraftWaiting, useDraftSaving, type EditorReport } from "../draftEditor";
import { DENSITIES, rememberPrefs, studioPrefs, type StudioPrefs } from "./prefs";
import "../studio.css";

/**
 * The Studio's workspace around its screens: the site header as one
 * row, with a way back to Solid Memo; the main content, which scrolls
 * on its own; and a status bar, with the open instance, whether the
 * open draft is saved, and how densely the Studio is laid out. Its
 * stylesheet (studio.css) holds only while it is shown, under
 * `data-surface="studio"` on the page's root: Solid Memo shares the page.
 */
export function StudioShell({
  banner,
  backHref,
  instance,
  draftUrl,
  children,
}: {
  /** What the site header shows first (the top bar and the masthead). */
  banner?: ComponentChildren;
  /** Solid Memo, at the open instance's decks when there is one. */
  backHref: string;
  instance: Instance | null;
  /** The draft the route names, if it does. */
  draftUrl: string | null;
  /** The main content. */
  children: ComponentChildren;
}) {
  const { t } = useI18n();
  const [prefs, setPrefs] = useState<StudioPrefs>(() => studioPrefs());
  const waiting = useWaiting();

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
      <header class="site-header">
        {banner}
        <p class="header-link">
          <a href={backHref}>{t("studio.backToApp")}</a>
        </p>
      </header>
      <main id={MAIN_ID} tabIndex={-1} class="workspace">
        {children}
      </main>
      <aside class="studio-status-bar" aria-label={t("studio.shell.status")}>
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
      </aside>
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
