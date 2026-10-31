// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { memo } from "preact/compat";
import { useId, useRef, useState } from "preact/hooks";
import type { LangText } from "@solid-memo/domain/langText";
import type { MdPhrase } from "@solid-memo/markdown/parse";
import { DataLine } from "./DataText";
import { useI18n } from "./i18n";
import { optionPhrases } from "./markdownCache";

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
 * words as well as color: the right answer, and the one chosen when it
 * was not.
 *
 * Options in Markdown (`markdown`, the card's format) show as one line
 * of it each, for a label holds no blocks or links (DataLine). Each
 * option's text is parsed once for as long as the question is shown,
 * however many options it has and however often its caller draws it
 * again (optionPhrases), and choosing an option draws again only the
 * options whose state changes (ChoiceRow), as does drawing the question
 * again with the same options.
 */
export function MultipleChoice({
  labelledBy,
  describedBy,
  choices,
  answered,
  busy,
  markdown = false,
  onCheck,
}: {
  /** Id of the question the options answer, or of its name. */
  labelledBy: string;
  /** Id of the whole question, when `labelledBy` names it only. */
  describedBy?: string;
  choices: readonly ChoiceOption[];
  /** Once checked: the option chosen and the right one. */
  answered?: { chosen: string; correct: string };
  /** The answer is being saved. */
  busy: boolean;
  /** The options are written in Markdown. */
  markdown?: boolean;
  onCheck: (key: string) => void;
}) {
  const { t } = useI18n();
  const name = useId();
  const groupRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // One cache for as long as the question is shown, whatever array its options come in:
  // the shared one keeps fewer texts than a question may offer.
  const [phrasesOf] = useState(optionPhrases);
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
      <div
        ref={groupRef}
        role="radiogroup"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        class="choices"
      >
        {choices.map((choice, index) => {
          const right = fixed && choice.key === answered.correct;
          return (
            <ChoiceRow
              key={choice.key}
              choice={choice}
              index={index}
              name={name}
              checked={fixed ? choice.key === answered.chosen : choice.key === selected}
              fixed={fixed}
              right={right}
              wrong={fixed && choice.key === answered.chosen && !right}
              markdown={markdown}
              phrasesOf={phrasesOf}
              onSelect={setSelected}
            />
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
          <p class="hint study-keys">
            {t("multipleChoice.keys", { last: Math.min(choices.length, 9) })}
          </p>
        </>
      )}
    </div>
  );
}

/**
 * One option of a MultipleChoice, drawn again only when its own props
 * change (memo), so choosing an option draws two rows, not every one.
 */
const ChoiceRow = memo(function ChoiceRow({
  choice,
  index,
  name,
  checked,
  fixed,
  right,
  wrong,
  markdown,
  phrasesOf,
  onSelect,
}: {
  choice: ChoiceOption;
  index: number;
  name: string;
  checked: boolean;
  fixed: boolean;
  right: boolean;
  wrong: boolean;
  markdown: boolean;
  phrasesOf: (text: string) => MdPhrase[] | null;
  onSelect: (key: string) => void;
}) {
  const { t } = useI18n();
  return (
    <label class={`choice${right ? " choice-right" : ""}${wrong ? " choice-wrong" : ""}`}>
      <input
        type="radio"
        name={name}
        value={choice.key}
        checked={checked}
        disabled={fixed}
        aria-keyshortcuts={String(index + 1)}
        onChange={() => onSelect(choice.key)}
      />
      <span class="choice-number" aria-hidden="true">
        {index + 1}
      </span>
      <span class="choice-text">
        <DataLine text={choice.text} markdown={markdown} phrasesOf={phrasesOf} />
      </span>
      {right && <span class="choice-mark">{t("multipleChoice.right")}</span>}
      {wrong && <span class="choice-mark">{t("multipleChoice.chosen")}</span>}
    </label>
  );
});
