import { isMarkdown } from "@solid-memo/domain/deck";
import { chapterOfStep, DRAFT_CARD_FILTERS, draftCardLanguages, draftCardRows, type DraftCardFilter } from "@solid-memo/domain/release/draftOutline";
import { liveSteps, type QuestionPlace, type ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { DataLine } from "@solid-memo/ui/DataText";
import { useI18n } from "@solid-memo/ui/i18n";
import { Pager, paginate } from "@solid-memo/ui/Pager";
import type { DraftEditor, DraftReadOnly } from "./draftEditor";
import type { DraftLinks } from "./DraftOverviewScreen";
import { DraftScope, DraftStatus } from "./DraftParts";
import { NewQuestionForm } from "./NewQuestionForm";

/** How many cards a page of the table shows. */
export const DRAFT_CARDS_PAGE = 50;

/** How the table is looked at, as its URL holds it: a filter, a language, a page. */
export interface DraftCardsView {
  filter?: DraftCardFilter;
  language?: string;
  page?: number;
}

/** A view as the URL holds it: what it leaves out (no filter, any language, the first page) not stated. */
function cleanView({ filter, language, page }: { filter?: DraftCardFilter | undefined; language?: string | undefined; page?: number | undefined }): DraftCardsView {
  return {
    ...(filter === undefined ? {} : { filter }),
    ...(language === undefined ? {} : { language }),
    ...(page === undefined || page === 1 ? {} : { page }),
  };
}

/**
 * A draft's cards as a table (docs/studio.md, A draft's cards): a row
 * each, by id, its front a link to its editor, its back, where it is
 * asked, its wrong options in use and whether it is retired. The URL
 * holds the view (`view`): a filter (asked nowhere, asked from two
 * places, too few wrong options, retired), a language its front or back
 * has text in, and the page, 50 cards each; a change of the filter or
 * the language goes back to the first. A new card is added under it,
 * asked nowhere yet: a course's is placed in its editor.
 */
export function DraftCardsScreen({
  draft,
  view,
  readOnly,
  status,
  links,
  onView,
  onEdit,
}: {
  draft: ReleaseDraft;
  view: DraftCardsView;
  readOnly: DraftReadOnly | null;
  status: Pick<DraftEditor, "saving" | "failure">;
  links: DraftLinks;
  onView: (view: DraftCardsView) => void;
  onEdit: DraftEditor["edit"];
}) {
  const { t, readerText } = useI18n();
  const rows = draftCardRows(draft, { ...(view.filter === undefined ? {} : { filter: view.filter }), ...(view.language === undefined ? {} : { language: view.language }) });
  const page = paginate(rows, view.page ?? 1, DRAFT_CARDS_PAGE);
  const languages = draftCardLanguages(draft);
  const chapterName = (id: string) => {
    const title = draft.chapters.find((node) => node.id === id)?.data.title;
    return title === undefined ? id : readerText(title);
  };
  const placeName = (place: QuestionPlace | null) => {
    if (place === null) return t("studio.question.nowhere");
    if (place.kind === "review") return t("studio.question.atReview", { chapter: chapterName(place.chapter) });
    const chapter = chapterOfStep(draft, place.step);
    const number = chapter === null ? -1 : liveSteps(draft, chapter).findIndex((node) => node.id === place.step);
    return number === -1 ? place.step : t("studio.question.atStep", { chapter: chapterName(chapter!), step: number + 1 });
  };
  const languageName = (tag: string) => (tag === "unstated" ? t("studio.draftCards.unstated") : tag);

  return (
    <section>
      <header>
        <h2>{t(draft.course ? "studio.draftCards.headingCourse" : "studio.draftCards.heading", {
            draft: draft.root.title === undefined ? t("studio.draft.untitled") : readerText(draft.root.title),
          })}</h2>
        <p class="hint">
          <a href={links.overviewHref}>{t("studio.draftCards.overview")}</a>
        </p>
      </header>
      <DraftStatus editor={status} />
      <div class="studio-filters">
        <label>
          {t("studio.draftCards.filter")}
          <select
            value={view.filter ?? ""}
            onChange={(event) => {
              const value = event.currentTarget.value;
              onView(cleanView({ ...view, filter: DRAFT_CARD_FILTERS.find((known) => known === value), page: undefined }));
            }}
          >
            <option value="">{t("studio.draftCards.all")}</option>
            {DRAFT_CARD_FILTERS.filter((filter) => draft.course || filter === "fewDistractors" || filter === "retired").map((filter) => (
              <option key={filter} value={filter}>
                {t(`studio.draftCards.filters.${filter}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("studio.draftCards.language")}
          <select
            value={view.language ?? ""}
            onChange={(event) => {
              const value = event.currentTarget.value;
              onView(cleanView({ ...view, language: value === "" ? undefined : value, page: undefined }));
            }}
          >
            <option value="">{t("studio.draftCards.anyLanguage")}</option>
            {[...new Set([...languages, ...(view.language === undefined ? [] : [view.language])])].map((tag) => (
              <option key={tag} value={tag}>
                {languageName(tag)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p role="status">{t("studio.draftCards.count", { count: rows.length })}</p>
      {rows.length > 0 && (
        <div class="studio-table">
          <table class="studio-list">
            <caption class="visually-hidden">{t("studio.draftCards.caption")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("studio.draftCards.column.front")}</th>
                <th scope="col">{t("studio.draftCards.column.back")}</th>
                {draft.course && <th scope="col">{t("studio.draftCards.column.place")}</th>}
                <th scope="col" class="number">
                  {t("studio.draftCards.column.distractors")}
                </th>
                <th scope="col">{t("studio.draftCards.column.id")}</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((row) => {
                const markdown = isMarkdown(row.card.textFormat);
                return (
                  <tr key={row.id}>
                    <th scope="row">
                      <a href={links.questionHref(row.id)}>
                        {row.card.front === undefined ? row.id : <DataLine text={row.card.front} markdown={markdown} />}
                      </a>
                      {row.retired && <span class="hint"> {t("studio.draftCards.retired")}</span>}
                    </th>
                    <td>{row.card.back === undefined ? "" : <DataLine text={row.card.back} markdown={markdown} />}</td>
                    {draft.course && <td>{row.asked > 1 ? t("studio.draftCards.askedTimes", { count: row.asked }) : placeName(row.place)}</td>}
                    <td class="number">{row.distractors}</td>
                    <td>
                      <code>{row.id}</code>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {page.pageCount > 1 && <Pager page={page.currentPage} pageCount={page.pageCount} onPageChange={(next) => onView(cleanView({ ...view, page: next }))} />}
      <DraftScope readOnly={readOnly} draftsHref={links.draftsHref} healthHref={links.healthHref}>
        <NewQuestionForm
          id="draft-cards-new"
          draft={draft}
          place={null}
          legend={t(draft.course ? "studio.draftCards.newQuestion" : "studio.draft.newCard")}
          onAdd={(changes) => onEdit(changes) === null}
        />
      </DraftScope>
    </section>
  );
}
