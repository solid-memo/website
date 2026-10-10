import { useEffect } from "preact/hooks";
import { useQuery } from "@tanstack/react-query";
import { DEFAULT_CARD_QUERY } from "@solid-memo/domain/cardQuery";
import { DEFAULT_DECK_TABLE_VIEW } from "@solid-memo/domain/deckTable";
import type { Card } from "@solid-memo/domain/deck";
import type { WorkspaceProps } from "@solid-memo/ui/App";
import { Breadcrumbs, type Crumb } from "@solid-memo/ui/Breadcrumbs";
import { cardName } from "@solid-memo/ui/DataText";
import { useDocumentTitle } from "@solid-memo/ui/documentTitle";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n } from "@solid-memo/ui/i18n";
import { InstancePickerContainer } from "@solid-memo/ui/InstancePickerContainer";
import { Loading } from "@solid-memo/ui/Loading";
import { decksHref, deckHref, libraryHref, routeToHash } from "@solid-memo/ui/router";
import { useScreenFocus } from "@solid-memo/ui/screenFocus";
import { MAIN_ID } from "@solid-memo/ui/SkipLink";
import { useInstanceTheme } from "@solid-memo/ui/theme";
import { chapterOfStep, draftCardOf } from "@solid-memo/domain/release/draftOutline";
import { liveSteps, type ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { CardInspectorContainer } from "./CardInspectorContainer";
import { CardWorkbenchContainer } from "./CardWorkbenchContainer";
import { DeckAboutContainer } from "./DeckAboutContainer";
import { DeckInsightContainer } from "./DeckInsightContainer";
import { DeckTableContainer } from "./DeckTableContainer";
import { DraftsContainer, HomeDraftsContainer } from "./DraftsContainer";
import { GroupsContainer } from "./GroupsContainer";
import { HealthContainer } from "./HealthContainer";
import { InstanceAboutContainer } from "./InstanceAboutContainer";
import { LibraryCopiesContainer } from "./LibraryCopiesContainer";
import { TransferContainer } from "./TransferContainer";
import { ChapterEditorContainer } from "./ChapterEditorContainer";
import { DraftCardsContainer } from "./DraftCardsContainer";
import { draftKey } from "./draftEditor";
import { DraftOverviewContainer } from "./DraftOverviewContainer";
import type { DraftLinks } from "./DraftOverviewScreen";
import { QuestionEditorContainer } from "./QuestionEditorContainer";
import { StepEditorContainer } from "./StepEditorContainer";
import { instanceOfRoute, isDraftRoute, spotRoute, studioRouteToHash, useStudioRoute, type StudioRoute } from "./router";

/**
 * The signed-in Studio: the site header, with a way back to Solid Memo,
 * then the main content, from the breadcrumbs to the screen the route
 * names, once the instances it needs are read (and, for a deck's
 * screen, the instance's decks; for a card's, the deck's cards).
 */
export function StudioWorkspace({ useCases, session, banner, children }: WorkspaceProps) {
  const { t, errorText, readerText } = useI18n();
  const { route, change, navigate, replace } = useStudioRoute();
  const screenRef = useScreenFocus(route, change);

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

  useInstanceTheme(useCases, activeInstance?.url ?? null);

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
      replace({ screen: "cards", deckUrl: deckUrl! });
    } else if (activeDraft !== null && draftSubject === false) {
      // A chapter, step or card the draft does not have (deleted, perhaps): the draft's overview.
      replace({ screen: "draft", draftUrl: draftUrl! });
    }
  }, [route, instances, decksQuery.data, cardsQuery.data, draftQuery.data]);

  const instancesCrumb: Crumb<StudioRoute> = { label: t("breadcrumbs.instances"), route: { screen: "instances" } };
  /** The trail to a draft: its instance's drafts, then the draft. */
  const draftCrumbs = (draftUrl: string): Crumb<StudioRoute>[] => {
    const title = activeDraft!.root.title ?? {};
    return [
      { label: t("studio.drafts.crumb"), route: { screen: "drafts", instanceUrl: instanceOfRoute(route!)! } },
      { label: Object.keys(title).length === 0 ? t("studio.draft.untitled") : readerText(title), route: { screen: "draft", draftUrl } },
    ];
  };
  const crumbsOf = (route: StudioRoute): Crumb<StudioRoute>[] => {
    if (route.screen === "instances") return [instancesCrumb];
    const decks: Crumb<StudioRoute> = { label: t("breadcrumbs.decks"), route: { screen: "home", instanceUrl: instanceOfRoute(route)! } };
    switch (route.screen) {
      case "home":
        return [instancesCrumb, { ...decks, route }];
      case "groups":
        return [instancesCrumb, decks, { label: t("breadcrumbs.groups"), route }];
      case "instance":
        return [instancesCrumb, decks, { label: t("studio.instance.crumb"), route }];
      case "library":
        return [instancesCrumb, decks, { label: t("studio.library.crumb"), route }];
      case "transfer":
        return [instancesCrumb, decks, { label: t("studio.transfer.crumb"), route }];
      case "drafts":
        return [instancesCrumb, decks, { label: t("studio.drafts.crumb"), route }];
      case "health": {
        const health: Crumb<StudioRoute> = { label: t("studio.health.crumb"), route: { screen: "health", instanceUrl: route.instanceUrl } };
        return route.deckUrl === undefined
          ? [instancesCrumb, decks, health]
          : [instancesCrumb, decks, health, { label: readerText(activeDeck!.title), route }];
      }
      case "about":
        return [instancesCrumb, decks, { label: t("studio.about.crumb", { deck: readerText(activeDeck!.title) }), route }];
      case "cards":
        return [instancesCrumb, decks, { label: t("studio.cards.crumb", { deck: readerText(activeDeck!.title) }), route }];
      case "schedule":
        return [
          instancesCrumb,
          decks,
          { label: t("studio.cards.crumb", { deck: readerText(activeDeck!.title) }), route: { screen: "cards", deckUrl: route.deckUrl } },
          { label: t("studio.insight.crumb"), route },
        ];
      case "card":
        return [
          instancesCrumb,
          decks,
          { label: t("studio.cards.crumb", { deck: readerText(activeDeck!.title) }), route: { screen: "cards", deckUrl: route.deckUrl } },
          { label: cardName(activeCard!, readerText), route },
        ];
      case "draft":
        return [instancesCrumb, decks, ...draftCrumbs(route.draftUrl)];
      case "draftCards":
        return [instancesCrumb, decks, ...draftCrumbs(route.draftUrl), { label: t("studio.draftCards.crumb"), route }];
      case "chapter":
        return [instancesCrumb, decks, ...draftCrumbs(route.draftUrl), { label: chapterName(activeDraft!, route.chapter), route }];
      case "step": {
        const chapter = chapterOfStep(activeDraft!, route.step);
        return [
          instancesCrumb,
          decks,
          ...draftCrumbs(route.draftUrl),
          ...(chapter === null ? [] : [{ label: chapterName(activeDraft!, chapter), route: { screen: "chapter" as const, draftUrl: route.draftUrl, chapter } }]),
          { label: stepName(activeDraft!, route.step), route },
        ];
      }
      case "question":
        return [
          instancesCrumb,
          decks,
          ...draftCrumbs(route.draftUrl),
          { label: t("studio.draftCards.crumb"), route: { screen: "draftCards", draftUrl: route.draftUrl } },
          { label: cardName({ ...draftCardOf(activeDraft!, route.card)!.content, id: route.card }, readerText), route },
        ];
    }
  };
  const chapterName = (draft: ReleaseDraft, chapter: string) => {
    const title = draft.chapters.find((node) => node.id === chapter)!.data.title;
    return title === undefined ? chapter : readerText(title);
  };
  const stepName = (draft: ReleaseDraft, step: string) => {
    const chapter = chapterOfStep(draft, step);
    const number = chapter === null ? -1 : liveSteps(draft, chapter).findIndex((node) => node.id === step);
    return number === -1 ? step : t("studio.chapter.step", { number: number + 1 });
  };
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
  const crumbs = waiting === null ? crumbsOf(route!) : [];
  // The page the trail ends at: "Decks – Solid Memo Studio".
  useDocumentTitle(crumbs.slice(-1).map((crumb) => crumb.label));

  const draftLinks = (draftUrl: string): DraftLinks => ({
    draftsHref: studioRouteToHash({ screen: "drafts", instanceUrl: instanceOfRoute(route!)! }),
    healthHref: studioRouteToHash({ screen: "health", instanceUrl: instanceOfRoute(route!)! }),
    overviewHref: studioRouteToHash({ screen: "draft", draftUrl }),
    cardsHref: studioRouteToHash({ screen: "draftCards", draftUrl }),
    chapterHref: (chapter) => studioRouteToHash({ screen: "chapter", draftUrl, chapter }),
    stepHref: (step) => studioRouteToHash({ screen: "step", draftUrl, step }),
    questionHref: (card) => studioRouteToHash({ screen: "question", draftUrl, card }),
  });

  const screenFor = (route: StudioRoute) => {
    switch (route.screen) {
      case "draft":
        return <DraftOverviewContainer key={route.draftUrl} useCases={useCases} draftUrl={route.draftUrl} links={draftLinks(route.draftUrl)} />;
      case "chapter":
        return (
          <ChapterEditorContainer
            // Another chapter: its fields start afresh.
            key={`${route.draftUrl} ${route.chapter}`}
            useCases={useCases}
            draftUrl={route.draftUrl}
            chapter={route.chapter}
            links={draftLinks(route.draftUrl)}
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
      case "home":
        return (
          <>
            <DeckTableContainer
              useCases={useCases}
              instance={activeInstance!}
              view={route.view ?? DEFAULT_DECK_TABLE_VIEW}
              // How the table is looked at is no Back stop: the screen stays the same.
              onView={(view) => replace({ ...route, view })}
              appHref={decksHref(route.instanceUrl)}
              groupsHref={studioRouteToHash({ screen: "groups", instanceUrl: route.instanceUrl })}
              instanceHref={studioRouteToHash({ screen: "instance", instanceUrl: route.instanceUrl })}
              healthHref={(deck) => studioRouteToHash({ screen: "health", instanceUrl: route.instanceUrl, ...(deck === undefined ? {} : { deckUrl: deck.url }) })}
              libraryHref={studioRouteToHash({ screen: "library", instanceUrl: route.instanceUrl })}
              transferHref={(decks) =>
                studioRouteToHash({ screen: "transfer", instanceUrl: route.instanceUrl, deckUrls: decks.map((deck) => deck.url) })
              }
              deckHref={(deck) => studioRouteToHash({ screen: "about", deckUrl: deck.url })}
              cardsHref={(deck) => studioRouteToHash({ screen: "cards", deckUrl: deck.url })}
              draftsHref={studioRouteToHash({ screen: "drafts", instanceUrl: route.instanceUrl })}
            />
            <HomeDraftsContainer
              useCases={useCases}
              instance={activeInstance!}
              draftsHref={studioRouteToHash({ screen: "drafts", instanceUrl: route.instanceUrl })}
              draftHref={(draft) => studioRouteToHash({ screen: "draft", draftUrl: draft.url })}
            />
          </>
        );
      case "drafts":
        return (
          <DraftsContainer
            // Another instance: no draft started for the last one stays.
            key={route.instanceUrl}
            useCases={useCases}
            instance={activeInstance!}
            healthHref={studioRouteToHash({ screen: "health", instanceUrl: route.instanceUrl })}
            draftHref={(draft) => studioRouteToHash({ screen: "draft", draftUrl: draft.url })}
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
      case "cards": {
        const inspector = (card: Card): StudioRoute => ({ screen: "card", deckUrl: route.deckUrl, cardUrl: card.url });
        return (
          <CardWorkbenchContainer
            // Another deck's cards: a new page, its selection and its Undo gone.
            key={route.deckUrl}
            useCases={useCases}
            instance={activeInstance!}
            deck={activeDeck!}
            decks={decksQuery.data!}
            query={route.query ?? DEFAULT_CARD_QUERY}
            // Like Home's view, the query is no Back stop.
            onQuery={(query) => replace({ ...route, query })}
            cardHref={(card) => studioRouteToHash(inspector(card))}
            onOpen={(card) => navigate(inspector(card))}
            scheduleHref={studioRouteToHash({ screen: "schedule", deckUrl: route.deckUrl })}
            healthHref={studioRouteToHash({ screen: "health", instanceUrl: activeInstance!.url, deckUrl: route.deckUrl })}
            exportHref={studioRouteToHash({ screen: "transfer", instanceUrl: activeInstance!.url, deckUrls: [route.deckUrl] })}
          />
        );
      }
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
            tabHref={(tab) => studioRouteToHash({ screen: "card", deckUrl: route.deckUrl, cardUrl: route.cardUrl, tab })}
            // Like the workbench's query, the tab is no Back stop.
            onTab={(tab) => replace({ screen: "card", deckUrl: route.deckUrl, cardUrl: route.cardUrl, tab })}
            appHref={routeToHash({ screen: "card", instanceUrl: activeInstance!.url, deckUrl: route.deckUrl, cardUrl: route.cardUrl })}
            healthHref={studioRouteToHash({ screen: "health", instanceUrl: activeInstance!.url, deckUrl: route.deckUrl })}
            onRemoved={() => replace({ screen: "cards", deckUrl: route.deckUrl })}
          />
        );
    }
  };

  return (
    <>
      <header class="site-header">
        {banner}
        <p class="header-link">
          <a href={instanceUrl === null ? "#/" : decksHref(instanceUrl)}>{t("studio.backToApp")}</a>
        </p>
      </header>
      <main id={MAIN_ID} tabIndex={-1} class="workspace">
        {children}
        {waiting === null && <Breadcrumbs crumbs={crumbs} toHash={studioRouteToHash} />}
        <div ref={screenRef} class="screen">
          {waiting ?? screenFor(route!)}
        </div>
      </main>
    </>
  );
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
