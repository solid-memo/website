import type { ComponentChildren } from "preact";
import type { Deck } from "@solid-memo/domain/deck";
import type { DeckGroup } from "@solid-memo/domain/deckTree";
import { useI18n } from "@solid-memo/ui/i18n";
import { ReaderText } from "@solid-memo/ui/ReaderText";
import { CountCell, type Count } from "./DeckTableScreen";
import type { DeckTab } from "./shell/workspaceLayout";

/** What the peek shows of a deck. */
export interface DeckPeek {
  deck: Deck;
  groups: readonly DeckGroup[];
  cards: Count;
  due: Count;
  /** Its new cards today. */
  fresh: Count;
  healthBadge: ComponentChildren;
  /** The deck's tabs, each with where it goes. */
  tabs: readonly { key: DeckTab; href: string }[];
}

/**
 * A deck beside Home's table (docs/studio.md, Home): the deck at the
 * table's cursor, in short: the groups it is in, its cards, today's due
 * and new cards (as they come in), when it last changed, its health
 * (`healthBadge`), and links to its tabs (`tabs`). Without one (`peek`
 * null: none at the cursor yet, or one no longer there), how to show one.
 */
export function DeckPeekScreen({ peek }: { peek: DeckPeek | null }) {
  const { t, tx, readerText, formatDate } = useI18n();
  if (peek === null) {
    return <p class="hint">{tx("studio.peek.none", { j: <kbd>j</kbd>, k: <kbd>k</kbd> })}</p>;
  }
  const { deck, groups, cards, due, fresh, healthBadge, tabs } = peek;
  const name = readerText(deck.title);
  return (
    <section class="studio-peek" aria-labelledby="studio-peek-heading">
      <h3 id="studio-peek-heading">
        <ReaderText text={deck.title} />
      </h3>
      {healthBadge}
      <dl>
        <dt>{t("studio.decks.group")}</dt>
        <dd>
          {groups.length === 0
            ? t("studio.decks.topLevel")
            : groups.map((group) => readerText(group.title)).join(" › ")}
        </dd>
        <dt>{t("studio.decks.cards")}</dt>
        <dd>
          <CountCell count={cards} />
        </dd>
        <dt>{t("studio.decks.due")}</dt>
        <dd>
          <CountCell count={due} />
        </dd>
        <dt>{t("studio.decks.new")}</dt>
        <dd>
          <CountCell count={fresh} />
        </dd>
        <dt>{t("studio.decks.modified")}</dt>
        <dd>{formatDate(deck.modifiedAt ?? deck.createdAt)}</dd>
      </dl>
      <ul class="studio-peek-links">
        {tabs.map((tab) => (
          <li key={tab.key}>
            <a href={tab.href}>
              {t(`studio.tabs.${tab.key}`)}
              <span class="visually-hidden"> {t("studio.peek.of", { deck: name })}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
