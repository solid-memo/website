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
import { decksHref, deckHref, routeToHash } from "@solid-memo/ui/router";
import { useScreenFocus } from "@solid-memo/ui/screenFocus";
import { MAIN_ID } from "@solid-memo/ui/SkipLink";
import { useInstanceTheme } from "@solid-memo/ui/theme";
import { CardInspectorContainer } from "./CardInspectorContainer";
import { CardWorkbenchContainer } from "./CardWorkbenchContainer";
import { DeckAboutContainer } from "./DeckAboutContainer";
import { DeckTableContainer } from "./DeckTableContainer";
import { GroupsContainer } from "./GroupsContainer";
import { InstanceAboutContainer } from "./InstanceAboutContainer";
import { instanceOfRoute, studioRouteToHash, useStudioRoute, type StudioRoute } from "./router";

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
  const deckUrl = route?.screen === "cards" || route?.screen === "card" || route?.screen === "about" ? route.deckUrl : null;
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
    }
  }, [route, instances, decksQuery.data, cardsQuery.data]);

  const instancesCrumb: Crumb<StudioRoute> = { label: t("breadcrumbs.instances"), route: { screen: "instances" } };
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
      case "about":
        return [instancesCrumb, decks, { label: t("studio.about.crumb", { deck: readerText(activeDeck!.title) }), route }];
      case "cards":
        return [instancesCrumb, decks, { label: t("studio.cards.crumb", { deck: readerText(activeDeck!.title) }), route }];
      case "card":
        return [
          instancesCrumb,
          decks,
          { label: t("studio.cards.crumb", { deck: readerText(activeDeck!.title) }), route: { screen: "cards", deckUrl: route.deckUrl } },
          { label: cardName(activeCard!, readerText), route },
        ];
    }
  };
  const waiting = instancesQuery.error ? (
    <ErrorMessage error={errorText(instancesQuery.error)} />
  ) : deckUrl !== null && decksQuery.error ? (
    <ErrorMessage error={errorText(decksQuery.error)} />
  ) : cardUrl !== null && cardsQuery.error ? (
    <ErrorMessage error={errorText(cardsQuery.error)} />
  ) : route === null ||
    instances === undefined ||
    (instanceUrl !== null && activeInstance === null) ||
    (deckUrl !== null && activeDeck === null) ||
    (cardUrl !== null && activeCard === null) ? (
    <Loading label={t("workspace.loadingInstances")} />
  ) : null;
  const crumbs = waiting === null ? crumbsOf(route!) : [];
  // The page the trail ends at: "Decks – Solid Memo Studio".
  useDocumentTitle(crumbs.slice(-1).map((crumb) => crumb.label));

  const screenFor = (route: StudioRoute) => {
    switch (route.screen) {
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
          <DeckTableContainer
            useCases={useCases}
            instance={activeInstance!}
            view={route.view ?? DEFAULT_DECK_TABLE_VIEW}
            // How the table is looked at is no Back stop: the screen stays the same.
            onView={(view) => replace({ ...route, view })}
            appHref={decksHref(route.instanceUrl)}
            groupsHref={studioRouteToHash({ screen: "groups", instanceUrl: route.instanceUrl })}
            instanceHref={studioRouteToHash({ screen: "instance", instanceUrl: route.instanceUrl })}
            deckHref={(deck) => studioRouteToHash({ screen: "about", deckUrl: deck.url })}
            cardsHref={(deck) => studioRouteToHash({ screen: "cards", deckUrl: deck.url })}
          />
        );
      case "groups":
        return <GroupsContainer useCases={useCases} instance={activeInstance!} />;
      case "instance":
        // Another instance: its forms start afresh.
        return <InstanceAboutContainer key={route.instanceUrl} useCases={useCases} session={session} instance={activeInstance!} />;
      case "about":
        return (
          <DeckAboutContainer
            // Another deck: its forms start afresh.
            key={route.deckUrl}
            useCases={useCases}
            instance={activeInstance!}
            deck={activeDeck!}
            appHref={deckHref(activeInstance!.url, route.deckUrl)}
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
          />
        );
      }
      case "card":
        return (
          <CardInspectorContainer
            // Another card: its editors start afresh.
            key={route.cardUrl}
            useCases={useCases}
            deck={activeDeck!}
            card={activeCard!}
            tab={route.tab ?? "content"}
            tabHref={(tab) => studioRouteToHash({ ...route, tab })}
            // Like the workbench's query, the tab is no Back stop.
            onTab={(tab) => replace({ ...route, tab })}
            appHref={routeToHash({ screen: "card", instanceUrl: activeInstance!.url, deckUrl: route.deckUrl, cardUrl: route.cardUrl })}
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
