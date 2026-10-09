import { useMemo } from "preact/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import { deckLanguages, type StatedLanguages } from "@solid-memo/domain/deckLanguages";
import type { DeckPace } from "@solid-memo/domain/deckPace";
import type { Instance } from "@solid-memo/domain/instance";
import type { LangText } from "@solid-memo/domain/langText";
import { DeckPreferencesScreen } from "./DeckPreferencesScreen";
import { ErrorMessage } from "./ErrorMessage";
import { Loading } from "./Loading";
import { deckHref, routeToHash } from "./router";
import { useI18n } from "./i18n";
import { useDeckReleaseQuery } from "./deckRelease";

/**
 * Owns a deck's preferences: reads the instance's (which the deck falls
 * back on), saves the deck's own and returns to the deck's page. The
 * deck's cached study queue is dropped, so its counts follow the new
 * limits at once. Renaming stays on the page; removing the deck leaves it.
 * The deck's cards, and the release it was copied from, tell which of its
 * text does not say its language (deckLanguages): stating it rewrites the
 * cards and reads them again; when either cannot be read, the section
 * says so. A link to the screen's Languages section
 * opens it there (`section`).
 */
export function DeckPreferencesContainer({
  useCases,
  instance,
  deck,
  section,
  onDeckRemoved,
  onDone,
}: {
  useCases: UseCases;
  instance: Instance;
  deck: Deck;
  /** The part of the screen a link opened it at. */
  section?: "languages";
  /** The deck is gone; leave its pages. */
  onDeckRemoved: () => void;
  /** Called after a successful save. */
  onDone: () => void;
}) {
  const { t, errorText } = useI18n();
  const queryClient = useQueryClient();

  const { release, error: releaseError } = useDeckReleaseQuery(useCases, deck);

  const cardsQuery = useQuery({
    queryKey: ["cards", deck.cardsDocumentUrl],
    queryFn: () => useCases.listCards(deck),
  });

  // The release decides which cards are the user's to settle: none is counted until it is known.
  const languages = useMemo(
    () =>
      cardsQuery.data === undefined || release === undefined
        ? undefined
        : deckLanguages(cardsQuery.data, release?.cards),
    [cardsQuery.data, release],
  );

  const preferencesQuery = useQuery({
    queryKey: ["preferences", instance.url],
    queryFn: () => useCases.getPreferences(instance.url),
  });

  const saveMutation = useMutation({
    mutationFn: (pace: DeckPace) => useCases.setDeckPace(deck, pace),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["decks"] });
      queryClient.removeQueries({ queryKey: ["studyQueue", deck.url] });
      onDone();
    },
  });

  const renameMutation = useMutation({
    mutationFn: (title: LangText) => useCases.renameDeck(deck, title),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["decks"] }),
  });

  const stateLanguagesMutation = useMutation({
    mutationFn: (languages: StatedLanguages) => useCases.stateCardLanguages(deck, languages),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cards", deck.cardsDocumentUrl] }),
  });

  const removeMutation = useMutation({
    mutationFn: () => useCases.removeDeck(deck),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["decks"] });
      onDeckRemoved();
    },
  });

  if (preferencesQuery.error) {
    return <ErrorMessage error={errorText(preferencesQuery.error)} />;
  }
  if (preferencesQuery.data === undefined) {
    return <Loading label={t("deckPreferences.loading")} />;
  }

  return (
    <DeckPreferencesScreen
      deck={deck}
      deckHref={deckHref(instance.url, deck.url)}
      preferences={preferencesQuery.data}
      preferencesHref={routeToHash({ screen: "preferences", instanceUrl: instance.url })}
      languages={languages}
      section={section}
      languagesUnreadable={languages === undefined ? errorText(cardsQuery.error ?? releaseError) : null}
      stated={stateLanguagesMutation.data ?? null}
      busy={
        saveMutation.isPending ||
        renameMutation.isPending ||
        removeMutation.isPending ||
        stateLanguagesMutation.isPending
      }
      error={
        errorText(saveMutation.error) ??
        errorText(renameMutation.error) ??
        errorText(removeMutation.error) ??
        errorText(stateLanguagesMutation.error)
      }
      onSave={(pace) => saveMutation.mutate(pace)}
      onRename={(title) => renameMutation.mutate(title)}
      onRemove={() => removeMutation.mutate()}
      onStateLanguages={(languages) => stateLanguagesMutation.mutate(languages)}
    />
  );
}
