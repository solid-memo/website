import { useEffect } from "preact/hooks";
import { useQuery } from "@tanstack/react-query";
import type { WorkspaceProps } from "@solid-memo/ui/App";
import { Breadcrumbs, type Crumb } from "@solid-memo/ui/Breadcrumbs";
import { useDocumentTitle } from "@solid-memo/ui/documentTitle";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n } from "@solid-memo/ui/i18n";
import { InstancePickerContainer } from "@solid-memo/ui/InstancePickerContainer";
import { Loading } from "@solid-memo/ui/Loading";
import { decksHref, routeToHash } from "@solid-memo/ui/router";
import { useScreenFocus } from "@solid-memo/ui/screenFocus";
import { MAIN_ID } from "@solid-memo/ui/SkipLink";
import { useInstanceTheme } from "@solid-memo/ui/theme";
import { DeckTableContainer } from "./DeckTableContainer";
import { studioRouteToHash, useStudioRoute, type StudioRoute } from "./router";

/**
 * Solid Memo itself, a folder up from the Studio on the same origin
 * (docs/studio.md), at one of its own routes (`hash`).
 */
const learnerApp = (hash: string) => `../${hash}`;

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
  const instanceUrl = route?.screen === "home" ? route.instanceUrl : null;
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
        : [instancesCrumb, { label: t("breadcrumbs.decks"), route }];
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
            appHref={learnerApp(decksHref(route.instanceUrl))}
          />
        );
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
