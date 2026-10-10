import { useState } from "preact/hooks";
import { isMarkdown } from "@solid-memo/domain/deck";
import type { LangText } from "@solid-memo/domain/langText";
import { isPublished, reviewQuestionsOf, stepIdFor } from "@solid-memo/domain/release/courseIds";
import { draftCardOf, retiredSteps } from "@solid-memo/domain/release/draftOutline";
import type { ChapterField } from "@solid-memo/domain/release/releaseCheck";
import { liveChapters, liveSteps, type ChapterText, type ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { cardName, DataText } from "@solid-memo/ui/DataText";
import { useI18n } from "@solid-memo/ui/i18n";
import { ReaderText } from "@solid-memo/ui/ReaderText";
import type { DraftEditor, DraftReadOnly } from "./draftEditor";
import type { DraftLinks } from "./DraftOverviewScreen";
import { DraftProseField, DraftScope, DraftStatus, DraftTextField, IdField, idUsable } from "./DraftParts";
import { LifeActions } from "./LifeActions";
import { NewQuestionForm } from "./NewQuestionForm";

/**
 * The text format prose of a draft states, as its Markdown toggle sets
 * it: `sm:markdown` on; off, none (plain text), unless it states a format
 * this app does not know, which is kept.
 */
export function proseFormat(markdown: boolean, was: string | undefined): string | undefined {
  if (markdown) return SM.markdown;
  return isMarkdown(was) ? undefined : was;
}

/**
 * A chapter of a course draft (docs/studio.md, A chapter): its title,
 * always plain text, and its description, with its Markdown toggle and
 * preview, both saved as they are typed; its steps in order, each moved
 * up or down, a new one added under the id the assistant suggests, and
 * its retired ones restored; the questions it asks only in its final
 * review, and a new one; and the chapter retired, restored or deleted
 * (one an earlier release published is only retired). Opened at a field
 * (`field`, from the release check), that field is where the user
 * arrives.
 */
export function ChapterEditorScreen({
  draft,
  chapter,
  readOnly,
  status,
  links,
  field,
  onEdit,
  onDeleted,
}: {
  draft: ReleaseDraft;
  chapter: string;
  readOnly: DraftReadOnly | null;
  status: Pick<DraftEditor, "saving" | "failure">;
  links: DraftLinks;
  field?: ChapterField;
  onEdit: DraftEditor["edit"];
  onDeleted: () => void;
}) {
  const { t, readerText } = useI18n();
  const held = readOnly !== null;
  const data = draft.chapters.find((node) => node.id === chapter)!.data;
  const text: ChapterText = { title: data.title, description: data.description, textFormat: data.textFormat };
  const number = liveChapters(draft).findIndex((node) => node.id === chapter);
  const steps = liveSteps(draft, chapter);
  const retired = retiredSteps(draft, chapter);
  const name = data.title === undefined ? chapter : readerText(data.title);
  const [stepId, setStepId] = useState<string | null>(null);
  const newStep = stepId ?? stepIdFor(draft, chapter);

  function save(next: ChapterText) {
    onEdit([{ kind: "editChapter", id: chapter, text: next }], { debounce: true });
  }

  function addStep(event: Event) {
    event.preventDefault();
    if (!idUsable(draft, newStep)) return;
    if (onEdit([{ kind: "addStep", id: newStep, chapter }]) === null) setStepId(null);
  }

  return (
    <section>
      <header>
        <h2>{data.title === undefined ? t("studio.chapter.untitled", { id: chapter }) : <ReaderText text={data.title} />}</h2>
        <p class="hint">
          {data.deprecated === true ? t("studio.chapter.retired") : t("studio.chapter.number", { number: number + 1, count: liveChapters(draft).length })}{" "}
          <code>{chapter}</code>
        </p>
      </header>
      <DraftStatus editor={status} />
      <DraftScope readOnly={readOnly} draftsHref={links.draftsHref} healthHref={links.healthHref}>
        <DraftTextField
          id="chapter-title"
          label={t("studio.chapter.title")}
          role="title"
          field={t("language.field.title")}
          text={data.title}
          disabled={held}
          arrival={field === "title"}
          onSave={(title) => save({ ...text, title: emptyAsNone(title) })}
        />
        <DraftProseField
          id="chapter-description"
          label={t("studio.chapter.description")}
          role="description"
          field={t("language.field.description")}
          text={data.description}
          markdown={isMarkdown(data.textFormat)}
          disabled={held}
          arrival={field === "description"}
          // As the course's screen shows a chapter's description.
          preview={(shown, markdown) => <DataText text={shown} markdown={markdown} />}
          onSave={(description, markdown) => save({ ...text, description: emptyAsNone(description), textFormat: proseFormat(markdown, data.textFormat) })}
        />

        <section aria-labelledby="chapter-steps-heading">
          <h3 id="chapter-steps-heading" tabIndex={-1} data-arrival={field === "steps" || undefined}>
            {t("studio.chapter.steps")}
          </h3>
          {steps.length === 0 ? (
            <p class="hint">{t("studio.outline.noSteps")}</p>
          ) : (
            <ol class="draft-order">
              {steps.map((step, index) => {
                const label = t("studio.chapter.step", { number: index + 1 });
                return (
                  <li key={step.id}>
                    <a href={links.stepHref(step.id)}>{label}</a>{" "}
                    <button
                      type="button"
                      aria-label={t("studio.chapter.stepUp", { step: label })}
                      disabled={index === 0}
                      onClick={() => onEdit([{ kind: "moveStep", id: step.id, chapter, to: index - 1 }])}
                    >
                      {t("deckList.moveUp")}
                    </button>{" "}
                    <button
                      type="button"
                      aria-label={t("studio.chapter.stepDown", { step: label })}
                      disabled={index === steps.length - 1}
                      onClick={() => onEdit([{ kind: "moveStep", id: step.id, chapter, to: index + 1 }])}
                    >
                      {t("deckList.moveDown")}
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
          <form class="card-edit" onSubmit={addStep}>
            <fieldset>
              <legend>{t("studio.chapter.newStep")}</legend>
              <IdField id="new-step-id" draft={draft} value={newStep} onChange={setStepId} />
              <button type="submit">{t("studio.chapter.addStep")}</button>
            </fieldset>
          </form>
          {retired.length > 0 && (
            <>
              <h4>{t("studio.chapter.retiredSteps")}</h4>
              <ul>
                {retired.map((step) => (
                  <li key={step.id}>
                    <a href={links.stepHref(step.id)}>
                      <code>{step.id}</code>
                    </a>{" "}
                    <button type="button" onClick={() => onEdit([{ kind: "restore", of: "step", id: step.id }])}>
                      {t("studio.draftEdit.restore")}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section aria-labelledby="chapter-review-heading">
          <h3 id="chapter-review-heading" tabIndex={-1} data-arrival={field === "review" || undefined}>
            {t("studio.chapter.review")}
          </h3>
          <p class="hint">{t("studio.chapter.reviewHint")}</p>
          <ul>
            {reviewQuestionsOf(draft, chapter).map((card) => {
              const found = draftCardOf(draft, card);
              return (
                <li key={card}>
                  <a href={links.questionHref(card)}>{found === null ? card : cardName({ ...found.content, id: card }, readerText)}</a>
                </li>
              );
            })}
          </ul>
          <NewQuestionForm
            id="chapter-new-question"
            draft={draft}
            place={{ kind: "review", chapter }}
            legend={t("studio.chapter.newReviewQuestion")}
            onAdd={(changes) => onEdit(changes) === null}
          />
        </section>

        <LifeActions
          of="chapter"
          id={chapter}
          name={name}
          retired={data.deprecated === true}
          published={isPublished(draft, chapter)}
          onEdit={(change) => onEdit([change])}
          onDeleted={onDeleted}
        />
      </DraftScope>
    </section>
  );
}

/** A text left empty as none. */
function emptyAsNone(text: LangText): LangText | undefined {
  return Object.keys(text).length === 0 ? undefined : text;
}
