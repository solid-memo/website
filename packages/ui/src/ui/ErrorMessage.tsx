import { useLayoutEffect, useRef } from "preact/hooks";
import type { ErrorText } from "./i18n";

/**
 * Where a screen's error shows: one alert, mounted for as long as the
 * screen is, whose text changes — screen readers reliably hear a live
 * region that was already there, not one inserted along with its text.
 * Empty, it is hidden (style.css). When an error comes up after focus was
 * lost (the button pressed was disabled while it worked, or the screen it
 * was on gave way), or with `focus` always, focus goes to the error, so a
 * keyboard picks up where the message is. A block, not a paragraph: an
 * error's technical detail folds out beneath its sentence.
 */
export function ErrorMessage({
  error,
  id,
  focus = false,
}: {
  error: ErrorText | null | undefined;
  id?: string;
  focus?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // An error with markup is new markup each render: what it says tells a new error.
  const said = useRef("");
  useLayoutEffect(() => {
    const text = ref.current!.textContent!;
    if (text === said.current) return;
    said.current = text;
    if (text === "") return;
    const active = document.activeElement;
    if (focus || active === null || active === document.body) ref.current!.focus();
  });
  return (
    <div ref={ref} id={id} class="error" role="alert" tabIndex={-1}>
      {error}
    </div>
  );
}
