import type { UseCases } from "@solid-memo/application/useCases";
import { decksOf } from "@solid-memo/domain/deckTree";
import type { Instance } from "@solid-memo/domain/instance";
import { DeckListScreen } from "@solid-memo/ui/DeckListScreen";
import { useCourseCopies, useDeckTreeEditor } from "@solid-memo/ui/deckTreeEditor";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n } from "@solid-memo/ui/i18n";
import { Loading } from "@solid-memo/ui/Loading";
import { courseHref, deckHref, libraryHref, routeToHash } from "@solid-memo/ui/router";

/**
 * Groups: the instance's decks as the user arranged them into groups,
 * to arrange, as Solid Memo's deck list does it (useDeckTreeEditor and
 * DeckListScreen: the same drags, menus and writes). What is not
 * arranging (a deck's page, its preferences, a course, a new deck, the
 * library) opens in Solid Memo. Nothing is offered for study here.
 */
export function GroupsContainer({ useCases, instance }: { useCases: UseCases; instance: Instance }) {
  const { t, errorText } = useI18n();
  const { treeQuery, editor } = useDeckTreeEditor(useCases, instance);
  const isCourse = useCourseCopies(useCases, decksOf(treeQuery.data?.children ?? []));

  if (treeQuery.error) return <ErrorMessage error={errorText(treeQuery.error)} />;
  if (editor === undefined) return <Loading label={t("deckList.loading")} />;

  return (
    <DeckListScreen
      {...editor}
      heading={t("studio.groups.heading")}
      libraryHref={libraryHref(instance.url)}
      deckHref={(deck) => deckHref(instance.url, deck.url)}
      courseHref={(deck) => (isCourse(deck) ? courseHref(instance.url, deck.url) : undefined)}
      preferencesHref={(deck) =>
        routeToHash({ screen: "deckPreferences", instanceUrl: instance.url, deckUrl: deck.url })
      }
      renderStudyAction={() => null}
      createDeckHref={routeToHash({ screen: "deckCreator", instanceUrl: instance.url })}
    />
  );
}
