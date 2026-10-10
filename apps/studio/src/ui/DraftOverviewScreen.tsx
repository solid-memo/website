import { useState } from "preact/hooks";
import type { LangText } from "@solid-memo/domain/langText";
import { chapterIdFor } from "@solid-memo/domain/release/courseIds";
import { retiredChapters } from "@solid-memo/domain/release/draftOutline";
import type { ReleaseProblem } from "@solid-memo/domain/release/problems";
import { problemCounts, type DraftField } from "@solid-memo/domain/release/releaseCheck";
import type { DraftChange, ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n } from "@solid-memo/ui/i18n";
import { draftOf, LangTextField, rememberLanguages, textOfDraft, type DraftEntry } from "@solid-memo/ui/LangTextField";
import { ReaderText } from "@solid-memo/ui/ReaderText";
import { recentLanguages } from "@solid-memo/ui/remembered";
import type { DraftEditor, DraftReadOnly } from "./draftEditor";
import { DraftOutline } from "./DraftOutline";
import { DraftScope, DraftStatus, DraftTextField, IdField, idUsable } from "./DraftParts";
import { NewQuestionForm } from "./NewQuestionForm";

/** What a draft's screens link to. */
export interface DraftLinks {
  draftsHref: string;
  healthHref: string;
  overviewHref: string;
  cardsHref: string;
  chapterHref: (chapter: string) => string;
  stepHref: (step: string) => string;
  questionHref: (card: string) => string;
  /** The draft's release check, for a pod. */
  checkHref: string;
  /** The draft as the library will list it. */
  previewHref: string;
  /** The draft played in a sandbox. */
  trialHref: string;
  /** The draft against the release it follows. */
  diffHref: string;
  /** What the release says of itself beyond its listing, how it was made and from what. */
  releaseHref: string;
}

/** The release check of the draft as the overview counts it: its problems, undefined while it runs, or why it did not. */
export interface OverviewCheck {
  problems: ReleaseProblem[] | undefined;
  error: unknown;
}

/** A text to set, or (empty) to clear. */
export function textOrNull(text: LangText): LangText | null {
  return Object.keys(text).length === 0 ? null : text;
}

/**
 * A draft's overview (docs/studio.md, A draft's overview): what the
 * release says of itself (its title and description, saved as they are
 * typed), and for a course its outline (DraftOutline), a new chapter (its
 * title, and its id as the id assistant suggests it), and its chapters
 * retired, to restore. Its cards are counted, with a link to their table;
 * a deck's are added here. The release check (for a pod) counts its
 * problems, each chapter's and step's beside it in the outline, and
 * links to the check and the listing preview. A draft released is
 * shown, frozen. Opened at a field (`field`, from the release check),
 * that field is where the user arrives.
 */
export function DraftOverviewScreen({
  draft,
  readOnly,
  status,
  links,
  check,
  field,
  onEdit,
}: {
  draft: ReleaseDraft;
  readOnly: DraftReadOnly | null;
  status: Pick<DraftEditor, "saving" | "failure">;
  links: DraftLinks;
  check: OverviewCheck;
  field?: DraftField;
  onEdit: DraftEditor["edit"];
}) {
  const { t, readerText, errorText } = useI18n();
  const held = readOnly !== null;
  const title = draft.root.title ?? {};
  const retired = retiredChapters(draft);

  return (
    <section>
      <header>
        <h2>{Object.keys(title).length === 0 ? t("studio.draft.untitled") : <ReaderText text={title} />}</h2>
        <p class="hint">
          {t("studio.drafts.summary", { kind: t(`studio.drafts.kind.${draft.course ? "course" : "deck"}`), version: draft.root.version ?? "1" })}
        </p>
      </header>
      <DraftStatus editor={status} />
      <DraftScope readOnly={readOnly} draftsHref={links.draftsHref} healthHref={links.healthHref}>
        <section aria-labelledby="draft-about-heading">
          <h3 id="draft-about-heading">{t("studio.draft.about")}</h3>
          <DraftTextField
            id="draft-title"
            label={t("studio.draft.title")}
            role="title"
            field={t("language.field.title")}
            text={draft.root.title}
            disabled={held}
            arrival={field === "title"}
            onSave={(text) => onEdit([{ kind: "setMeta", meta: { title: textOrNull(text) } }], { debounce: true })}
          />
          <DraftTextField
            id="draft-description"
            label={t("studio.draft.description")}
            role="description"
            field={t("language.field.description")}
            text={draft.root.description}
            multiline
            disabled={held}
            arrival={field === "description"}
            onSave={(text) => onEdit([{ kind: "setMeta", meta: { description: textOrNull(text) } }], { debounce: true })}
          />
          <p>
            <a href={links.releaseHref}>{t("studio.draft.releaseLink")}</a>
          </p>
        </section>
        {draft.course && (
          <section aria-labelledby="draft-outline-heading">
            <h3 id="draft-outline-heading" tabIndex={-1} data-arrival={field === "outline" || undefined}>
              {t("studio.draft.outline")}
            </h3>
            <p class="hint">{t("studio.draft.outlineHint")}</p>
            <DraftOutline
              draft={draft}
              readOnly={held}
              chapterHref={links.chapterHref}
              stepHref={links.stepHref}
              questionHref={links.questionHref}
              checkHref={links.checkHref}
              problems={problemCounts(draft, check.problems ?? [])}
              onEdit={(changes) => onEdit(changes)}
            />
            <NewChapterForm draft={draft} onAdd={(changes) => onEdit(changes) === null} />
            {retired.length > 0 && (
              <>
                <h4>{t("studio.draft.retiredChapters")}</h4>
                <ul>
                  {retired.map((node) => (
                    <li key={node.id}>
                      <a href={links.chapterHref(node.id)}>{node.data.title === undefined ? node.id : readerText(node.data.title)}</a>{" "}
                      <button type="button" onClick={() => onEdit([{ kind: "restore", of: "chapter", id: node.id }])}>
                        {t("studio.draftEdit.restore")}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}
        <section aria-labelledby="draft-cards-heading">
          <h3 id="draft-cards-heading">{t(draft.course ? "studio.draft.questions" : "studio.draft.cards")}</h3>
          <p>
            {t("studio.draft.cardCount", { count: draft.cards.length })} <a href={links.cardsHref}>{t("studio.draft.allCards")}</a>
          </p>
          {!draft.course && (
            <NewQuestionForm id="draft-new-card" draft={draft} place={null} legend={t("studio.draft.newCard")} onAdd={(changes) => onEdit(changes) === null} />
          )}
        </section>
        <section aria-labelledby="draft-problems-heading">
          <h3 id="draft-problems-heading">{t("studio.draft.problems")}</h3>
          {check.problems === undefined ? (
            check.error ? <ErrorMessage error={errorText(check.error)} /> : <p class="hint">{t("studio.draft.problemsChecking")}</p>
          ) : (
            <p>{check.problems.length === 0 ? t("studio.draft.problemsNone") : t("studio.draft.problemsCount", { count: check.problems.length })}</p>
          )}
          <p>
            <a href={links.checkHref}>{t("studio.draft.problemsLink")}</a> · <a href={links.previewHref}>{t("studio.draft.previewLink")}</a> ·{" "}
            <a href={links.trialHref}>{t("studio.draft.trialLink")}</a>
            {draft.root.prev !== undefined && (
              <>
                {" · "}
                <a href={links.diffHref}>{t("studio.draft.diffLink")}</a>
              </>
            )}
          </p>
        </section>
      </DraftScope>
    </section>
  );
}

/**
 * A new chapter of a course: its title, in the languages the user
 * states, and its id, as the id assistant makes it of the title
 * (chapterIdFor) until the user writes another. Added last among the
 * chapters; the form is then empty again.
 */
function NewChapterForm({ draft, onAdd }: { draft: ReleaseDraft; onAdd: (changes: DraftChange[]) => boolean }) {
  const { t } = useI18n();
  const [title, setTitle] = useState(() => draftOf(undefined, [], { tag: recentLanguages("deck")[0] ?? null }));
  const [typedId, setTypedId] = useState<string | null>(null);
  const [missing, setMissing] = useState<DraftEntry | undefined>(undefined);
  const text = textOfDraft(title);
  const id = typedId ?? chapterIdFor(draft, "text" in text ? text.text : {});

  function submit(event: Event) {
    event.preventDefault();
    if ("missing" in text) {
      setMissing(text.missing);
      return;
    }
    setMissing(undefined);
    if (!idUsable(draft, id)) return;
    const titled = textOrNull(text.text);
    if (!onAdd([{ kind: "addChapter", id, ...(titled === null ? {} : { text: { title: titled } }) }])) return;
    rememberLanguages("deck", text.text, title);
    setTypedId(null);
    setTitle(draftOf(undefined, [], { tag: title[0]!.tag }));
  }

  return (
    <form class="card-edit" onSubmit={submit}>
      <fieldset>
        <legend>{t("studio.draft.newChapter")}</legend>
        <LangTextField
          id="new-chapter-title"
          label={t("studio.draft.chapterTitle")}
          role="title"
          draft={title}
          suggestions={[]}
          missing={missing}
          errorId="new-chapter-error"
          onChange={(next) => {
            setMissing(undefined);
            setTitle(next);
          }}
        />
        <IdField id="new-chapter-id" draft={draft} value={id} onChange={setTypedId} />
        <p id="new-chapter-error" class="error" role="alert">
          {missing !== undefined && t("studio.draftEdit.chooseLanguage", { field: t("language.field.title") })}
        </p>
        <button type="submit">{t("studio.draft.addChapter")}</button>
      </fieldset>
    </form>
  );
}
