// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Course } from "@solid-memo/application/courses";
import { cardName, cardNameText } from "./DataText";
import { decksOf } from "@solid-memo/domain/deckTree";
import type { CourseChapter } from "@solid-memo/domain/course";
import type { Card, Deck } from "@solid-memo/domain/deck";
import type { Instance, RegistrationTarget } from "@solid-memo/domain/instance";
import type { LibraryCard, LibraryDeck } from "@solid-memo/domain/library";
import type { Session } from "@solid-memo/domain/session";
import { Breadcrumbs, breadcrumbsFor, type CrumbNames } from "./Breadcrumbs";
import { BrowserContainer } from "./BrowserContainer";
import { CardContainer } from "./CardContainer";
import { CardHistoryContainer } from "./CardHistoryContainer";
import { CardCreatorContainer } from "./CardCreatorContainer";
import { ChapterPlayerContainer } from "./ChapterPlayerContainer";
import { ChapterReviewContainer } from "./ChapterReviewContainer";
import { CourseContainer, type CompletedChapter } from "./CourseContainer";
import { courseStripQuery } from "./CourseStrip";
import { DeckCreatorContainer } from "./DeckCreatorContainer";
import { DeckDetailContainer } from "./DeckDetailContainer";
import { DeckPreferencesContainer } from "./DeckPreferencesContainer";
import { DeckListContainer } from "./DeckListContainer";
import { libraryIndexQuery, useCopies } from "./deckTreeEditor";
import { studyCountsQuery } from "./DeckStudyAction";
import { ErrorMessage } from "./ErrorMessage";
import { GuestStudyOffer } from "./GuestStudyOffer";
import { InstanceBar } from "./InstanceBar";
import { InstanceCreator } from "./InstanceCreator";
import { InstancePickerContainer } from "./InstancePickerContainer";
import { FindableContainer } from "./FindableContainer";
import { DataCheckNotice } from "./DataCheckNotice";
import { UnclaimedDecksNotice } from "./UnclaimedDecksNotice";
import { type DataCheck, useDataCheck } from "./dataCheck";
import { LibraryBrowserContainer } from "./LibraryBrowserContainer";
import { LibraryCardScreen } from "./LibraryCardScreen";
import { LibraryContainer } from "./LibraryContainer";
import { ImportUrlContainer } from "./ImportUrlContainer";
import { LibraryDeckContainer } from "./LibraryDeckContainer";
import { LibraryPreviewContainer } from "./LibraryPreviewContainer";
import { Loading } from "./Loading";
import { MigrationContainer } from "./MigrationContainer";
import { StudyContainer } from "./StudyContainer";
import { CramContainer } from "./CramContainer";
import { PaletteEditorContainer } from "./PaletteEditorContainer";
import { PreferencesContainer } from "./PreferencesContainer";
import { StatisticsContainer } from "./StatisticsContainer";
import { StoragePicker } from "./StoragePicker";
import {
  DEFAULT_STATISTICS_RANGE,
  deckHref,
  isCanonicalStatisticsHash,
  libraryDeckHref,
  routeToHash,
  useHashRoute,
  type RouteRef,
  validationHref,
} from "./router";
import { ValidationContainer } from "./ValidationContainer";
import { WebIdDocumentContainer } from "./WebIdDocumentContainer";
import { CardLanguage } from "./cardLanguage";
import { useI18n, type CardReader, type I18n } from "./i18n";
import { ReaderText } from "./ReaderText";
import { useInstanceTheme } from "./theme";
import { useDocumentTitle } from "./documentTitle";
import { useScreenFocus } from "./screenFocus";
import { MAIN_ID } from "./SkipLink";
import { queryKeys } from "./queryKeys";

/**
 * The breadcrumbs' names of what the route has open, each "" (or no
 * language) when nothing is: a card of the open deck named in the deck's
 * card language first (`cards`), the rest as `readerText` names them.
 */
function crumbNamesOf(
  open: {
    deck: Deck | null;
    card: Card | null;
    libraryDeck: LibraryDeck | null;
    libraryCard: LibraryCard | null;
    chapter: CourseChapter | null;
  },
  readerText: I18n["readerText"],
  readerLang: I18n["readerLang"],
  { cardText, cardLang }: CardReader,
): CrumbNames {
  const { deck, card, libraryDeck, libraryCard, chapter } = open;
  return {
    deck: deck === null ? "" : readerText(deck.title),
    card: card === null ? "" : cardName(card, cardText),
    libraryDeck: libraryDeck === null ? "" : readerText(libraryDeck.title),
    libraryCard: libraryCard === null ? "" : cardName(libraryCard, readerText),
    chapter: chapter === null ? "" : readerText(chapter.title),
    deckLang: deck === null ? undefined : readerLang(deck.title),
    cardLang: card === null ? undefined : cardLang(cardNameText(card, cardText)),
    libraryDeckLang: libraryDeck === null ? undefined : readerLang(libraryDeck.title),
    libraryCardLang:
      libraryCard === null ? undefined : readerLang(cardNameText(libraryCard, readerText)),
    chapterLang: chapter === null ? undefined : readerLang(chapter.title),
  };
}

/** What the route names, each null when it names none (or there is no route yet). */
function routeAddresses(route: RouteRef | null) {
  return {
    instanceUrl: route !== null && "instanceUrl" in route ? route.instanceUrl : null,
    deckUrl: route !== null && "deckUrl" in route ? route.deckUrl : null,
    cardUrl: route?.screen === "card" ? route.cardUrl : null,
    libraryDeckUrl:
      route?.screen === "libraryDeck" ||
      route?.screen === "libraryBrowser" ||
      route?.screen === "libraryCard" ||
      route?.screen === "libraryPreview" ||
      route?.screen === "try"
        ? route.libraryDeckUrl
        : null,
    libraryCardId: route?.screen === "libraryCard" ? route.cardId : null,
    chapterUrl:
      route?.screen === "courseChapter" || route?.screen === "courseReview"
        ? route.chapterUrl
        : null,
  };
}

/**
 * What a lookup the route needs finds in what it has read: null when the
 * route does not need it, until it is read, and when it is not there.
 */
function lookedUp<T>(needed: boolean, read: T[] | undefined, isIt: (item: T) => boolean) {
  return needed ? (read?.find(isIt) ?? null) : null;
}

/**
 * Where the route's chapter is in the course's outline (-1 when it is not,
 * or there is no course), and the chapter, null unless it is there and open.
 */
function openChapterOf(course: Course | null, chapterUrl: string | null) {
  const chapterIndex =
    course === null ? -1 : course.outline.chapters.findIndex((c) => c.url === chapterUrl);
  const activeChapter =
    chapterIndex >= 0 && course!.progress.chapters[chapterIndex]!.state !== "locked"
      ? course!.outline.chapters[chapterIndex]!
      : null;
  return { chapterIndex, activeChapter };
}

/**
 * The screen as the data check lets it show: while the check holds it
 * back, that it checks, or nothing once its notice says why; for a deck
 * the check set aside, that it is; otherwise the screen itself.
 */
function checkedScreen(
  held: boolean,
  reported: boolean,
  deckSetAside: boolean,
  t: I18n["t"],
  screen: () => ComponentChildren,
) {
  if (held) {
    return reported ? null : <Loading label={t("workspace.checkingData")} />;
  }
  return deckSetAside ? <p class="hint">{t("workspace.deckSetAside")}</p> : screen();
}

/**
 * What the screen shows while a lookup the route needs loads or fails:
 * its error, or the loading label while what it looks up is missing;
 * null when the route does not need it or it is there.
 */
function lookupWaiting(
  needed: boolean,
  query: { error: unknown },
  missing: boolean,
  loadingLabel: string,
  errorText: I18n["errorText"],
) {
  if (!needed) return null;
  if (query.error) {
    return <ErrorMessage error={errorText(query.error)} />;
  }
  return missing ? <Loading label={loadingLabel} /> : null;
}

/**
 * On a link to a library deck (#/try), the deck: undefined until the
 * library is read (and off that route), null when it does not have it;
 * and whether that is settled, the library read or failed.
 */
function triedOf(
  onTry: boolean,
  library: { data: LibraryDeck[] | undefined; isError: boolean },
  isAddressed: (deck: LibraryDeck) => boolean,
) {
  const triedDeck =
    onTry && library.data !== undefined ? (library.data.find(isAddressed) ?? null) : undefined;
  const triedSettled = onTry && (triedDeck !== undefined || library.isError);
  return { triedDeck, triedSettled };
}

/**
 * The open instance's notices, above the breadcrumbs: its migration, a
 * data check that failed, what the check found, and its unclaimed decks.
 */
function instanceNotices(
  useCases: UseCases,
  session: Session,
  instance: Instance,
  check: DataCheck,
  checkedDecks: Deck[] | undefined,
  tx: I18n["tx"],
  errorText: I18n["errorText"],
) {
  return (
    <>
      <MigrationContainer useCases={useCases} session={session} instance={instance} />
      {check.error && (
        // A div: the error may bring its technical details, a block.
        <div class="warning">{tx("workspace.checkFailed", { error: errorText(check.error) })}</div>
      )}
      {check.report !== null && (
        <DataCheckNotice
          useCases={useCases}
          instance={instance}
          report={check.report}
          policy={check.policy}
          setAside={(checkedDecks ?? []).filter(check.isSetAside).map((deck) => deck.title)}
          arrangementSetAside={check.arrangementSetAside}
        />
      )}
      <UnclaimedDecksNotice
        useCases={useCases}
        instanceUrl={instance.url}
        decks={check.unclaimed}
      />
    </>
  );
}

/**
 * The signed-in app: the site header, closed by the open instance's bar,
 * then the main content, from the notices and breadcrumbs to the screen.
 */
export function Workspace({
  useCases,
  session,
  banner,
  children,
}: {
  useCases: UseCases;
  session: Session;
  /** What the site header shows above the instance bar (the masthead). */
  banner?: ComponentChildren;
  /** What the main content starts with, above the offer of a guest's study (to a user logged in) and the instance's notices. */
  children?: ComponentChildren;
}) {
  const { t, tx, readerText, readerLang, cardReader, errorText } = useI18n();
  const queryClient = useQueryClient();
  const { route, change, navigate, replace } = useHashRoute();
  const screenRef = useScreenFocus(route, change);
  const webId = session.webId;

  const instancesQuery = useQuery({
    queryKey: queryKeys.instances(webId),
    queryFn: () => useCases.listInstances(session),
  });
  const instances = instancesQuery.data;

  const { instanceUrl, deckUrl, cardUrl, libraryDeckUrl, libraryCardId, chapterUrl } =
    routeAddresses(route);
  const activeInstance = lookedUp(instanceUrl !== null, instances, (i) => i.url === instanceUrl);

  useInstanceTheme(useCases, activeInstance?.url ?? null);

  const needsDeck = deckUrl !== null && activeInstance !== null;

  useEffect(() => {
    if (route !== null || instances === undefined) return;
    if (instances.length === 1) {
      replace({ screen: "home", instanceUrl: instances[0].url });
    } else if (instances.length > 1) {
      replace({ screen: "instancePicker" });
    } else {
      replace({ screen: "storagePicker" });
    }
  }, [route, instances]);

  useEffect(() => {
    if (instanceUrl === null || instances === undefined) return;
    if (!instances.some((i) => i.url === instanceUrl)) {
      replace(instances.length > 0 ? { screen: "instancePicker" } : { screen: "storagePicker" });
    }
  }, [instanceUrl, instances]);

  const decksQuery = useQuery({
    queryKey: queryKeys.decks(instanceUrl),
    queryFn: () => useCases.listDecks(instanceUrl!),
    enabled: needsDeck,
  });
  const activeDeck = lookedUp(needsDeck, decksQuery.data, (d) => d.url === deckUrl);

  useEffect(() => {
    if (!needsDeck || decksQuery.data === undefined) return;
    if (!decksQuery.data.some((d) => d.url === deckUrl)) {
      replace({ screen: "home", instanceUrl: instanceUrl! });
    }
  }, [needsDeck, decksQuery.data, deckUrl, instanceUrl]);

  // A range or tab the statistics do not know falls back to the default, the URL with it.
  useEffect(() => {
    if (route?.screen !== "statistics" && route?.screen !== "deckStatistics") return;
    if (!isCanonicalStatisticsHash(window.location.hash)) replace(route);
  }, [route]);

  const needsCard = cardUrl !== null && activeDeck !== null;
  const cardsQuery = useQuery({
    queryKey: queryKeys.cards(activeDeck?.cardsDocumentUrl),
    queryFn: () => useCases.listCards(activeDeck!),
    enabled: needsCard,
  });
  const activeCard = lookedUp(needsCard, cardsQuery.data, (c) => c.url === cardUrl);

  useEffect(() => {
    if (!needsCard || cardsQuery.data === undefined) return;
    if (!cardsQuery.data.some((c) => c.url === cardUrl)) {
      replace({
        screen: "browser",
        instanceUrl: instanceUrl!,
        deckUrl: deckUrl!,
      });
    }
  }, [needsCard, cardsQuery.data, cardUrl, instanceUrl, deckUrl]);

  const needsLibraryDeck = libraryDeckUrl !== null && activeInstance !== null;
  const libraryQuery = useQuery({
    ...libraryIndexQuery(useCases),
    enabled: needsLibraryDeck || route?.screen === "try",
  });
  // A library deck's page is addressed by its series, which outlives
  // releases; an address of one of its releases still finds it.
  const isAddressed = (d: LibraryDeck) =>
    d.seriesUrl === libraryDeckUrl || d.releases.some((r) => r.url === libraryDeckUrl);
  const activeLibraryDeck = lookedUp(needsLibraryDeck, libraryQuery.data, isAddressed);

  useEffect(() => {
    if (!needsLibraryDeck || libraryQuery.data === undefined) return;
    if (!libraryQuery.data.some(isAddressed)) {
      replace({ screen: "library", instanceUrl: instanceUrl! });
    }
  }, [needsLibraryDeck, libraryQuery.data, libraryDeckUrl, instanceUrl]);

  // A link to a library deck (#/try) goes on to the deck's page in the
  // learner's instance, once the library is read; with several, the one
  // they choose. A deck the library does not have takes them to the
  // library instead, which says so; that is kept in memory, as
  // justCompleted is, and dropped as they leave the library. A library
  // that cannot be read takes them there too, where its error says why.
  // With no instance, they make one first.
  const [triedUnknown, setTriedUnknown] = useState(false);
  useEffect(() => {
    if (route?.screen !== "try" && route?.screen !== "library") setTriedUnknown(false);
  }, [route]);
  const { triedDeck, triedSettled } = triedOf(route?.screen === "try", libraryQuery, isAddressed);
  const openTried = (instance: Instance) => {
    if (triedDeck === null) setTriedUnknown(true);
    replace(
      triedDeck == null
        ? { screen: "library", instanceUrl: instance.url }
        : { screen: "libraryDeck", instanceUrl: instance.url, libraryDeckUrl: triedDeck.seriesUrl },
    );
  };
  useEffect(() => {
    if (!triedSettled || instances === undefined) return;
    if (instances.length === 1) openTried(instances[0]!);
    else if (instances.length === 0) replace({ screen: "storagePicker" });
  }, [triedSettled, instances]);

  const needsLibraryCard = libraryCardId !== null && activeLibraryDeck !== null;
  const libraryCardsQuery = useQuery({
    queryKey: queryKeys.libraryCards(activeLibraryDeck?.url),
    queryFn: () => useCases.listLibraryCards(activeLibraryDeck!),
    enabled: needsLibraryCard,
  });
  const activeLibraryCard = lookedUp(
    needsLibraryCard,
    libraryCardsQuery.data,
    (c) => c.id === libraryCardId,
  );

  useEffect(() => {
    if (!needsLibraryCard || libraryCardsQuery.data === undefined) return;
    if (!libraryCardsQuery.data.some((c) => c.id === libraryCardId)) {
      replace({
        screen: "libraryBrowser",
        instanceUrl: instanceUrl!,
        libraryDeckUrl: libraryDeckUrl!,
      });
    }
  }, [needsLibraryCard, libraryCardsQuery.data, libraryCardId, instanceUrl, libraryDeckUrl]);

  // A course's routes name the learner's deck of it; the course itself
  // (its release's outline and cards, and the learner's progress) is read
  // through the deck. A chapter that is not in it, or not open yet, falls
  // back to the course; a deck that is no library copy, to its page; a
  // final review of a chapter with steps not done, to the chapter, once
  // the course is read afresh (the last step's answer is still being
  // read as the learner goes on from it).
  const isCourseRoute =
    route?.screen === "course" ||
    route?.screen === "courseChapter" ||
    route?.screen === "courseReview";
  const needsCourse = isCourseRoute && activeDeck !== null;
  const courseQuery = useQuery({
    queryKey: queryKeys.course(deckUrl!),
    queryFn: () => useCases.getCourse(activeDeck!),
    enabled: needsCourse && activeDeck.sourceUrl !== undefined,
  });
  const activeCourse = needsCourse ? (courseQuery.data ?? null) : null;
  const { chapterIndex, activeChapter } = openChapterOf(activeCourse, chapterUrl);
  const reviewTooSoon =
    route?.screen === "courseReview" &&
    activeChapter !== null &&
    activeCourse!.progress.chapters[chapterIndex]!.resumeStepId !== undefined &&
    !courseQuery.isFetching;

  // The chapter the learner has just completed, for the course's page to
  // celebrate as they come back to it. Kept in memory, not the URL, and
  // dropped as they go anywhere else, so neither a reload nor a later
  // visit shows it again.
  const [justCompleted, setJustCompleted] = useState<CompletedChapter | null>(null);
  useEffect(() => {
    if (route?.screen !== "course") setJustCompleted(null);
  }, [route]);

  useEffect(() => {
    if (!needsCourse) return;
    if (activeDeck.sourceUrl === undefined) {
      replace({ screen: "deckDetail", instanceUrl: instanceUrl!, deckUrl: deckUrl! });
    } else if (chapterUrl !== null && activeCourse !== null && activeChapter === null) {
      replace({ screen: "course", instanceUrl: instanceUrl!, deckUrl: deckUrl! });
    } else if (reviewTooSoon) {
      replace({
        screen: "courseChapter",
        instanceUrl: instanceUrl!,
        deckUrl: deckUrl!,
        chapterUrl: chapterUrl!,
      });
    }
  }, [
    needsCourse,
    activeDeck,
    activeCourse,
    activeChapter,
    reviewTooSoon,
    chapterUrl,
    instanceUrl,
    deckUrl,
  ]);

  const preferencesQuery = useQuery({
    queryKey: queryKeys.preferences(instanceUrl),
    queryFn: () => useCases.getPreferences(instanceUrl!),
    enabled: activeInstance !== null,
  });
  const developerMode = preferencesQuery.data?.developerMode === true;

  // Every instance is checked against Solid Memo's shapes and DCAT-AP
  // when it is opened (docs/validation.md); what happens with invalid
  // data is the user's invalid data policy. Writes are checked as they
  // are made, so the check runs again only after a repair or an update.
  // The Studio's screens hold to the same check (useDataCheck).
  const check = useDataCheck(useCases, activeInstance === null ? null : instanceUrl);
  // The deck list's arrangement (DeckListContainer's query), counts and
  // courses to continue are fetched while the instance is checked, not
  // after. Its decks are the deck lookup's too, so the catalog is read
  // once, and a deck opened from the list resolves without a refetch.
  // The library's index, which tells the courses among them (useCopies),
  // is read beside the arrangement, not once it is in, so each course's
  // summary (CourseStrip's) is fetched as soon as the decks are known,
  // as their counts are.
  const onHome = activeInstance !== null && route?.screen === "home";
  const homeTreeQuery = useQuery({
    queryKey: queryKeys.deckTree(instanceUrl),
    queryFn: () => useCases.listDeckTree(instanceUrl!),
    enabled: onHome,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (onHome) void queryClient.prefetchQuery(libraryIndexQuery(useCases));
  }, [onHome]);
  useEffect(() => {
    if (instanceUrl === null || homeTreeQuery.data === undefined) return;
    const decks = decksOf(homeTreeQuery.data.children);
    queryClient.setQueryData(queryKeys.decks(instanceUrl), decks);
    for (const deck of decks) {
      void queryClient.prefetchQuery(studyCountsQuery(useCases, instanceUrl, deck));
    }
  }, [homeTreeQuery.data, instanceUrl]);
  const homeDecks = decksOf(homeTreeQuery.data?.children ?? []);
  const { isCourse } = useCopies(useCases, homeDecks);
  const homeCourses = homeDecks.filter((deck) => isCourse(deck) && !check.isSetAside(deck));
  useEffect(() => {
    for (const deck of homeCourses) {
      void queryClient.prefetchQuery(courseStripQuery(useCases, deck));
    }
  }, [homeCourses.map((deck) => `${deck.url} ${deck.sourceUrl}`).join(" ")]);
  // Until the preferences are read, the workspace waits as under "block
  // the instance": a user who chose it never sees data before the check.
  const {
    policy,
    report: invalidReport,
    isSetAside,
    arrangementSetAside: arrangementIsSetAside,
  } = check;
  const decksOfCheck = useQuery({
    queryKey: queryKeys.decks(instanceUrl),
    queryFn: () => useCases.listDecks(instanceUrl!),
    enabled: invalidReport !== null && policy === "block-subject",
  });
  // Under "set invalid data aside" nothing is known to be set aside until
  // the check is done: until then a deck's pages wait for it and the list
  // cannot be rearranged, so no write lands on data the check would set
  // aside. A check that fails sets nothing aside.
  const checkUnsettled = activeInstance !== null && policy === "block-subject" && check.pending;
  /** Screens that stay reachable whatever the data: where the policy is changed and the report read. */
  const alwaysReachable =
    route?.screen === "preferences" ||
    route?.screen === "palette" ||
    route?.screen === "validation";

  const storagesQuery = useQuery({
    queryKey: queryKeys.storages(webId),
    queryFn: () => useCases.listStorages(session),
    enabled: route?.screen === "storagePicker",
  });

  useEffect(() => {
    if (route?.screen === "storagePicker" && storagesQuery.data?.length === 1) {
      replace({
        screen: "instanceCreator",
        storageUrl: storagesQuery.data[0].url,
        source: storagesQuery.data[0].source,
      });
    }
  }, [route, storagesQuery.data]);

  const registrationOptionsQuery = useQuery({
    queryKey: queryKeys.registrationOptions(webId),
    queryFn: () => useCases.getRegistrationOptions(session),
    enabled: route?.screen === "instanceCreator",
  });
  const registrationOptions = registrationOptionsQuery.data ?? null;

  const manualStorageMutation = useMutation({
    mutationFn: (url: string) => useCases.addManualStorage(url),
    onSuccess: (storage) =>
      navigate({
        screen: "instanceCreator",
        storageUrl: storage.url,
        source: storage.source,
      }),
  });

  const createInstanceMutation = useMutation({
    mutationFn: (args: {
      containerUrl: string;
      name: string;
      registrationTarget: RegistrationTarget;
    }) => useCases.createInstance(session, args),
    onSuccess: async (instance) => {
      // A new instance has no decks, so its list offers the library's course for
      // newcomers (NewcomerCourseContainer): read from now, it comes with the list.
      void queryClient.prefetchQuery(libraryIndexQuery(useCases));
      await queryClient.invalidateQueries({ queryKey: queryKeys.instances(webId) });
      navigate({ screen: "home", instanceUrl: instance.url });
    },
  });

  const crumbs =
    route === null
      ? []
      : breadcrumbsFor(
          route,
          crumbNamesOf(
            {
              deck: activeDeck,
              card: activeCard,
              libraryDeck: activeLibraryDeck,
              libraryCard: activeLibraryCard,
              chapter: activeChapter,
            },
            readerText,
            readerLang,
            cardReader(activeDeck?.cardLanguage),
          ),
          t,
        );
  // The page and what it is in, as the trail ends: "Study – Kanji N5 – Solid Memo".
  useDocumentTitle(
    crumbs
      .map((crumb) => crumb.label)
      .filter((label) => label !== "")
      .slice(-2)
      .reverse(),
  );

  // While the instances, or the route's deck or card, load (or fail), the
  // site header and main landmark stay: the skip link, Log out and the
  // theme and language choices must not come and go with the data.
  const waiting = (() => {
    if (instancesQuery.error) {
      return <ErrorMessage error={errorText(instancesQuery.error)} />;
    }
    if (
      route === null ||
      instances === undefined ||
      (instanceUrl !== null && activeInstance === null)
    ) {
      return <Loading label={t("workspace.loadingInstances")} />;
    }
    return (
      lookupWaiting(
        needsDeck,
        decksQuery,
        decksQuery.data === undefined || activeDeck === null,
        t("workspace.loadingDeck"),
        errorText,
      ) ??
      lookupWaiting(
        needsCard,
        cardsQuery,
        activeCard === null,
        t("workspace.loadingCard"),
        errorText,
      ) ??
      lookupWaiting(
        needsCourse,
        courseQuery,
        activeCourse === null || (chapterUrl !== null && activeChapter === null) || reviewTooSoon,
        t("workspace.loadingCourse"),
        errorText,
      ) ??
      lookupWaiting(
        needsLibraryDeck,
        libraryQuery,
        activeLibraryDeck === null,
        t("workspace.loadingLibrary"),
        errorText,
      ) ??
      (route.screen === "try" && (!triedSettled || instances.length < 2) ? (
        <Loading label={t("workspace.loadingLibrary")} />
      ) : null) ??
      lookupWaiting(
        needsLibraryCard,
        libraryCardsQuery,
        activeLibraryCard === null,
        t("workspace.loadingCard"),
        errorText,
      )
    );
  })();

  // Only called once nothing is waiting, so the route and instances are there.
  const screenFor = (route: RouteRef, instances: Instance[]) => {
    switch (route.screen) {
      case "storagePicker":
        if (storagesQuery.error) {
          return <ErrorMessage error={errorText(storagesQuery.error)} />;
        }
        if (storagesQuery.data === undefined) {
          return <Loading label={t("workspace.discoveringStorages")} />;
        }
        return (
          <StoragePicker
            storages={storagesQuery.data}
            busy={manualStorageMutation.isPending}
            error={errorText(manualStorageMutation.error)}
            onSelect={(storage) =>
              navigate({
                screen: "instanceCreator",
                storageUrl: storage.url,
                source: storage.source,
              })
            }
            onAddManual={(url) => manualStorageMutation.mutate(url)}
          />
        );
      case "instancePicker":
        return (
          <InstancePickerContainer
            useCases={useCases}
            session={session}
            instances={instances}
            newInstanceHref={routeToHash({ screen: "storagePicker" })}
            onOpen={(instance) => navigate({ screen: "home", instanceUrl: instance.url })}
          />
        );
      case "try":
        // Only reached with several instances: the learner chooses one.
        return (
          <InstancePickerContainer
            useCases={useCases}
            session={session}
            instances={instances}
            purpose={
              triedDeck == null
                ? undefined
                : tx("workspace.tryChooseInstance", {
                    deck: <ReaderText text={triedDeck.title} />,
                  })
            }
            newInstanceHref={routeToHash({ screen: "storagePicker" })}
            onOpen={openTried}
          />
        );
      case "instanceCreator":
        return (
          <InstanceCreator
            storage={{ url: route.storageUrl, source: route.source }}
            options={registrationOptions}
            busy={createInstanceMutation.isPending}
            error={errorText(createInstanceMutation.error)}
            onCreate={(args) => createInstanceMutation.mutate(args)}
            backHref={routeToHash({ screen: "instancePicker" })}
          />
        );
      case "home":
        return (
          <DeckListContainer
            useCases={useCases}
            instance={activeInstance!}
            isSetAside={isSetAside}
            arrangementSetAside={arrangementIsSetAside}
            checking={checkUnsettled}
            onStudyDeck={(deck) =>
              navigate({
                screen: "study",
                instanceUrl: instanceUrl!,
                deckUrl: deck.url,
              })
            }
            onCourseStarted={(started) =>
              navigate({ screen: "course", instanceUrl: instanceUrl!, deckUrl: started.url })
            }
          />
        );
      case "deckCreator":
        return (
          <DeckCreatorContainer
            useCases={useCases}
            instance={activeInstance!}
            onDone={() => navigate({ screen: "home", instanceUrl: instanceUrl! })}
          />
        );
      case "library":
        return (
          <>
            {triedUnknown && (
              <p class="warning" role="status">
                {t("workspace.triedUnknown")}
              </p>
            )}
            <LibraryContainer
              useCases={useCases}
              instance={activeInstance!}
              onDone={() => navigate({ screen: "home", instanceUrl: instanceUrl! })}
            />
          </>
        );
      case "libraryDeck":
        return (
          <LibraryDeckContainer
            useCases={useCases}
            instance={activeInstance!}
            deck={activeLibraryDeck!}
            onDone={() => navigate({ screen: "home", instanceUrl: instanceUrl! })}
            onCourseStarted={(started) =>
              navigate({ screen: "course", instanceUrl: instanceUrl!, deckUrl: started.url })
            }
          />
        );
      case "importUrl":
        return (
          <ImportUrlContainer
            useCases={useCases}
            instance={activeInstance!}
            url={route.url}
            onShow={(url) => navigate({ screen: "importUrl", instanceUrl: instanceUrl!, url })}
            onDone={() => navigate({ screen: "home", instanceUrl: instanceUrl! })}
            onCourseStarted={(started) =>
              navigate({ screen: "course", instanceUrl: instanceUrl!, deckUrl: started.url })
            }
          />
        );
      case "libraryBrowser":
        return (
          <LibraryBrowserContainer
            useCases={useCases}
            deck={activeLibraryDeck!}
            deckHref={libraryDeckHref(instanceUrl!, libraryDeckUrl!)}
            cardHref={(card) =>
              routeToHash({
                screen: "libraryCard",
                instanceUrl: instanceUrl!,
                libraryDeckUrl: libraryDeckUrl!,
                cardId: card.id,
              })
            }
            page={route.page ?? 1}
            onPageChange={(page) => replace({ ...route, page })}
          />
        );
      case "libraryCard":
        return (
          <LibraryCardScreen
            card={activeLibraryCard!}
            deckName={readerText(activeLibraryDeck!.title)}
            deckLang={readerLang(activeLibraryDeck!.title)}
            deckHref={libraryDeckHref(instanceUrl!, libraryDeckUrl!)}
            releaseUrl={activeLibraryDeck!.url}
          />
        );
      case "libraryPreview":
        return (
          <LibraryPreviewContainer
            useCases={useCases}
            deck={activeLibraryDeck!}
            deckHref={libraryDeckHref(instanceUrl!, libraryDeckUrl!)}
            onExit={() => navigate({ screen: "library", instanceUrl: instanceUrl! })}
          />
        );
      case "deckDetail":
        return (
          <DeckDetailContainer
            useCases={useCases}
            instance={activeInstance!}
            deck={activeDeck!}
            onStudy={() =>
              navigate({
                screen: "study",
                instanceUrl: instanceUrl!,
                deckUrl: deckUrl!,
              })
            }
          />
        );
      case "deckPreferences":
        return (
          <DeckPreferencesContainer
            useCases={useCases}
            instance={activeInstance!}
            deck={activeDeck!}
            section={route.section}
            onDeckRemoved={() => replace({ screen: "home", instanceUrl: instanceUrl! })}
            onDone={() =>
              navigate({
                screen: "deckDetail",
                instanceUrl: instanceUrl!,
                deckUrl: deckUrl!,
              })
            }
          />
        );
      case "browser":
        return (
          <CardLanguage language={activeDeck!.cardLanguage}>
            <BrowserContainer
              useCases={useCases}
              deck={activeDeck!}
              deckHref={deckHref(instanceUrl!, deckUrl!)}
              page={route.page ?? 1}
              languageFilter={route.languages}
              addCardHref={routeToHash({
                screen: "cardCreator",
                instanceUrl: instanceUrl!,
                deckUrl: deckUrl!,
              })}
              cardHref={(card) =>
                routeToHash({
                  screen: "card",
                  instanceUrl: instanceUrl!,
                  deckUrl: deckUrl!,
                  cardUrl: card.url,
                })
              }
              onPageChange={(page) => replace({ ...route, page })}
              onLanguageFilterChange={(languages) =>
                replace({
                  screen: "browser",
                  instanceUrl: route.instanceUrl,
                  deckUrl: route.deckUrl,
                  ...(languages === undefined ? {} : { languages }),
                })
              }
            />
          </CardLanguage>
        );
      case "cardCreator":
        return (
          <CardCreatorContainer
            useCases={useCases}
            deck={activeDeck!}
            deckHref={deckHref(instanceUrl!, deckUrl!)}
            backHref={routeToHash({
              screen: "browser",
              instanceUrl: instanceUrl!,
              deckUrl: deckUrl!,
            })}
          />
        );
      case "card": {
        const browser = {
          screen: "browser",
          instanceUrl: instanceUrl!,
          deckUrl: deckUrl!,
        } as const;
        return (
          <CardLanguage key={activeCard!.url} language={activeDeck!.cardLanguage}>
            <CardContainer
              useCases={useCases}
              deck={activeDeck!}
              card={activeCard!}
              onRemoved={() => replace(browser)}
            />
            <CardHistoryContainer
              useCases={useCases}
              instanceUrl={instanceUrl!}
              deck={activeDeck!}
              card={activeCard!}
            />
          </CardLanguage>
        );
      }
      case "study":
        return (
          <CardLanguage language={activeDeck!.cardLanguage}>
            <StudyContainer
              useCases={useCases}
              instance={activeInstance!}
              deck={activeDeck!}
              onExit={() => navigate({ screen: "home", instanceUrl: instanceUrl! })}
            />
          </CardLanguage>
        );
      case "cram":
        return (
          <CramContainer
            key={deckUrl}
            useCases={useCases}
            instance={activeInstance!}
            deck={activeDeck!}
            onExit={() =>
              navigate({ screen: "deckDetail", instanceUrl: instanceUrl!, deckUrl: deckUrl! })
            }
          />
        );
      case "cramAll":
        return (
          <CramContainer
            key="all"
            useCases={useCases}
            instance={activeInstance!}
            onExit={() =>
              navigate({ screen: "statistics", instanceUrl: instanceUrl!, view: "memory" })
            }
          />
        );
      case "course":
        return (
          <CourseContainer
            useCases={useCases}
            instance={activeInstance!}
            course={activeCourse!}
            justCompleted={justCompleted ?? undefined}
          />
        );
      case "courseChapter":
        // The cards of the chapter's questions; its title and theory are not card text.
        return (
          <CardLanguage key={route.chapterUrl} language={activeDeck!.cardLanguage}>
            <ChapterPlayerContainer
              useCases={useCases}
              instance={activeInstance!}
              course={activeCourse!}
              chapter={activeChapter!}
              onReview={() => navigate({ ...route, screen: "courseReview" })}
            />
          </CardLanguage>
        );
      case "courseReview":
        return (
          <CardLanguage key={route.chapterUrl} language={activeDeck!.cardLanguage}>
            <ChapterReviewContainer
              useCases={useCases}
              instance={activeInstance!}
              course={activeCourse!}
              chapter={activeChapter!}
              onCompleted={(finishedCourse) => {
                setJustCompleted({ chapterUrl: route.chapterUrl, finishedCourse });
                navigate({ screen: "course", instanceUrl: instanceUrl!, deckUrl: deckUrl! });
              }}
            />
          </CardLanguage>
        );
      case "preferences":
        return (
          <>
            <PreferencesContainer
              useCases={useCases}
              instance={activeInstance!}
              onBack={() => navigate({ screen: "home", instanceUrl: instanceUrl! })}
            />
            {/* A guest's pod is on this device: no other app looks there. */}
            {session.guest !== true && (
              <FindableContainer useCases={useCases} session={session} instance={activeInstance!} />
            )}
          </>
        );
      case "palette":
        return (
          <PaletteEditorContainer
            useCases={useCases}
            instance={activeInstance!}
            paletteUrl={route.paletteUrl}
            onDone={() => navigate({ screen: "preferences", instanceUrl: instanceUrl! })}
          />
        );
      case "statistics":
      case "deckStatistics":
        return (
          <StatisticsContainer
            useCases={useCases}
            instance={activeInstance!}
            decks={route.screen === "deckStatistics" ? [activeDeck!] : (decksQuery.data ?? [])}
            deck={route.screen === "deckStatistics" ? activeDeck! : undefined}
            range={route.range ?? DEFAULT_STATISTICS_RANGE}
            view={route.view ?? "overview"}
            hrefOf={(change) => routeToHash({ ...route, ...change })}
            onChange={(change) => replace({ ...route, ...change })}
          />
        );
      case "validation":
        if (developerMode) {
          return <ValidationContainer useCases={useCases} instance={activeInstance!} />;
        }
        return preferencesQuery.isPending ? (
          <Loading label={t("workspace.loadingPreferences")} />
        ) : (
          <p class="hint">
            {tx("workspace.developerModeOff", {
              preferences: (
                <a href={routeToHash({ screen: "preferences", instanceUrl: instanceUrl! })}>
                  {t("workspace.preferencesLink")}
                </a>
              ),
            })}
          </p>
        );
    }
  };

  const blocked =
    activeInstance !== null &&
    !alwaysReachable &&
    policy === "block-instance" &&
    (check.pending || invalidReport !== null);
  const deckSetAside = activeDeck !== null && isSetAside(activeDeck);
  const deckWaits = activeDeck !== null && checkUnsettled;
  const shown =
    waiting ??
    checkedScreen(blocked || deckWaits, invalidReport !== null, deckSetAside, t, () =>
      screenFor(route!, instances!),
    );

  return (
    <>
      <header class="site-header">
        {banner}
        {activeInstance !== null && <InstanceBar instance={activeInstance} />}
      </header>
      <main id={MAIN_ID} tabIndex={-1} class="workspace">
        {children}
        {session.guest !== true && <GuestStudyOffer useCases={useCases} session={session} />}
        {waiting === null &&
          activeInstance !== null &&
          instanceNotices(
            useCases,
            session,
            activeInstance,
            check,
            decksOfCheck.data,
            tx,
            errorText,
          )}
        {waiting === null && <Breadcrumbs crumbs={crumbs} />}
        <div ref={screenRef} class="screen">
          {shown}
        </div>
        {developerMode && activeInstance !== null && (
          <nav class="developer-tools" aria-label={t("workspace.developerTools")}>
            <a href={validationHref(activeInstance.url)}>{t("workspace.validateInstance")}</a>
          </nav>
        )}
        {developerMode && <WebIdDocumentContainer useCases={useCases} session={session} />}
      </main>
    </>
  );
}
