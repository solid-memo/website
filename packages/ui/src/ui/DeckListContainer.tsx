import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import { decksOf } from "@solid-memo/domain/deckTree";
import type { Instance } from "@solid-memo/domain/instance";
import { DeckListScreen } from "./DeckListScreen";
import { DeckStudyActionContainer } from "./DeckStudyAction";
import { useCopies, useDeckTreeEditor } from "./deckTreeEditor";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n } from "./i18n";
import { Loading } from "./Loading";
import { NewcomerCourseContainer } from "./NewcomerCourseContainer";
import { TodaySummaryContainer } from "./TodaySummaryContainer";
import { courseHref, deckHref, importUrlHref, libraryHref, routeToHash, studioHref } from "./router";

/**
 * Owns the deck list of one instance, as the user arranged it into
 * groups, and its edits (useDeckTreeEditor). A deck set aside for
 * invalid data (docs/validation.md) is listed, but not offered for study.
 *
 * A deck copied from a course (docs/courses.md) is continued from its
 * menu, and a copy of a release added from a link says the host it came
 * from (useCopies). An instance with no decks (groups aside) is
 * offered the library's course for newcomers under the list's heading
 * (NewcomerCourseContainer), which opens once started.
 */
export function DeckListContainer({
  useCases,
  instance,
  isSetAside = () => false,
  arrangementSetAside = false,
  checking = false,
  onStudyDeck,
  onCourseStarted,
}: {
  useCases: UseCases;
  instance: Instance;
  isSetAside?: (deck: Deck) => boolean;
  /** The catalogue or a deck group is invalid, and the policy sets it aside: the list cannot be rearranged. */
  arrangementSetAside?: boolean;
  /** The instance's data is still being checked, under a policy that may set some of it aside: the list cannot be rearranged yet. */
  checking?: boolean;
  onStudyDeck: (deck: Deck) => void;
  /** Called with the instance's deck of the course for newcomers once it is started. */
  onCourseStarted: (deck: Deck) => void;
}) {
  const { t, errorText } = useI18n();
  const { treeQuery, editor } = useDeckTreeEditor(useCases, instance);
  const { isCourse, linkedHost } = useCopies(useCases, decksOf(treeQuery.data?.children ?? []));

  if (treeQuery.error) {
    return <ErrorMessage error={errorText(treeQuery.error)} />;
  }
  if (editor === undefined) {
    return <Loading label={t("deckList.loading")} />;
  }

  return (
    <>
      <TodaySummaryContainer useCases={useCases} instance={instance} />
      <DeckListScreen
        {...editor}
        arrangementSetAside={arrangementSetAside}
        checking={checking}
        libraryHref={libraryHref(instance.url)}
        deckHref={(deck) => deckHref(instance.url, deck.url)}
        courseHref={(deck) => (isCourse(deck) ? courseHref(instance.url, deck.url) : undefined)}
        fromHost={linkedHost}
        importUrlHref={importUrlHref(instance.url)}
        preferencesHref={(deck) =>
          routeToHash({ screen: "deckPreferences", instanceUrl: instance.url, deckUrl: deck.url })
        }
        studioHref={studioHref(instance.url)}
        renderStudyAction={(deck) =>
          isSetAside(deck) ? (
            <span class="hint">{t("deckList.setAside")}</span>
          ) : (
            <DeckStudyActionContainer
              useCases={useCases}
              instance={instance}
              deck={deck}
              onStudy={() => onStudyDeck(deck)}
            />
          )
        }
        createDeckHref={routeToHash({ screen: "deckCreator", instanceUrl: instance.url })}
        offer={
          decksOf(editor.tree.children).length === 0 && (
            <NewcomerCourseContainer useCases={useCases} instance={instance} onCourseStarted={onCourseStarted} />
          )
        }
      />
    </>
  );
}
