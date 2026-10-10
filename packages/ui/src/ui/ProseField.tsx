import type { ComponentChildren } from "preact";
import { useId } from "preact/hooks";
import type { LangText } from "@solid-memo/domain/langText";
import { PROSE } from "@solid-memo/markdown/problems";
import { useI18n } from "./i18n";
import { LangTextField, type DraftEntry, type LangTextDraft } from "./LangTextField";
import type { LanguageRole } from "./LanguagePicker";
import { MarkdownHelp, markdownHints, previewText } from "./MarkdownEditing";

/**
 * Prose of a course, a step's theory or a chapter's description, as its
 * writer edits it (docs/studio.md, Writing a draft): its text in the
 * languages the user states (LangTextField, a textarea), "Format with
 * Markdown" (`markdown`, the subject's `sm:textFormat`), and under them
 * a preview of the main text as the course player shows it (`preview`,
 * the player's own rendering: DataProse for a step's theory, say). In Markdown, each text is
 * hinted at where it would not show as meant, by the rules of prose
 * (PROSE: blocks and links allowed), and a cheat sheet sits under the
 * toggle.
 */
export function ProseField({
  id,
  label,
  role,
  draft,
  markdown,
  suggestions,
  disabled,
  preview,
  missing,
  errorId,
  arrival = false,
  onChange,
  onMarkdown,
}: {
  id: string;
  label: string;
  role: LanguageRole;
  draft: LangTextDraft;
  markdown: boolean;
  suggestions: string[];
  disabled: boolean;
  preview: (text: LangText, markdown: boolean) => ComponentChildren;
  /** An entry whose text needs its language, asked for under `errorId`. */
  missing?: DraftEntry;
  errorId?: string;
  /** The screen was opened at this field: its main text is where the user arrives (LangTextField). */
  arrival?: boolean;
  onChange: (draft: LangTextDraft) => void;
  onMarkdown: (on: boolean) => void;
}) {
  const { t } = useI18n();
  const hintId = useId();
  const shown = previewText(draft);
  return (
    <div class="prose-field">
      <LangTextField
        id={id}
        label={label}
        role={role}
        draft={draft}
        suggestions={suggestions}
        multiline
        disabled={disabled}
        entryHints={markdown ? (entry) => markdownHints(entry.value, PROSE, t) : undefined}
        missing={missing}
        errorId={errorId}
        arrival={arrival}
        onChange={onChange}
      />
      <div class="markdown-toggle">
        <label>
          <input
            type="checkbox"
            checked={markdown}
            aria-describedby={hintId}
            disabled={disabled}
            onChange={(event) => onMarkdown(event.currentTarget.checked)}
          />
          {t("proseField.markdown")}
        </label>
        <p id={hintId} class="hint field-hint">
          {t("proseField.markdownHint")}
        </p>
        {markdown && <MarkdownHelp />}
      </div>
      <section class="prose-preview" aria-label={t("proseField.preview", { field: label })}>
        {shown === undefined ? <p class="hint">{t("proseField.empty")}</p> : preview(shown, markdown)}
      </section>
    </div>
  );
}
