import { useI18n } from "./i18n";

/** One page of a list, clamped to the pages there are. */
export interface Page<T> {
  pageCount: number;
  /** The page actually shown: 1 at the least, the last at the most. */
  currentPage: number;
  /** Index of the page's first item in the whole list. */
  firstIndex: number;
  items: T[];
}

/**
 * Cut a list into pages of `perPage`. An out-of-range page clamps to the
 * nearest one rather than failing: after removing the last item of the
 * last page, the previous page simply shows without a route change.
 */
export function paginate<T>(list: T[], page: number, perPage: number): Page<T> {
  const pageCount = Math.max(1, Math.ceil(list.length / perPage));
  const currentPage = Math.min(Math.max(1, page), pageCount);
  const firstIndex = (currentPage - 1) * perPage;
  return {
    pageCount,
    currentPage,
    firstIndex,
    items: list.slice(firstIndex, firstIndex + perPage),
  };
}

/**
 * Previous / "Page 2 of 3" / Next, for a paged list of cards. At either
 * end the button there is only aria-disabled, so one pressed onto the
 * last (or first) page keeps the focus; the page it is on is a status
 * line, read out as it changes.
 */
export function Pager({
  page,
  pageCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  const { t } = useI18n();
  return (
    <nav class="pager" aria-label={t("pager.label")}>
      <button
        onClick={() => {
          if (page > 1) onPageChange(page - 1);
        }}
        aria-disabled={page === 1}
      >
        {t("pager.previous")}
      </button>
      <span role="status">{t("pager.page", { page, pageCount })}</span>
      <button
        onClick={() => {
          if (page < pageCount) onPageChange(page + 1);
        }}
        aria-disabled={page === pageCount}
      >
        {t("pager.next")}
      </button>
    </nav>
  );
}
