import { useMemo } from "preact/hooks";
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import { deckLanguages, type StatedLanguages } from "@solid-memo/domain/deckLanguages";
import type { Instance } from "@solid-memo/domain/instance";
import { useDataCheck } from "@solid-memo/ui/dataCheck";
import { useDeckReleaseQuery } from "@solid-memo/ui/deckRelease";
import { useCopies } from "@solid-memo/ui/deckTreeEditor";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n } from "@solid-memo/ui/i18n";
import { Loading } from "@solid-memo/ui/Loading";
import { routeToHash } from "@solid-memo/ui/router";
import { DeckAboutScreen } from "./DeckAboutScreen";

/** One save of the screen: the write, and the queries it changes beside the decks'. */
interface Save {
  write: () => Promise<unknown>;
  touches?: QueryKey[];
}

/**
 * A deck's about screen's data: the instance's preferences (which its
 * pace falls back on), its cards and the release it came from (which of
 * its text does not state its language, as Solid Memo's deck preferences
 * read them), and, for a copy of a course, the course as the learner has
 * it. Each save is one use case (renameDeck, describeDeck,
 * setDeckProvenance, setDeckPace then setDeckDirection, setCompletedChapters,
 * stateCardLanguages), one at a time; then the decks are read afresh, so
 * the workspace's deck is the one saved, and the deck's study queue is
 * dropped, as Solid Memo does after a change of its pace. Until the
 * instance's data check is done, and while the deck is set aside
 * (useDataCheck), nothing can be saved.
 */
export function DeckAboutContainer({
  useCases,
  instance,
  deck,
  appHref,
  healthHref,
}: {
  useCases: UseCases;
  instance: Instance;
  deck: Deck;
  appHref: string;
  /** The deck's health, where data set aside is repaired. */
  healthHref: string;
}) {
  const { t, errorText } = useI18n();
  const queryClient = useQueryClient();
  const isCourse = useCopies(useCases, [deck]).isCourse(deck);
  const { release, error: releaseError } = useDeckReleaseQuery(useCases, deck);

  const preferencesQuery = useQuery({
    queryKey: ["preferences", instance.url],
    queryFn: () => useCases.getPreferences(instance.url),
  });
  // After the preferences' own query, which reads them.
  const readOnly = useDataCheck(useCases, instance.url).readOnly(deck);
  const cardsQuery = useQuery({
    queryKey: ["cards", deck.cardsDocumentUrl],
    queryFn: () => useCases.listCards(deck),
  });
  // The same query as Solid Memo's course screens, so a change shows there.
  const courseQuery = useQuery({
    queryKey: ["course", deck.url],
    queryFn: () => useCases.getCourse(deck),
    enabled: isCourse,
  });
  // The release decides which cards are the user's to settle: none is counted until it is known.
  const languages = useMemo(
    () => (cardsQuery.data === undefined || release === undefined ? undefined : deckLanguages(cardsQuery.data, release?.cards)),
    [cardsQuery.data, release],
  );

  const save = useMutation({
    mutationFn: ({ write }: Save) => write(),
    onSuccess: async (_written, { touches = [] }) => {
      await Promise.all([["decks"], ...touches].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      queryClient.removeQueries({ queryKey: ["studyQueue", deck.url] });
    },
  });
  const stateLanguages = useMutation({
    mutationFn: (languages: StatedLanguages) => useCases.stateCardLanguages(deck, languages),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cards", deck.cardsDocumentUrl] }),
  });
  const run = (write: Save["write"], touches?: QueryKey[]) => save.mutateAsync({ write, touches }).then(() => true, () => false);

  if (preferencesQuery.error) return <ErrorMessage error={errorText(preferencesQuery.error)} />;
  if (preferencesQuery.data === undefined) return <Loading label={t("deckPreferences.loading")} />;

  return (
    <DeckAboutScreen
      deck={deck}
      appHref={appHref}
      readOnly={readOnly}
      healthHref={healthHref}
      preferences={preferencesQuery.data}
      preferencesHref={routeToHash({ screen: "preferences", instanceUrl: instance.url })}
      languages={languages}
      languagesUnreadable={languages === undefined ? errorText(cardsQuery.error ?? releaseError) : null}
      stated={stateLanguages.data ?? null}
      course={isCourse ? { course: courseQuery.data, unreadable: errorText(courseQuery.error) } : null}
      busy={save.isPending || stateLanguages.isPending}
      saved={save.isSuccess}
      error={errorText(save.error) ?? errorText(stateLanguages.error)}
      onRename={(title) => void run(() => useCases.renameDeck(deck, title))}
      onDescribe={(about) => void run(() => useCases.describeDeck(deck, about))}
      onProvenance={(provenance) => run(() => useCases.setDeckProvenance(deck, provenance))}
      onStudy={(direction, pace) =>
        void run(async () => {
          const paced = await useCases.setDeckPace(deck, pace);
          if (paced.direction !== direction) await useCases.setDeckDirection(paced, direction);
        })
      }
      onStateLanguages={(languages) => stateLanguages.mutate(languages)}
      onCompletedChapters={(edit) => void run(() => useCases.setCompletedChapters(deck, edit), [["course", deck.url]])}
    />
  );
}
