// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useMemo } from "preact/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import { preferableCardLanguages } from "@solid-memo/domain/deckCardLanguage";
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
import { queryKeys } from "./queryKeys";

/**
 * Owns a deck's preferences: reads the instance's (which the deck falls
 * back on), saves the deck's own and returns to the deck's page. The
 * deck's cached study queue is dropped, so its counts follow the new
 * limits at once. Renaming stays on the page; removing the deck leaves it.
 * The deck's cards, and the release it was copied from, tell which of its
 * text does not say its language (deckLanguages): stating it rewrites the
 * cards and reads them again; when either cannot be read, the section
 * says so. The cards also tell which languages the deck's cards can be
 * shown in first; choosing one saves it on the deck and stays, and the
 * screens showing its cards follow the deck list read again, the
 * statistics their report read again. A link to
 * the screen's Languages section
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
    queryKey: queryKeys.cards(deck.cardsDocumentUrl),
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

  const cardLanguages = useMemo(
    () => (cardsQuery.data === undefined ? undefined : preferableCardLanguages(cardsQuery.data)),
    [cardsQuery.data],
  );

  const preferencesQuery = useQuery({
    queryKey: ["preferences", instance.url],
    queryFn: () => useCases.getPreferences(instance.url),
  });

  const saveMutation = useMutation({
    mutationFn: (pace: DeckPace) => useCases.setDeckPace(deck, pace),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.allDecks() });
      queryClient.removeQueries({ queryKey: queryKeys.studyQueue(deck.url) });
      onDone();
    },
  });

  const renameMutation = useMutation({
    mutationFn: (title: LangText) => useCases.renameDeck(deck, title),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.allDecks() }),
  });

  const stateLanguagesMutation = useMutation({
    mutationFn: (languages: StatedLanguages) => useCases.stateCardLanguages(deck, languages),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.cards(deck.cardsDocumentUrl) }),
  });

  const cardLanguageMutation = useMutation({
    mutationFn: (language: string | null) => useCases.setDeckCardLanguage(deck, language),
    // The deck's card language is on the deck: every screen of its cards reads it from the deck list,
    // and the statistics' cards (hardest cards, confused options, leeches) from the deck in their report.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.allDecks() }),
        queryClient.invalidateQueries({ queryKey: ["cardProgress"] }),
      ]),
  });

  const removeMutation = useMutation({
    mutationFn: () => useCases.removeDeck(deck),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.allDecks() });
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
      languagesUnreadable={
        languages === undefined ? errorText(cardsQuery.error ?? releaseError) : null
      }
      cardLanguages={cardLanguages}
      stated={stateLanguagesMutation.data ?? null}
      busy={
        saveMutation.isPending ||
        renameMutation.isPending ||
        removeMutation.isPending ||
        stateLanguagesMutation.isPending ||
        cardLanguageMutation.isPending
      }
      error={
        errorText(saveMutation.error) ??
        errorText(renameMutation.error) ??
        errorText(removeMutation.error) ??
        errorText(stateLanguagesMutation.error) ??
        errorText(cardLanguageMutation.error)
      }
      onSave={(pace) => saveMutation.mutate(pace)}
      onRename={(title) => renameMutation.mutate(title)}
      onRemove={() => removeMutation.mutate()}
      onStateLanguages={(languages) => stateLanguagesMutation.mutate(languages)}
      onSetCardLanguage={(language) => cardLanguageMutation.mutate(language)}
    />
  );
}
