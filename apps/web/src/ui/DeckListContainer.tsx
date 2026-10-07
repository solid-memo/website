import { useState } from "preact/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import { applyDeckTreeEdit, type DeckTree, type DeckTreeEdit, type TreeNode } from "@solid-memo/domain/deckTree";
import type { Instance } from "@solid-memo/domain/instance";
import { DeckListScreen } from "./DeckListScreen";
import { DeckStudyActionContainer } from "./DeckStudyAction";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n } from "./i18n";
import { Loading } from "./Loading";
import { collapsedGroups, rememberCollapsed } from "./remembered";
import { TodaySummaryContainer } from "./TodaySummaryContainer";
import { deckHref, libraryHref, routeToHash } from "./router";

/** Every group's URL in the nodes, at any depth. */
function groupUrls(nodes: readonly TreeNode[]): string[] {
  return nodes.flatMap((node) => (node.kind === "group" ? [node.group.url, ...groupUrls(node.children)] : []));
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
 * that fails is taken back from the screen when none is waiting behind
 * it, the list is read afresh, and the screen says why; while edits are
 * waiting, a finished one leaves the screen to show theirs.
 *
 * Which groups are folded shut is this device's own (remembered.ts),
 * never the pod's.
 */
export function DeckListContainer({
  useCases,
  instance,
  isSetAside = () => false,
  onStudyDeck,
}: {
  useCases: UseCases;
  instance: Instance;
  isSetAside?: (deck: Deck) => boolean;
  onStudyDeck: (deck: Deck) => void;
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
      if (pending() === 1) queryClient.setQueryData(treeKey, context!.previous);
      setFailure(error);
      void queryClient.invalidateQueries({ queryKey: treeKey });
    },
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
        error={errorText(failure)}
        libraryHref={libraryHref(instance.url)}
        deckHref={(deck) => deckHref(instance.url, deck.url)}
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
      />
    </>
  );
}
