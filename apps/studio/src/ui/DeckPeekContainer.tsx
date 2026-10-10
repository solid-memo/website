import { skipToken, useQuery } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { activeCards } from "@solid-memo/domain/deck";
import { groupsOfDecks } from "@solid-memo/domain/deckTable";
import { decksOf } from "@solid-memo/domain/deckTree";
import type { Instance } from "@solid-memo/domain/instance";
import { studyCountsQuery } from "@solid-memo/ui/DeckStudyAction";
import { deckTreeKey } from "@solid-memo/ui/deckTreeEditor";
import { DeckPeekScreen } from "./DeckPeekScreen";
import { HealthBadge } from "./HealthBadge";
import { studioRouteToHash, type StudioRoute } from "./router";
import { deckTabs } from "./shell/workspaceLayout";

/**
 * The deck beside Home's table (DeckPeekScreen), by its URL (`deckUrl`;
 * none when null), from the same queries as the table's: the
 * instance's decks as arranged, the deck's cards and today's counts,
 * so it reads nothing the table has not. A deck the instance does not
 * have (deleted, say) is none.
 */
export function DeckPeekContainer({
  useCases,
  instance,
  route,
  deckUrl,
}: {
  useCases: UseCases;
  instance: Instance;
  /** The route shown, Home's, which the deck's tabs go from. */
  route: StudioRoute;
  deckUrl: string | null;
}) {
  const treeQuery = useQuery({
    queryKey: deckTreeKey(instance.url),
    queryFn: () => useCases.listDeckTree(instance.url),
    refetchOnWindowFocus: false,
  });
  const deck = decksOf(treeQuery.data?.children ?? []).find((each) => each.url === deckUrl) ?? null;
  const cardsQuery = useQuery({
    queryKey: ["cards", deck?.cardsDocumentUrl],
    queryFn: deck === null ? skipToken : () => useCases.listCards(deck),
  });
  const countsQuery = useQuery(
    deck === null ? { queryKey: ["studyQueue", null, "counts"], queryFn: skipToken } : studyCountsQuery(useCases, instance.url, deck),
  );
  if (deck === null) return <DeckPeekScreen peek={null} />;
  const pending = (query: { isError: boolean }) => (query.isError ? "unreadable" : "loading");
  const healthHref = studioRouteToHash({ screen: "health", instanceUrl: instance.url, deckUrl: deck.url });
  return (
    <DeckPeekScreen
      // Another deck: its health badge checks it afresh.
      key={deck.url}
      peek={{
        deck,
        groups: groupsOfDecks(treeQuery.data!).get(deck.url)!,
        cards: cardsQuery.data === undefined ? pending(cardsQuery) : activeCards(cardsQuery.data).length,
        due: countsQuery.data?.dueCount ?? pending(countsQuery),
        fresh: countsQuery.data?.newCount ?? pending(countsQuery),
        healthBadge: <HealthBadge useCases={useCases} instanceUrl={instance.url} deck={deck} href={healthHref} />,
        tabs: deckTabs(route, deck.url).map((tab) => ({ key: tab.key, href: studioRouteToHash(tab.route) })),
      }}
    />
  );
}
