import {
  DEFAULT_DECK_TABLE_VIEW,
  deckTableViewFromParams,
  deckTableViewToParams,
  type DeckTableView,
} from "@solid-memo/domain/deckTable";
import { isDefaultQuery, queryFromParams, queryToParams, type CardQuery } from "@solid-memo/domain/cardQuery";
import type { CardSpot } from "@solid-memo/domain/deckHealth";
import { instanceUrlOfDeck } from "@solid-memo/domain/instanceLayout";
import { draftPlaceOf } from "@solid-memo/domain/release/draftLayout";
import { DRAFT_CARD_FILTERS, type DraftCardFilter } from "@solid-memo/domain/release/draftOutline";
import {
  isTargetField,
  type ChapterField,
  type CheckPolicy,
  type DraftField,
  type ProblemTarget,
  type QuestionField,
  type StepField,
} from "@solid-memo/domain/release/releaseCheck";
import { STUDIO_PATH } from "@solid-memo/ui/router";
import { hashParams, useHashRouter } from "@solid-memo/ui/routerCore";

/**
 * A Studio view, as its URL hash carries it (docs/studio.md): only
 * identifiers (instance, deck and card URLs) and how a screen is looked
 * at (Home's filter and sort, the card workbench's query, the card
 * inspector's tab), so it round-trips through the hash. The Studio
 * shares the site's one page with Solid Memo, so its hashes all start
 * with `#/studio` (STUDIO_PATH); Solid Memo's own routes are the others
 * (packages/ui/src/ui/router.ts). Both keep the hash with the same core
 * (routerCore.ts).
 */
export type StudioRoute =
  /** The user's instances, to pick the one to manage. */
  | { screen: "instances" }
  /** Home: every deck of the instance, filtered and sorted as `view` says (all, as arranged, when absent). */
  | { screen: "home"; instanceUrl: string; view?: DeckTableView }
  /** The instance's deck groups, to arrange. */
  | { screen: "groups"; instanceUrl: string }
  /** The card workbench: a deck's cards, searched, filtered, sorted and paged as `query` says (all, as listed, when absent). */
  | { screen: "cards"; deckUrl: string; query?: CardQuery }
  /**
   * The card inspector: one card of a deck, its content, its wrong
   * options, its schedule or its history (`tab`; the content when
   * absent), opened at one of its fields when `field` says (a text of
   * its content, or a wrong option by its id).
   */
  | { screen: "card"; deckUrl: string; cardUrl: string; tab?: CardTab; field?: string }
  /** A deck's schedule: the reviews to come, how its intervals and eases are spread, its lapses and leeches. */
  | { screen: "schedule"; deckUrl: string }
  /** What a deck says of itself, how it is studied and, for a course, the learner's progress through it. */
  | { screen: "about"; deckUrl: string }
  /** The instance's name and its catalogue's description and licence. */
  | { screen: "instance"; instanceUrl: string }
  /** Everything wrong with the instance or, with `deckUrl`, one of its decks. */
  | { screen: "health"; instanceUrl: string; deckUrl?: string }
  /** The instance's copies of library releases: their versions, the newer releases and what upgrading would change. */
  | { screen: "library"; instanceUrl: string }
  /** Decks to and from files: the instance's decks to export (those of `deckUrls` chosen, none when absent), and a file to import. */
  | { screen: "transfer"; instanceUrl: string; deckUrls?: readonly string[] }
  /** The drafts of releases the instance holds, and a new one to start. */
  | { screen: "drafts"; instanceUrl: string }
  /**
   * A draft (by its release document): what it says of itself, and its
   * outline. A draft's editors open at one of their fields when `field`
   * says (a link from the release check).
   */
  | { screen: "draft"; draftUrl: string; field?: DraftField }
  /** A chapter of a draft, by its id. */
  | { screen: "chapter"; draftUrl: string; chapter: string; field?: ChapterField }
  /** A step of a draft, by its id. */
  | { screen: "step"; draftUrl: string; step: string; field?: StepField }
  /** A card of a draft (a course's question), by its id. */
  | { screen: "question"; draftUrl: string; card: string; field?: QuestionField }
  /** A draft's cards as a table: those `filter` keeps, with text in `language`, on `page` (all, the first, when absent). */
  | { screen: "draftCards"; draftUrl: string; filter?: DraftCardFilter; language?: string; page?: number }
  /** The release check of a draft, for a pod or (`policy`) the repository's library; a pod's when absent. */
  | { screen: "check"; draftUrl: string; policy?: CheckPolicy }
  /** A draft as the library lists the release it will be. */
  | { screen: "preview"; draftUrl: string }
  /**
   * A draft played in a sandbox: a course's page, or with `chapter` (an
   * id) that chapter's steps, or with `review` its final review; a deck's
   * study.
   */
  | { screen: "trial"; draftUrl: string; chapter?: string; review?: true };

/** The routes of a draft's screens. */
export type DraftRoute = Extract<StudioRoute, { draftUrl: string }>;

/** Whether a route is one of a draft's screens. */
export function isDraftRoute(route: StudioRoute): route is DraftRoute {
  return "draftUrl" in route;
}

/** What the card inspector shows: the card's content, its wrong options, its review state in each direction, or its answers. */
export type CardTab = "content" | "distractors" | "schedule" | "history";

/** A draft's editor, opened where a problem of the release check is (problemTarget). */
export function targetRoute(draftUrl: string, target: ProblemTarget): DraftRoute {
  return { ...target, draftUrl } as DraftRoute;
}

/** The inspector's tabs, in their order. */
export const CARD_TABS: readonly CardTab[] = ["content", "distractors", "schedule", "history"];

/** The card inspector, opened at where in a card a problem is (`spot`, domain/deckHealth.ts): its tab, and the field there. */
export function spotRoute(deckUrl: string, { card, place }: CardSpot): StudioRoute {
  const field = place.tab === "content" ? place.part : place.tab === "distractors" ? place.distractor : undefined;
  return { screen: "card", deckUrl, cardUrl: card.url, tab: place.tab, ...(field === undefined ? {} : { field }) };
}

/** The instance a route is in: the one it names, or the one of the deck it names; null for the picker. */
export function instanceOfRoute(route: StudioRoute): string | null {
  switch (route.screen) {
    case "instances":
      return null;
    case "cards":
    case "card":
    case "about":
    case "schedule":
      return instanceUrlOfDeck(route.deckUrl);
    case "draft":
    case "chapter":
    case "step":
    case "question":
    case "draftCards":
    case "check":
    case "preview":
    case "trial":
      // A draft's route is parsed only with a draft's URL.
      return draftPlaceOf(route.draftUrl)!.instanceUrl;
    default:
      return route.instanceUrl;
  }
}

export function studioRouteToHash(route: StudioRoute): string {
  switch (route.screen) {
    case "instances":
      return `#${STUDIO_PATH}/instances`;
    case "home":
      return `#${STUDIO_PATH}${hashParams({ instance: route.instanceUrl, ...deckTableViewToParams(route.view ?? DEFAULT_DECK_TABLE_VIEW) })}`;
    case "groups":
      return `#${STUDIO_PATH}/groups${hashParams({ instance: route.instanceUrl })}`;
    case "cards":
      return `#${STUDIO_PATH}/cards${hashParams({ deck: route.deckUrl, ...(route.query === undefined ? {} : queryToParams(route.query)) })}`;
    case "card":
      return `#${STUDIO_PATH}/card${hashParams({
        deck: route.deckUrl,
        card: route.cardUrl,
        ...(route.tab === undefined || route.tab === "content" ? {} : { tab: route.tab }),
        ...(route.field === undefined ? {} : { field: route.field }),
      })}`;
    case "about":
      return `#${STUDIO_PATH}/about${hashParams({ deck: route.deckUrl })}`;
    case "schedule":
      return `#${STUDIO_PATH}/schedule${hashParams({ deck: route.deckUrl })}`;
    case "instance":
      return `#${STUDIO_PATH}/instance${hashParams({ instance: route.instanceUrl })}`;
    case "health":
      return `#${STUDIO_PATH}/health${hashParams({ instance: route.instanceUrl, ...(route.deckUrl === undefined ? {} : { deck: route.deckUrl }) })}`;
    case "library":
      return `#${STUDIO_PATH}/library${hashParams({ instance: route.instanceUrl })}`;
    case "drafts":
      return `#${STUDIO_PATH}/drafts${hashParams({ instance: route.instanceUrl })}`;
    case "draft":
      return `#${STUDIO_PATH}/draft${hashParams({ draft: route.draftUrl, ...fieldParam(route.field) })}`;
    case "chapter":
      return `#${STUDIO_PATH}/chapter${hashParams({ draft: route.draftUrl, chapter: route.chapter, ...fieldParam(route.field) })}`;
    case "step":
      return `#${STUDIO_PATH}/step${hashParams({ draft: route.draftUrl, step: route.step, ...fieldParam(route.field) })}`;
    case "question":
      return `#${STUDIO_PATH}/question${hashParams({ draft: route.draftUrl, card: route.card, ...fieldParam(route.field) })}`;
    case "check":
      return `#${STUDIO_PATH}/check${hashParams({ draft: route.draftUrl, ...(route.policy === undefined || route.policy === "pod" ? {} : { policy: route.policy }) })}`;
    case "preview":
      return `#${STUDIO_PATH}/preview${hashParams({ draft: route.draftUrl })}`;
    case "trial":
      return `#${STUDIO_PATH}/trial${hashParams({
        draft: route.draftUrl,
        ...(route.chapter === undefined ? {} : { chapter: route.chapter }),
        ...(route.review === true ? { part: "review" } : {}),
      })}`;
    case "draftCards":
      return `#${STUDIO_PATH}/draft-cards${hashParams({
        draft: route.draftUrl,
        ...(route.filter === undefined ? {} : { filter: route.filter }),
        ...(route.language === undefined ? {} : { lang: route.language }),
        ...(route.page === undefined || route.page === 1 ? {} : { page: String(route.page) }),
      })}`;
    case "transfer":
      // A `deck` each: hashParams takes one value a name.
      return `#${STUDIO_PATH}/transfer?${new URLSearchParams([
        ["instance", route.instanceUrl],
        ...(route.deckUrls ?? []).map((url) => ["deck", url]),
      ]).toString()}`;
  }
}

/**
 * Parse a location hash; null for anything that isn't a route, `#/studio`
 * without an instance among them: the default route, which depends on
 * how many instances the user has. Home is `#/studio`, or `#/studio/` as
 * the redirect from the Studio's old address makes it (docs/studio.md).
 * Home's view, and the workbench's query, are left out when they are the
 * default ones.
 */
export function parseStudioHash(hash: string): StudioRoute | null {
  const [path, search] = hash.replace(/^#/, "").split("?");
  if (!path!.startsWith(STUDIO_PATH)) return null;
  const query = new URLSearchParams(search);
  const instanceUrl = query.get("instance");
  switch (path!.slice(STUDIO_PATH.length)) {
    case "/instances":
      return { screen: "instances" };
    case "":
    case "/": {
      if (instanceUrl === null) return null;
      const view = deckTableViewFromParams(query);
      return view.filter === "" && view.sort === undefined
        ? { screen: "home", instanceUrl }
        : { screen: "home", instanceUrl, view };
    }
    case "/groups":
      return instanceUrl === null ? null : { screen: "groups", instanceUrl };
    case "/instance":
      return instanceUrl === null ? null : { screen: "instance", instanceUrl };
    case "/library":
      return instanceUrl === null ? null : { screen: "library", instanceUrl };
    case "/drafts":
      return instanceUrl === null ? null : { screen: "drafts", instanceUrl };
    case "/draft":
    case "/chapter":
    case "/step":
    case "/question":
    case "/draft-cards":
    case "/check":
    case "/preview":
    case "/trial":
      return draftRouteOf(path!.slice(STUDIO_PATH.length), query);
    case "/transfer": {
      if (instanceUrl === null) return null;
      const deckUrls = query.getAll("deck");
      return deckUrls.length === 0 ? { screen: "transfer", instanceUrl } : { screen: "transfer", instanceUrl, deckUrls };
    }
    case "/health": {
      const deckUrl = query.get("deck");
      if (instanceUrl === null) return null;
      return deckUrl === null ? { screen: "health", instanceUrl } : { screen: "health", instanceUrl, deckUrl };
    }
    case "/about": {
      const deckUrl = query.get("deck");
      return deckUrl === null ? null : { screen: "about", deckUrl };
    }
    case "/schedule": {
      const deckUrl = query.get("deck");
      return deckUrl === null ? null : { screen: "schedule", deckUrl };
    }
    case "/cards": {
      const deckUrl = query.get("deck");
      if (deckUrl === null) return null;
      const cardQuery = queryFromParams(query);
      return isDefaultQuery(cardQuery) ? { screen: "cards", deckUrl } : { screen: "cards", deckUrl, query: cardQuery };
    }
    case "/card": {
      const deckUrl = query.get("deck");
      const cardUrl = query.get("card");
      if (deckUrl === null || cardUrl === null) return null;
      const tab = CARD_TABS.find((known) => known !== "content" && known === query.get("tab"));
      const field = query.get("field");
      return {
        screen: "card",
        deckUrl,
        cardUrl,
        ...(tab === undefined ? {} : { tab }),
        ...(field === null ? {} : { field }),
      };
    }
    default:
      return null;
  }
}

/** A draft's route, from its path and query; null without a draft's URL, or the subject it names. */
function draftRouteOf(path: string, query: URLSearchParams): DraftRoute | null {
  const draftUrl = query.get("draft");
  if (draftUrl === null || draftPlaceOf(draftUrl) === null) return null;
  const chapter = query.get("chapter");
  const step = query.get("step");
  const card = query.get("card");
  /** The field a screen opens at, when it is one of that screen's. */
  const field = (screen: ProblemTarget["screen"]) => {
    const named = query.get("field");
    return named !== null && isTargetField(screen, named) ? { field: named } : {};
  };
  switch (path) {
    case "/draft":
      return { screen: "draft", draftUrl, ...(field("draft") as { field?: DraftField }) };
    case "/chapter":
      return chapter === null ? null : { screen: "chapter", draftUrl, chapter, ...(field("chapter") as { field?: ChapterField }) };
    case "/step":
      return step === null ? null : { screen: "step", draftUrl, step, ...(field("step") as { field?: StepField }) };
    case "/question":
      return card === null ? null : { screen: "question", draftUrl, card, ...(field("question") as { field?: QuestionField }) };
    case "/check":
      return query.get("policy") === "library" ? { screen: "check", draftUrl, policy: "library" } : { screen: "check", draftUrl };
    case "/preview":
      return { screen: "preview", draftUrl };
    case "/trial":
      // A review is of a chapter.
      return chapter === null
        ? { screen: "trial", draftUrl }
        : { screen: "trial", draftUrl, chapter, ...(query.get("part") === "review" ? { review: true as const } : {}) };
    default: {
      const filter = DRAFT_CARD_FILTERS.find((known) => known === query.get("filter"));
      const language = query.get("lang");
      const page = Number(query.get("page"));
      return {
        screen: "draftCards",
        draftUrl,
        ...(filter === undefined ? {} : { filter }),
        ...(language === null || language === "" ? {} : { language }),
        ...(Number.isInteger(page) && page > 1 ? { page } : {}),
      };
    }
  }
}

/** A route's field as a hash names it: none when absent. */
function fieldParam(field: string | undefined): Record<string, string> {
  return field === undefined ? {} : { field };
}

/** The URL hash as the Studio's route state. */
export function useStudioRoute(): ReturnType<typeof useHashRouter<StudioRoute>> {
  return useHashRouter(parseStudioHash, studioRouteToHash);
}
