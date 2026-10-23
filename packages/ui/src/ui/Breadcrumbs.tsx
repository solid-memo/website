// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useI18n, type I18n } from "./i18n";
import { routeToHash, type RouteRef } from "./router";

/** One step of the trail. The last crumb is the current page. */
export interface Crumb<Route = RouteRef> {
  label: string;
  /** The language a deck's or card's name is in, when not the page's (readerLang). */
  lang?: string;
  route: Route;
}

/** Display names the route itself (URLs only) cannot supply. */
export interface CrumbNames {
  /** Name of the route's deck; read for routes inside a deck. */
  deck: string;
  /** Front of the route's card; read for the card page. */
  card: string;
  /** Name of the route's library deck; read for a library deck's page. */
  libraryDeck: string;
  /** Front of the route's library card; read for a library card's page. */
  libraryCard?: string;
  /** Title of the route's course chapter; read for a chapter and its final review. */
  chapter?: string;
  /** The language each name above is in, when not the page's. */
  deckLang?: string;
  cardLang?: string;
  libraryDeckLang?: string;
  libraryCardLang?: string;
  chapterLang?: string;
}

/**
 * The trail from the top of the app down to a route. Every screen has
 * one — a top-level screen's is a single crumb — so t("breadcrumbs.decks") (the list of
 * all decks) is on hand wherever the user is inside an instance.
 */
export function breadcrumbsFor(route: RouteRef, names: CrumbNames, t: I18n["t"]): Crumb[] {
  const instances: Crumb = {
    label: t("breadcrumbs.instances"),
    route: { screen: "instancePicker" },
  };
  switch (route.screen) {
    case "instancePicker":
      return [instances];
    case "storagePicker":
      return [instances, { label: t("breadcrumbs.storagePicker"), route }];
    case "instanceCreator":
      return [instances, { label: t("breadcrumbs.instanceCreator"), route }];
    // A link to a library deck shows the instances only to ask which to open it in.
    case "try":
      return [{ label: t("breadcrumbs.instances"), route }];
  }

  const decks: Crumb = {
    label: t("breadcrumbs.decks"),
    route: { screen: "home", instanceUrl: route.instanceUrl },
  };
  if (route.screen === "home") return [decks];
  if (route.screen === "deckCreator") {
    return [decks, { label: t("breadcrumbs.deckCreator"), route }];
  }
  const library: Crumb = {
    label: t("breadcrumbs.library"),
    route: { screen: "library", instanceUrl: route.instanceUrl },
  };
  if (route.screen === "library") return [decks, library];
  if (route.screen === "importUrl")
    return [decks, library, { label: t("breadcrumbs.importUrl"), route }];
  if (
    route.screen === "libraryDeck" ||
    route.screen === "libraryBrowser" ||
    route.screen === "libraryCard" ||
    route.screen === "libraryPreview"
  ) {
    const libraryDeck: Crumb = {
      label: names.libraryDeck,
      lang: names.libraryDeckLang,
      route: {
        screen: "libraryDeck",
        instanceUrl: route.instanceUrl,
        libraryDeckUrl: route.libraryDeckUrl,
      },
    };
    if (route.screen === "libraryDeck") return [decks, library, libraryDeck];
    if (route.screen === "libraryCard") {
      const cards: Crumb = {
        label: t("breadcrumbs.cards"),
        route: {
          screen: "libraryBrowser",
          instanceUrl: route.instanceUrl,
          libraryDeckUrl: route.libraryDeckUrl,
        },
      };
      return [
        decks,
        library,
        libraryDeck,
        cards,
        { label: names.libraryCard ?? "", lang: names.libraryCardLang, route },
      ];
    }
    return [
      decks,
      library,
      libraryDeck,
      {
        label:
          route.screen === "libraryBrowser" ? t("breadcrumbs.cards") : t("breadcrumbs.preview"),
        route,
      },
    ];
  }
  if (route.screen === "preferences") {
    return [decks, { label: t("breadcrumbs.preferences"), route }];
  }
  if (route.screen === "palette") {
    const preferences: Crumb = {
      label: t("breadcrumbs.preferences"),
      route: { screen: "preferences", instanceUrl: route.instanceUrl },
    };
    return [decks, preferences, { label: t("breadcrumbs.palette"), route }];
  }
  if (route.screen === "statistics") {
    return [decks, { label: t("breadcrumbs.statistics"), route }];
  }
  // Every deck's leeches are crammed from the statistics' memory tab, which lists them.
  if (route.screen === "cramAll") {
    const statistics: Crumb = {
      label: t("breadcrumbs.statistics"),
      route: { screen: "statistics", instanceUrl: route.instanceUrl, view: "memory" },
    };
    return [decks, statistics, { label: t("breadcrumbs.cram"), route }];
  }
  if (route.screen === "validation") {
    return [decks, { label: t("breadcrumbs.validation"), route }];
  }

  const deck: Crumb = {
    label: names.deck,
    lang: names.deckLang,
    route: {
      screen: "deckDetail",
      instanceUrl: route.instanceUrl,
      deckUrl: route.deckUrl,
    },
  };
  const browser: Crumb = {
    label: t("breadcrumbs.browser"),
    route: {
      screen: "browser",
      instanceUrl: route.instanceUrl,
      deckUrl: route.deckUrl,
    },
  };
  switch (route.screen) {
    case "deckDetail":
      return [decks, deck];
    case "deckPreferences":
      return [decks, deck, { label: t("breadcrumbs.preferences"), route }];
    case "browser":
      return [decks, deck, browser];
    case "cardCreator":
      return [decks, deck, browser, { label: t("breadcrumbs.cardCreator"), route }];
    case "card":
      return [decks, deck, browser, { label: names.card, lang: names.cardLang, route }];
    case "study":
      return [decks, deck, { label: t("breadcrumbs.study"), route }];
    case "cram":
      return [decks, deck, { label: t("breadcrumbs.cram"), route }];
    case "deckStatistics":
      return [decks, deck, { label: t("breadcrumbs.statistics"), route }];
  }
  const course: Crumb = {
    label: t("breadcrumbs.course"),
    route: { screen: "course", instanceUrl: route.instanceUrl, deckUrl: route.deckUrl },
  };
  if (route.screen === "course") return [decks, deck, course];
  const chapter: Crumb = {
    label: names.chapter ?? "",
    lang: names.chapterLang,
    route: { ...route, screen: "courseChapter" },
  };
  return route.screen === "courseChapter"
    ? [decks, deck, course, chapter]
    : [decks, deck, course, chapter, { label: t("breadcrumbs.courseReview"), route }];
}

/**
 * The trail as links. An app with routes of its own (the Studio) passes
 * its crumbs and how its routes become hashes; Solid Memo's are the default.
 */
export function Breadcrumbs<Route = RouteRef>({
  crumbs,
  toHash = routeToHash as (route: Route) => string,
}: {
  crumbs: Crumb<Route>[];
  toHash?: (route: Route) => string;
}) {
  const { t } = useI18n();
  return (
    <nav class="breadcrumbs" aria-label={t("breadcrumbs.label")}>
      <ol>
        {crumbs.map((crumb, index) => (
          <li key={index}>
            <a
              href={toHash(crumb.route)}
              aria-current={index === crumbs.length - 1 ? "page" : undefined}
              lang={crumb.lang}
            >
              {crumb.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
