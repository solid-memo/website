import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { AppError } from "@solid-memo/domain/appError";
import { canonicalTag, NO_LANGUAGE } from "@solid-memo/domain/languageTag";
import { composing } from "./composing";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n, type MessageKey } from "./i18n";
import { recentLanguages, RECENT_LANGUAGES, type RecentLanguageKind } from "./remembered";

/** Which text a picker says the language of: names its legend. */
export type LanguageRole =
  | "front"
  | "back"
  | "deckName"
  | "description"
  | "keywords"
  | "frontNote"
  | "backLabel"
  | "backNote"
  | "pictureDescription"
  | "distractor"
  | "distractorNote";

const LEGENDS: Record<LanguageRole, MessageKey> = {
  front: "language.legend.front",
  back: "language.legend.back",
  deckName: "language.legend.deckName",
  description: "language.legend.description",
  keywords: "language.legend.keywords",
  frontNote: "language.legend.frontNote",
  backLabel: "language.legend.backLabel",
  backNote: "language.legend.backNote",
  pictureDescription: "language.legend.pictureDescription",
  distractor: "language.legend.distractor",
  distractorNote: "language.legend.distractorNote",
};

/** Whose recent choices a role offers first: a deck's own text, or a card's. */
function recentKinds(role: LanguageRole): RecentLanguageKind[] {
  return role === "deckName" || role === "description" || role === "keywords" ? ["deck", "own"] : ["own", "deck"];
}

/**
 * The id of the text a picker's button reads ("Language: Swedish"): the
 * field the picker belongs to lists it in its aria-describedby, so the
 * field says its language along with its label.
 */
export function languageTextId(id: string): string {
  return `${id}-text`;
}

/**
 * Each tag as the app stores it, once, in the order given; what names no
 * language is left out — but `value` itself, first and as it is, so a tag
 * another app wrote ("x-klingon", "EN") still shows checked, and can be
 * chosen again or changed.
 */
function choices(tags: Iterable<string>, value: string | null = null): string[] {
  const found = new Set<string>();
  for (const tag of tags) {
    const canonical = canonicalTag(tag);
    if (canonical !== null) found.add(canonical);
  }
  if (value === null) return [...found];
  found.delete(canonicalTag(value) ?? value);
  return [value, ...found];
}

/**
 * What language a piece of text is in, chosen by the user: a button that
 * says it ("Language: Swedish", or "not stated" while `value` is null),
 * opening in place onto a group of radios — the value (as it is, even
 * one the app would not store), then `suggestions` (what the deck
 * uses), the device's recent choices, this page's language, English, Swedish and the browser's languages, no
 * language ("zxx", for codes, numbers and symbols), and any other by its
 * code. A radio chosen is the language (`onChange`); Done, Escape, or
 * Enter on a radio or on the code closes the group, and focus goes back
 * to the button. Nothing is chosen for the user: with `value` null no
 * radio is checked. `unstated` says the text was saved with no
 * language, and asks for one; `errorId` names an error about this
 * choice (a language still to choose), which marks the button invalid.
 * While `disabled` (the form saving) nothing can be chosen: the button
 * keeps the focus (aria-disabled), and an open group's radios are
 * disabled.
 */
export function LanguagePicker({
  id,
  value,
  role,
  suggestions,
  unstated = false,
  errorId,
  disabled = false,
  onChange,
}: {
  id: string;
  value: string | null;
  role: LanguageRole;
  suggestions: string[];
  unstated?: boolean;
  errorId?: string;
  disabled?: boolean;
  onChange: (tag: string) => void;
}) {
  const { t, locale, languageParts } = useI18n();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  // Closing gives focus back to the button, wherever in the group it was.
  useLayoutEffect(() => {
    if (wasOpen.current && !open) buttonRef.current!.focus();
    wasOpen.current = open;
  }, [open]);
  const hintId = `${id}-hint`;
  const describedBy = [unstated && value === null ? hintId : undefined, errorId].filter(Boolean).join(" ");
  return (
    <div class="language-picker">
      <button
        ref={buttonRef}
        id={id}
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        aria-describedby={describedBy === "" ? undefined : describedBy}
        aria-invalid={errorId === undefined ? undefined : true}
        aria-disabled={disabled || undefined}
        onClick={() => {
          if (!disabled) setOpen(!open);
        }}
      >
        <span id={languageTextId(id)}>
          {value === null ? t("language.notStated") : t("language.button", { language: languageParts(value).name })}
        </span>
      </button>
      {unstated && value === null && (
        <p id={hintId} class="hint">
          {t("language.unstatedHint")}
        </p>
      )}
      {open && (
        <LanguageChoices
          id={id}
          value={value}
          legend={t(LEGENDS[role])}
          disabled={disabled}
          tags={choices(
            [
              ...suggestions,
              ...choices(recentKinds(role).flatMap((kind) => recentLanguages(kind))).slice(0, RECENT_LANGUAGES),
              locale,
              "en",
              "sv",
              ...navigator.languages,
              NO_LANGUAGE,
            ],
            value,
          )}
          onChange={onChange}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

/** The open group: its radios, the code of another language, and Done. */
function LanguageChoices({
  id,
  value,
  legend,
  tags,
  disabled,
  onChange,
  onClose,
}: {
  id: string;
  value: string | null;
  legend: string;
  tags: string[];
  disabled: boolean;
  onChange: (tag: string) => void;
  onClose: () => void;
}) {
  const { t, errorText, languageLabel } = useI18n();
  const ref = useRef<HTMLFieldSetElement>(null);
  // The group takes focus as it opens, its legend read out: Tab goes on to its radios.
  useLayoutEffect(() => {
    ref.current!.focus();
  }, []);
  const [other, setOther] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<AppError | null>(null);
  const otherRef = useRef<HTMLInputElement>(null);
  const errorId = `${id}-other-error`;
  const previewId = `${id}-other-preview`;
  const typed = canonicalTag(code);

  // The code's field takes focus when Other is chosen, so typing it follows.
  useLayoutEffect(() => {
    if (other) otherRef.current!.focus();
  }, [other]);

  /** Done: the code typed, when Other is chosen, is the language; a code that names none is refused. */
  function done() {
    if (other && code.trim() !== "") {
      if (typed === null) {
        setError(new AppError("textLanguageInvalid", { tag: code.trim() }));
        otherRef.current!.focus();
        return;
      }
      onChange(typed);
    }
    onClose();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (composing(event)) return;
    if (event.key === "Escape") {
      event.preventDefault();
      // The group closes, not the dialog or screen around it.
      event.stopPropagation();
      onClose();
    } else if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
      // Not the form's submit: Enter on a radio or the code is Done.
      event.preventDefault();
      done();
    }
  }

  return (
    <fieldset ref={ref} id={`${id}-panel`} class="language-choices" tabIndex={-1} disabled={disabled} onKeyDown={onKeyDown}>
      <legend>{legend}</legend>
      {tags.map((tag) => (
        <label key={tag} class="radio-option">
          <input
            type="radio"
            name={`${id}-language`}
            value={tag}
            checked={!other && tag === value}
            onChange={() => {
              setOther(false);
              setError(null);
              onChange(tag);
            }}
          />
          <LanguageName tag={tag} />
        </label>
      ))}
      <label class="radio-option">
        <input
          type="radio"
          name={`${id}-language`}
          value=""
          checked={other}
          onChange={() => setOther(true)}
        />
        {t("language.otherOption")}
      </label>
      {other && (
        <div class="language-other">
          <label for={`${id}-other`}>{t("language.otherLabel")}</label>
          <input
            ref={otherRef}
            id={`${id}-other`}
            type="text"
            autoComplete="off"
            spellcheck={false}
            value={code}
            aria-invalid={error === null ? undefined : true}
            aria-describedby={error === null ? previewId : `${previewId} ${errorId}`}
            onInput={(event) => {
              setCode(event.currentTarget.value);
              setError(null);
            }}
          />
          <p id={previewId} class="hint" role="status">
            {typed === null ? "" : languageLabel(typed)}
          </p>
        </div>
      )}
      <ErrorMessage id={errorId} error={errorText(error)} />
      <button type="button" onClick={done}>
        {t("language.done")}
      </button>
    </fieldset>
  );
}

/**
 * A language named in full, its name in itself marked with its language
 * for a screen reader. One span, so the spaces around the name in itself
 * stay in the flex row of its radio.
 */
function LanguageName({ tag }: { tag: string }) {
  const { languageParts } = useI18n();
  const { name, autonym, code } = languageParts(tag);
  return (
    <span>
      {name}
      {autonym !== undefined && (
        <>
          {" — "}
          <span lang={tag}>{autonym}</span>
        </>
      )}
      {code !== undefined && ` (${code})`}
    </span>
  );
}
