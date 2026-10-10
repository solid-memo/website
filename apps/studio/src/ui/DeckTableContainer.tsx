import { useState } from "preact/hooks";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { activeCards, type Deck, type DeckDirection } from "@solid-memo/domain/deck";
import { deckPreferences, type DeckPace } from "@solid-memo/domain/deckPace";
import { groupsOfDecks, groupTrails, type DeckFigure, type DeckTableRow, type DeckTableView } from "@solid-memo/domain/deckTable";
import { decksOf, type DeckGroup } from "@solid-memo/domain/deckTree";
import type { Instance } from "@solid-memo/domain/instance";
import { setAsideDecks } from "@solid-memo/domain/validation";
import { useDataCheck } from "@solid-memo/ui/dataCheck";
import { studyCountsQuery } from "@solid-memo/ui/DeckStudyAction";
import { catalogScope, deckTreeKey, useCopies } from "@solid-memo/ui/deckTreeEditor";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n } from "@solid-memo/ui/i18n";
import { Loading } from "@solid-memo/ui/Loading";
import { DeckTableScreen, type DeckBadge } from "./DeckTableScreen";
import { HealthBadge } from "./HealthBadge";
import { UpdateBadge } from "./UpdateBadge";

/** A bulk action on the selected decks. */
type Bulk =
  | { kind: "move"; decks: readonly Deck[]; parent: DeckGroup | null }
  | { kind: "pace"; decks: readonly Deck[]; pace: DeckPace }
  | { kind: "direction"; decks: readonly Deck[]; direction: DeckDirection }
  | { kind: "remove"; decks: readonly Deck[] };

/**
 * Home's data: the instance's decks as the user arranged them (the same
 * query as Solid Memo's deck list, so its groups come with them), the
 * instance's preferences (the pace a deck without its own follows),
 * then each deck's cards and today's counts, read as Solid Memo reads
 * them, each row's figures as they come. The check of the instance
 * (as Solid Memo makes it when it is opened), which decks are courses
 * and which are copies of a release added from a link, with the host it
 * came from (useCopies), come in later, as badges; each deck's health (HealthBadge),
 * and for a library copy whether a newer release is out (UpdateBadge),
 * only once its row is on the screen.
 *
 * A bulk action is one write wherever it can be: a move is one edit of
 * the arrangement (`gather`), a pace or a direction one save of the
 * catalog, a deletion one save of it after the decks' own documents. It
 * is made in turn with the other writes of the catalog (catalogScope),
 * and every query of the instance's decks, and their counts, is read
 * afresh after it. Until the check is done no deck can be selected,
 * nor, after it, a deck it sets aside (useDataCheck); while the
 * arrangement is set aside, none can be moved into a group.
 */
export function DeckTableContainer({
  useCases,
  instance,
  view,
  onView,
  appHref,
  groupsHref,
  instanceHref,
  healthHref,
  libraryHref,
  transferHref,
  deckHref,
  cardsHref,
  draftsHref,
}: {
  useCases: UseCases;
  instance: Instance;
  view: DeckTableView;
  onView: (view: DeckTableView) => void;
  /** Solid Memo, open at the instance's decks. */
  appHref: string;
  groupsHref: string;
  /** The instance's name and catalogue. */
  instanceHref: string;
  /** The health of a deck, or (none named) of the instance. */
  healthHref: (deck?: Deck) => string;
  /** The instance's copies of library releases. */
  libraryHref: string;
  /** Import and export, these decks ticked to export. */
  transferHref: (decks: readonly Deck[]) => string;
  /** What a deck says of itself, in the Studio. */
  deckHref: (deck: Deck) => string;
  /** A deck's cards, in the card workbench. */
  cardsHref: (deck: Deck) => string;
  /** The instance's drafts of releases. */
  draftsHref: string;
}) {
  const { t, errorText } = useI18n();
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<unknown>(null);
  const treeQuery = useQuery({
    queryKey: deckTreeKey(instance.url),
    queryFn: () => useCases.listDeckTree(instance.url),
    refetchOnWindowFocus: false,
  });
  const preferencesQuery = useQuery({
    queryKey: ["preferences", instance.url],
    queryFn: () => useCases.getPreferences(instance.url),
  });
  const check = useDataCheck(useCases, instance.url);
  const decks = decksOf(treeQuery.data?.children ?? []);
  const cardQueries = useQueries({
    queries: decks.map((deck) => ({
      queryKey: ["cards", deck.cardsDocumentUrl],
      queryFn: () => useCases.listCards(deck),
    })),
  });
  const countQueries = useQueries({
    queries: decks.map((deck) => studyCountsQuery(useCases, instance.url, deck)),
  });
  const { isCourse, linkedHost } = useCopies(useCases, decks);

  const bulkMutation = useMutation({
    scope: { id: catalogScope(instance.url) },
    mutationFn: async (bulk: Bulk): Promise<void> => {
      switch (bulk.kind) {
        case "move":
          await useCases.editDeckTree(instance.url, {
            kind: "gather",
            nodes: bulk.decks.map((deck) => deck.url),
            parent: bulk.parent?.url ?? null,
          });
          return;
        case "pace":
          await useCases.setDecksPace(bulk.decks, bulk.pace);
          return;
        case "direction":
          await useCases.setDecksDirection(bulk.decks, bulk.direction);
          return;
        case "remove":
          await useCases.removeDecks(bulk.decks);
      }
    },
    onMutate: () => setFailure(null),
    onError: (error) => setFailure(error),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["decks", instance.url] }),
        queryClient.invalidateQueries({ queryKey: ["studyQueue"] }),
      ]),
  });
  const run = (bulk: Bulk) =>
    bulkMutation.mutateAsync(bulk).then(
      () => true,
      () => false,
    );

  const error = treeQuery.error ?? preferencesQuery.error;
  if (error) return <ErrorMessage error={errorText(error)} />;
  if (treeQuery.data === undefined || preferencesQuery.data === undefined) {
    return <Loading label={t("studio.decks.loading")} />;
  }

  const preferences = preferencesQuery.data;
  const groups = groupsOfDecks(treeQuery.data);
  const report = check.report;
  const queries = (deck: Deck) => {
    const at = decks.indexOf(deck);
    return { cards: cardQueries[at]!, counts: countQueries[at]! };
  };
  const rows = decks.map((deck): DeckTableRow => {
    const { cards, counts } = queries(deck);
    const pace = deckPreferences(preferences, deck);
    return {
      deck,
      groups: groups.get(deck.url)!,
      figures: {
        ...(cards.data === undefined ? {} : { cards: activeCards(cards.data).length }),
        ...(counts.data === undefined ? {} : { due: counts.data.dueCount, new: counts.data.newCount }),
      },
      newCardsPerDay: pace.newCardsPerDay,
      maxReviewsPerDay: pace.maxReviewsPerDay,
    };
  });
  const pending = (deck: Deck, figure: DeckFigure) => {
    const { cards, counts } = queries(deck);
    return (figure === "cards" ? cards : counts).isError ? "unreadable" : "loading";
  };
  const badges = (deck: Deck): DeckBadge[] => [
    ...(deck.sourceUrl === undefined
      ? []
      : linkedHost(deck) === null
        ? [isCourse(deck) ? ("course" as const) : ("library" as const)]
        : [...(isCourse(deck) ? ["course" as const] : []), { from: linkedHost(deck)! }]),
    ...(report !== null && setAsideDecks(report, [deck]).size > 0 ? ["invalid" as const] : []),
    ...(queries(deck).cards.isError ? ["unreadable" as const] : []),
  ];

  return (
    <DeckTableScreen
      instance={instance}
      rows={rows}
      view={view}
      onView={onView}
      pending={pending}
      badges={badges}
      groups={groupTrails(treeQuery.data)}
      moveLocked={treeQuery.data.readOnly ? "newerVersion" : check.arrangementSetAside ? "setAside" : null}
      readOnly={check.readOnly() ?? (decks.some(check.isSetAside) ? "setAside" : null)}
      selectable={(deck) => check.readOnly(deck) === null}
      deckHref={deckHref}
      cardsHref={cardsHref}
      appHref={appHref}
      groupsHref={groupsHref}
      instanceHref={instanceHref}
      healthHref={healthHref()}
      // Checked only as its row comes into view; quiet when all is well.
      healthBadge={(deck) => <HealthBadge useCases={useCases} instanceUrl={instance.url} deck={deck} href={healthHref(deck)} quiet />}
      libraryHref={libraryHref}
      transferHref={transferHref}
      draftsHref={draftsHref}
      // A copy only, looked up as its row comes into view; nothing while it is up to date.
      updateBadge={(deck) =>
        deck.sourceUrl === undefined ? null : <UpdateBadge useCases={useCases} instanceUrl={instance.url} deck={deck} href={libraryHref} />
      }
      onMove={(selected, parent) => run({ kind: "move", decks: selected, parent })}
      onPace={(selected, pace) => run({ kind: "pace", decks: selected, pace })}
      onDirection={(selected, direction) => run({ kind: "direction", decks: selected, direction })}
      onRemove={(selected) => run({ kind: "remove", decks: selected })}
      error={errorText(failure)}
    />
  );
}
