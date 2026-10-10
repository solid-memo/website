import type { ComponentChildren } from "preact";
import { useEffect, useId, useRef } from "preact/hooks";
import { useI18n } from "@solid-memo/ui/i18n";

/**
 * A modal dialog, open while it is shown: the browser's own `<dialog>`,
 * which keeps the focus in it and closes on Escape. Its heading names it.
 * Its Close button closes it too, and closed (`onClose`, which stops
 * showing it), the focus goes back where it was before it opened.
 * Opened, the focus goes to the field marked `autoFocus` in it, if one
 * is, as the browser does (and the test DOM does not). While
 * it is open, the Studio's shortcuts leave its keys to it.
 */
export function Dialog({
  heading,
  onClose,
  children,
}: {
  heading: string;
  /** The dialog closed: stop showing it. */
  onClose: () => void;
  children: ComponentChildren;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();

  useEffect(() => {
    const opener = document.activeElement as HTMLElement;
    ref.current!.showModal();
    ref.current!.querySelector<HTMLElement>("[autofocus]")?.focus();
    return () => opener.focus();
  }, []);

  return (
    <dialog ref={ref} class="studio-dialog" aria-labelledby={headingId} onClose={onClose}>
      <header>
        <h2 id={headingId}>{heading}</h2>
        <button type="button" onClick={() => ref.current!.close()}>
          {t("studio.shell.close")}
        </button>
      </header>
      {children}
    </dialog>
  );
}
