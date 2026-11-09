// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { memo } from "preact/compat";
import { useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
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
import type { MdPhrase } from "@solid-memo/markdown/parse";
import { OPTION, PROSE } from "@solid-memo/markdown/problems";
import { useAskFirst } from "./askFirst";
import { useCardText } from "./cardLanguage";
import { DataLine, plainDataText } from "./DataText";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n } from "./i18n";
import {
  draftOf,
  LangTextField,
  languageButtonId,
  textOfDraft,
  type DraftEntry,
  type LangTextDraft,
} from "./LangTextField";
import { optionPhrases } from "./markdownCache";
import { useEntryHints } from "./MarkdownEditing";

const NONE_PUBLISHED: ReadonlySet<string> = new Set();

/** The id of an option's Edit button: where focus returns when its editor closes. */
const editButtonId = (id: string) => `distractor-${id}-edit`;

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
 *
 * A card may have thousands of options. Each one's Markdown is parsed once
 * for as long as the card is shown (optionPhrases), and writing an option,
 * or anything else that draws this list again, draws again only the options
 * that change (OptionRow).
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
  arrival,
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
  /** The option (by id) the screen was opened at (a link to it): its Edit button is where the user arrives. */
  arrival?: string;
  /** Nothing, or, for a change saved at once, whether it was saved. */
  onChange: (distractors: Distractor[]) => void | Promise<boolean>;
}) {
  const { t, languageLabel, errorText } = useI18n();
  const { cardText } = useCardText();
  const askFirst = useAskFirst();
  const hintsOf = useEntryHints();
  // One cache per card: the shared one keeps fewer texts than a card may have options.
  const phrasesOf = useMemo(optionPhrases, [cardId]);
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
    document
      .getElementById(
        languageButtonId(
          missing.field === "text" ? "distractor-text" : "distractor-note",
          missing.entry,
        ),
      )
      ?.focus();
  }, [missing]);

  const named = (distractor: Distractor) => plainDataText(cardText(distractor.text), markdown, 60);
  const backTag = shownTag(back) ?? null;

  function start(distractor: Distractor | null) {
    if (busy || editing !== null) return;
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
    if ("missing" in text)
      return setEditing({
        ...editing,
        missing: { field: "text", entry: text.missing },
        error: null,
      });
    const note = textOfDraft(editing.note, { trim: !formatted });
    if ("missing" in note)
      return setEditing({
        ...editing,
        missing: { field: "note", entry: note.missing },
        error: null,
      });
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

  function retireOrRestore(distractor: Distractor) {
    if (busy) return;
    const toggle = distractor.retired ? restoreDistractor : retireDistractor;
    change(toggle(distractors, distractor.id));
  }

  function remove(distractor: Distractor, at: number) {
    if (busy) return;
    const edit = deleteDistractor(distractors, at, published);
    // One the release published is refused at once, saying to retire it instead.
    if (!edit.ok) return setRefusal(edit.error);
    askFirst({
      heading: t("distractorFields.deleteHeading"),
      text: t("distractorFields.deleteConfirm", { option: named(distractor) }),
      action: t("distractorFields.delete"),
      onConfirm: () => {
        focusNext.current = "distractor-add";
        change(edit.distractors);
      },
    });
  }

  // The same object from one drawing to the next, so a row needs drawing again
  // only for its own data; what it does is always what this drawing would do.
  const actions = useRef<OptionActions>({ start, retireOrRestore, remove });
  actions.current = { start, retireOrRestore, remove };

  // A card may have thousands of wrong options, each with its issues: the
  // issues are found once a change, not on every render, and each tag's
  // label is looked up once, however many options name it.
  const issues = useMemo(() => {
    const labels = new Map<string, string>();
    const label = (tag: string) => {
      let known = labels.get(tag);
      if (known === undefined) {
        known = tag === "" ? t("distractorFields.noLanguage") : languageLabel(tag);
        labels.set(tag, known);
      }
      return known;
    };
    // An issue lists a few of the tags and counts the rest.
    const languages = (tags: readonly string[], more: number) => {
      const listed = tags.map(label).join(", ");
      return more === 0
        ? listed
        : t("distractorFields.issue.moreLanguages", { languages: listed, count: more });
    };
    // Each is looked up by id, the first of an id, as a search of the list finds it.
    const byId = new Map<string, Distractor>();
    for (const distractor of distractors)
      if (!byId.has(distractor.id)) byId.set(distractor.id, distractor);
    const issueText = (issue: DistractorIssue): string[] => {
      if (issue.code === "fewDistractors")
        return [t("distractorFields.issue.few", { count: issue.count, least: issue.least })];
      const option = plainDataText(cardText(byId.get(issue.id)!.text), markdown, 60);
      return [
        ...(issue.missing.length === 0
          ? []
          : [
              t("distractorFields.issue.missing", {
                option,
                languages: languages(issue.missing, issue.moreMissing),
              }),
            ]),
        ...(issue.extra.length === 0
          ? []
          : [
              t("distractorFields.issue.extra", {
                option,
                languages: languages(issue.extra, issue.moreExtra),
              }),
            ]),
      ];
    };
    return distractorIssues({ back, distractors }, "pod").flatMap(issueText);
  }, [back, distractors, t, languageLabel, cardText, markdown]);

  const editor = (state: Editing) => (
    <div class="distractor-editor" onKeyDown={onKeyDown}>
      <LangTextField
        id="distractor-text"
        label={t("distractorFields.text")}
        role="distractor"
        draft={state.text}
        suggestions={suggestions}
        disabled={busy}
        entryHints={markdown ? hintsOf("distractor-text", OPTION) : undefined}
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
        entryHints={markdown ? hintsOf("distractor-note", PROSE) : undefined}
        missing={state.missing?.field === "note" ? state.missing.entry : undefined}
        errorId="distractor-error"
        onChange={(note) => setEditing({ ...state, note, missing: undefined, error: null })}
      />
      <ErrorMessage
        id="distractor-error"
        error={errorText(
          state.missing === undefined
            ? state.error
            : new AppError("textNeedsLanguage", {
                field: t(
                  state.missing.field === "text"
                    ? "language.field.distractor"
                    : "language.field.distractorNote",
                ),
              }),
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
          {distractors.map((distractor, at) =>
            editing?.id === distractor.id ? (
              <li key={distractor.id}>{editor(editing)}</li>
            ) : (
              <OptionRow
                key={distractor.id}
                distractor={distractor}
                at={at}
                markdown={markdown}
                phrasesOf={phrasesOf}
                busy={busy}
                editingAny={editing !== null}
                picked={picks === undefined ? undefined : (picks.get(distractor.id) ?? 0)}
                arrival={distractor.id === arrival}
                actions={actions}
              />
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
          onClick={() => start(null)}
        >
          {t("distractorFields.add")}
        </button>
      )}
    </fieldset>
  );
}

/** What an option's buttons do, as of the list's latest drawing. */
interface OptionActions {
  start: (distractor: Distractor) => void;
  retireOrRestore: (distractor: Distractor) => void;
  remove: (distractor: Distractor, at: number) => void;
}

/**
 * One option of the list, drawn again only when something it shows
 * changes: the props are its own data, and `actions` stays the same.
 */
const OptionRow = memo(function OptionRow({
  distractor,
  at,
  markdown,
  phrasesOf,
  busy,
  editingAny,
  picked,
  arrival,
  actions,
}: {
  distractor: Distractor;
  /** Its place in the card's list. */
  at: number;
  markdown: boolean;
  phrasesOf: (text: string) => MdPhrase[] | null;
  busy: boolean;
  /** An option is being written, so none can be opened. */
  editingAny: boolean;
  /** How often it was chosen; undefined when that is not shown. */
  picked: number | undefined;
  /** The screen was opened at this option. */
  arrival: boolean;
  actions: { current: OptionActions };
}) {
  const { t } = useI18n();
  const { cardText } = useCardText();
  const option = plainDataText(cardText(distractor.text), markdown, 60);
  return (
    <li class={distractor.retired ? "retired" : undefined}>
      <p class="distractor-text">
        <DataLine text={distractor.text} markdown={markdown} phrasesOf={phrasesOf} />
        {distractor.retired && (
          <>
            {" "}
            <span class="retired-tag">{t("distractorFields.retiredTag")}</span>
          </>
        )}
      </p>
      {distractor.note !== undefined && (
        <p class="hint distractor-note">
          <DataLine text={distractor.note} markdown={markdown} phrasesOf={phrasesOf} />
        </p>
      )}
      <p class="hint distractor-id">{distractor.id}</p>
      {picked !== undefined && (
        <p class="hint distractor-picks">{t("distractorFields.picks", { count: picked })}</p>
      )}
      <div class="edit-actions">
        <button
          type="button"
          id={editButtonId(distractor.id)}
          data-arrival={arrival || undefined}
          class="secondary"
          aria-label={t("distractorFields.editLabel", { option })}
          aria-disabled={busy || editingAny}
          onClick={() => actions.current.start(distractor)}
        >
          {t("distractorFields.edit")}
        </button>
        <button
          type="button"
          class="secondary"
          aria-label={t(
            distractor.retired ? "distractorFields.restoreLabel" : "distractorFields.retireLabel",
            { option },
          )}
          aria-disabled={busy}
          onClick={() => actions.current.retireOrRestore(distractor)}
        >
          {t(distractor.retired ? "distractorFields.restore" : "distractorFields.retire")}
        </button>
        <button
          type="button"
          class="danger"
          aria-label={t("distractorFields.deleteLabel", { option })}
          aria-disabled={busy}
          onClick={() => actions.current.remove(distractor, at)}
        >
          {t("distractorFields.delete")}
        </button>
      </div>
    </li>
  );
});
