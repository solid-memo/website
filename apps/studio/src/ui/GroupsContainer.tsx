import type { UseCases } from "@solid-memo/application/useCases";
import { decksOf } from "@solid-memo/domain/deckTree";
import type { Instance } from "@solid-memo/domain/instance";
import { useDataCheck } from "@solid-memo/ui/dataCheck";
import { DeckListScreen } from "@solid-memo/ui/DeckListScreen";
import { useCourseCopies, useDeckTreeEditor } from "@solid-memo/ui/deckTreeEditor";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n } from "@solid-memo/ui/i18n";
import { Loading } from "@solid-memo/ui/Loading";
import { courseHref, deckHref, libraryHref, routeToHash } from "@solid-memo/ui/router";
import { ReadOnlyNotice } from "./ReadOnly";

/**
 * Groups: the instance's decks as the user arranged them into groups,
 * to arrange, as Solid Memo's deck list does it (useDeckTreeEditor and
 * DeckListScreen: the same drags, menus and writes). What is not
 * arranging (a deck's page, its preferences, a course, a new deck, the
 * library) opens in Solid Memo. Nothing is offered for study here. As
 * in Solid Memo, nothing can be rearranged until the instance's data
 * check is done, nor while the arrangement is set aside, and a deck set
 * aside says so (useDataCheck); under "block the instance", invalid
 * data holds the whole list. Unlike Solid Memo's list, a deck held so
 * (until the check is done, set aside, or blocked) cannot be renamed or
 * deleted either, and a line says why, with a link to the instance's
 * health (`healthHref`).
 */
export function GroupsContainer({
  useCases,
  instance,
  healthHref,
}: {
  useCases: UseCases;
  instance: Instance;
  /** The instance's health, where data set aside is repaired. */
  healthHref: string;
}) {
  const { t, errorText } = useI18n();
  const { treeQuery, editor } = useDeckTreeEditor(useCases, instance);
  const check = useDataCheck(useCases, instance.url);
  const decks = decksOf(treeQuery.data?.children ?? []);
  const isCourse = useCourseCopies(useCases, decks);

  if (treeQuery.error) return <ErrorMessage error={errorText(treeQuery.error)} />;
  if (editor === undefined) return <Loading label={t("deckList.loading")} />;

  return (
    <DeckListScreen
      {...editor}
      arrangementSetAside={check.arrangementSetAside}
      // Checking, or the whole instance blocked: the list waits, as while the check is made.
      checking={check.readOnly() !== null}
      deckHeld={(deck) => check.readOnly(deck) !== null}
      offer={
        <ReadOnlyNotice
          reason={check.readOnly() ?? (decks.some(check.isSetAside) ? "setAside" : null)}
          subject="decks"
          healthHref={healthHref}
        />
      }
      heading={t("studio.groups.heading")}
      libraryHref={libraryHref(instance.url)}
      deckHref={(deck) => deckHref(instance.url, deck.url)}
      courseHref={(deck) => (isCourse(deck) ? courseHref(instance.url, deck.url) : undefined)}
      preferencesHref={(deck) =>
        routeToHash({ screen: "deckPreferences", instanceUrl: instance.url, deckUrl: deck.url })
      }
      renderStudyAction={(deck) => (check.isSetAside(deck) ? <span class="hint">{t("deckList.setAside")}</span> : null)}
      createDeckHref={routeToHash({ screen: "deckCreator", instanceUrl: instance.url })}
    />
  );
}
