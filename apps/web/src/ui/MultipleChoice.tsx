import { useId, useRef, useState } from "preact/hooks";
import type { LangText } from "@solid-memo/domain/langText";
import { useI18n } from "./i18n";
import { ReaderText } from "./ReaderText";

/** One option offered: its key (domain/course.ts Choice) and its text. */
export interface ChoiceOption {
  key: string;
  text: LangText;
}

/**
 * A multiple-choice question's options and its Check button: native
 * radios in a radiogroup named by the question (`labelledBy`), so arrow
 * keys move among them as anywhere else. While the focus is among the
 * options, a number key 1–n picks that option (and takes the focus to
 * it), and Enter checks the one picked, as a hint under them says; the
 * keys work only there, so they never catch a screen reader's own keys
 * elsewhere on the page. While the answer saves, Check is only
 * aria-disabled, so it keeps the focus if saving fails.
 *
 * Once checked (`answered`), the options stay, fixed, each marked in
 * words as well as colour: the right answer, and the one chosen when it
 * was not.
 */
export function MultipleChoice({
  labelledBy,
  choices,
  answered,
  busy,
  onCheck,
}: {
  /** Id of the question the options answer. */
  labelledBy: string;
  choices: readonly ChoiceOption[];
  /** Once checked: the option chosen and the right one. */
  answered?: { chosen: string; correct: string };
  /** The answer is being saved. */
  busy: boolean;
  onCheck: (key: string) => void;
}) {
  const { t } = useI18n();
  const name = useId();
  const groupRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const fixed = answered !== undefined;

  function check() {
    if (!busy && selected !== null) onCheck(selected);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (fixed || busy || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.key === "Enter") {
      // Enter on Check itself already presses it.
      if ((event.target as Element).closest("button")) return;
      event.preventDefault();
      check();
      return;
    }
    const index = /^[1-9]$/.test(event.key) ? Number(event.key) - 1 : -1;
    if (index < 0 || index >= choices.length) return;
    event.preventDefault();
    setSelected(choices[index]!.key);
    groupRef.current!.querySelectorAll<HTMLInputElement>("input")[index]!.focus();
  }

  return (
    <div class="multiple-choice" onKeyDown={onKeyDown}>
      <div ref={groupRef} role="radiogroup" aria-labelledby={labelledBy} class="choices">
        {choices.map((choice, index) => {
          const right = fixed && choice.key === answered.correct;
          const wrong = fixed && choice.key === answered.chosen && !right;
          return (
            <label
              key={choice.key}
              class={`choice${right ? " choice-right" : ""}${wrong ? " choice-wrong" : ""}`}
            >
              <input
                type="radio"
                name={name}
                value={choice.key}
                checked={fixed ? choice.key === answered.chosen : choice.key === selected}
                disabled={fixed}
                aria-keyshortcuts={String(index + 1)}
                onChange={() => setSelected(choice.key)}
              />
              <span class="choice-number" aria-hidden="true">
                {index + 1}
              </span>
              <span class="choice-text">
                <ReaderText text={choice.text} breaks />
              </span>
              {right && <span class="choice-mark">{t("multipleChoice.right")}</span>}
              {wrong && <span class="choice-mark">{t("multipleChoice.chosen")}</span>}
            </label>
          );
        })}
      </div>
      {!fixed && (
        <>
          <button
            class="primary"
            onClick={check}
            disabled={!busy && selected === null}
            aria-disabled={busy}
            aria-keyshortcuts="Enter"
          >
            {busy ? t("multipleChoice.checking") : t("multipleChoice.check")}
          </button>
          <p class="hint study-keys">{t("multipleChoice.keys", { last: Math.min(choices.length, 9) })}</p>
        </>
      )}
    </div>
  );
}
