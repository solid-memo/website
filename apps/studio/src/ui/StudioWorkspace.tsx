import { useEffect } from "preact/hooks";
import { useQuery } from "@tanstack/react-query";
import { DEFAULT_DECK_TABLE_VIEW } from "@solid-memo/domain/deckTable";
import type { WorkspaceProps } from "@solid-memo/ui/App";
import { Breadcrumbs, type Crumb } from "@solid-memo/ui/Breadcrumbs";
import { useDocumentTitle } from "@solid-memo/ui/documentTitle";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n } from "@solid-memo/ui/i18n";
import { InstancePickerContainer } from "@solid-memo/ui/InstancePickerContainer";
import { Loading } from "@solid-memo/ui/Loading";
import { decksHref, deckHref, routeToHash } from "@solid-memo/ui/router";
import { useScreenFocus } from "@solid-memo/ui/screenFocus";
import { MAIN_ID } from "@solid-memo/ui/SkipLink";
import { useInstanceTheme } from "@solid-memo/ui/theme";
import { DeckTableContainer } from "./DeckTableContainer";
import { GroupsContainer } from "./GroupsContainer";
import { learnerApp } from "./learnerApp";
import { studioRouteToHash, useStudioRoute, type StudioRoute } from "./router";

/**
 * The signed-in Studio: the site header, with a way back to Solid Memo,
 * then the main content, from the breadcrumbs to the screen the route
 * names, once the instances it needs are read.
 */
export function StudioWorkspace({ useCases, session, banner, children }: WorkspaceProps) {
  const { t, errorText } = useI18n();
  const { route, change, navigate, replace } = useStudioRoute();
  const screenRef = useScreenFocus(route, change);

  const instancesQuery = useQuery({
    queryKey: ["instances", session.webId],
    queryFn: () => useCases.listInstances(session),
  });
  const instances = instancesQuery.data;
  const instanceUrl = route === null || route.screen === "instances" ? null : route.instanceUrl;
  const activeInstance = instanceUrl === null ? null : (instances?.find((i) => i.url === instanceUrl) ?? null);

  useInstanceTheme(useCases, activeInstance?.url ?? null);

  // No route: the only instance's decks, else the picker. An instance the
  // user does not have: the picker. Neither is a Back stop.
  useEffect(() => {
    if (instances === undefined) return;
    if (route === null) {
      replace(instances.length === 1 ? { screen: "home", instanceUrl: instances[0]!.url } : { screen: "instances" });
    } else if (instanceUrl !== null && !instances.some((i) => i.url === instanceUrl)) {
      replace({ screen: "instances" });
    }
  }, [route, instances]);

  const instancesCrumb: Crumb<StudioRoute> = { label: t("breadcrumbs.instances"), route: { screen: "instances" } };
  const crumbs: Crumb<StudioRoute>[] =
    route === null
      ? []
      : route.screen === "instances"
        ? [instancesCrumb]
        : route.screen === "home"
          ? [instancesCrumb, { label: t("breadcrumbs.decks"), route }]
          : [
              instancesCrumb,
              { label: t("breadcrumbs.decks"), route: { screen: "home", instanceUrl: route.instanceUrl } },
              { label: t("breadcrumbs.groups"), route },
            ];
  // The page the trail ends at: "Decks – Solid Memo Studio".
  useDocumentTitle(crumbs.slice(-1).map((crumb) => crumb.label));

  const waiting = instancesQuery.error ? (
    <ErrorMessage error={errorText(instancesQuery.error)} />
  ) : route === null || instances === undefined || (instanceUrl !== null && activeInstance === null) ? (
    <Loading label={t("workspace.loadingInstances")} />
  ) : null;

  const screenFor = (route: StudioRoute) => {
    switch (route.screen) {
      case "instances":
        return (
          <InstancePickerContainer
            useCases={useCases}
            session={session}
            instances={instances!}
            // Instances are made in Solid Memo, from a storage in the user's Pod.
            newInstanceHref={learnerApp(routeToHash({ screen: "storagePicker" }))}
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
            appHref={learnerApp(decksHref(route.instanceUrl))}
            groupsHref={studioRouteToHash({ screen: "groups", instanceUrl: route.instanceUrl })}
            deckHref={(deck) => learnerApp(deckHref(route.instanceUrl, deck.url))}
            cardsHref={(deck) =>
              learnerApp(routeToHash({ screen: "browser", instanceUrl: route.instanceUrl, deckUrl: deck.url }))
            }
          />
        );
      case "groups":
        return <GroupsContainer useCases={useCases} instance={activeInstance!} />;
    }
  };

  return (
    <>
      <header class="site-header">
        {banner}
        <p class="header-link">
          <a href={learnerApp(instanceUrl === null ? "#/" : decksHref(instanceUrl))}>{t("studio.backToApp")}</a>
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
