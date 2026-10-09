import {
  DECK_DIRECTIONS,
  type Card,
  type Deck,
  type DeckDirection,
} from "@solid-memo/domain/deck";
import type { DeckAbout } from "@solid-memo/domain/deckAbout";
import { hasUnstatedSide } from "@solid-memo/domain/deckLanguages";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { CardRowBack, CardRowFront } from "./CardFace";
import { cardName } from "./DataText";
import { DeckAboutSection } from "./DeckAboutSection";
import { ErrorMessage } from "./ErrorMessage";
import { BrowserIcon, TrashIcon } from "./icons";
import { Pager, paginate } from "./Pager";
import { useI18n, type ErrorText } from "./i18n";
import { RetiredTag, useRetiredCards } from "./RetiredCards";
import { ReaderText } from "./ReaderText";
import type { BrowserLanguageFilter } from "./router";

/** Cards per Browser page: a short list, so paging is quick to scan. */
export const CARDS_PER_PAGE = 10;

/** Which cards the Browser lists: all, or only those of a language filter. */
type LanguageFilter = "all" | BrowserLanguageFilter;

/**
 * Management view for one deck: describe it (description, topics,
 * keywords, the text in the languages the user states), choose which way it is studied, add
 * cards, and open any card's own page (where it
 * is edited) through its front. Retired cards are listed only when asked.
 * A card whose language is the user's to settle (`toSettle`: not one
 * still as its library release has it, which a later release updates) is
 * marked so: a side that does not say its language. While any is listed,
 * the list can be narrowed down to them (radios: a change of filter goes
 * back to the first page).
 * Long decks are paged; the page and the filter are route state, so they
 * survive a round trip to a card's page.
 *
 * Removing a card takes its row, and the button pressed, off the page:
 * the focus goes to the card now in that row (the last one, if it was
 * last, or the page before's last if the page emptied), or to Add card
 * when none is left, and a status line says it is
 * gone. While it is removed, the button keeps the focus (aria-disabled).
 */
export function BrowserScreen({
  deck,
  deckHref,
  cards,
  page,
  languageFilter,
  toSettle = [],
  busy,
  error,
  onDescribeDeck,
  onChangeDirection,
  addCardHref,
  cardHref,
  onRemoveCard,
  onPageChange,
  onLanguageFilterChange,
}: {
  deck: Deck;
  /** URL of the deck's page; its name links there. */
  deckHref: string;
  cards: Card[];
  /** 1-based; out-of-range values show the nearest page. */
  page: number;
  /** The cards to list by their languages; undefined lists all. */
  languageFilter?: BrowserLanguageFilter;
  /** The cards whose languages are the user's to settle (unlikeRelease); none while that is not known. */
  toSettle?: readonly Card[];
  busy: boolean;
  error: ErrorText | null;
  /** Replace the deck's description, topics and keywords (per language). */
  onDescribeDeck: (about: DeckAbout) => void;
  /** Study the deck front→back, back→front or both ways. */
  onChangeDirection: (direction: DeckDirection) => void;
  /** URL of the card creator. */
  addCardHref: string;
  /** URL of a card's own page. */
  cardHref: (card: Card) => string;
  onRemoveCard: (card: Card) => void;
  onPageChange: (page: number) => void;
  /** List the cards of another language filter, from the first page. */
  onLanguageFilterChange: (filter: BrowserLanguageFilter | undefined) => void;
}) {
  const { t, tx, readerText, directionLabel } = useI18n();
  const { listed: unfiltered, toggle } = useRetiredCards(cards);
  const unstated = new Set(toSettle.filter(hasUnstatedSide).map((card) => card.url));
  const unstatedCards = unfiltered.filter((card) => unstated.has(card.url));
  const filters: BrowserLanguageFilter[] = unstatedCards.length > 0 ? ["unstated"] : [];
  // With none of a kind left there is nothing to narrow down to: all are listed.
  const filter: LanguageFilter =
    languageFilter !== undefined && filters.includes(languageFilter) ? languageFilter : "all";
  const listed = filter === "all" ? unfiltered : unstatedCards;
  const {
    pageCount,
    currentPage,
    firstIndex,
    items: pageCards,
  } = paginate(listed, page, CARDS_PER_PAGE);
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const addCardRef = useRef<HTMLAnchorElement>(null);
  /** The card being removed, its page and row and its name, until it is gone. */
  const removing = useRef<{ url: string; page: number; row: number; label: string } | null>(null);
  const [removed, setRemoved] = useState("");

  useLayoutEffect(() => {
    const pending = removing.current;
    if (pending === null || busy || cards.some((card) => card.url === pending.url)) return;
    removing.current = null;
    const rows = tbodyRef.current?.children ?? [];
    // A page left empty gives way to the one before: its last row is nearest.
    const row = rows[currentPage < pending.page ? rows.length - 1 : Math.min(pending.row, rows.length - 1)];
    (row?.querySelector("a") ?? addCardRef.current!).focus();
    setRemoved(t("browser.removed", { card: pending.label }));
  });

  function handleRemove(card: Card) {
    if (busy) return;
    const label = cardName(card, readerText);
    if (window.confirm(t("browser.removeConfirm", { card: label }))) {
      removing.current = { url: card.url, page: currentPage, row: pageCards.indexOf(card), label };
      setRemoved("");
      onRemoveCard(card);
    }
  }

  return (
    <section>
      <header>
        <h2>
          <BrowserIcon />
          {tx("browser.heading", {
            deck: (
              <a href={deckHref}>
                <ReaderText text={deck.title} />
              </a>
            ),
          })}
        </h2>
        <a ref={addCardRef} class="button" href={addCardHref}>
          {t("browser.addCardButton")}
        </a>
      </header>
      <p class="hint">{t("browser.intro")}</p>
      <DeckAboutSection
        deck={deck}
        busy={busy}
        onSave={onDescribeDeck}
      />
      <fieldset aria-describedby="deck-direction-hint">
        <legend>{t("browser.directionLegend")}</legend>
        {DECK_DIRECTIONS.map((direction) => (
          <label key={direction} class="radio-option">
            <input
              type="radio"
              name="deck-direction"
              value={direction}
              checked={deck.direction === direction}
              onChange={() => onChangeDirection(direction)}
              disabled={busy}
            />
            {directionLabel(direction)}
          </label>
        ))}
        <span id="deck-direction-hint" class="hint">
          {deck.direction === "bidirectional"
            ? t("browser.bidirectionalHint")
            : t("browser.directionHint")}
        </span>
      </fieldset>
      {toggle}
      {filters.length > 0 && (
        <fieldset class="language-filter">
          <legend>{t("browser.languageFilter.legend")}</legend>
          {(["all", ...filters] as const).map((value) => (
            <label key={value} class="radio-option">
              <input
                type="radio"
                name="language-filter"
                value={value}
                checked={filter === value}
                onChange={() => onLanguageFilterChange(value === "all" ? undefined : value)}
              />
              {t(`browser.languageFilter.${value}`)}
            </label>
          ))}
        </fieldset>
      )}
      {cards.length === 0 ? (
        <p>{t("browser.empty")}</p>
      ) : listed.length === 0 ? (
        <p>{t("browser.allRetired")}</p>
      ) : (
        <>
          <p class="hint">
            {pageCount > 1
              ? t("browser.pageHint", {
                  first: firstIndex + 1,
                  last: firstIndex + pageCards.length,
                  total: listed.length,
                })
              : t("browser.openHint")}
          </p>
          <table class="card-table">
            <thead>
              <tr>
                <th scope="col">{t("browser.frontColumn")}</th>
                <th scope="col">{t("browser.backColumn")}</th>
                <th scope="col">
                  <span class="visually-hidden">{t("browser.actionsColumn")}</span>
                </th>
              </tr>
            </thead>
            <tbody ref={tbodyRef}>
              {pageCards.map((card) => (
                <tr key={card.url} class={card.retired ? "retired" : undefined}>
                  <td class="clickable">
                    <a href={cardHref(card)}>
                      <CardRowFront
                        front={card.front}
                        back={card.back}
                        imageUrl={card.frontImageUrl}
                        imageDescription={card.frontImageDescription}
                        textFormat={card.textFormat}
                      />
                      {card.retired && <RetiredTag />}
                    </a>
                    {/* Outside the link, which names the card alone. */}
                    {unstated.has(card.url) && (
                      <span class="card-tags">
                        <span class="unstated-tag">{t("browser.unstatedTag")}</span>
                      </span>
                    )}
                  </td>
                  {/* The back stays readable to screen readers; only the
                      pointer target over it is hidden, since the front's
                      link already opens the card. */}
                  <td class="clickable back-cell">
                    <CardRowBack
                      back={card.back}
                      imageUrl={card.backImageUrl}
                      imageDescription={card.backImageDescription}
                      textFormat={card.textFormat}
                    />
                    <a
                      class="cell-overlay"
                      href={cardHref(card)}
                      tabIndex={-1}
                      aria-hidden="true"
                    />
                  </td>
                  <td class="actions">
                    <button
                      class="danger icon"
                      aria-label={t("browser.removeCardLabel", {
                        card: cardName(card, readerText),
                      })}
                      title={t("browser.removeButton")}
                      onClick={() => handleRemove(card)}
                      aria-disabled={busy}
                    >
                      <TrashIcon />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pageCount > 1 && (
            <Pager
              page={currentPage}
              pageCount={pageCount}
              onPageChange={onPageChange}
            />
          )}
        </>
      )}
      <p class="visually-hidden" role="status">
        {removed}
      </p>
      <ErrorMessage error={error} />
    </section>
  );
}
