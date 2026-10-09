import type { ComponentChildren } from "preact";
import type { Card } from "@solid-memo/domain/deck";
import { cardName } from "@solid-memo/ui/DataText";
import { useI18n } from "@solid-memo/ui/i18n";
import type { CardTab } from "./router";

/**
 * How a card stands to the release its deck was copied from:
 * - `none`: the deck is not a copy, or the card is the user's own;
 * - `same`: the card is as the release has it, so a newer release updates it;
 * - `changed`: the user changed it, so a newer release no longer does.
 */
export type CardReleaseLink = "none" | "same" | "changed";

const TABS: readonly CardTab[] = ["content", "distractors"];

/**
 * The card inspector: one card of a deck, its name as the heading, then
 * a word on its release when the deck is a copy of a library deck or a
 * course (an edit of a card still as the release has it detaches it: a
 * newer release no longer updates it), the tabs (`tab`, in the URL:
 * the card's content or its wrong options, each a link, which changes
 * the view without a Back stop through `onTab`), and the tab's panel.
 */
export function CardInspectorScreen({
  card,
  release,
  tab,
  tabHref,
  onTab,
  appHref,
  children,
}: {
  card: Card;
  release: CardReleaseLink;
  tab: CardTab;
  tabHref: (tab: CardTab) => string;
  onTab: (tab: CardTab) => void;
  /** The card's page in Solid Memo. */
  appHref: string;
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
      <nav class="studio-tabs" aria-label={t("studio.card.tabs")}>
        <ul>
          {TABS.map((each) => (
            <li key={each}>
              <a
                href={tabHref(each)}
                aria-current={each === tab ? "page" : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  onTab(each);
                }}
              >
                {each === "content" ? t("studio.card.tab.content") : t("studio.card.tab.distractors", { count })}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div class="studio-tab-panel">{children}</div>
      <p class="hint">
        <a href={appHref}>{t("studio.card.openInApp")}</a>
      </p>
    </section>
  );
}
