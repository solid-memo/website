import type { ComponentChildren } from "preact";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { useI18n } from "@solid-memo/ui/i18n";
import { ConfirmDialog } from "./ConfirmDialog";

/** Edits not saved, as an editor reports them: a way to save them, which resolves to whether they were. */
export type SaveEdits = () => Promise<boolean>;

/**
 * Keeps edits not saved from being dropped unasked (docs/studio.md, Card
 * inspector). An editor reports them (`report`: how to save them, then
 * null once there are none). While there are some, a move away from the
 * page (`guard`, any link to another of the app's pages followed by a
 * plain click, and Back, Forward or a hash typed in) first asks, in a
 * dialog: Save saves them, then moves, unless the save failed or was
 * refused, which the editor shows; Discard moves without them; Stay,
 * Escape or Close moves nowhere. A link followed after the question is
 * followed as it would have been. Back or Forward is undone before the
 * question, the page shown before it put back on top of the history, and
 * done again once answered, by going back from there to where it went.
 * Leaving the app (a reload, closing the tab) is left to the browser's
 * own question.
 */
export function useUnsavedEdits(): {
  report: (save: SaveEdits | null) => void;
  guard: (move: () => void) => void;
  dialog: ComponentChildren;
} {
  const { t } = useI18n();
  const unsaved = useRef<SaveEdits | null>(null);
  // The move asked about, until it is answered.
  const [asked, setAsked] = useState<(() => void) | null>(null);
  // A link followed once answered: its click is let through.
  const passing = useRef(false);

  // One function for the page's life, as the editor reports through it.
  const report = useCallback((save: SaveEdits | null) => {
    unsaved.current = save;
  }, []);

  function guard(move: () => void) {
    if (unsaved.current === null) move();
    else setAsked(() => move);
  }

  useEffect(() => {
    const click = (event: MouseEvent) => {
      if (unsaved.current === null || passing.current || event.button !== 0) return;
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element).closest<HTMLAnchorElement>('a[href^="#/"]');
      if (link === null || link.getAttribute("href") === window.location.hash) return;
      // Before the link's own handlers, which would follow it.
      event.preventDefault();
      event.stopPropagation();
      setAsked(() => () => {
        passing.current = true;
        link.click();
        passing.current = false;
      });
    };
    document.addEventListener("click", click, true);
    return () => document.removeEventListener("click", click, true);
  }, []);

  // Before the router's own listener (useHashRouter), which then never hears of the move.
  useLayoutEffect(() => {
    const hashChange = (event: HashChangeEvent) => {
      if (unsaved.current === null) return;
      const shown = new URL(event.oldURL).hash;
      if (shown === window.location.hash) return;
      event.stopImmediatePropagation();
      window.history.pushState(null, "", shown);
      setAsked(() => () => window.history.back());
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (unsaved.current !== null) event.preventDefault();
    };
    window.addEventListener("hashchange", hashChange, true);
    window.addEventListener("beforeunload", unload);
    return () => {
      window.removeEventListener("hashchange", hashChange, true);
      window.removeEventListener("beforeunload", unload);
    };
  }, []);

  const dialog = asked !== null && (
    <ConfirmDialog
      heading={t("studio.confirm.unsaved.heading")}
      choices={[
        {
          label: t("studio.confirm.unsaved.save"),
          onChoose: () => {
            setAsked(null);
            void unsaved.current!().then((saved) => {
              if (!saved) return;
              unsaved.current = null;
              asked();
            });
          },
        },
        {
          label: t("studio.confirm.unsaved.discard"),
          danger: true,
          onChoose: () => {
            setAsked(null);
            // Left behind: the move it makes is not asked about again.
            unsaved.current = null;
            asked();
          },
        },
        { label: t("studio.confirm.unsaved.stay"), onChoose: () => setAsked(null) },
      ]}
      onCancel={() => setAsked(null)}
    >
      <p>{t("studio.confirm.unsaved.text")}</p>
    </ConfirmDialog>
  );

  return { report, guard, dialog };
}
