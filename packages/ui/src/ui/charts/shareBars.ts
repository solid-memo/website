// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Recall } from "@solid-memo/domain/statistics";
import { useI18n } from "../i18n";

/** A bar of the share of reviews remembered, in percent; none without reviews. */
export function shareBar({ reviews, recalled }: Recall): number {
  return reviews === 0 ? 0 : (recalled / reviews) * 100;
}

/** The words for a share of reviews remembered, with the count it is of, however few; "no reviews" without. */
export function useRecallShare(): (recall: Recall) => string {
  const { t, formatPercent } = useI18n();
  return ({ reviews, recalled }) =>
    reviews === 0
      ? t("statistics.noReviewsThen")
      : t("statistics.recallShare", { percent: formatPercent(recalled / reviews), count: reviews });
}
