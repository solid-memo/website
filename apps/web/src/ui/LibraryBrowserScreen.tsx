import type { LibraryCard, LibraryDeck } from "@solid-memo/domain/library";
import { CARDS_PER_PAGE } from "./BrowserScreen";
import { CardRowBack, CardRowFront } from "./CardFace";
import { BrowserIcon } from "./icons";
import { useI18n } from "./i18n";
import { Pager, paginate } from "./Pager";
import { RetiredTag, useRetiredCards } from "./RetiredCards";
import { ReaderText } from "./ReaderText";

/**
 * A library deck's cards, to look through before importing it: the
 * Browser's table without its editing, retired cards listed only when
 * asked. Paged the same way, with the page as route state.
 */
export function LibraryBrowserScreen({
  deck,
  deckHref,
  cardHref,
  cards,
  page,
  onPageChange,
}: {
  deck: LibraryDeck;
  /** URL of the deck's page; its name links there. */
  deckHref: string;
  /** URL of a card's own page; its row links there. */
  cardHref: (card: LibraryCard) => string;
  cards: LibraryCard[];
  /** 1-based; out-of-range values show the nearest page. */
  page: number;
  onPageChange: (page: number) => void;
}) {
  const { t, tx } = useI18n();
  const { listed, toggle } = useRetiredCards(cards);
  const {
    pageCount,
    currentPage,
    firstIndex,
    items: pageCards,
  } = paginate(listed, page, CARDS_PER_PAGE);

  return (
    <section>
      <header>
        <h2>
          <BrowserIcon />
          {tx("libraryBrowser.heading", {
            deck: (
              <a href={deckHref}>
                <ReaderText text={deck.title} />
              </a>
            ),
          })}
        </h2>
      </header>
      {toggle}
      {listed.length === 0 ? (
        <p>{t("libraryBrowser.empty")}</p>
      ) : (
        <>
          <p class="hint">
            {pageCount > 1
              ? t("libraryBrowser.range", {
                  first: firstIndex + 1,
                  last: firstIndex + pageCards.length,
                  total: listed.length,
                })
              : t("libraryBrowser.count", { count: listed.length })}{" "}
            {t("libraryBrowser.hint")}
          </p>
          <table class="card-table">
            <thead>
              <tr>
                <th scope="col">{t("libraryBrowser.front")}</th>
                <th scope="col">{t("libraryBrowser.back")}</th>
              </tr>
            </thead>
            <tbody>
              {pageCards.map((card) => (
                <tr key={card.id} class={card.retired ? "retired" : undefined}>
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
    </section>
  );
}
