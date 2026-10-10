import type { ComponentChildren } from "preact";
import type { Card } from "@solid-memo/domain/deck";
import { cardName } from "@solid-memo/ui/DataText";
import { useI18n } from "@solid-memo/ui/i18n";
import { CARD_TABS, type CardTab } from "./router";
import { ContextTabs } from "./shell/ContextTabs";

/**
 * How a card stands to the release its deck was copied from:
 * - `none`: the deck is not a copy, or the card is the user's own;
 * - `same`: the card is as the release has it, so a newer release updates it;
 * - `changed`: the user changed it, so a newer release no longer does.
 */
export type CardReleaseLink = "none" | "same" | "changed";

/**
 * The card inspector: one card of a deck, its name as the heading, then
 * a word on its release when the deck is a copy of a library deck or a
 * course (an edit of a card still as the release has it detaches it: a
 * newer release no longer updates it), the tabs (`tab`, in the URL:
 * the card's content, its wrong options, its schedule or its history, each a link,
 * which changes the view without a Back stop through `onTab`), and the
 * tab's panel. Beside the deck's cards, Previous and Next show the card
 * before it in the workbench's list, or the one after (`steps`; none at
 * either end), as k and j do.
 */
export function CardInspectorScreen({
  card,
  release,
  tab,
  tabHref,
  onTab,
  appHref,
  steps,
  children,
}: {
  card: Card;
  release: CardReleaseLink;
  tab: CardTab;
  tabHref: (tab: CardTab) => string;
  onTab: (tab: CardTab) => void;
  /** The card's page in Solid Memo. */
  appHref: string;
  /** Show the card before this one in the list beside it, or the one after; null at either end. */
  steps?: { previous: (() => void) | null; next: (() => void) | null };
  /** The tab's panel. */
  children: ComponentChildren;
}) {
  const { t, readerText } = useI18n();
  const count = card.distractors?.length ?? 0;
  return (
    <section class="card-inspector">
      <header>
        <h2>{t("studio.card.heading", { card: cardName(card, readerText) })}</h2>
        {card.retired && <span class="studio-badge">{t("retiredCards.tag")}</span>}
        {steps !== undefined && (
          <div class="studio-card-steps" role="group" aria-label={t("studio.card.steps")}>
            <button type="button" aria-keyshortcuts="k" disabled={steps.previous === null} onClick={steps.previous ?? undefined}>
              {t("studio.card.previous")}
            </button>
            <button type="button" aria-keyshortcuts="j" disabled={steps.next === null} onClick={steps.next ?? undefined}>
              {t("studio.card.next")}
            </button>
          </div>
        )}
      </header>
      {release === "same" && (
        <p class="warning" role="note">
          {t("studio.card.releaseSame")}
        </p>
      )}
      {release === "changed" && (
        <p class="hint" role="note">
          {t("studio.card.releaseChanged")}
        </p>
      )}
      <ContextTabs
        label={t("studio.card.tabs")}
        tabs={CARD_TABS.map((each) => ({
          key: each,
          href: tabHref(each),
          label: each === "distractors" ? t("studio.card.tab.distractors", { count }) : t(`studio.card.tab.${each}`),
          current: each === tab && "page",
        }))}
        onFollow={onTab}
      />
      <div class="studio-tab-panel">{children}</div>
      <p class="hint">
        <a href={appHref}>{t("studio.card.openInApp")}</a>
      </p>
    </section>
  );
}
