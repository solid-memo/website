import { useQuery } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Card, Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n } from "@solid-memo/ui/i18n";
import { Loading } from "@solid-memo/ui/Loading";
import { DeckInsightScreen } from "./DeckInsightScreen";

/**
 * A deck's schedule screen's data: the instance's preferences (the
 * study day, and the cap a deck without its own follows), then the
 * deck's insight (UseCases.deckInsight), as of when it is read. Writes
 * nothing.
 */
export function DeckInsightContainer({
  useCases,
  instance,
  deck,
  cardHref,
  leechesHref,
}: {
  useCases: UseCases;
  instance: Instance;
  deck: Deck;
  cardHref: (card: Card) => string;
  leechesHref: string;
}) {
  const { t, errorText } = useI18n();
  const preferencesQuery = useQuery({
    queryKey: ["preferences", instance.url],
    queryFn: () => useCases.getPreferences(instance.url),
  });
  const prefs = preferencesQuery.data;
  const insightQuery = useQuery({
    // The preferences and the deck's own pace are in the key: an insight
    // read under another cap or study day is not shown as this one's.
    queryKey: ["deckInsight", deck.url, deck.maxReviewsPerDay, prefs],
    queryFn: () => useCases.deckInsight(instance.url, deck, new Date(), prefs!),
    enabled: prefs !== undefined,
  });

  const error = preferencesQuery.error ?? insightQuery.error;
  if (error) return <ErrorMessage error={errorText(error)} />;
  if (insightQuery.data === undefined) return <Loading label={t("studio.insight.loading")} />;
  return (
    <DeckInsightScreen
      deck={deck}
      insight={insightQuery.data}
      ownCap={deck.maxReviewsPerDay !== undefined}
      cardHref={cardHref}
      leechesHref={leechesHref}
    />
  );
}
