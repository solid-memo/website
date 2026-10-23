// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Card, Deck } from "@solid-memo/domain/deck";
import type { ReleaseDraftSummary } from "@solid-memo/domain/release/draftLayout";
import { chapterOfStep, draftCardOf } from "@solid-memo/domain/release/draftOutline";
import { liveSteps, type ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import type { Crumb } from "@solid-memo/ui/Breadcrumbs";
import { cardName } from "@solid-memo/ui/DataText";
import type { I18n } from "@solid-memo/ui/i18n";
import { instanceOfRoute, type StudioRoute } from "../router";

/**
 * What a route's trail names besides its screens: the deck, card and
 * draft it is about, as the workspace read them. A route about one must
 * be given it.
 */
export interface CrumbSubjects {
  deck: Deck | null;
  card: Card | null;
  draft: ReleaseDraft | null;
}

/**
 * The trail to a route (docs/studio.md, Routes): Instances, then the
 * instance's Decks, then the way down to the route's screen, the last
 * crumb the screen itself. A draft's screens go on from its instance's
 * Drafts, then the draft; a step from its chapter, a question from the
 * draft's Cards.
 */
export function crumbsOf(
  route: StudioRoute,
  subjects: CrumbSubjects,
  i18n: Pick<I18n, "t" | "readerText" | "cardReader">,
): Crumb<StudioRoute>[] {
  const { t, readerText, cardReader } = i18n;
  const instances: Crumb<StudioRoute> = {
    label: t("breadcrumbs.instances"),
    route: { screen: "instances" },
  };
  if (route.screen === "instances") return [instances];
  const decks: Crumb<StudioRoute> = {
    label: t("breadcrumbs.decks"),
    route: { screen: "home", instanceUrl: instanceOfRoute(route)! },
  };
  const deck = () => readerText(subjects.deck!.title);
  const draft = subjects.draft!;
  /** The trail to a draft: its instance's drafts, then the draft. */
  const draftCrumbs = (draftUrl: string): Crumb<StudioRoute>[] => {
    const title = draft.root.title ?? {};
    return [
      instances,
      decks,
      {
        label: t("studio.drafts.crumb"),
        route: { screen: "drafts", instanceUrl: instanceOfRoute(route)! },
      },
      {
        label: Object.keys(title).length === 0 ? t("studio.draft.untitled") : readerText(title),
        route: { screen: "draft", draftUrl },
      },
    ];
  };
  const chapterName = (chapter: string) => {
    const title = draft.chapters.find((node) => node.id === chapter)!.data.title;
    return title === undefined ? chapter : readerText(title);
  };
  const stepName = (step: string) => {
    const chapter = chapterOfStep(draft, step);
    const number =
      chapter === null ? -1 : liveSteps(draft, chapter).findIndex((node) => node.id === step);
    return number === -1 ? step : t("studio.chapter.step", { number: number + 1 });
  };
  switch (route.screen) {
    case "home":
      return [instances, { ...decks, route }];
    case "groups":
      return [instances, decks, { label: t("breadcrumbs.groups"), route }];
    case "instance":
      return [instances, decks, { label: t("studio.instance.crumb"), route }];
    case "library":
      return [instances, decks, { label: t("studio.library.crumb"), route }];
    case "transfer":
      return [instances, decks, { label: t("studio.transfer.crumb"), route }];
    case "drafts":
      return [instances, decks, { label: t("studio.drafts.crumb"), route }];
    case "releases":
      return [instances, decks, { label: t("studio.releases.crumb"), route }];
    case "graph":
      return [instances, decks, { label: t("studio.graph.crumb"), route }];
    case "health": {
      const health: Crumb<StudioRoute> = {
        label: t("studio.health.crumb"),
        route: { screen: "health", instanceUrl: route.instanceUrl },
      };
      return route.deckUrl === undefined
        ? [instances, decks, health]
        : [instances, decks, health, { label: deck(), route }];
    }
    case "about":
      return [instances, decks, { label: t("studio.about.crumb", { deck: deck() }), route }];
    case "cards":
      return [instances, decks, { label: t("studio.cards.crumb", { deck: deck() }), route }];
    case "schedule":
      return [
        instances,
        decks,
        {
          label: t("studio.cards.crumb", { deck: deck() }),
          route: { screen: "cards", deckUrl: route.deckUrl },
        },
        { label: t("studio.insight.crumb"), route },
      ];
    case "card":
      return [
        instances,
        decks,
        {
          label: t("studio.cards.crumb", { deck: deck() }),
          route: { screen: "cards", deckUrl: route.deckUrl },
        },
        // In the deck's card language first, as its screens show the card.
        {
          label: cardName(subjects.card!, cardReader(subjects.deck!.cardLanguage).cardText),
          route,
        },
      ];
    case "draft":
      return draftCrumbs(route.draftUrl);
    case "draftCards":
      return [...draftCrumbs(route.draftUrl), { label: t("studio.draftCards.crumb"), route }];
    case "check":
      return [...draftCrumbs(route.draftUrl), { label: t("studio.check.crumb"), route }];
    case "preview":
      return [...draftCrumbs(route.draftUrl), { label: t("studio.preview.crumb"), route }];
    case "trial":
      return [...draftCrumbs(route.draftUrl), { label: t("studio.trial.crumb"), route }];
    case "diff":
      return [...draftCrumbs(route.draftUrl), { label: t("studio.diff.crumb"), route }];
    case "release":
      return [...draftCrumbs(route.draftUrl), { label: t("studio.release.crumb"), route }];
    case "chapter":
      return [...draftCrumbs(route.draftUrl), { label: chapterName(route.chapter), route }];
    case "step": {
      const chapter = chapterOfStep(draft, route.step);
      return [
        ...draftCrumbs(route.draftUrl),
        ...(chapter === null
          ? []
          : [
              {
                label: chapterName(chapter),
                route: { screen: "chapter" as const, draftUrl: route.draftUrl, chapter },
              },
            ]),
        { label: stepName(route.step), route },
      ];
    }
    case "question":
      return [
        ...draftCrumbs(route.draftUrl),
        {
          label: t("studio.draftCards.crumb"),
          route: { screen: "draftCards", draftUrl: route.draftUrl },
        },
        {
          label: cardName(
            { ...draftCardOf(draft, route.card)!.content, id: route.card },
            readerText,
          ),
          route,
        },
      ];
  }
}

/** A draft as the Studio lists it: its title, else "Untitled" and its name. */
export function draftNameOf(
  draft: Pick<ReleaseDraftSummary, "title" | "name">,
  { t, readerText }: Pick<I18n, "t" | "readerText">,
): string {
  return Object.keys(draft.title).length === 0
    ? t("studio.drafts.untitled", { name: draft.name })
    : readerText(draft.title);
}
