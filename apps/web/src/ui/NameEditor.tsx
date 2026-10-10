import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { composing } from "./composing";
import { CheckIcon } from "./icons";
import { useI18n } from "./i18n";

/**
 * A name in the deck list, a deck's or a group's, to edit in place:
 * focused with its text selected, so typing replaces it. Enter, the
 * check button or leaving the field with a name in it keeps that name;
 * Escape, or leaving it empty or as it was, keeps the name it has. Left
 * for another control, it says not to take focus back from there.
 */
export function NameEditor({
  initial,
  label,
  maxLength,
  onDone,
}: {
  initial: string;
  /** The field's name. */
  label: string;
  /** The longest name it takes; none when unset. */
  maxLength?: number;
  /** With the new name, or null to keep the one it has; `refocus` unless the user left it for another control. */
  onDone: (name: string | null, refocus: boolean) => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  // The field goes as it is done, and a browser may say it lost focus as it goes.
  const done = useRef(false);

  useLayoutEffect(() => {
    input.current!.focus();
    input.current!.select();
  }, []);

  function finish(name: string | null, refocus: boolean) {
    if (done.current) return;
    done.current = true;
    onDone(name, refocus);
  }

  function commit(refocus: boolean) {
    const name = draft.trim();
    finish(name === "" || name === initial ? null : name, refocus);
  }

  return (
    <form
      class="name-form"
      onSubmit={(event) => {
        event.preventDefault();
        commit(true);
      }}
      onFocusOut={(event) => {
        const to = event.relatedTarget as Node | null;
        if (!event.currentTarget.contains(to)) commit(to === null);
      }}
    >
      <input
        ref={input}
        value={draft}
        aria-label={label}
        maxLength={maxLength}
        onInput={(event) => setDraft(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || composing(event)) return;
          event.preventDefault();
          event.stopPropagation();
          finish(null, true);
        }}
      />
      <button type="submit" class="icon" aria-label={t("deckList.saveName")} title={t("deckList.saveName")}>
        <CheckIcon />
      </button>
    </form>
  );
}
