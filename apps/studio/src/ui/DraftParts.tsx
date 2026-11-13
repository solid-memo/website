// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { idProblem } from "@solid-memo/domain/release/courseIds";
import type { LangText } from "@solid-memo/domain/langText";
import type { DraftRefusal, ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n, type I18n } from "@solid-memo/ui/i18n";
import {
  draftOf,
  LangTextField,
  rememberLanguages,
  textOfDraft,
  type DraftEntry,
  type LangTextDraft,
} from "@solid-memo/ui/LangTextField";
import type { LanguageRole } from "@solid-memo/ui/LanguagePicker";
import { ProseField } from "@solid-memo/ui/ProseField";
import { recentLanguages } from "@solid-memo/ui/remembered";
import type { DraftEditor, DraftReadOnly } from "./draftEditor";
import { ReadOnlyNotice } from "./ReadOnly";

/** Why a change of a draft was not made, in words. */
export function refusalText(refusal: DraftRefusal, t: I18n["t"]): string {
  return t(`studio.draftEdit.refused.${refusal.refused}`, {
    id: "id" in refusal ? refusal.id : "",
  });
}

/** The most characters of a chapter's title a label shows (chapterTitles). */
const CHAPTER_LABEL = 60;

/** A text cut at a code point to at most CHAPTER_LABEL characters, "…" included. */
function shortened(text: string): string {
  if (text.length <= CHAPTER_LABEL) return text;
  let end = 0;
  for (const point of text) {
    if (end + point.length > CHAPTER_LABEL - 1) break;
    end += point.length;
  }
  return `${text.slice(0, end)}…`;
}

/**
 * The titles a list of a draft's chapters (in the outline's order) names
 * them by: each its title, or its id when it has none, cut at a code
 * point to at most CHAPTER_LABEL characters, "…" included, in each of
 * its languages; and where two then read the same, each of those
 * followed by its place in the list, "(2)". A title may be as long as a
 * term, and a list of a draft's places or cards names a chapter many
 * times over.
 */
export function chapterTitles(
  chapters: readonly { id: string; data: { title?: LangText } }[],
  readerText: I18n["readerText"],
): Map<string, LangText> {
  const short = chapters.map(({ id, data }) =>
    Object.fromEntries(
      Object.entries(data.title ?? { "": id }).map(([lang, text]) => [lang, shortened(text)]),
    ),
  );
  const seen = new Map<string, number>();
  for (const title of short) {
    const name = readerText(title);
    seen.set(name, (seen.get(name) ?? 0) + 1);
  }
  return new Map(
    chapters.map(({ id }, at) => {
      const title = short[at]!;
      return [
        id,
        seen.get(readerText(title))! > 1
          ? Object.fromEntries(
              Object.entries(title).map(([lang, text]) => [lang, `${text} (${at + 1})`]),
            )
          : title,
      ];
    }),
  );
}

/**
 * Whether the draft's changes are written: "Saving…" while some wait
 * or are being written, else "All changes saved."; or why the last
 * write failed, after which the draft shown is the pod's again.
 */
export function DraftStatus({ editor }: { editor: Pick<DraftEditor, "saving" | "failure"> }) {
  const { t, errorText } = useI18n();
  const { saving, failure } = editor;
  return (
    <>
      <p role="status" class="hint">
        {failure === null && t(saving ? "studio.draftEdit.saving" : "studio.draftEdit.saved")}
      </p>
      <ErrorMessage
        error={
          failure === null
            ? null
            : "refusal" in failure
              ? refusalText(failure.refusal, t)
              : errorText(failure.error)
        }
      />
    </>
  );
}

/**
 * A draft screen's part that changes the draft, held while it may not
 * be (a disabled fieldset, as ReadOnlyScope): a draft released is
 * frozen, and says so; the instance's data check says why it holds it.
 */
export function DraftScope({
  readOnly,
  draftsHref,
  healthHref,
  children,
}: {
  readOnly: DraftReadOnly | null;
  draftsHref: string;
  healthHref: string;
  children: ComponentChildren;
}) {
  const { t, tx } = useI18n();
  return (
    <>
      {readOnly === "released" ? (
        <p class="warning">
          {tx("studio.draftEdit.released", {
            drafts: <a href={draftsHref}>{t("studio.draftEdit.releasedLink")}</a>,
          })}
        </p>
      ) : (
        <ReadOnlyNotice reason={readOnly} subject="catalogue" healthHref={healthHref} />
      )}
      <fieldset class="studio-scope" disabled={readOnly !== null}>
        {children}
      </fieldset>
    </>
  );
}

/** A draft's text in the languages it has, to start a field from; a new one in the language last chosen for a deck's text. */
function startOf(text: LangText | undefined): LangTextDraft {
  return draftOf(text, [], { tag: recentLanguages("deck")[0] ?? null });
}

/** The state of a field of a draft's text, saved as it is typed: its draft, and the entry whose language is asked for. */
function useSavedText(text: LangText | undefined, onSave: (text: LangText) => void) {
  const [draft, setDraft] = useState(() => startOf(text));
  const [missing, setMissing] = useState<DraftEntry | undefined>(undefined);
  function change(next: LangTextDraft) {
    setDraft(next);
    const result = textOfDraft(next, { trim: false });
    if ("missing" in result) {
      setMissing(result.missing);
      return;
    }
    setMissing(undefined);
    rememberLanguages("deck", result.text, next);
    onSave(result.text);
  }
  return { draft, missing, change };
}

/** Says, under a field, that its text is saved only once its language is chosen. */
function MissingLanguage({
  id,
  missing,
  field,
}: {
  id: string;
  missing: DraftEntry | undefined;
  field: string;
}) {
  const { t } = useI18n();
  return missing === undefined ? null : (
    <p id={id} class="error">
      {t("studio.draftEdit.chooseLanguage", { field })}
    </p>
  );
}

/**
 * A text of a draft (a title, a description), saved as it is typed
 * (`onSave`, which the editor debounces): in the languages the user
 * states, a text whose language is not chosen yet waiting until it is.
 * It starts from `text` and keeps what is typed after that.
 */
export function DraftTextField({
  id,
  label,
  role,
  field,
  text,
  multiline = false,
  disabled,
  arrival = false,
  onSave,
}: {
  id: string;
  label: string;
  role: LanguageRole;
  /** How the field is named in a sentence ("the title"). */
  field: string;
  text: LangText | undefined;
  multiline?: boolean;
  disabled: boolean;
  /** The screen was opened at this field (a link from the release check). */
  arrival?: boolean;
  onSave: (text: LangText) => void;
}) {
  const { draft, missing, change } = useSavedText(text, onSave);
  return (
    <>
      <LangTextField
        id={id}
        label={label}
        role={role}
        draft={draft}
        suggestions={[]}
        multiline={multiline}
        disabled={disabled}
        missing={missing}
        errorId={`${id}-language`}
        arrival={arrival}
        onChange={change}
      />
      <MissingLanguage id={`${id}-language`} missing={missing} field={field} />
    </>
  );
}

/**
 * Prose of a draft (a step's theory, a chapter's description) with its
 * Markdown toggle and its preview (ProseField), saved as it is typed or
 * switched, as DraftTextField saves.
 */
export function DraftProseField({
  id,
  label,
  role,
  field,
  text,
  markdown,
  disabled,
  preview,
  arrival = false,
  onSave,
}: {
  id: string;
  label: string;
  role: LanguageRole;
  field: string;
  text: LangText | undefined;
  markdown: boolean;
  disabled: boolean;
  preview: (text: LangText, markdown: boolean) => ComponentChildren;
  /** The screen was opened at this field (a link from the release check). */
  arrival?: boolean;
  onSave: (text: LangText, markdown: boolean) => void;
}) {
  const [inMarkdown, setInMarkdown] = useState(markdown);
  const { draft, missing, change } = useSavedText(text, (saved) => onSave(saved, inMarkdown));
  return (
    <>
      <ProseField
        id={id}
        label={label}
        role={role}
        draft={draft}
        markdown={inMarkdown}
        suggestions={[]}
        disabled={disabled}
        preview={preview}
        missing={missing}
        errorId={`${id}-language`}
        arrival={arrival}
        onChange={change}
        onMarkdown={(on) => {
          setInMarkdown(on);
          const result = textOfDraft(draft, { trim: false });
          if (!("missing" in result)) onSave(result.text, on);
        }}
      />
      <MissingLanguage id={`${id}-language`} missing={missing} field={field} />
    </>
  );
}

/**
 * The id of a subject to add, as the id assistant suggests it
 * (courseIds.ts), which the user may change: why it cannot be the
 * subject's (none a subject can have, or one taken, a published one
 * among them) shows as it is typed.
 */
export function IdField({
  id,
  draft,
  value,
  describedBy,
  onChange,
}: {
  id: string;
  draft: ReleaseDraft;
  value: string;
  /** Another hint of the form's that tells of the id, by its id. */
  describedBy?: string;
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  const problem = idProblem(draft, value);
  return (
    <>
      <label for={id}>{t("studio.draftEdit.id")}</label>
      <input
        id={id}
        value={value}
        spellcheck={false}
        autocomplete="off"
        aria-invalid={problem !== null}
        aria-describedby={describedBy === undefined ? `${id}-hint` : `${id}-hint ${describedBy}`}
        onInput={(event) => onChange(event.currentTarget.value)}
      />
      <p id={`${id}-hint`} class={problem === null ? "hint field-hint" : "error"}>
        {problem === null
          ? t("studio.draftEdit.idHint")
          : t(`studio.draftEdit.idProblem.${problem}`)}
      </p>
    </>
  );
}

/** Whether an id can be a new subject's: none of IdField's problems. */
export function idUsable(draft: ReleaseDraft, value: string): boolean {
  return idProblem(draft, value) === null;
}
