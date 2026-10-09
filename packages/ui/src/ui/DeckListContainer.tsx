import { useState } from "preact/hooks";
import { hashKey, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import { applyDeckTreeEdit, decksOf, type DeckTree, type DeckTreeEdit, type TreeNode } from "@solid-memo/domain/deckTree";
import type { Instance } from "@solid-memo/domain/instance";
import type { LangText } from "@solid-memo/domain/langText";
import { librarySeriesUrlOf } from "@solid-memo/domain/libraryLayout";
import { DeckListScreen } from "./DeckListScreen";
import { DeckStudyActionContainer } from "./DeckStudyAction";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n } from "./i18n";
import { Loading } from "./Loading";
import { NewcomerCourseContainer } from "./NewcomerCourseContainer";
import { collapsedGroups, rememberCollapsed } from "./remembered";
import { TodaySummaryContainer } from "./TodaySummaryContainer";
import { courseHref, deckHref, libraryHref, routeToHash } from "./router";

/** Every group's URL in the nodes, at any depth. */
function groupUrls(nodes: readonly TreeNode[]): string[] {
  return nodes.flatMap((node) => (node.kind === "group" ? [node.group.url, ...groupUrls(node.children)] : []));
}

/** The nodes, the deck `url` names under its new title. */
function retitled(nodes: readonly TreeNode[], url: string, title: LangText): TreeNode[] {
  return nodes.map((node) =>
    node.kind === "group"
      ? { ...node, children: retitled(node.children, url, title) }
      : node.deck.url === url
        ? { ...node, deck: { ...node.deck, title } }
        : node,
  );
}

/**
 * Owns the deck list of one instance, as the user arranged it into
 * groups, and its edits. A deck set aside for invalid data
 * (docs/validation.md) is listed, but not offered for study.
 *
 * The arrangement is queried under ["decks", url, "tree"], so whatever
 * refreshes the instance's decks refreshes it too; not when the window
 * regains focus, which would undo edits still on their way. An edit is
 * shown at once and written in turn after the ones before it (one
 * mutation scope per instance), each against the pod as it is then. One
 * that fails says why; when none is waiting behind it, it is taken back
 * from the screen and the list is read afresh. While edits are waiting,
 * a finished one leaves the screen to show theirs, and the last of them
 * brings the list as the pod has it.
 *
 * A deck is renamed and removed here as on its preferences screen
 * (DeckPreferencesContainer), in turn with the edits, since all of them
 * write the catalog the arrangement is kept in; every query of the
 * instance's decks is read afresh after. A new name shows at once, and
 * only it is taken back when it fails; a removed deck goes once it is
 * gone. Either says why it failed as an edit does.
 *
 * Which groups are folded shut is this device's own (remembered.ts),
 * never the pod's.
 *
 * A deck copied from a course (docs/courses.md) is continued from its
 * menu: which library decks are courses, the library says, read once
 * some deck is a library copy. An instance with no decks (groups aside)
 * is offered the library's course for newcomers under the list's heading
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
  const queryClient = useQueryClient();
  const treeKey = ["decks", instance.url, "tree"];
  const treeQuery = useQuery({
    queryKey: treeKey,
    queryFn: () => useCases.listDeckTree(instance.url),
    refetchOnWindowFocus: false,
  });
  // Each instance's, once changed here; until then, as this device remembers it.
  const [collapsedBy, setCollapsedBy] = useState<Record<string, readonly string[]>>({});
  const [failure, setFailure] = useState<unknown>(null);

  const scope = `deckTree ${instance.url}`;
  const pending = () =>
    queryClient
      .getMutationCache()
      .findAll({ predicate: (mutation) => mutation.options.scope?.id === scope && mutation.state.status === "pending" })
      .length;
  const editMutation = useMutation({
    scope: { id: scope },
    mutationFn: (edit: DeckTreeEdit) => useCases.editDeckTree(instance.url, edit),
    onMutate: async (edit) => {
      setFailure(null);
      await queryClient.cancelQueries({ queryKey: treeKey });
      const previous = queryClient.getQueryData<DeckTree>(treeKey)!;
      try {
        queryClient.setQueryData(treeKey, applyDeckTreeEdit(previous, edit));
      } catch {
        // The list changed under the edit: the pod's tree, as it is written, decides.
      }
      return { previous };
    },
    onSuccess: (tree) => {
      if (pending() === 1) queryClient.setQueryData(treeKey, tree);
    },
    onError: (error, _edit, context) => {
      setFailure(error);
      // Read afresh by the last of the edits waiting, if any.
      if (pending() > 1) return;
      queryClient.setQueryData(treeKey, context!.previous);
      void queryClient.invalidateQueries({ queryKey: treeKey });
    },
  });

  /**
   * Every query of the instance's decks, read afresh; the arrangement
   * only when nothing is waiting behind (it brings its own, and a read
   * now could come back after it, as the list was before it).
   */
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: ["decks"],
      predicate: (query) => pending() === 1 || query.queryHash !== hashKey(treeKey),
    });

  const retitle = (deck: Deck, title: LangText) => {
    const tree = queryClient.getQueryData<DeckTree>(treeKey)!;
    queryClient.setQueryData(treeKey, { ...tree, children: retitled(tree.children, deck.url, title) });
  };

  // In the arrangement's scope: both write the catalog it is kept in.
  const renameMutation = useMutation({
    scope: { id: scope },
    mutationFn: ({ deck, title }: { deck: Deck; title: LangText }) => useCases.renameDeck(deck, title),
    onMutate: async ({ deck, title }) => {
      setFailure(null);
      await queryClient.cancelQueries({ queryKey: treeKey });
      retitle(deck, title);
    },
    // Only the name goes back: what was done since stays.
    onError: (error, { deck }) => {
      retitle(deck, deck.title);
      setFailure(error);
    },
    onSettled: refresh,
  });

  const isCopy = decksOf(treeQuery.data?.children ?? []).some((deck) => deck.sourceUrl !== undefined);
  const libraryQuery = useQuery({
    queryKey: ["library"],
    queryFn: () => useCases.listLibraryDecks(),
    enabled: isCopy,
    refetchOnWindowFocus: false,
  });
  const courses = new Set(
    (libraryQuery.data ?? []).filter((deck) => deck.isCourse === true).map((deck) => deck.seriesUrl),
  );

  const removeMutation = useMutation({
    scope: { id: scope },
    mutationFn: (deck: Deck) => useCases.removeDeck(deck),
    onMutate: () => setFailure(null),
    onSuccess: refresh,
    onError: (error) => setFailure(error),
  });

  if (treeQuery.error) {
    return <ErrorMessage error={errorText(treeQuery.error)} />;
  }
  if (treeQuery.data === undefined) {
    return <Loading label={t("deckList.loading")} />;
  }

  const groups = new Set(groupUrls(treeQuery.data.children));
  // Only groups still there: one deleted, here or elsewhere, is forgotten at the next change.
  const collapsed = (collapsedBy[instance.url] ?? collapsedGroups(instance.url)).filter((url) => groups.has(url));
  function remember(urls: readonly string[]) {
    rememberCollapsed(instance.url, urls);
    setCollapsedBy((all) => ({ ...all, [instance.url]: urls }));
  }

  return (
    <>
      <TodaySummaryContainer useCases={useCases} instance={instance} />
      <DeckListScreen
        tree={treeQuery.data}
        arrangementSetAside={arrangementSetAside}
        checking={checking}
        collapsed={new Set(collapsed)}
        onToggle={(url) =>
          remember(collapsed.includes(url) ? collapsed.filter((other) => other !== url) : [...collapsed, url])
        }
        onUnfold={(urls) => remember(collapsed.filter((url) => !urls.includes(url)))}
        onEdit={(edit) => {
          if (edit.kind === "removeGroup") remember(collapsed.filter((url) => url !== edit.group));
          return editMutation.mutateAsync(edit).then(
            () => true,
            () => false,
          );
        }}
        newGroup={(title) => useCases.newDeckGroup(instance.url, title)}
        onRenameDeck={(deck, title) => renameMutation.mutate({ deck, title })}
        onRemoveDeck={(deck) =>
          removeMutation.mutateAsync(deck).then(
            () => true,
            () => false,
          )
        }
        error={errorText(failure)}
        libraryHref={libraryHref(instance.url)}
        deckHref={(deck) => deckHref(instance.url, deck.url)}
        courseHref={(deck) =>
          deck.sourceUrl !== undefined && courses.has(librarySeriesUrlOf(deck.sourceUrl))
            ? courseHref(instance.url, deck.url)
            : undefined
        }
        preferencesHref={(deck) =>
          routeToHash({ screen: "deckPreferences", instanceUrl: instance.url, deckUrl: deck.url })
        }
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
          decksOf(treeQuery.data.children).length === 0 && (
            <NewcomerCourseContainer useCases={useCases} instance={instance} onCourseStarted={onCourseStarted} />
          )
        }
      />
    </>
  );
}
