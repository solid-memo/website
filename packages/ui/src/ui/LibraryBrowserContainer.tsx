import { useQuery } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { LibraryCard, LibraryDeck } from "@solid-memo/domain/library";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n } from "./i18n";
import { LibraryBrowserScreen } from "./LibraryBrowserScreen";
import { Loading } from "./Loading";

/** Fetches a library deck's cards for the read-only card list. */
export function LibraryBrowserContainer({
  useCases,
  deck,
  deckHref,
  cardHref,
  page,
  onPageChange,
}: {
  useCases: UseCases;
  deck: LibraryDeck;
  /** URL of the deck's page. */
  deckHref: string;
  /** URL of a card's own page. */
  cardHref: (card: LibraryCard) => string;
  /** 1-based page, from the route. */
  page: number;
  onPageChange: (page: number) => void;
}) {
  const { t, errorText } = useI18n();
  const cardsQuery = useQuery({
    queryKey: ["libraryCards", deck.url],
    queryFn: () => useCases.listLibraryCards(deck),
  });

  if (cardsQuery.error) {
    return <ErrorMessage error={errorText(cardsQuery.error)} />;
  }
  if (cardsQuery.data === undefined) {
    return <Loading label={t("libraryBrowser.loading")} />;
  }

  return (
    <LibraryBrowserScreen
      deck={deck}
      deckHref={deckHref}
      cardHref={cardHref}
      cards={cardsQuery.data}
      page={page}
      onPageChange={onPageChange}
    />
  );
}
