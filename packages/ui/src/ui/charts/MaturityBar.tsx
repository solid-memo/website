// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ComponentChildren } from "preact";
import type { CardProgress } from "@solid-memo/domain/cardProgress";
import { useI18n } from "../i18n";

/** The stages a prompt goes through, in order, with the words their counts take. */
const STAGES = [
  ["new", "statistics.maturityNew"],
  ["relearning", "statistics.maturityRelearning"],
  ["young", "statistics.maturityYoung"],
  ["mature", "statistics.maturityMature"],
] as const;

/**
 * How many prompts are new, relearning, young and mature, as one bar of
 * four steps of the green, each as wide as its share; an empty stage takes no room.
 * The legend under it gives every count, so no table is needed.
 */
export function MaturityBar({
  progress,
  caption,
}: {
  progress: CardProgress;
  caption: ComponentChildren;
}) {
  const { t } = useI18n();
  return (
    <figure class="maturity">
      <figcaption>{caption}</figcaption>
      <div
        class="maturity-bar"
        role="img"
        aria-label={t("statistics.maturityLabel", {
          new: t("statistics.maturityNew", { count: progress.new }),
          relearning: t("statistics.maturityRelearning", { count: progress.relearning }),
          young: t("statistics.maturityYoung", { count: progress.young }),
          mature: t("statistics.maturityMature", { count: progress.mature }),
        })}
      >
        {STAGES.filter(([stage]) => progress[stage] > 0).map(([stage]) => (
          <span
            key={stage}
            class={`maturity-segment maturity-${stage}`}
            style={{ flexGrow: progress[stage] }}
          />
        ))}
      </div>
      <ul class="maturity-legend hint" aria-hidden="true">
        {STAGES.map(([stage, key]) => (
          <li key={stage}>
            <span class={`maturity-swatch maturity-${stage}`} />
            {t(key, { count: progress[stage] })}
          </li>
        ))}
      </ul>
    </figure>
  );
}
