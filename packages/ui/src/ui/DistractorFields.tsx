import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { AppError } from "@solid-memo/domain/appError";
import { isFormatted, isMarkdown, type Distractor } from "@solid-memo/domain/deck";
import {
  addDistractor,
  deleteDistractor,
  distractorIssues,
  editDistractor,
  restoreDistractor,
  retireDistractor,
  type DistractorIssue,
} from "@solid-memo/domain/distractors";
import { shownTag, type LangText } from "@solid-memo/domain/langText";
import { OPTION, PROSE } from "@solid-memo/markdown/problems";
import { DataLine, plainDataText } from "./DataText";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n } from "./i18n";
import { draftOf, LangTextField, languageButtonId, textOfDraft, type DraftEntry, type LangTextDraft } from "./LangTextField";
import { markdownHints } from "./MarkdownEditing";

const NONE_PUBLISHED: ReadonlySet<string> = new Set();

/** The wrong option being written: a new one (`id` null) or one of the card's. */
interface Editing {
  id: string | null;
  text: LangTextDraft;
  note: LangTextDraft;
  /** The text whose language is asked for, as the editor found it on Add or Update. */
  missing?: { field: "text" | "note"; entry: DraftEntry };
  error: AppError | null;
}

/**
 * A card's wrong options (its distractors), shared by the card's page in
 * Solid Memo and the Studio's card inspector (docs/studio.md): each with
 * its note, marked when retired, with buttons to edit, retire or restore
 * it, and to delete it, once the user confirms: only one its deck's
 * release never published (`published`, the release's ids); one it did
 * is refused at once, to be retired instead, since a learner's history
 * may name it. "Add a wrong option" writes a new one,
 * created only once it has text, under the card's next id
 * (nextDistractorId). The domain makes each change (domain/distractors.ts);
 * `onChange` gets the card's distractors as they are then, for the
 * caller to save with the card. A caller that saves each change at once
 * returns whether it was saved: the option being written stays open,
 * as the user wrote it, until it is.
 *
 * One option is written at a time, in its own fields (LangTextField),
 * text in the language of the back's main text to start with. Add or Update (or
 * Enter in a single-line field, which so does not save the form around
 * it) takes it; Cancel leaves it as it was. Under the list, what is worth
 * a look (distractorIssues): an option not in the back's languages, and
 * too few in use for a course, as warnings, never refusals, for a pod's
 * deck is its user's. With `picks`, each option says how often a learner
 * chose it, as the answer log tells.
 */
export function DistractorFields({
  cardId,
  distractors,
  published = NONE_PUBLISHED,
  back,
  textFormat,
  busy,
  suggestions,
  picks,
  onChange,
}: {
  cardId: string;
  distractors: readonly Distractor[];
  /** The ids of the distractors the release the deck came from has: never deleted. */
  published?: ReadonlySet<string>;
  /** The card's back: the options are meant to be in its languages. */
  back: LangText;
  /** The card's text format: Markdown options are written and shown as such. */
  textFormat?: string;
  busy: boolean;
  /** The languages the pickers suggest first. */
  suggestions: string[];
  /** How often each option (by id) was chosen in a wrong answer; none counts as 0. Not shown when absent. */
  picks?: ReadonlyMap<string, number>;
  /** Nothing, or, for a change saved at once, whether it was saved. */
  onChange: (distractors: Distractor[]) => void | Promise<boolean>;
}) {
  const { t, readerText, languageLabel, errorText } = useI18n();
  const [editing, setEditing] = useState<Editing | null>(null);
  /** Why the last Delete was refused, until the next change. */
  const [refusal, setRefusal] = useState<AppError | null>(null);
  const markdown = isMarkdown(textFormat);
  const formatted = isFormatted(textFormat);
  /** Where focus goes once the list is drawn again: an option's Edit button, or Add. */
  const focusNext = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (focusNext.current === null) return;
    document.getElementById(focusNext.current)?.focus();
    focusNext.current = null;
  });

  // A language asked for: its picker takes the focus, saying so.
  const missing = editing?.missing;
  useLayoutEffect(() => {
    if (missing === undefined) return;
    document.getElementById(languageButtonId(missing.field === "text" ? "distractor-text" : "distractor-note", missing.entry))?.focus();
  }, [missing]);

  const named = (distractor: Distractor) => plainDataText(readerText(distractor.text), markdown, 60);
  const editButtonId = (id: string) => `distractor-${id}-edit`;
  const backTag = shownTag(back) ?? null;

  function start(distractor: Distractor | null) {
    setEditing({
      id: distractor?.id ?? null,
      text: draftOf(distractor?.text, [], { tag: backTag }),
      note: draftOf(distractor?.note, [], { tag: backTag === "" ? null : backTag }),
      error: null,
    });
  }

  function close(id: string | null) {
    focusNext.current = id === null ? "distractor-add" : editButtonId(id);
    setEditing(null);
  }

  function done() {
    if (editing === null || busy) return;
    const text = textOfDraft(editing.text, { trim: !formatted });
    if ("missing" in text) return setEditing({ ...editing, missing: { field: "text", entry: text.missing }, error: null });
    const note = textOfDraft(editing.note, { trim: !formatted });
    if ("missing" in note) return setEditing({ ...editing, missing: { field: "note", entry: note.missing }, error: null });
    const entered = { text: text.text, note: note.text };
    const edit =
      editing.id === null
        ? addDistractor(distractors, cardId, entered, { published, formatted })
        : editDistractor(distractors, editing.id, entered, formatted);
    if (!edit.ok) return setEditing({ ...editing, missing: undefined, error: edit.error });
    const saved = change(edit.distractors);
    const { id } = editing;
    if (saved === undefined) return close(id);
    // Kept open, as written, until it is saved: the caller says why not.
    void saved.then((ok) => ok && close(id));
  }

  function onKeyDown(event: KeyboardEvent) {
    // Enter in a line of the option is its Add or Update, not the form's submit.
    if (event.key !== "Enter" || event.defaultPrevented || event.isComposing) return;
    if (!(event.target instanceof HTMLInputElement)) return;
    event.preventDefault();
    done();
  }

  function change(next: Distractor[]) {
    setRefusal(null);
    return onChange(next);
  }

  function remove(distractor: Distractor) {
    if (busy) return;
    const edit = deleteDistractor(distractors, distractor.id, published);
    // One the release published is refused at once, saying to retire it instead.
    if (!edit.ok) return setRefusal(edit.error);
    if (!window.confirm(t("distractorFields.deleteConfirm", { option: named(distractor) }))) return;
    focusNext.current = "distractor-add";
    change(edit.distractors);
  }

  const languages = (tags: readonly string[]) =>
    tags.map((tag) => (tag === "" ? t("distractorFields.noLanguage") : languageLabel(tag))).join(", ");
  const issueText = (issue: DistractorIssue): string[] => {
    if (issue.code === "fewDistractors") return [t("distractorFields.issue.few", { count: issue.count, least: issue.least })];
    const option = named(distractors.find((distractor) => distractor.id === issue.id)!);
    return [
      ...(issue.missing.length === 0 ? [] : [t("distractorFields.issue.missing", { option, languages: languages(issue.missing) })]),
      ...(issue.extra.length === 0 ? [] : [t("distractorFields.issue.extra", { option, languages: languages(issue.extra) })]),
    ];
  };
  const issues = distractorIssues({ back, distractors }, "pod").flatMap(issueText);

  const editor = (state: Editing) => (
    <div class="distractor-editor" onKeyDown={onKeyDown}>
      <LangTextField
        id="distractor-text"
        label={t("distractorFields.text")}
        role="distractor"
        draft={state.text}
        suggestions={suggestions}
        disabled={busy}
        entryHints={markdown ? (entry) => markdownHints(entry.value, OPTION, t) : undefined}
        missing={state.missing?.field === "text" ? state.missing.entry : undefined}
        errorId="distractor-error"
        onChange={(text) => setEditing({ ...state, text, missing: undefined, error: null })}
      />
      <LangTextField
        id="distractor-note"
        label={t("distractorFields.note")}
        role="distractorNote"
        draft={state.note}
        suggestions={suggestions}
        multiline={markdown}
        disabled={busy}
        describedBy="distractor-note-hint"
        hint={
          <p id="distractor-note-hint" class="hint field-hint">
            {t("distractorFields.noteHint")}
          </p>
        }
        entryHints={markdown ? (entry) => markdownHints(entry.value, PROSE, t) : undefined}
        missing={state.missing?.field === "note" ? state.missing.entry : undefined}
        errorId="distractor-error"
        onChange={(note) => setEditing({ ...state, note, missing: undefined, error: null })}
      />
      <ErrorMessage
        id="distractor-error"
        error={errorText(
          state.missing === undefined
            ? state.error
            : new AppError("textNeedsLanguage", { field: t(state.missing.field === "text" ? "language.field.distractor" : "language.field.distractorNote") }),
        )}
      />
      <div class="edit-actions">
        <button type="button" onClick={done} aria-disabled={busy}>
          {t(state.id === null ? "distractorFields.addDone" : "distractorFields.update")}
        </button>
        <button type="button" class="secondary" onClick={() => close(state.id)}>
          {t("distractorFields.cancel")}
        </button>
      </div>
    </div>
  );

  return (
    <fieldset class="distractor-fields">
      <legend>{t("distractorFields.legend")}</legend>
      <p id="distractor-fields-hint" class="hint">
        {t("distractorFields.hint")}
      </p>
      {distractors.length === 0 ? (
        <p class="hint">{t("distractorFields.none")}</p>
      ) : (
        <ul class="distractor-list" aria-describedby="distractor-fields-hint">
          {distractors.map((distractor) =>
            editing?.id === distractor.id ? (
              <li key={distractor.id}>{editor(editing)}</li>
            ) : (
              <li key={distractor.id} class={distractor.retired ? "retired" : undefined}>
                <p class="distractor-text">
                  <DataLine text={distractor.text} markdown={markdown} />
                  {distractor.retired && (
                    <>
                      {" "}
                      <span class="retired-tag">{t("distractorFields.retiredTag")}</span>
                    </>
                  )}
                </p>
                {distractor.note !== undefined && (
                  <p class="hint distractor-note">
                    <DataLine text={distractor.note} markdown={markdown} />
                  </p>
                )}
                <p class="hint distractor-id">{distractor.id}</p>
                {picks !== undefined && (
                  <p class="hint distractor-picks">{t("distractorFields.picks", { count: picks.get(distractor.id) ?? 0 })}</p>
                )}
                <div class="edit-actions">
                  <button
                    type="button"
                    id={editButtonId(distractor.id)}
                    class="secondary"
                    aria-label={t("distractorFields.editLabel", { option: named(distractor) })}
                    aria-disabled={busy || editing !== null}
                    onClick={() => !busy && editing === null && start(distractor)}
                  >
                    {t("distractorFields.edit")}
                  </button>
                  <button
                    type="button"
                    class="secondary"
                    aria-label={t(distractor.retired ? "distractorFields.restoreLabel" : "distractorFields.retireLabel", {
                      option: named(distractor),
                    })}
                    aria-disabled={busy}
                    onClick={() => !busy && change((distractor.retired ? restoreDistractor : retireDistractor)(distractors, distractor.id))}
                  >
                    {t(distractor.retired ? "distractorFields.restore" : "distractorFields.retire")}
                  </button>
                  <button
                    type="button"
                    class="danger"
                    aria-label={t("distractorFields.deleteLabel", { option: named(distractor) })}
                    aria-disabled={busy}
                    onClick={() => remove(distractor)}
                  >
                    {t("distractorFields.delete")}
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
      <ErrorMessage id="distractor-fields-error" error={errorText(refusal)} />
      {issues.length > 0 && (
        <ul class="distractor-issues" aria-label={t("distractorFields.issues")}>
          {issues.map((issue) => (
            <li key={issue} class="warning">
              {issue}
            </li>
          ))}
        </ul>
      )}
      {editing?.id === null ? (
        editor(editing)
      ) : (
        <button
          type="button"
          id="distractor-add"
          class="secondary"
          aria-disabled={busy || editing !== null}
          onClick={() => !busy && editing === null && start(null)}
        >
          {t("distractorFields.add")}
        </button>
      )}
    </fieldset>
  );
}
