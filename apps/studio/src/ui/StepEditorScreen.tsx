import { isMarkdown } from "@solid-memo/domain/deck";
import { isPublished, questionsOfStep } from "@solid-memo/domain/release/courseIds";
import { chapterOfStep, draftCardOf } from "@solid-memo/domain/release/draftOutline";
import type { StepField } from "@solid-memo/domain/release/releaseCheck";
import { liveSteps, type ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { cardName, DataProse } from "@solid-memo/ui/DataText";
import { useI18n } from "@solid-memo/ui/i18n";
import { proseFormat } from "./ChapterEditorScreen";
import type { DraftEditor, DraftReadOnly } from "./draftEditor";
import type { DraftLinks } from "./DraftOverviewScreen";
import { DraftProseField, DraftScope, DraftStatus } from "./DraftParts";
import { LifeActions } from "./LifeActions";
import { NewQuestionForm } from "./NewQuestionForm";

/**
 * A step of a course draft (docs/studio.md, A step): its theory, in
 * each language it has, with its Markdown toggle (`sm:textFormat` of the
 * step), the hints of prose and a preview as the course player shows it
 * (DataProse, the player's `course-theory`), saved as it is typed; the
 * questions that check it, in the order the learner meets them (their
 * ids), and a new one, its id after the last; and the step retired,
 * restored or deleted (one an earlier release published is only
 * retired). Opened at a field (`field`, from the release check), that
 * field is where the user arrives.
 */
export function StepEditorScreen({
  draft,
  step,
  readOnly,
  status,
  links,
  field,
  onEdit,
  onDeleted,
}: {
  draft: ReleaseDraft;
  step: string;
  readOnly: DraftReadOnly | null;
  status: Pick<DraftEditor, "saving" | "failure">;
  links: DraftLinks;
  field?: StepField;
  onEdit: DraftEditor["edit"];
  onDeleted: () => void;
}) {
  const { t, readerText } = useI18n();
  const data = draft.steps.find((node) => node.id === step)!.data;
  const chapter = chapterOfStep(draft, step);
  const chapterData = chapter === null ? undefined : draft.chapters.find((node) => node.id === chapter)!.data;
  const number = chapter === null ? -1 : liveSteps(draft, chapter).findIndex((node) => node.id === step);
  const name = number === -1 ? step : t("studio.chapter.step", { number: number + 1 });

  return (
    <section>
      <header>
        <h2>{name}</h2>
        <p class="hint">
          {chapter !== null && (
            <>
              {t("studio.step.inChapter")} <a href={links.chapterHref(chapter)}>{chapterData!.title === undefined ? chapter : readerText(chapterData!.title)}</a>
              {" · "}
            </>
          )}
          {data.deprecated === true && `${t("studio.step.retired")} · `}
          <code>{step}</code>
        </p>
      </header>
      <DraftStatus editor={status} />
      <DraftScope readOnly={readOnly} draftsHref={links.draftsHref} healthHref={links.healthHref}>
        <DraftProseField
          id="step-theory"
          label={t("studio.step.theory")}
          role="theory"
          field={t("language.field.theory")}
          text={data.theory}
          markdown={isMarkdown(data.textFormat)}
          disabled={readOnly !== null}
          arrival={field === "theory"}
          preview={(shown, markdown) => <DataProse class="course-theory" text={shown} markdown={markdown} />}
          onSave={(theory, markdown) =>
            onEdit(
              [{ kind: "editStep", id: step, text: { ...(Object.keys(theory).length === 0 ? {} : { theory }), textFormat: proseFormat(markdown, data.textFormat) } }],
              { debounce: true },
            )
          }
        />

        <section aria-labelledby="step-questions-heading">
          <h3 id="step-questions-heading" tabIndex={-1} data-arrival={field === "questions" || undefined}>
            {t("studio.step.questions")}
          </h3>
          <p class="hint">{t("studio.step.questionsHint")}</p>
          <ol>
            {questionsOfStep(draft, step).map((card) => {
              const found = draftCardOf(draft, card);
              return (
                <li key={card}>
                  <a href={links.questionHref(card)}>{found === null ? card : cardName({ ...found.content, id: card }, readerText)}</a>
                </li>
              );
            })}
          </ol>
          <NewQuestionForm
            id="step-new-question"
            draft={draft}
            place={{ kind: "step", step }}
            legend={t("studio.step.newQuestion")}
            onAdd={(changes) => onEdit(changes) === null}
          />
        </section>

        <LifeActions
          of="step"
          id={step}
          name={name}
          retired={data.deprecated === true}
          published={isPublished(draft, step)}
          onEdit={(change) => onEdit([change])}
          onDeleted={onDeleted}
        />
      </DraftScope>
    </section>
  );
}
