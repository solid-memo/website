// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useQuery } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { activeCards } from "@solid-memo/domain/deck";
import { groupsOfDecks } from "@solid-memo/domain/deckTable";
import { decksOf } from "@solid-memo/domain/deckTree";
import type { Instance } from "@solid-memo/domain/instance";
import { DeckPeekScreen } from "./DeckPeekScreen";
import { HealthBadge } from "./HealthBadge";
import { studioRouteToHash, type StudioRoute } from "./router";
import { deckTabs } from "./shell/workspaceLayout";
import { queries } from "./queries";

/**
 * The deck beside Home's table (DeckPeekScreen), by its URL (`deckUrl`;
 * none when null), from the same queries as the table's: the
 * instance's decks as arranged and today's counts, so it reads none of
 * those again. Its cards it reads at once under the deck's cards key
 * (listCards), not in the table's turns, so it never waits behind the
 * table's reads. A deck the instance does not have (deleted, say) is
 * none.
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
  const treeQuery = useQuery(queries.deckTree(useCases, instance.url));
  const deck = decksOf(treeQuery.data?.children ?? []).find((each) => each.url === deckUrl) ?? null;
  const cardsQuery = useQuery(queries.cards(useCases, deck));
  const countsQuery = useQuery(queries.studyCounts(useCases, instance.url, deck));
  if (deck === null) return <DeckPeekScreen peek={null} />;
  const pending = (query: { isError: boolean }) => (query.isError ? "unreadable" : "loading");
  const healthHref = studioRouteToHash({
    screen: "health",
    instanceUrl: instance.url,
    deckUrl: deck.url,
  });
  return (
    <DeckPeekScreen
      // Another deck: its health badge checks it afresh.
      key={deck.url}
      peek={{
        deck,
        groups: groupsOfDecks(treeQuery.data!).get(deck.url)!,
        cards:
          cardsQuery.data === undefined ? pending(cardsQuery) : activeCards(cardsQuery.data).length,
        due: countsQuery.data?.dueCount ?? pending(countsQuery),
        fresh: countsQuery.data?.newCount ?? pending(countsQuery),
        healthBadge: (
          <HealthBadge
            useCases={useCases}
            instanceUrl={instance.url}
            deck={deck}
            href={healthHref}
          />
        ),
        tabs: deckTabs(route, deck.url).map((tab) => ({
          key: tab.key,
          href: studioRouteToHash(tab.route),
        })),
      }}
    />
  );
}
