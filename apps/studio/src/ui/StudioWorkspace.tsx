import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { useQuery } from "@tanstack/react-query";
import { DEFAULT_CARD_QUERY } from "@solid-memo/domain/cardQuery";
import { DEFAULT_DECK_TABLE_VIEW } from "@solid-memo/domain/deckTable";
import type { Card } from "@solid-memo/domain/deck";
import type { WorkspaceProps } from "@solid-memo/ui/App";
import type { CardEdits } from "@solid-memo/ui/CardScreen";
import { Breadcrumbs } from "@solid-memo/ui/Breadcrumbs";
import { useDocumentTitle } from "@solid-memo/ui/documentTitle";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n } from "@solid-memo/ui/i18n";
import { InstancePickerContainer } from "@solid-memo/ui/InstancePickerContainer";
import { Loading } from "@solid-memo/ui/Loading";
import { decksHref, deckHref, libraryHref, routeToHash } from "@solid-memo/ui/router";
import { useScreenFocus } from "@solid-memo/ui/screenFocus";
import { useInstanceTheme } from "@solid-memo/ui/theme";
import { draftCardOf } from "@solid-memo/domain/release/draftOutline";
import type { ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { CardInspectorContainer } from "./CardInspectorContainer";
import { CardWorkbenchContainer } from "./CardWorkbenchContainer";
import { DeckAboutContainer } from "./DeckAboutContainer";
import { DeckInsightContainer } from "./DeckInsightContainer";
import { DeckPeekContainer } from "./DeckPeekContainer";
import { DeckTableContainer } from "./DeckTableContainer";
import { DraftsContainer } from "./DraftsContainer";
import { GroupsContainer } from "./GroupsContainer";
import { HealthContainer } from "./HealthContainer";
import { InstanceAboutContainer } from "./InstanceAboutContainer";
import { LibraryCopiesContainer, LibraryPlanContainer } from "./LibraryCopiesContainer";
import { TransferContainer } from "./TransferContainer";
import { ChapterEditorContainer } from "./ChapterEditorContainer";
import { DraftCardsContainer } from "./DraftCardsContainer";
import { draftKey } from "./draftEditor";
import { DraftOverviewContainer } from "./DraftOverviewContainer";
import type { DraftLinks } from "./DraftOverviewScreen";
import { ListingPreviewContainer } from "./ListingPreviewContainer";
import { QuestionEditorContainer } from "./QuestionEditorContainer";
import { ReleaseCheckContainer } from "./ReleaseCheckContainer";
import { ReleaseDiffContainer } from "./ReleaseDiffContainer";
import { ReleaseMetadataContainer } from "./ReleaseMetadataContainer";
import { ReleasesContainer } from "./ReleasesContainer";
import { StepEditorContainer } from "./StepEditorContainer";
import { TrialContainer } from "./TrialContainer";
import { OutlineAside } from "./OutlineAside";
import { ContextTabs } from "./shell/ContextTabs";
import { InstanceSwitcher } from "./shell/InstanceSwitcher";
import { ProblemCount } from "./shell/ProblemCount";
import { openedNow, togglePin, type WorkItem } from "./shell/prefs";
import { StudioShell } from "./shell/StudioShell";
import { StudioSidebar } from "./shell/StudioSidebar";
import { crumbsOf } from "./shell/titles";
import { UnsavedEdits, useUnsavedEdits } from "./shell/unsavedEdits";
import { useInstancePrefs } from "./shell/useInstancePrefs";
import { useMedia } from "./shell/useMedia";
import { viewOf, withView, type SavedView, type ViewTable } from "./shell/views";
import { asideOf, contextTabsOf, currentOutlineKey, MEDIUM, type Aside } from "./shell/workspaceLayout";
import { PublishState, useWorkspaceProblems } from "./WorkspaceProblems";
import {
  instanceOfRoute,
  isDraftRoute,
  spotRoute,
  studioRouteToHash,
  targetRoute,
  useStudioRoute,
  workbenchOf,
  type CardRoute,
  type StudioRoute,
} from "./router";

/**
 * The signed-in Studio: in its shell (StudioShell), with the open
 * instance's sidebar and a switch to the user's other instances, the
 * main content, from the breadcrumbs and the deck's or draft's tabs to
 * the screen the route names, once the instances it needs are read
 * (and, for a deck's screen, the instance's decks; for a card's, the
 * deck's cards); in the aside a course draft's outline, the deck at
 * Home's cursor (its route's `deckUrl`), the library copy at the
 * cursor of the table of them (kept here, not in the URL), or a card in
 * the inspector beside its deck's cards in the workbench (on a screen
 * wide enough, else the inspector alone), and the problems of the deck
 * or the draft shown (useWorkspaceProblems), the draft's counted in its
 * Check tab. A card's edits not saved are asked about before they are
 * left (useUnsavedEdits), and kept as the window changes from the card
 * beside its deck's cards to the card alone, or back. A card opened
 * beside its deck's cards from elsewhere (the palette, a deck's
 * schedule) has the list at its page, so that its row is in sight.
 * What the device keeps of the open instance (useInstancePrefs) holds
 * the views saved of Home and of the workbench, and the decks and drafts
 * pinned, and opened last, each noted as it is opened; a table's cell
 * edited and not saved is asked about as a card's edits are
 * (UnsavedEdits). On a draft's screens, the status bar says whether it
 * can be published (PublishState).
 */
export function StudioWorkspace({ useCases, session, banner, children }: WorkspaceProps) {
  const { t, errorText, readerText } = useI18n();
  const { route, change, navigate, replace } = useStudioRoute();
  const medium = useMedia(MEDIUM);
  // A card beside its deck's cards, on a screen wide enough for both.
  const split = route?.screen === "card" && !medium;
  // After a move, the screen's heading takes the focus: beside a card, the
  // workbench stays where it is, and the card's takes it.
  const mainScreen = useMemo(() => route, [route?.screen === "cards" || split ? `cards ${(route as CardRoute).deckUrl}` : route]);
  const screenRef = useScreenFocus(mainScreen, change);
  const detailRef = useScreenFocus(split ? route : null, change);
  const unsaved = useUnsavedEdits();
  // The cards the workbench beside a card lists, in its order, for the card's Previous and Next.
  const [order, setOrder] = useState<readonly string[]>([]);
  // The library copy at the cursor of the table of them, shown beside it, by its deck's URL.
  const [libraryDeck, setLibraryDeck] = useState<string | null>(null);
  // The card the list was last put at the page of.
  const placed = useRef<string | null>(null);

  const instancesQuery = useQuery({
    queryKey: ["instances", session.webId],
    queryFn: () => useCases.listInstances(session),
  });
  const instances = instancesQuery.data;
  const instanceUrl = route === null ? null : instanceOfRoute(route);
  const activeInstance = instanceUrl === null ? null : (instances?.find((i) => i.url === instanceUrl) ?? null);
  const deckUrl =
    route?.screen === "cards" || route?.screen === "card" || route?.screen === "about" || route?.screen === "schedule"
      ? route.deckUrl
      : route?.screen === "health"
        ? (route.deckUrl ?? null)
        : null;
  const decksQuery = useQuery({
    queryKey: ["decks", instanceUrl],
    queryFn: () => useCases.listDecks(instanceUrl!),
    enabled: deckUrl !== null && activeInstance !== null,
  });
  const activeDeck = deckUrl === null ? null : (decksQuery.data?.find((deck) => deck.url === deckUrl) ?? null);
  const cardUrl = route?.screen === "card" ? route.cardUrl : null;
  // The same query as the workbench's and Solid Memo's, so an edit anywhere shows here.
  const cardsQuery = useQuery({
    queryKey: ["cards", activeDeck?.cardsDocumentUrl],
    queryFn: () => useCases.listCards(activeDeck!),
    enabled: cardUrl !== null && activeDeck !== null,
  });
  const activeCard = cardUrl === null ? null : (cardsQuery.data?.find((card) => card.url === cardUrl) ?? null);
  // What the card's editor holds, for the editor shown next of the same card on the same tab (beside its deck's cards, or alone):
  // another card, or another tab and back (its edits saved or discarded on the way), starts afresh.
  const cardTab = route?.screen === "card" ? (route.tab ?? "content") : null;
  const cardEdits = useMemo<{ current: CardEdits | null }>(() => ({ current: null }), [cardUrl, cardTab]);
  const draftUrl = route !== null && isDraftRoute(route) ? route.draftUrl : null;
  // The draft's editors share this query (useDraftEditor): it is read once, and changed as they edit it.
  const draftQuery = useQuery({
    queryKey: draftKey(draftUrl ?? ""),
    queryFn: () => useCases.getReleaseDraft(draftUrl!),
    enabled: draftUrl !== null && activeInstance !== null,
    staleTime: Infinity,
  });
  const activeDraft = draftUrl === null ? null : (draftQuery.data ?? null);
  const draftSubject = activeDraft === null ? null : subjectOf(activeDraft, route!);
  const mine = useInstancePrefs(activeInstance?.url ?? null);
  // The deck or the draft the route is about, as the sidebar lists those opened last.
  const opened: WorkItem | null = deckUrl !== null ? { kind: "deck", url: deckUrl } : draftUrl !== null ? { kind: "draft", url: draftUrl } : null;

  useInstanceTheme(useCases, activeInstance?.url ?? null);

  useEffect(() => {
    if (opened !== null && activeInstance !== null) mine.change((prefs) => ({ ...prefs, recent: openedNow(prefs.recent, opened) }));
  }, [opened?.url, activeInstance?.url]);

  // No route: the only instance's decks, else the picker. An instance the
  // user does not have: the picker. Neither is a Back stop.
  useEffect(() => {
    if (instances === undefined) return;
    if (route === null) {
      replace(instances.length === 1 ? { screen: "home", instanceUrl: instances[0]!.url } : { screen: "instances" });
    } else if (instanceUrl !== null && !instances.some((i) => i.url === instanceUrl)) {
      replace({ screen: "instances" });
    } else if (deckUrl !== null && decksQuery.data !== undefined && activeDeck === null) {
      // A deck the instance does not have (deleted, perhaps): its decks.
      replace({ screen: "home", instanceUrl: instanceUrl! });
    } else if (cardUrl !== null && cardsQuery.data !== undefined && activeCard === null) {
      // A card the deck does not have (removed, perhaps): the deck's cards.
      replace(workbenchOf(route as CardRoute));
    } else if (activeDraft !== null && draftSubject === false) {
      // A chapter, step or card the draft does not have (deleted, perhaps): the draft's overview.
      replace({ screen: "draft", draftUrl: draftUrl! });
    }
  }, [route, instances, decksQuery.data, cardsQuery.data, draftQuery.data]);

  // A card beside its deck's cards, once the list has it: the list at its page, once for each card.
  useEffect(() => {
    if (!split || placed.current === cardUrl || !order.includes(cardUrl!)) return;
    placed.current = cardUrl;
    const at = atItsPage(route as CardRoute);
    if (at.query!.page !== ((route as CardRoute).query ?? DEFAULT_CARD_QUERY).page) replace(at);
  }, [split, cardUrl, order]);

  const waiting = instancesQuery.error ? (
    <ErrorMessage error={errorText(instancesQuery.error)} />
  ) : deckUrl !== null && decksQuery.error ? (
    <ErrorMessage error={errorText(decksQuery.error)} />
  ) : cardUrl !== null && cardsQuery.error ? (
    <ErrorMessage error={errorText(cardsQuery.error)} />
  ) : draftUrl !== null && activeDraft === null && draftQuery.error ? (
    <ErrorMessage error={errorText(draftQuery.error)} />
  ) : route === null ||
    instances === undefined ||
    (instanceUrl !== null && activeInstance === null) ||
    (deckUrl !== null && activeDeck === null) ||
    (cardUrl !== null && activeCard === null) ||
    (draftUrl !== null && (activeDraft === null || draftSubject === false)) ? (
    <Loading label={t("workspace.loadingInstances")} />
  ) : null;
  const crumbs = waiting === null ? crumbsOf(route!, { deck: activeDeck, card: activeCard, draft: activeDraft }, { t, readerText }) : [];
  // The page the trail ends at: "Decks – Solid Memo Studio".
  useDocumentTitle(crumbs.slice(-1).map((crumb) => crumb.label));
  const tabs = waiting === null ? contextTabsOf(route!, activeDraft) : null;
  const found = useWorkspaceProblems(useCases, waiting === null ? route : null, { deck: activeDeck, draft: activeDraft });
  const checkCount = found.draft?.length ?? 0;
  const aside = waiting === null ? asideOf(route!, activeDraft) : null;
  /** The views saved of a table, and keeping them as they change. */
  const saved = (table: ViewTable) => ({
    savedViews: mine.prefs.views[table],
    onSavedViews: (views: SavedView[]) => mine.change((prefs) => ({ ...prefs, views: { ...prefs.views, [table]: views } })),
  });

  const draftLinks = (draftUrl: string): DraftLinks => ({
    draftsHref: studioRouteToHash({ screen: "drafts", instanceUrl: instanceOfRoute(route!)! }),
    healthHref: studioRouteToHash({ screen: "health", instanceUrl: instanceOfRoute(route!)! }),
    cardsHref: studioRouteToHash({ screen: "draftCards", draftUrl }),
    chapterHref: (chapter) => studioRouteToHash({ screen: "chapter", draftUrl, chapter }),
    stepHref: (step) => studioRouteToHash({ screen: "step", draftUrl, step }),
    questionHref: (card) => studioRouteToHash({ screen: "question", draftUrl, card }),
    checkHref: studioRouteToHash({ screen: "check", draftUrl }),
  });

  /** A deck's cards in the workbench, as the route's query says; beside a card, that card's row the current one. */
  const workbench = (route: Extract<StudioRoute, { screen: "cards" }> | CardRoute) => {
    // A card opens from the list with the list beside it, on the tab shown, if a card is.
    const cardRoute = (card: Card): CardRoute =>
      route.screen === "card"
        ? { ...withoutField(route), cardUrl: card.url }
        : { screen: "card", deckUrl: route.deckUrl, cardUrl: card.url, ...(route.query === undefined ? {} : { query: route.query }) };
    return (
      <CardWorkbenchContainer
        // Another deck's cards: a new page, its selection and its Undo gone. A card beside them keeps them.
        key={route.deckUrl}
        useCases={useCases}
        instance={activeInstance!}
        deck={activeDeck!}
        decks={decksQuery.data!}
        query={route.query ?? DEFAULT_CARD_QUERY}
        // Like Home's view, the query is no Back stop.
        onQuery={(query) => replace({ ...route, query })}
        {...saved("cards")}
        cardHref={(card) => studioRouteToHash(cardRoute(card))}
        onOpen={(card) => unsaved.guard(() => navigate(cardRoute(card)))}
        // Moving from card to card beside them is no Back stop either.
        {...(route.screen === "card"
          ? { current: route.cardUrl, onMove: (card: Card) => unsaved.guard(() => replace(atItsPage(cardRoute(card)))) }
          : {})}
        // Read already as a card opens beside them.
        onRows={setOrder}
        healthHref={studioRouteToHash({ screen: "health", instanceUrl: activeInstance!.url, deckUrl: route.deckUrl })}
      />
    );
  };

  /** A card's route beside its deck's cards, the list at the card's page there. */
  const atItsPage = (route: CardRoute): CardRoute => {
    const query = route.query ?? DEFAULT_CARD_QUERY;
    return { ...route, query: { ...query, page: Math.floor(order.indexOf(route.cardUrl) / query.size) + 1 } };
  };

  /**
   * The card a route names in the inspector; beside its deck's cards, with
   * the cards before and after it in the workbench's list, each shown at
   * its page there.
   */
  const inspector = (route: CardRoute) => {
    const base = withoutField(route);
    const at = order.indexOf(route.cardUrl);
    const step = (by: 1 | -1) => {
      const url = at === -1 ? undefined : order[at + by];
      if (url === undefined) return null;
      return () => unsaved.guard(() => replace(atItsPage({ ...base, cardUrl: url })));
    };
    return (
      <CardInspectorContainer
        // Another card: its editors start afresh.
        key={route.cardUrl}
        useCases={useCases}
        deck={activeDeck!}
        card={activeCard!}
        tab={route.tab ?? "content"}
        field={route.field}
        // Another tab is opened at none of its fields.
        tabHref={(tab) => studioRouteToHash({ ...base, tab })}
        // Like the workbench's query, the tab is no Back stop.
        onTab={(tab) => replace({ ...base, tab })}
        appHref={routeToHash({ screen: "card", instanceUrl: activeInstance!.url, deckUrl: route.deckUrl, cardUrl: route.cardUrl })}
        healthHref={studioRouteToHash({ screen: "health", instanceUrl: activeInstance!.url, deckUrl: route.deckUrl })}
        onRemoved={() => replace(workbenchOf(route))}
        {...(split ? { steps: { previous: step(-1), next: step(1) } } : {})}
        onUnsaved={unsaved.report}
        keep={cardEdits}
      />
    );
  };

  /** What the aside shows on the route. */
  const asideFor = (aside: Aside, route: StudioRoute) => {
    switch (aside) {
      case "outline":
        return (
          <OutlineAside
            useCases={useCases}
            draftUrl={draftUrl!}
            links={draftLinks(draftUrl!)}
            currentKey={currentOutlineKey(route)}
            problems={found.draft}
          />
        );
      case "peek":
        return <DeckPeekContainer useCases={useCases} instance={activeInstance!} route={route} deckUrl={(route as HomeRoute).deckUrl ?? null} />;
      case "plan":
        return <LibraryPlanContainer useCases={useCases} instance={activeInstance!} deckUrl={libraryDeck} />;
    }
  };

  const screenFor = (route: StudioRoute) => {
    switch (route.screen) {
      case "draft":
        return (
          <DraftOverviewContainer
            key={route.draftUrl}
            useCases={useCases}
            draftUrl={route.draftUrl}
            links={draftLinks(route.draftUrl)}
            {...(route.field === undefined ? {} : { field: route.field })}
          />
        );
      case "check":
        return (
          <ReleaseCheckContainer
            // Another draft or policy: the shapes are asked afresh.
            key={`${route.draftUrl} ${route.policy ?? "pod"}`}
            useCases={useCases}
            draftUrl={route.draftUrl}
            policy={route.policy ?? "pod"}
            links={{
              policyHref: (policy) => studioRouteToHash({ screen: "check", draftUrl: route.draftUrl, policy }),
              targetHref: (target) => studioRouteToHash(targetRoute(route.draftUrl, target)),
            }}
          />
        );
      case "preview":
        return <ListingPreviewContainer key={route.draftUrl} useCases={useCases} draftUrl={route.draftUrl} />;
      case "diff":
        return (
          <ReleaseDiffContainer
            key={route.draftUrl}
            useCases={useCases}
            draftUrl={route.draftUrl}
            links={{ targetHref: (target) => studioRouteToHash(targetRoute(route.draftUrl, target)) }}
          />
        );
      case "release":
        return (
          <ReleaseMetadataContainer
            key={route.draftUrl}
            useCases={useCases}
            draftUrl={route.draftUrl}
            links={draftLinks(route.draftUrl)}
            publishLinks={{
              checkHref: studioRouteToHash({ screen: "check", draftUrl: route.draftUrl }),
              libraryCheckHref: studioRouteToHash({ screen: "check", draftUrl: route.draftUrl, policy: "library" }),
              healthHref: studioRouteToHash({ screen: "health", instanceUrl: instanceOfRoute(route)! }),
            }}
            {...(route.field === undefined ? {} : { field: route.field })}
            onStarted={(created) => navigate({ screen: "draft", draftUrl: created.draft.url })}
          />
        );
      case "trial":
        return (
          <TrialContainer
            // Another draft: a trial of its own. Its chapters are the same trial's.
            key={route.draftUrl}
            useCases={useCases}
            draftUrl={route.draftUrl}
            chapter={route.chapter}
            review={route.review === true}
            links={{
              courseHref: studioRouteToHash({ screen: "trial", draftUrl: route.draftUrl }),
              chapterHref: (chapter) => studioRouteToHash({ screen: "trial", draftUrl: route.draftUrl, chapter }),
              reviewHref: (chapter) => studioRouteToHash({ screen: "trial", draftUrl: route.draftUrl, chapter, review: true }),
              targetHref: (target) => studioRouteToHash(targetRoute(route.draftUrl, target)),
            }}
            onReview={(chapter) => navigate({ screen: "trial", draftUrl: route.draftUrl, chapter, review: true })}
            onCourse={() => navigate({ screen: "trial", draftUrl: route.draftUrl })}
            onJump={(chapter) => navigate({ screen: "trial", draftUrl: route.draftUrl, chapter })}
          />
        );
      case "chapter":
        return (
          <ChapterEditorContainer
            // Another chapter: its fields start afresh.
            key={`${route.draftUrl} ${route.chapter}`}
            useCases={useCases}
            draftUrl={route.draftUrl}
            chapter={route.chapter}
            links={draftLinks(route.draftUrl)}
            {...(route.field === undefined ? {} : { field: route.field })}
            onDeleted={() => replace({ screen: "draft", draftUrl: route.draftUrl })}
          />
        );
      case "step":
        return (
          <StepEditorContainer
            key={`${route.draftUrl} ${route.step}`}
            useCases={useCases}
            draftUrl={route.draftUrl}
            step={route.step}
            links={draftLinks(route.draftUrl)}
            {...(route.field === undefined ? {} : { field: route.field })}
            onDeleted={() => replace({ screen: "draft", draftUrl: route.draftUrl })}
          />
        );
      case "question":
        return (
          <QuestionEditorContainer
            key={`${route.draftUrl} ${route.card}`}
            useCases={useCases}
            draftUrl={route.draftUrl}
            card={route.card}
            links={draftLinks(route.draftUrl)}
            {...(route.field === undefined ? {} : { field: route.field })}
            onDeleted={() => replace({ screen: "draftCards", draftUrl: route.draftUrl })}
          />
        );
      case "draftCards":
        return (
          <DraftCardsContainer
            key={route.draftUrl}
            useCases={useCases}
            draftUrl={route.draftUrl}
            view={route}
            links={draftLinks(route.draftUrl)}
            // Like the workbench's query, the view is no Back stop.
            onView={(view) => replace({ screen: "draftCards", draftUrl: route.draftUrl, ...view })}
            onOpen={(card) => navigate({ screen: "question", draftUrl: route.draftUrl, card })}
          />
        );
      case "instances":
        return (
          <InstancePickerContainer
            useCases={useCases}
            session={session}
            instances={instances!}
            // Instances are made in Solid Memo, from a storage in the user's Pod.
            newInstanceHref={routeToHash({ screen: "storagePicker" })}
            onOpen={(instance) => navigate({ screen: "home", instanceUrl: instance.url })}
          />
        );
      case "home": {
        const { view: _view, show: _show, ...rest } = route;
        return (
          <DeckTableContainer
            useCases={useCases}
            instance={activeInstance!}
            view={route.view ?? DEFAULT_DECK_TABLE_VIEW}
            // How the table is looked at is no Back stop: the screen stays the same.
            onView={(view) => replace({ ...route, view })}
            shownView={viewOf(route)}
            onShow={(view) => replace({ ...rest, ...withView(route, view) })}
            {...saved("home")}
            onApply={(query) => replace({ ...rest, ...query })}
            current={route.deckUrl}
            // Nor is the deck shown beside it.
            onCursor={(deck) => replace({ ...route, deckUrl: deck.url })}
            onOpen={(deck) => navigate({ screen: "about", deckUrl: deck.url })}
            appHref={decksHref(route.instanceUrl)}
            healthHref={(deck) => studioRouteToHash({ screen: "health", instanceUrl: route.instanceUrl, ...(deck === undefined ? {} : { deckUrl: deck.url }) })}
            libraryHref={studioRouteToHash({ screen: "library", instanceUrl: route.instanceUrl })}
            transferHref={(decks) =>
              studioRouteToHash({ screen: "transfer", instanceUrl: route.instanceUrl, deckUrls: decks.map((deck) => deck.url) })
            }
            deckHref={(deck) => studioRouteToHash({ screen: "about", deckUrl: deck.url })}
            cardsHref={(deck) => studioRouteToHash({ screen: "cards", deckUrl: deck.url })}
          />
        );
      }
      case "drafts":
        return (
          <DraftsContainer
            // Another instance: no draft started for the last one stays.
            key={route.instanceUrl}
            useCases={useCases}
            instance={activeInstance!}
            healthHref={studioRouteToHash({ screen: "health", instanceUrl: route.instanceUrl })}
            releasesHref={studioRouteToHash({ screen: "releases", instanceUrl: route.instanceUrl })}
            draftHref={(draft) => studioRouteToHash({ screen: "draft", draftUrl: draft.url })}
            onCreated={(created) => navigate({ screen: "draft", draftUrl: created.draft.url })}
          />
        );
      case "releases":
        return (
          <ReleasesContainer
            key={route.instanceUrl}
            useCases={useCases}
            instance={activeInstance!}
            healthHref={studioRouteToHash({ screen: "health", instanceUrl: route.instanceUrl })}
            draftsHref={studioRouteToHash({ screen: "drafts", instanceUrl: route.instanceUrl })}
            draftHref={(draft) => studioRouteToHash({ screen: "draft", draftUrl: draft.url })}
            onStarted={(created) => navigate({ screen: "draft", draftUrl: created.draft.url })}
          />
        );
      case "groups":
        return (
          <GroupsContainer
            useCases={useCases}
            instance={activeInstance!}
            healthHref={studioRouteToHash({ screen: "health", instanceUrl: route.instanceUrl })}
          />
        );
      case "health":
        return (
          <HealthContainer
            useCases={useCases}
            instance={activeInstance!}
            deck={activeDeck}
            spotHref={(deck, spot) => studioRouteToHash(spotRoute(deck.url, spot))}
            aboutHref={(deck) => studioRouteToHash({ screen: "about", deckUrl: deck.url })}
            deckHref={(deck) => studioRouteToHash({ screen: "health", instanceUrl: route.instanceUrl, deckUrl: deck.url })}
          />
        );
      case "library":
        return (
          <LibraryCopiesContainer
            useCases={useCases}
            instance={activeInstance!}
            deckHref={(deck) => studioRouteToHash({ screen: "about", deckUrl: deck.url })}
            libraryHref={libraryHref(route.instanceUrl)}
            healthHref={studioRouteToHash({ screen: "health", instanceUrl: route.instanceUrl })}
            current={libraryDeck ?? undefined}
            onCursor={(deck) => setLibraryDeck(deck.url)}
          />
        );
      case "transfer":
        // Another instance: no file or status of the last one stays.
        return (
          <TransferContainer
            key={route.instanceUrl}
            useCases={useCases}
            instance={activeInstance!}
            chosen={route.deckUrls ?? []}
            // Like Home's view, which decks are ticked is no Back stop.
            onChoose={(urls) => replace({ screen: "transfer", instanceUrl: route.instanceUrl, ...(urls.length === 0 ? {} : { deckUrls: urls }) })}
            cardsHref={(deck) => studioRouteToHash({ screen: "cards", deckUrl: deck.url })}
            healthHref={studioRouteToHash({ screen: "health", instanceUrl: route.instanceUrl })}
          />
        );
      case "instance":
        // Another instance: its forms start afresh.
        return (
          <InstanceAboutContainer
            key={route.instanceUrl}
            useCases={useCases}
            session={session}
            instance={activeInstance!}
            healthHref={studioRouteToHash({ screen: "health", instanceUrl: route.instanceUrl })}
          />
        );
      case "about":
        return (
          <DeckAboutContainer
            // Another deck: its forms start afresh.
            key={route.deckUrl}
            useCases={useCases}
            instance={activeInstance!}
            deck={activeDeck!}
            appHref={deckHref(activeInstance!.url, route.deckUrl)}
            healthHref={studioRouteToHash({ screen: "health", instanceUrl: activeInstance!.url, deckUrl: route.deckUrl })}
          />
        );
      case "cards":
        return workbench(route);
      case "schedule":
        return (
          <DeckInsightContainer
            useCases={useCases}
            instance={activeInstance!}
            deck={activeDeck!}
            cardHref={(card) => studioRouteToHash({ screen: "card", deckUrl: route.deckUrl, cardUrl: card.url, tab: "history" })}
            leechesHref={studioRouteToHash({
              screen: "cards",
              deckUrl: route.deckUrl,
              query: { ...DEFAULT_CARD_QUERY, state: "leech", sort: { key: "lapses", descending: true } },
            })}
          />
        );
      case "card":
        return split ? workbench(route) : inspector(route);
    }
  };

  return (
    <StudioShell
      banner={banner}
      backHref={instanceUrl === null ? "#/" : decksHref(instanceUrl)}
      route={route}
      instances={instances ?? []}
      instance={activeInstance}
      switcher={activeInstance !== null && <InstanceSwitcher instances={instances!} instance={activeInstance} />}
      sidebar={
        activeInstance === null ? null : (
          <StudioSidebar
            useCases={useCases}
            instance={activeInstance}
            route={route!}
            pinned={mine.prefs.pinned}
            recent={mine.prefs.recent}
            onPin={(item) => mine.change((prefs) => ({ ...prefs, pinned: togglePin(prefs.pinned, item) }))}
          />
        )
      }
      tabs={tabs?.tabs ?? []}
      draftUrl={draftUrl}
      aside={
        split && waiting === null
          ? {
              label: t("studio.card.detail"),
              content: (
                <div ref={detailRef} class="screen">
                  {inspector(route as CardRoute)}
                </div>
              ),
              detail: { closeLabel: t("studio.card.close"), onClose: () => unsaved.guard(() => navigate(workbenchOf(route as CardRoute))) },
            }
          : aside === null
            ? null
            : { label: t(ASIDE_LABELS[aside]), content: asideFor(aside, route!) }
      }
      problems={found.problems}
      pinned={mine.prefs.pinned}
      status={
        found.publish !== null && (
          <PublishState
            readiness={found.publish}
            checkHref={studioRouteToHash({ screen: "check", draftUrl: draftUrl! })}
            releaseHref={studioRouteToHash({ screen: "release", draftUrl: draftUrl! })}
          />
        )
      }
      onGo={(to) => unsaved.guard(() => navigate(to))}
    >
      {children}
      {unsaved.dialog}
      {waiting === null && <Breadcrumbs crumbs={crumbs} toHash={studioRouteToHash} />}
      {tabs !== null && (
        <ContextTabs
          label={t(`studio.tabs.${tabs.of}`)}
          tabs={tabs.tabs.map((tab) => ({
            key: tab.key,
            href: studioRouteToHash(tab.route),
            label:
              tab.key === "check" && checkCount > 0 ? (
                <>
                  {t("studio.tabs.check")} <ProblemCount count={checkCount} />
                </>
              ) : (
                t(`studio.tabs.${tab.key}`)
              ),
            current: tab.current,
          }))}
        />
      )}
      <div ref={screenRef} class="screen">
        <UnsavedEdits.Provider value={unsaved.report}>{waiting ?? screenFor(route!)}</UnsavedEdits.Provider>
      </div>
    </StudioShell>
  );
}

/** What each aside is named, as its region. */
const ASIDE_LABELS = { outline: "studio.draft.outline", peek: "studio.peek.label", plan: "studio.library.plan" } as const;

type HomeRoute = Extract<StudioRoute, { screen: "home" }>;

/** A card's route but the field it opens at, which another tab or card does not. */
function withoutField({ field: _field, ...route }: CardRoute): CardRoute {
  return route;
}

/**
 * Whether the subject a draft's route names is there to show: a chapter,
 * a step or a card it has (a card it can read); null for a route of the
 * draft as a whole, which is always there.
 */
function subjectOf(draft: ReleaseDraft, route: StudioRoute): boolean | null {
  switch (route.screen) {
    case "chapter":
      return draft.chapters.some((node) => node.id === route.chapter);
    case "step":
      return draft.steps.some((node) => node.id === route.step);
    case "question":
      return draftCardOf(draft, route.card) !== null;
    default:
      return null;
  }
}
