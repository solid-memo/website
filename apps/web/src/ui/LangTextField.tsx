import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { AppError } from "@solid-memo/domain/appError";
import { shownTag, type LangText } from "@solid-memo/domain/langText";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n } from "./i18n";
import { LanguagePicker, languageTextId, type LanguageRole } from "./LanguagePicker";
import { rememberLanguage, type RecentLanguageKind } from "./remembered";

/**
 * Text whose languages the user states, as a form edits it: entries of
 * text, each with the language it is saved in (its tag; "" for text saved
 * with none), which its picker shows; null while the user is yet to
 * choose one. The same words
 * in several languages are an entry per language, as any other
 * translations. The first entry is the main one, the text the reader is
 * shown; the others are its translations. `id` stays an entry's own as
 * it is edited, retagged or moved, naming its picker.
 */
export interface DraftEntry {
  id: number;
  value: string;
  tag: string | null;
}

export type LangTextDraft = DraftEntry[];

/**
 * The draft of `text` for a reader who prefers `readerLanguages`: the
 * text they are shown first (shownTag), each other language after it,
 * each language an entry of its own. New text is one empty entry, in `tag` when there is evidence of its language, else
 * in none yet.
 */
export function draftOf(
  text: LangText | undefined,
  readerLanguages: readonly string[],
  { tag = null }: { tag?: string | null } = {},
): LangTextDraft {
  const main = text === undefined ? undefined : shownTag(text, readerLanguages);
  if (main === undefined) return [{ id: 0, value: "", tag }];
  const tags = [main, ...Object.keys(text!).filter((t) => t !== main)];
  return tags.map((t, id) => ({ id, value: text![t]!, tag: t }));
}

/**
 * The text a draft says, each entry's value trimmed under its language; a translation left empty is left out. Clearing the main
 * text clears the text in every language: empty. The entry, instead,
 * when text in it has no language chosen yet, for the app asks the user
 * for one rather than guess it.
 *
 * With `trim` false each value is kept as typed, for a caller that tidies
 * it itself: a card's text, whose leading spaces may be a Markdown code
 * block (validateCardContent).
 */
export function textOfDraft(
  draft: LangTextDraft,
  { trim = true }: { trim?: boolean } = {},
): { text: LangText } | { missing: DraftEntry } {
  if (draft[0]!.value.trim() === "") return { text: {} };
  const written = draft.filter((entry) => entry.value.trim() !== "");
  const missing = written.find((entry) => entry.tag === null);
  if (missing !== undefined) return { missing };
  return { text: Object.fromEntries(written.map(({ value, tag }) => [tag!, trim ? value.trim() : value])) };
}

/**
 * Notes the languages a saved draft states as this device's latest
 * choices, the main one last: the most recent. `text` is what is saved,
 * by language: a text, or keywords.
 */
export function rememberLanguages(
  kind: RecentLanguageKind,
  text: Readonly<Record<string, unknown>>,
  draft: LangTextDraft,
): void {
  for (const entry of [...draft].reverse()) {
    if (entry.tag !== null && entry.tag in text) rememberLanguage(kind, entry.tag);
  }
}

/**
 * Submits a textarea's form on Ctrl+Enter or ⌘+Enter: Enter itself starts
 * a new line. Not while an input method composes text (Japanese, say),
 * whose keys are its own.
 */
function submitOnCtrlEnter(event: KeyboardEvent) {
  if (event.key !== "Enter" || !(event.ctrlKey || event.metaKey) || event.isComposing) return;
  event.preventDefault();
  (event.currentTarget as HTMLTextAreaElement).form?.requestSubmit();
}

/** The id of the picker of a field's entry: a form moves focus to it when the entry needs its language. */
export function languageButtonId(id: string, entry: DraftEntry): string {
  return `${id}-language-${entry.id}`;
}

/**
 * The entry of a form's field (`fieldId`) whose text needs its language,
 * found as the form is submitted (textOfDraft): asking for it moves focus
 * to the entry's picker, which the field marks invalid; it is cleared as
 * the user changes the text.
 */
export function useMissingLanguage(fieldId: string) {
  const [asked, setAsked] = useState<{ entry: DraftEntry } | null>(null);
  useLayoutEffect(() => {
    if (asked !== null) document.getElementById(languageButtonId(fieldId, asked.entry))!.focus();
  }, [asked]);
  return {
    missing: asked?.entry,
    ask: (entry: DraftEntry) => setAsked({ entry }),
    clear: () => setAsked(null),
  };
}

/**
 * A field for text whose languages the user states (a deck's name or
 * description): its main text, marked with its language and followed by
 * the picker that states it (retagging the text without retyping it),
 * then its translations behind a disclosure, open from the start when
 * `translationsOpen`, each with its own picker and a button to remove
 * it. A language can hold one text: choosing one another entry has is
 * refused (textLanguageTaken).
 *
 * `missing`, with `errorId` (the form's message), is an entry whose text
 * needs its language: its picker is marked invalid, and shown should it
 * be a translation. `invalid` marks the main text itself, the form's
 * message about it among what `describedBy` adds to what describes it.
 * Text saved with no language (untagged, "", as a card's side may be)
 * keeps none until the user chooses one: its picker says it is not
 * stated, and asks for it. `hint`, a field's hint, goes right under the
 * main text, which it is about; the picker sits in a row with the
 * Translations button (or a translation's remove button) under that.
 *
 * A `multiline` text is a textarea, where Enter starts a new line, so
 * Ctrl+Enter (⌘+Enter) submits its form, as Enter does a single line.
 *
 * `entryHints` gives each entry's own hints, about that one text (its
 * Markdown, say): a list right under it, which describes it alone, so a
 * hint about a translation sits by the translation and is read with it.
 * They are read as the text is reached, never announced as they change,
 * which as the user types would be noise.
 */
export function LangTextField({
  id,
  label,
  role,
  draft,
  suggestions,
  multiline = false,
  placeholder,
  hint,
  entryHints,
  translationsOpen = false,
  required = false,
  disabled = false,
  describedBy,
  invalid,
  missing,
  errorId,
  inputRef,
  onChange,
}: {
  id: string;
  label: string;
  role: LanguageRole;
  draft: LangTextDraft;
  suggestions: string[];
  multiline?: boolean;
  /** The main text's placeholder. */
  placeholder?: string;
  /** Shown under the main text: its hint, listed in `describedBy` by its id. */
  hint?: ComponentChildren;
  /** Hints about one entry's text, listed under it and describing it. */
  entryHints?: (entry: DraftEntry) => readonly string[];
  translationsOpen?: boolean;
  required?: boolean;
  disabled?: boolean;
  describedBy?: string;
  invalid?: boolean;
  missing?: DraftEntry;
  errorId?: string;
  inputRef?: { current: HTMLInputElement | HTMLTextAreaElement | null };
  onChange: (draft: LangTextDraft) => void;
}) {
  const { t, partLang, languageParts, errorText } = useI18n();
  const [open, setOpen] = useState(translationsOpen);
  /** A language refused for an entry, another one having it. */
  const [taken, setTaken] = useState<{ entry: number; error: AppError } | null>(null);
  /** Where focus goes once the draft is drawn: an entry's picker or text, or the Add button. */
  const focusNext = useRef<string | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (focusNext.current === null) return;
    const target = focusNext.current === "add" ? addRef.current : document.getElementById(focusNext.current);
    focusNext.current = null;
    target?.focus();
  });

  const takenId = `${id}-taken`;
  const [main, ...translations] = draft;
  const showTranslations = open || (missing !== undefined && missing.id !== main!.id);
  const name = (tag: string) => languageParts(tag).name;
  /** The id of an entry's text: the field's own for the main text, which its label names. */
  const textIdOf = (entry: DraftEntry) => (entry === main ? id : `${id}-${entry.id}`);
  const nextId = () => Math.max(...draft.map((entry) => entry.id)) + 1;

  function change(next: LangTextDraft) {
    setTaken(null);
    onChange(next);
  }

  function edit(entry: DraftEntry, value: string) {
    change(draft.map((e) => (e === entry ? { ...e, value } : e)));
  }

  /** The entry said to be in `tag`, not the language it showed: refused when another entry has it. */
  function retag(entry: DraftEntry, tag: string) {
    if (draft.some((e) => e !== entry && e.tag === tag)) {
      setTaken({ entry: entry.id, error: new AppError("textLanguageTaken", { language: name(tag) }) });
      return;
    }
    change(draft.map((e) => (e === entry ? { ...e, tag } : e)));
  }

  function add() {
    const entry: DraftEntry = { id: nextId(), value: "", tag: null };
    focusNext.current = languageButtonId(id, entry);
    change([...draft, entry]);
  }

  function remove(entry: DraftEntry) {
    focusNext.current = "add";
    change(draft.filter((e) => e !== entry));
  }

  /**
   * An entry's text and its picker in a row with `control`;
   * the main one labelled by the field's label, and followed by the hint.
   */
  function entryFields(entry: DraftEntry, entryLabel: string, control: ComponentChildren) {
    const textId = textIdOf(entry);
    const pickerId = languageButtonId(id, entry);
    const hints = entryHints?.(entry) ?? [];
    const hintsId = `${textId}-hints`;
    const describers = [
      languageTextId(pickerId),
      entry === main ? describedBy : undefined,
      hints.length > 0 ? hintsId : undefined,
    ].filter(Boolean);
    const props = {
      id: textId,
      lang: partLang(entry.tag ?? undefined),
      value: entry.value,
      placeholder: entry === main ? placeholder : undefined,
      required: entry === main && required,
      "aria-invalid": entry === main ? invalid : undefined,
      disabled,
      "aria-describedby": describers.join(" "),
      onInput: (event: Event) => edit(entry, (event.currentTarget as HTMLInputElement).value),
    };
    return (
      <>
        <label for={textId}>{entryLabel}</label>
        {multiline ? (
          <textarea
            ref={entry === main ? (inputRef as { current: HTMLTextAreaElement | null }) : undefined}
            {...props}
            aria-keyshortcuts="Control+Enter Meta+Enter"
            onKeyDown={submitOnCtrlEnter}
          />
        ) : (
          <input
            ref={entry === main ? (inputRef as { current: HTMLInputElement | null }) : undefined}
            type="text"
            {...props}
          />
        )}
        {entry === main && hint}
        {hints.length > 0 && (
          <ul id={hintsId} class="hint field-hint entry-hints">
            {hints.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        )}
        <div class="language-controls">
          <LanguagePicker
            id={pickerId}
            value={entry.tag === "" ? null : entry.tag}
            role={role}
            suggestions={suggestions}
            unstated={entry.tag === ""}
            errorId={entry.id === missing?.id ? errorId : entry.id === taken?.entry ? takenId : undefined}
            disabled={disabled}
            onChange={(tag) => retag(entry, tag)}
          />
          {control}
        </div>
      </>
    );
  }

  return (
    <div class="lang-text-field">
      {entryFields(
        main!,
        label,
        <button
          type="button"
          class="translations-toggle"
          aria-expanded={showTranslations}
          aria-controls={`${id}-translations`}
          onClick={() => setOpen(!showTranslations)}
        >
          {t("language.translations", { count: translations.length })}
        </button>,
      )}
      <div id={`${id}-translations`} class="translations" hidden={!showTranslations}>
        {translations.map((entry) => {
          const { tag } = entry;
          return (
            <div key={entry.id} class="translation">
              {entryFields(
                entry,
                tag === null ? t("language.translationUnstated") : t("language.translationLabel", { language: name(tag) }),
                <button type="button" onClick={() => remove(entry)} disabled={disabled}>
                  {tag === null ? t("language.removeUnstated") : t("language.remove", { language: name(tag) })}
                </button>,
              )}
            </div>
          );
        })}
        <button ref={addRef} type="button" onClick={add} disabled={disabled}>
          {t("language.add")}
        </button>
      </div>
      <ErrorMessage id={takenId} error={errorText(taken?.error)} />
    </div>
  );
}
