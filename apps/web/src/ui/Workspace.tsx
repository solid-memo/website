import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import { cardName, cardNameText } from "./DataText";
import { decksOf } from "@solid-memo/domain/deckTree";
import { DEFAULT_INVALID_DATA_POLICY } from "@solid-memo/domain/invalidDataPolicy";
import { arrangementSetAside, setAsideDecks } from "@solid-memo/domain/validation";
import type { Instance, RegistrationTarget } from "@solid-memo/domain/instance";
import type { LibraryDeck } from "@solid-memo/domain/library";
import type { Session } from "@solid-memo/domain/session";
import { Breadcrumbs, breadcrumbsFor } from "./Breadcrumbs";
import { BrowserContainer } from "./BrowserContainer";
import { CardContainer } from "./CardContainer";
import { CardCreatorContainer } from "./CardCreatorContainer";
import { ChapterPlayerContainer } from "./ChapterPlayerContainer";
import { ChapterReviewContainer } from "./ChapterReviewContainer";
import { CourseContainer, courseKey, type CompletedChapter } from "./CourseContainer";
import { DeckCreatorContainer } from "./DeckCreatorContainer";
import { DeckDetailContainer } from "./DeckDetailContainer";
import { DeckPreferencesContainer } from "./DeckPreferencesContainer";
import { DeckListContainer } from "./DeckListContainer";
import { studyCountsQuery } from "./DeckStudyAction";
import { ErrorMessage } from "./ErrorMessage";
import { InstanceBar } from "./InstanceBar";
import { InstanceCreator } from "./InstanceCreator";
import { InstancePicker } from "./InstancePicker";
import { FindableContainer } from "./FindableContainer";
import { DataCheckNotice } from "./DataCheckNotice";
import { LibraryBrowserContainer } from "./LibraryBrowserContainer";
import { LibraryCardScreen } from "./LibraryCardScreen";
import { LibraryContainer } from "./LibraryContainer";
import { LibraryDeckContainer } from "./LibraryDeckContainer";
import { LibraryPreviewContainer } from "./LibraryPreviewContainer";
import { Loading } from "./Loading";
import { InterruptedMoveContainer } from "./InterruptedMoveContainer";
import { MigrationContainer } from "./MigrationContainer";
import { StudyContainer } from "./StudyContainer";
import { PreferencesContainer } from "./PreferencesContainer";
import { StatisticsContainer } from "./StatisticsContainer";
import { StoragePicker } from "./StoragePicker";
import {
  deckHref,
  libraryDeckHref,
  routeToHash,
  useHashRoute,
  type RouteRef,
  validationHref,
} from "./router";
import { ValidationContainer } from "./ValidationContainer";
import { WebIdDocumentContainer } from "./WebIdDocumentContainer";
import { useI18n } from "./i18n";
import { useInstanceTheme } from "./theme";
import { useDocumentTitle } from "./documentTitle";
import { useScreenFocus } from "./screenFocus";
import { MAIN_ID } from "./SkipLink";

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
  /** What the main content starts with, above the instance's notices. */
  children?: ComponentChildren;
}) {
  const { t, tx, readerText, readerLang, errorText } = useI18n();
  const queryClient = useQueryClient();
  const { route, change, navigate, replace } = useHashRoute();
  const screenRef = useScreenFocus(route, change);
  const webId = session.webId;

  const instancesQuery = useQuery({
    queryKey: ["instances", webId],
    queryFn: () => useCases.listInstances(session),
  });
  const instances = instancesQuery.data;

  const instanceUrl =
    route !== null && "instanceUrl" in route ? route.instanceUrl : null;
  const activeInstance =
    instanceUrl === null
      ? null
      : (instances?.find((i) => i.url === instanceUrl) ?? null);

  useInstanceTheme(useCases, activeInstance?.url ?? null);

  const deckUrl = route !== null && "deckUrl" in route ? route.deckUrl : null;
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
      replace(
        instances.length > 0
          ? { screen: "instancePicker" }
          : { screen: "storagePicker" },
      );
    }
  }, [instanceUrl, instances]);

  const decksQuery = useQuery({
    queryKey: ["decks", instanceUrl],
    queryFn: () => useCases.listDecks(instanceUrl!),
    enabled: needsDeck,
  });
  const activeDeck =
    needsDeck
      ? (decksQuery.data?.find((d) => d.url === deckUrl) ?? null)
      : null;

  useEffect(() => {
    if (!needsDeck || decksQuery.data === undefined) return;
    if (!decksQuery.data.some((d) => d.url === deckUrl)) {
      replace({ screen: "home", instanceUrl: instanceUrl! });
    }
  }, [needsDeck, decksQuery.data, deckUrl, instanceUrl]);

  const cardUrl = route?.screen === "card" ? route.cardUrl : null;
  const needsCard = cardUrl !== null && activeDeck !== null;
  const cardsQuery = useQuery({
    queryKey: ["cards", activeDeck?.cardsDocumentUrl],
    queryFn: () => useCases.listCards(activeDeck!),
    enabled: needsCard,
  });
  const activeCard = needsCard
    ? (cardsQuery.data?.find((c) => c.url === cardUrl) ?? null)
    : null;

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

  const libraryDeckUrl =
    route?.screen === "libraryDeck" ||
    route?.screen === "libraryBrowser" ||
    route?.screen === "libraryCard" ||
    route?.screen === "libraryPreview"
      ? route.libraryDeckUrl
      : null;
  const needsLibraryDeck = libraryDeckUrl !== null && activeInstance !== null;
  const libraryQuery = useQuery({
    queryKey: ["library"],
    queryFn: () => useCases.listLibraryDecks(),
    enabled: needsLibraryDeck,
  });
  // A library deck's page is addressed by its series, which outlives
  // releases; an address of one of its releases still finds it.
  const isAddressed = (d: LibraryDeck) =>
    d.seriesUrl === libraryDeckUrl || d.releases.some((r) => r.url === libraryDeckUrl);
  const activeLibraryDeck = needsLibraryDeck
    ? (libraryQuery.data?.find(isAddressed) ?? null)
    : null;

  useEffect(() => {
    if (!needsLibraryDeck || libraryQuery.data === undefined) return;
    if (!libraryQuery.data.some(isAddressed)) {
      replace({ screen: "library", instanceUrl: instanceUrl! });
    }
  }, [needsLibraryDeck, libraryQuery.data, libraryDeckUrl, instanceUrl]);

  const libraryCardId = route?.screen === "libraryCard" ? route.cardId : null;
  const needsLibraryCard = libraryCardId !== null && activeLibraryDeck !== null;
  const libraryCardsQuery = useQuery({
    queryKey: ["libraryCards", activeLibraryDeck?.url],
    queryFn: () => useCases.listLibraryCards(activeLibraryDeck!),
    enabled: needsLibraryCard,
  });
  const activeLibraryCard = needsLibraryCard
    ? (libraryCardsQuery.data?.find((c) => c.id === libraryCardId) ?? null)
    : null;

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
  // back to the course; a deck that is no library copy, to its page.
  const isCourseRoute =
    route?.screen === "course" || route?.screen === "courseChapter" || route?.screen === "courseReview";
  const needsCourse = isCourseRoute && activeDeck !== null;
  const courseQuery = useQuery({
    queryKey: courseKey(deckUrl!),
    queryFn: () => useCases.getCourse(activeDeck!),
    enabled: needsCourse && activeDeck.sourceUrl !== undefined,
  });
  const activeCourse = needsCourse ? (courseQuery.data ?? null) : null;
  const chapterUrl =
    route?.screen === "courseChapter" || route?.screen === "courseReview" ? route.chapterUrl : null;
  const chapterIndex =
    activeCourse === null ? -1 : activeCourse.outline.chapters.findIndex((c) => c.url === chapterUrl);
  const activeChapter =
    chapterIndex >= 0 && activeCourse!.progress.chapters[chapterIndex]!.state !== "locked"
      ? activeCourse!.outline.chapters[chapterIndex]!
      : null;

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
    }
  }, [needsCourse, activeDeck, activeCourse, activeChapter, chapterUrl, instanceUrl, deckUrl]);

  const preferencesQuery = useQuery({
    queryKey: ["preferences", instanceUrl],
    queryFn: () => useCases.getPreferences(instanceUrl!),
    enabled: activeInstance !== null,
  });
  const developerMode = preferencesQuery.data?.developerMode === true;

  // Every instance is checked against Solid Memo's shapes and DCAT-AP
  // when it is opened (docs/validation.md); what happens with invalid
  // data is the user's invalid data policy. Writes are checked as they
  // are made, so the check runs again only after a repair or an update.
  const checkQuery = useQuery({
    queryKey: ["validation", instanceUrl],
    queryFn: () => useCases.checkInstance(instanceUrl!),
    enabled: activeInstance !== null,
    staleTime: Infinity,
  });
  // The deck list's arrangement (DeckListContainer's query) and counts are
  // fetched while the instance is checked, not after. Its decks are the
  // deck lookup's too, so the catalog is read once, and a deck opened
  // from the list resolves without a refetch.
  const homeTreeQuery = useQuery({
    queryKey: ["decks", instanceUrl, "tree"],
    queryFn: () => useCases.listDeckTree(instanceUrl!),
    enabled: activeInstance !== null && route?.screen === "home",
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (instanceUrl === null || homeTreeQuery.data === undefined) return;
    const decks = decksOf(homeTreeQuery.data.children);
    queryClient.setQueryData(["decks", instanceUrl], decks);
    for (const deck of decks) {
      void queryClient.prefetchQuery(studyCountsQuery(useCases, instanceUrl, deck));
    }
  }, [homeTreeQuery.data, instanceUrl]);
  // Until the preferences are read, the workspace waits as under "block
  // the instance": a user who chose it never sees data before the check.
  const policy =
    preferencesQuery.data?.invalidDataPolicy ??
    (preferencesQuery.isPending ? "block-instance" : DEFAULT_INVALID_DATA_POLICY);
  const invalidReport =
    checkQuery.data !== undefined && !checkQuery.data.conforms ? checkQuery.data : null;
  const decksOfCheck = useQuery({
    queryKey: ["decks", instanceUrl],
    queryFn: () => useCases.listDecks(instanceUrl!),
    enabled: invalidReport !== null && policy === "block-subject",
  });
  const isSetAside = (deck: Deck) =>
    invalidReport !== null && policy === "block-subject" && setAsideDecks(invalidReport, [deck]).size > 0;
  /** The catalogue or a deck group is invalid: the deck list cannot be rearranged until it is repaired. */
  const arrangementIsSetAside =
    invalidReport !== null && policy === "block-subject" && arrangementSetAside(invalidReport);
  // Under "set invalid data aside" nothing is known to be set aside until
  // the check is done: until then a deck's pages wait for it and the list
  // cannot be rearranged, so no write lands on data the check would set
  // aside. A check that fails sets nothing aside.
  const checkUnsettled = activeInstance !== null && policy === "block-subject" && checkQuery.isPending;
  /** Screens that stay reachable whatever the data: where the policy is changed and the report read. */
  const alwaysReachable = route?.screen === "preferences" || route?.screen === "validation";

  const storagesQuery = useQuery({
    queryKey: ["storages", webId],
    queryFn: () => useCases.listStorages(session),
    enabled: route?.screen === "storagePicker",
  });

  useEffect(() => {
    if (
      route?.screen === "storagePicker" &&
      storagesQuery.data?.length === 1
    ) {
      replace({
        screen: "instanceCreator",
        storageUrl: storagesQuery.data[0].url,
        source: storagesQuery.data[0].source,
      });
    }
  }, [route, storagesQuery.data]);

  const registrationOptionsQuery = useQuery({
    queryKey: ["registrationOptions", webId],
    queryFn: () => useCases.getRegistrationOptions(session),
    enabled:
      route?.screen === "instanceCreator" ||
      route?.screen === "instancePicker",
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
      void queryClient.prefetchQuery({
        queryKey: ["library"],
        queryFn: () => useCases.listLibraryDecks(),
      });
      await queryClient.invalidateQueries({ queryKey: ["instances", webId] });
      navigate({ screen: "home", instanceUrl: instance.url });
    },
  });

  const attachInstanceMutation = useMutation({
    mutationFn: (args: { url: string; target: RegistrationTarget }) =>
      useCases.attachInstanceByUrl(session, args.url, args.target),
    onSuccess: async (instance) => {
      await queryClient.invalidateQueries({ queryKey: ["instances", webId] });
      navigate({ screen: "home", instanceUrl: instance.url });
    },
  });

  const deleteInstanceMutation = useMutation({
    mutationFn: (instance: Instance) =>
      useCases.deleteInstance(session, instance),
    onSuccess: async (_, instance) => {
      queryClient.removeQueries({ queryKey: ["decks", instance.url] });
      queryClient.removeQueries({ queryKey: ["preferences", instance.url] });
      await queryClient.invalidateQueries({ queryKey: ["instances", webId] });
    },
  });

  const crumbs =
    route === null
      ? []
      : breadcrumbsFor(route, {
          deck: activeDeck === null ? "" : readerText(activeDeck.title),
          card: activeCard === null ? "" : cardName(activeCard, readerText),
          libraryDeck: activeLibraryDeck === null ? "" : readerText(activeLibraryDeck.title),
          libraryCard: activeLibraryCard === null ? "" : cardName(activeLibraryCard, readerText),
          chapter: activeChapter === null ? "" : readerText(activeChapter.title),
          deckLang: activeDeck === null ? undefined : readerLang(activeDeck.title),
          cardLang: activeCard === null ? undefined : readerLang(cardNameText(activeCard, readerText)),
          libraryDeckLang: activeLibraryDeck === null ? undefined : readerLang(activeLibraryDeck.title),
          libraryCardLang: activeLibraryCard === null ? undefined : readerLang(cardNameText(activeLibraryCard, readerText)),
          chapterLang: activeChapter === null ? undefined : readerLang(activeChapter.title),
        }, t);
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
    if (route === null || instances === undefined) {
      return <Loading label={t("workspace.loadingInstances")} />;
    }
    if (instanceUrl !== null && activeInstance === null) {
      return <Loading label={t("workspace.loadingInstances")} />;
    }
    if (needsDeck) {
      if (decksQuery.error) {
        return <ErrorMessage error={errorText(decksQuery.error)} />;
      }
      if (decksQuery.data === undefined) {
        return <Loading label={t("workspace.loadingDeck")} />;
      }
      if (activeDeck === null) {
        return <Loading label={t("workspace.loadingDeck")} />;
      }
    }
    if (needsCard) {
      if (cardsQuery.error) {
        return <ErrorMessage error={errorText(cardsQuery.error)} />;
      }
      if (activeCard === null) {
        return <Loading label={t("workspace.loadingCard")} />;
      }
    }
    if (needsCourse) {
      if (courseQuery.error) {
        return <ErrorMessage error={errorText(courseQuery.error)} />;
      }
      if (activeCourse === null || (chapterUrl !== null && activeChapter === null)) {
        return <Loading label={t("workspace.loadingCourse")} />;
      }
    }
    if (needsLibraryDeck) {
      if (libraryQuery.error) {
        return <ErrorMessage error={errorText(libraryQuery.error)} />;
      }
      if (activeLibraryDeck === null) {
        return <Loading label={t("workspace.loadingLibrary")} />;
      }
    }
    if (needsLibraryCard) {
      if (libraryCardsQuery.error) {
        return <ErrorMessage error={errorText(libraryCardsQuery.error)} />;
      }
      if (activeLibraryCard === null) {
        return <Loading label={t("workspace.loadingCard")} />;
      }
    }
    return null;
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
          <InstancePicker
            instances={instances}
            options={registrationOptions}
            busy={
              attachInstanceMutation.isPending ||
              deleteInstanceMutation.isPending
            }
            error={
              errorText(attachInstanceMutation.error) ??
              errorText(deleteInstanceMutation.error)
            }
            onSelect={(instance: Instance) =>
              navigate({ screen: "home", instanceUrl: instance.url })
            }
            newInstanceHref={routeToHash({ screen: "storagePicker" })}
            onAttach={(url, target) =>
              attachInstanceMutation.mutate({ url, target })
            }
            onDelete={(instance) => deleteInstanceMutation.mutate(instance)}
            keptFolder={deleteInstanceMutation.data?.keptFolder ?? null}
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
            onDone={() =>
              navigate({ screen: "home", instanceUrl: instanceUrl! })
            }
          />
        );
      case "library":
        return (
          <LibraryContainer
            useCases={useCases}
            instance={activeInstance!}
            onDone={() =>
              navigate({ screen: "home", instanceUrl: instanceUrl! })
            }
          />
        );
      case "libraryDeck":
        return (
          <LibraryDeckContainer
            useCases={useCases}
            instance={activeInstance!}
            deck={activeLibraryDeck!}
            onDone={() =>
              navigate({ screen: "home", instanceUrl: instanceUrl! })
            }
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
          />
        );
      case "libraryPreview":
        return (
          <LibraryPreviewContainer
            useCases={useCases}
            deck={activeLibraryDeck!}
            deckHref={libraryDeckHref(instanceUrl!, libraryDeckUrl!)}
            onExit={() =>
              navigate({ screen: "library", instanceUrl: instanceUrl! })
            }
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
            onDeckRemoved={() =>
              replace({ screen: "home", instanceUrl: instanceUrl! })
            }
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
          <CardContainer
            key={activeCard!.url}
            useCases={useCases}
            deck={activeDeck!}
            card={activeCard!}
            onRemoved={() => replace(browser)}
          />
        );
      }
      case "study":
        return (
          <StudyContainer
            useCases={useCases}
            instance={activeInstance!}
            deck={activeDeck!}
            onExit={() =>
              navigate({ screen: "home", instanceUrl: instanceUrl! })
            }
          />
        );
      case "course":
        return (
          <CourseContainer instanceUrl={instanceUrl!} course={activeCourse!} justCompleted={justCompleted ?? undefined} />
        );
      case "courseChapter":
        return (
          <ChapterPlayerContainer
            key={route.chapterUrl}
            useCases={useCases}
            instance={activeInstance!}
            course={activeCourse!}
            chapter={activeChapter!}
            onReview={() => navigate({ ...route, screen: "courseReview" })}
          />
        );
      case "courseReview":
        return (
          <ChapterReviewContainer
            key={route.chapterUrl}
            useCases={useCases}
            instance={activeInstance!}
            course={activeCourse!}
            chapter={activeChapter!}
            onCompleted={(finishedCourse) => {
              setJustCompleted({ chapterUrl: route.chapterUrl, finishedCourse });
              navigate({ screen: "course", instanceUrl: instanceUrl!, deckUrl: deckUrl! });
            }}
          />
        );
      case "preferences":
        return (
          <>
          <PreferencesContainer
            useCases={useCases}
            instance={activeInstance!}
            onBack={() =>
              navigate({ screen: "home", instanceUrl: instanceUrl! })
            }
          />
          {/* A guest's pod is on this device: no other app looks there. */}
          {session.guest !== true && (
            <FindableContainer useCases={useCases} session={session} instance={activeInstance!} />
          )}
          </>
        );
      case "statistics":
        return (
          <StatisticsContainer useCases={useCases} instance={activeInstance!} decks={decksQuery.data ?? []} />
        );
      case "validation":
        if (developerMode) {
          return (
            <ValidationContainer useCases={useCases} instance={activeInstance!} />
          );
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
    activeInstance !== null && !alwaysReachable && policy === "block-instance" &&
    (checkQuery.isPending || invalidReport !== null);
  const deckSetAside = activeDeck !== null && isSetAside(activeDeck);
  const deckWaits = activeDeck !== null && checkUnsettled;
  const shown = waiting ?? (blocked || deckWaits ? (
    invalidReport === null ? <Loading label={t("workspace.checkingData")} /> : null
  ) : deckSetAside ? (
    <p class="hint">{t("workspace.deckSetAside")}</p>
  ) : (
    screenFor(route!, instances!)
  ));

  return (
    <>
      <header class="site-header">
        {banner}
        {activeInstance !== null && <InstanceBar instance={activeInstance} />}
      </header>
      <main id={MAIN_ID} tabIndex={-1} class="workspace">
        {children}
        {waiting === null && activeInstance !== null && (
          <>
            <InterruptedMoveContainer useCases={useCases} instance={activeInstance} />
            <MigrationContainer
              useCases={useCases}
              session={session}
              instance={activeInstance}
            />
            {checkQuery.error && (
              // A div: the error may bring its technical details, a block.
              <div class="warning">
                {tx("workspace.checkFailed", { error: errorText(checkQuery.error) })}
              </div>
            )}
            {invalidReport !== null && (
              <DataCheckNotice
                useCases={useCases}
                instance={activeInstance}
                report={invalidReport}
                policy={policy}
                setAside={(decksOfCheck.data ?? []).filter(isSetAside).map((deck) => deck.title)}
                arrangementSetAside={arrangementIsSetAside}
              />
            )}
          </>
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
        {developerMode && (
          <WebIdDocumentContainer useCases={useCases} session={session} />
        )}
      </main>
    </>
  );
}
