import type { StorageSource } from "@solid-memo/domain/storage";
import { hashParams as params, parsePage, useHashRouter, type RouteChange } from "./routerCore";

export type { RouteChange };

/**
 * Serializable description of a Workspace view. Unlike the resolved
 * screen state, it carries only identifiers (instance/deck URLs), so it
 * can round-trip through the browser's URL hash.
 *
 * Hash routing (rather than pathname routing) keeps deep links working
 * on any static host and stays clear of the Solid OIDC redirect
 * parameters, which live in the query string.
 */
export type RouteRef =
  | { screen: "storagePicker" }
  | { screen: "instancePicker" }
  | { screen: "instanceCreator"; storageUrl: string; source: StorageSource }
  | { screen: "home"; instanceUrl: string }
  | { screen: "deckCreator"; instanceUrl: string }
  | { screen: "library"; instanceUrl: string }
  /** One library deck's page. Named `libraryDeckUrl`, not `deckUrl`: the
      deck is in the library, not the instance, so it must not be
      resolved (and redirected) like a pod deck. */
  | { screen: "libraryDeck"; instanceUrl: string; libraryDeckUrl: string }
  /** A library deck's cards, read-only; paged like the Browser. */
  | {
    screen: "libraryBrowser";
    instanceUrl: string;
    libraryDeckUrl: string;
    page?: number;
  }
  /** One card of a library deck, read-only; `cardId` is its fragment id. */
  | {
    screen: "libraryCard";
    instanceUrl: string;
    libraryDeckUrl: string;
    cardId: string;
  }
  /** A library deck's cards shown at random, for a try before import;
      nothing is recorded. */
  | { screen: "libraryPreview"; instanceUrl: string; libraryDeckUrl: string }
  | { screen: "deckDetail"; instanceUrl: string; deckUrl: string }
  /** The deck's own preferences: its daily limits. `section` is the part
      the screen opens on, its heading focused: the deck's languages. */
  | { screen: "deckPreferences"; instanceUrl: string; deckUrl: string; section?: "languages" }
  /** `page` is 1-based; absent means the first page. `languages` narrows
      the list to the cards whose language is yet to settle; absent lists all. */
  | {
    screen: "browser";
    instanceUrl: string;
    deckUrl: string;
    page?: number;
    languages?: BrowserLanguageFilter;
  }
  | { screen: "cardCreator"; instanceUrl: string; deckUrl: string }
  | { screen: "card"; instanceUrl: string; deckUrl: string; cardUrl: string }
  /** A study session over the deck's due and new prompts. */
  | { screen: "study"; instanceUrl: string; deckUrl: string }
  /** The course a deck is the learner's copy of: its chapters and progress. */
  | { screen: "course"; instanceUrl: string; deckUrl: string }
  /** One chapter of the deck's course, its steps taken in turn. `chapterUrl`
      is the chapter's subject in the release; the step to take is derived
      from the learner's progress, not carried in the URL. */
  | { screen: "courseChapter"; instanceUrl: string; deckUrl: string; chapterUrl: string }
  /** A chapter's final review, which completes it. */
  | { screen: "courseReview"; instanceUrl: string; deckUrl: string; chapterUrl: string }
  | { screen: "preferences"; instanceUrl: string }
  /** The instance's study statistics. */
  | { screen: "statistics"; instanceUrl: string }
  /** Developer tool: the instance's documents checked against the shapes. */
  | { screen: "validation"; instanceUrl: string };

/**
 * The cards the Browser narrows its list down to: those with a side that
 * does not say its language.
 */
export type BrowserLanguageFilter = "unstated";

const BROWSER_LANGUAGE_FILTERS: BrowserLanguageFilter[] = ["unstated"];

const STORAGE_SOURCES: StorageSource[] = ["profile", "linkHeader", "manual"];

export function routeToHash(ref: RouteRef): string {
  switch (ref.screen) {
    case "storagePicker":
      return "#/storages";
    case "instancePicker":
      return "#/instances";
    case "instanceCreator":
      return `#/new-instance${params({
        storage: ref.storageUrl,
        source: ref.source,
      })}`;
    case "home":
      return `#/decks${params({ instance: ref.instanceUrl })}`;
    case "deckCreator":
      return `#/new-deck${params({ instance: ref.instanceUrl })}`;
    case "library":
      return `#/library${params({ instance: ref.instanceUrl })}`;
    case "libraryDeck":
      return `#/library-deck${params({
        instance: ref.instanceUrl,
        deck: ref.libraryDeckUrl,
      })}`;
    case "libraryBrowser":
      return `#/library-browse${params({
        instance: ref.instanceUrl,
        deck: ref.libraryDeckUrl,
        ...(ref.page !== undefined && ref.page > 1
          ? { page: String(ref.page) }
          : {}),
      })}`;
    case "libraryCard":
      return `#/library-card${params({
        instance: ref.instanceUrl,
        deck: ref.libraryDeckUrl,
        card: ref.cardId,
      })}`;
    case "libraryPreview":
      return `#/library-preview${params({
        instance: ref.instanceUrl,
        deck: ref.libraryDeckUrl,
      })}`;
    case "deckDetail":
      return `#/deck${params({ instance: ref.instanceUrl, deck: ref.deckUrl })}`;
    case "deckPreferences":
      return `#/deck-preferences${params({
        instance: ref.instanceUrl,
        deck: ref.deckUrl,
        ...(ref.section === undefined ? {} : { section: ref.section }),
      })}`;
    case "browser":
      return `#/browse${params({
        instance: ref.instanceUrl,
        deck: ref.deckUrl,
        ...(ref.languages === undefined ? {} : { languages: ref.languages }),
        ...(ref.page !== undefined && ref.page > 1
          ? { page: String(ref.page) }
          : {}),
      })}`;
    case "cardCreator":
      return `#/new-card${params({
        instance: ref.instanceUrl,
        deck: ref.deckUrl,
      })}`;
    case "card":
      return `#/card${params({
        instance: ref.instanceUrl,
        deck: ref.deckUrl,
        card: ref.cardUrl,
      })}`;
    case "study":
      return `#/study${params({
        instance: ref.instanceUrl,
        deck: ref.deckUrl,
      })}`;
    case "course":
      return `#/course${params({ instance: ref.instanceUrl, deck: ref.deckUrl })}`;
    case "courseChapter":
      return `#/course-chapter${params({
        instance: ref.instanceUrl,
        deck: ref.deckUrl,
        chapter: ref.chapterUrl,
      })}`;
    case "courseReview":
      return `#/course-review${params({
        instance: ref.instanceUrl,
        deck: ref.deckUrl,
        chapter: ref.chapterUrl,
      })}`;
    case "preferences":
      return `#/preferences${params({ instance: ref.instanceUrl })}`;
    case "statistics":
      return `#/statistics${params({ instance: ref.instanceUrl })}`;
    case "validation":
      return `#/validate${params({ instance: ref.instanceUrl })}`;
  }
}

/** Hash URL of the developer tool that checks an instance against the shapes. */
export function validationHref(instanceUrl: string): string {
  return routeToHash({ screen: "validation", instanceUrl });
}

/**
 * Hash URL of an instance's deck list: what every "Decks" in the UI —
 * breadcrumb, "Back to decks" — links to.
 */
export function decksHref(instanceUrl: string): string {
  return routeToHash({ screen: "home", instanceUrl });
}

/** Hash URL of an instance's study statistics. */
export function statisticsHref(instanceUrl: string): string {
  return routeToHash({ screen: "statistics", instanceUrl });
}

/** Hash URL of the deck library, where ready-made decks are imported. */
export function libraryHref(instanceUrl: string): string {
  return routeToHash({ screen: "library", instanceUrl });
}

/**
 * Hash URL of a library deck's page: what its name links to in the
 * library list, where it is read about and imported on its own.
 */
export function libraryDeckHref(
  instanceUrl: string,
  libraryDeckUrl: string,
): string {
  return routeToHash({ screen: "libraryDeck", instanceUrl, libraryDeckUrl });
}

/** Hash URL of a library deck's preview: what its Preview button opens. */
export function libraryPreviewHref(
  instanceUrl: string,
  libraryDeckUrl: string,
): string {
  return routeToHash({ screen: "libraryPreview", instanceUrl, libraryDeckUrl });
}

/**
 * Hash URL of a deck's page: what a deck's name links to wherever the UI
 * shows it — deck list, headings, breadcrumb.
 */
export function deckHref(instanceUrl: string, deckUrl: string): string {
  return routeToHash({ screen: "deckDetail", instanceUrl, deckUrl });
}

/** Hash URL of the course a deck is the learner's copy of. */
export function courseHref(instanceUrl: string, deckUrl: string): string {
  return routeToHash({ screen: "course", instanceUrl, deckUrl });
}

/**
 * Where Solid Memo Studio's routes are in the site's one page
 * (docs/studio.md): the hashes whose path is `/studio` or starts with
 * `/studio/`. None of Solid Memo's own routes does; the site's page
 * shows the Studio for these (apps/web/src/App.tsx), and the Studio's
 * router reads and writes them (apps/studio/src/ui/router.ts).
 */
export const STUDIO_PATH = "/studio";

/** Whether a location hash is one of the Studio's routes. */
export function isStudioHash(hash: string): boolean {
  const path = hash.replace(/^#/, "").split("?")[0]!;
  return path === STUDIO_PATH || path.startsWith(`${STUDIO_PATH}/`);
}

/**
 * Hash URL of the instance's Home in Solid Memo Studio. It is the
 * Studio's route, spelled here since Solid Memo cannot import the
 * Studio's router.
 */
export function studioHref(instanceUrl: string): string {
  return `#${STUDIO_PATH}${params({ instance: instanceUrl })}`;
}

/** Parse a location hash; null for anything that isn't a valid route. */
export function parseHash(hash: string): RouteRef | null {
  const [path, search] = hash.replace(/^#/, "").split("?");
  const query = new URLSearchParams(search);
  const instanceUrl = query.get("instance");
  const deckUrl = query.get("deck");

  switch (path) {
    case "/storages":
      return { screen: "storagePicker" };
    case "/instances":
      return { screen: "instancePicker" };
    case "/new-instance": {
      const storageUrl = query.get("storage");
      const source = query.get("source") as StorageSource | null;
      if (storageUrl === null || source === null) return null;
      if (!STORAGE_SOURCES.includes(source)) return null;
      return { screen: "instanceCreator", storageUrl, source };
    }
    case "/decks":
      return instanceUrl === null ? null : { screen: "home", instanceUrl };
    case "/new-deck":
      return instanceUrl === null
        ? null
        : { screen: "deckCreator", instanceUrl };
    case "/library":
      return instanceUrl === null ? null : { screen: "library", instanceUrl };
    case "/library-deck":
      return instanceUrl === null || deckUrl === null
        ? null
        : { screen: "libraryDeck", instanceUrl, libraryDeckUrl: deckUrl };
    case "/library-browse": {
      if (instanceUrl === null || deckUrl === null) return null;
      const page = parsePage(query.get("page"));
      const ref = {
        screen: "libraryBrowser",
        instanceUrl,
        libraryDeckUrl: deckUrl,
      } as const;
      return page === null ? ref : { ...ref, page };
    }
    case "/library-card": {
      const cardId = query.get("card");
      return instanceUrl === null || deckUrl === null || cardId === null
        ? null
        : { screen: "libraryCard", instanceUrl, libraryDeckUrl: deckUrl, cardId };
    }
    case "/library-preview":
      return instanceUrl === null || deckUrl === null
        ? null
        : { screen: "libraryPreview", instanceUrl, libraryDeckUrl: deckUrl };
    case "/deck":
      return instanceUrl === null || deckUrl === null
        ? null
        : { screen: "deckDetail", instanceUrl, deckUrl };
    case "/deck-preferences":
      if (instanceUrl === null || deckUrl === null) return null;
      return query.get("section") === "languages"
        ? { screen: "deckPreferences", instanceUrl, deckUrl, section: "languages" }
        : { screen: "deckPreferences", instanceUrl, deckUrl };
    case "/browse": {
      if (instanceUrl === null || deckUrl === null) return null;
      const page = parsePage(query.get("page"));
      const languages = query.get("languages") as BrowserLanguageFilter | null;
      return {
        screen: "browser",
        instanceUrl,
        deckUrl,
        ...(page === null ? {} : { page }),
        ...(languages !== null && BROWSER_LANGUAGE_FILTERS.includes(languages) ? { languages } : {}),
      };
    }
    case "/new-card":
      return instanceUrl === null || deckUrl === null
        ? null
        : { screen: "cardCreator", instanceUrl, deckUrl };
    case "/card": {
      const cardUrl = query.get("card");
      return instanceUrl === null || deckUrl === null || cardUrl === null
        ? null
        : { screen: "card", instanceUrl, deckUrl, cardUrl };
    }
    case "/study":
      return instanceUrl === null || deckUrl === null
        ? null
        : { screen: "study", instanceUrl, deckUrl };
    case "/course":
      return instanceUrl === null || deckUrl === null
        ? null
        : { screen: "course", instanceUrl, deckUrl };
    case "/course-chapter":
    case "/course-review": {
      const chapterUrl = query.get("chapter");
      if (instanceUrl === null || deckUrl === null || chapterUrl === null) return null;
      const screen = path === "/course-chapter" ? "courseChapter" : "courseReview";
      return { screen, instanceUrl, deckUrl, chapterUrl };
    }
    case "/preferences":
      return instanceUrl === null
        ? null
        : { screen: "preferences", instanceUrl };
    case "/statistics":
      return instanceUrl === null ? null : { screen: "statistics", instanceUrl };
    case "/validate":
      return instanceUrl === null ? null : { screen: "validation", instanceUrl };
    default:
      return null;
  }
}

/**
 * The URL hash as the learner app's route state (routerCore.ts).
 */
export function useHashRoute(): ReturnType<typeof useHashRouter<RouteRef>> {
  return useHashRouter(parseHash, routeToHash);
}
