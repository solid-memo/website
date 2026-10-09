import { useState } from "preact/hooks";
import { hashKey, useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import { applyDeckTreeEdit, type DeckGroup, type DeckTree, type DeckTreeEdit, type TreeNode } from "@solid-memo/domain/deckTree";
import type { Instance } from "@solid-memo/domain/instance";
import type { LangText } from "@solid-memo/domain/langText";
import { librarySeriesUrlOf } from "@solid-memo/domain/libraryLayout";
import { useI18n, type ErrorText } from "./i18n";
import { collapsedGroups, rememberCollapsed } from "./remembered";

/**
 * The mutation scope of every write of an instance's catalog document:
 * the arrangement's edits, and a deck's name, settings and removal. Its
 * writes are made in turn, each against the document as it is then.
 */
export function catalogScope(instanceUrl: string): string {
  return `deckTree ${instanceUrl}`;
}

/** The query key of an instance's arrangement: under its decks', so whatever refreshes them refreshes it too. */
export function deckTreeKey(instanceUrl: string): unknown[] {
  return ["decks", instanceUrl, "tree"];
}

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

/** What DeckListScreen needs to show an arrangement and edit it. */
export interface DeckTreeEditor {
  tree: DeckTree;
  collapsed: ReadonlySet<string>;
  onToggle: (groupUrl: string) => void;
  onUnfold: (groupUrls: readonly string[]) => void;
  onEdit: (edit: DeckTreeEdit) => Promise<boolean>;
  newGroup: (title: LangText) => DeckGroup;
  onRenameDeck: (deck: Deck, title: LangText) => void;
  onRemoveDeck: (deck: Deck) => Promise<boolean>;
  error: ErrorText | null;
}

/**
 * Owns the arrangement of one instance's decks into groups, and its
 * edits, wherever it is edited: Solid Memo's deck list
 * (DeckListContainer) and the Studio's Groups screen.
 *
 * The arrangement is queried under deckTreeKey, not again when the
 * window regains focus, which would undo edits still on their way. An
 * edit is shown at once and written in turn after the ones before it
 * (catalogScope), each against the pod as it is then. One that fails
 * says why; when none is waiting behind it, it is taken back from the
 * screen and the list is read afresh. While edits are waiting, a
 * finished one leaves the screen to show theirs, and the last of them
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
 * never the pod's. `editor` is there once the arrangement is read.
 */
export function useDeckTreeEditor(
  useCases: UseCases,
  instance: Instance,
): { treeQuery: UseQueryResult<DeckTree>; editor: DeckTreeEditor | undefined } {
  const { errorText } = useI18n();
  const queryClient = useQueryClient();
  const treeKey = deckTreeKey(instance.url);
  const treeQuery = useQuery({
    queryKey: treeKey,
    queryFn: () => useCases.listDeckTree(instance.url),
    refetchOnWindowFocus: false,
  });
  // Each instance's, once changed here; until then, as this device remembers it.
  const [collapsedBy, setCollapsedBy] = useState<Record<string, readonly string[]>>({});
  const [failure, setFailure] = useState<unknown>(null);

  const scope = catalogScope(instance.url);
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

  const removeMutation = useMutation({
    scope: { id: scope },
    mutationFn: (deck: Deck) => useCases.removeDeck(deck),
    onMutate: () => setFailure(null),
    onSuccess: refresh,
    onError: (error) => setFailure(error),
  });

  if (treeQuery.data === undefined) return { treeQuery, editor: undefined };

  const groups = new Set(groupUrls(treeQuery.data.children));
  // Only groups still there: one deleted, here or elsewhere, is forgotten at the next change.
  const collapsed = (collapsedBy[instance.url] ?? collapsedGroups(instance.url)).filter((url) => groups.has(url));
  function remember(urls: readonly string[]) {
    rememberCollapsed(instance.url, urls);
    setCollapsedBy((all) => ({ ...all, [instance.url]: urls }));
  }

  return {
    treeQuery,
    editor: {
      tree: treeQuery.data,
      collapsed: new Set(collapsed),
      onToggle: (url) =>
        remember(collapsed.includes(url) ? collapsed.filter((other) => other !== url) : [...collapsed, url]),
      onUnfold: (urls) => remember(collapsed.filter((url) => !urls.includes(url))),
      onEdit: (edit) => {
        if (edit.kind === "removeGroup") remember(collapsed.filter((url) => url !== edit.group));
        return editMutation.mutateAsync(edit).then(
          () => true,
          () => false,
        );
      },
      newGroup: (title) => useCases.newDeckGroup(instance.url, title),
      onRenameDeck: (deck, title) => renameMutation.mutate({ deck, title }),
      onRemoveDeck: (deck) =>
        removeMutation.mutateAsync(deck).then(
          () => true,
          () => false,
        ),
      error: errorText(failure),
    },
  };
}

/**
 * Which of the decks are copies of a course (docs/courses.md): the
 * library says which of its decks are courses, read once some deck is a
 * library copy (only then, and once: ["library"]).
 */
export function useCourseCopies(useCases: UseCases, decks: readonly Deck[]): (deck: Deck) => boolean {
  const isCopy = decks.some((deck) => deck.sourceUrl !== undefined);
  const libraryQuery = useQuery({
    queryKey: ["library"],
    queryFn: () => useCases.listLibraryDecks(),
    enabled: isCopy,
    refetchOnWindowFocus: false,
  });
  const courses = new Set(
    (libraryQuery.data ?? []).filter((deck) => deck.isCourse === true).map((deck) => deck.seriesUrl),
  );
  return (deck) => deck.sourceUrl !== undefined && courses.has(librarySeriesUrlOf(deck.sourceUrl));
}
