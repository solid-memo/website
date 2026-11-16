// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useState } from "preact/hooks";
import { useI18n } from "@solid-memo/ui/i18n";

/**
 * The first `limit` of a list the release screen shows, and how many
 * more there are. A release can state any number of a thing, so each
 * of its lists on the screen is bounded so; those it doesn't list stay
 * in the release.
 */
export function bounded<T>(all: readonly T[], limit: number): { shown: T[]; more: number } {
  return { shown: all.slice(0, limit), more: Math.max(0, all.length - limit) };
}

/** How many more of a list the release states than the screen lists, if any. */
export function MoreInRelease({ count }: { count: number }) {
  const { t } = useI18n();
  return count > 0 ? <p class="hint">{t("studio.release.othersMore", { count })}</p> : null;
}

/**
 * The first page of a list a draft can make as long as it likes (a
 * course's chapters, a chapter's steps, a step's questions), and how
 * many more there are: `limit` at first, `limit` more each time the user
 * asks for them (`showMore`, ShowMore's button).
 */
export function usePage<T>(
  all: readonly T[],
  limit: number,
): { shown: T[]; more: number; showMore: () => void } {
  const [count, setCount] = useState(limit);
  return { ...bounded(all, count), showMore: () => setCount((was) => was + limit) };
}

/** A button that shows up to `limit` more of a list usePage pages, while it has `more`. */
export function ShowMore({
  more,
  limit,
  onShow,
}: {
  more: number;
  limit: number;
  onShow: () => void;
}) {
  const { t } = useI18n();
  return more > 0 ? (
    <button type="button" onClick={onShow}>
      {t("studio.draftEdit.showMore", { count: Math.min(more, limit) })}
    </button>
  ) : null;
}
