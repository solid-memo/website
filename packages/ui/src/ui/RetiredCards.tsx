import { useState } from "preact/hooks";
import { activeCards } from "@solid-memo/domain/deck";
import { useI18n } from "./i18n";

/**
 * A browser's cards as it lists them: the retired ones (kept, with their
 * review history, but no longer studied) only when the user asks, with
 * the checkbox that asks. The checkbox shows only when there are any.
 */
export function useRetiredCards<T extends { retired?: true }>(
  cards: T[],
): { listed: T[]; retiredCount: number; toggle: preact.JSX.Element | null } {
  const { t } = useI18n();
  const [showRetired, setShowRetired] = useState(false);
  const retiredCount = cards.length - activeCards(cards).length;
  const toggle =
    retiredCount === 0 ? null : (
      <p class="retired-toggle">
        <label>
          <input
            type="checkbox"
            checked={showRetired}
            onChange={(e) => setShowRetired(e.currentTarget.checked)}
            aria-describedby="retired-cards-hint"
          />
          {t("retiredCards.showToggle")}
        </label>{" "}
        <span id="retired-cards-hint" class="hint">
          {t("retiredCards.toggleHint", { count: retiredCount })}
        </span>
      </p>
    );
  return { listed: showRetired ? cards : activeCards(cards), retiredCount, toggle };
}

/** The mark on a retired card's row. */
export function RetiredTag() {
  const { t } = useI18n();
  return <span class="retired-tag">{t("retiredCards.tag")}</span>;
}

/** On a retired card's page: why it is not studied. */
export function RetiredNotice() {
  const { t } = useI18n();
  return (
    <p class="hint" role="note">
      {t("retiredCards.notice")}
    </p>
  );
}
