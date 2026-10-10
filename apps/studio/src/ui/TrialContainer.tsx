import { useEffect, useRef, useState } from "preact/hooks";
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Trial, TrialOpening } from "@solid-memo/application/trial";
import type { UseCases } from "@solid-memo/application/useCases";
import { draftPlaceOf } from "@solid-memo/domain/release/draftLayout";
import type { ProblemTarget } from "@solid-memo/domain/release/releaseCheck";
import type { ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { fragmentIdOf } from "@solid-memo/domain/subjectUrl";
import { ChapterPlayerContainer } from "@solid-memo/ui/ChapterPlayerContainer";
import { ChapterReviewContainer } from "@solid-memo/ui/ChapterReviewContainer";
import { CourseContainer, courseKey, type CompletedChapter } from "@solid-memo/ui/CourseContainer";
import { Clock, CourseLinksContext, type CourseLinks } from "@solid-memo/ui/courseLinks";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n } from "@solid-memo/ui/i18n";
import { Loading } from "@solid-memo/ui/Loading";
import { StudyContainer } from "@solid-memo/ui/StudyContainer";
import { draftKey, useDraftEditor } from "./draftEditor";
import { answerChapter, answerQueue, jumpToChapter } from "./trialActions";
import { TrialControls } from "./TrialControls";
import { TrialScreen } from "./TrialScreen";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Where a trial links: the course's page, a chapter's steps or final review (by its id), and a problem's field in the draft's editors. */
export interface TrialLinks {
  courseHref: string;
  chapterHref: (chapter: string) => string;
  reviewHref: (chapter: string) => string;
  targetHref: (target: ProblemTarget) => string;
}

/** A trial opened: the draft it plays, the trial or what keeps the draft from it, and the trial's own query client. */
interface Played {
  id: number;
  draft: ReleaseDraft;
  opening: TrialOpening;
  client: QueryClient;
}

/**
 * A draft's trial (docs/studio.md, The trial): the draft, as its editor
 * keeps it, played in a sandbox of its own (UseCases.openTrial), with
 * Solid Memo's own course or study screens. Each trial has its own
 * query client, so nothing it reads or writes mixes with the user's:
 * starting over, or playing the draft as the pod has it now, discards
 * the sandbox and the client, and opens another.
 */
export function TrialContainer({
  useCases,
  draftUrl,
  chapter,
  review,
  links,
  onReview,
  onCourse,
  onJump,
}: {
  useCases: UseCases;
  draftUrl: string;
  /** The chapter to show (its id); the course's page when absent. */
  chapter: string | undefined;
  /** Its final review, not its steps. */
  review: boolean;
  links: TrialLinks;
  /** On from the chapter's last question to its final review. */
  onReview: (chapter: string) => void;
  /** Back to the course's page, from a final review passed. */
  onCourse: () => void;
  /** On to a chapter, from the controls. */
  onJump: (chapter: string) => void;
}) {
  const queryClient = useQueryClient();
  const editor = useDraftEditor(useCases, draftUrl);
  const instanceUrl = draftPlaceOf(draftUrl)!.instanceUrl;
  const [played, setPlayed] = useState<Played | null>(null);
  const plays = useRef(0);
  const open = useMutation({
    /** A trial of the draft; null: of the draft read afresh from the pod. */
    mutationFn: async (from: ReleaseDraft | null) => {
      const draft: ReleaseDraft =
        from ?? (await queryClient.fetchQuery({ queryKey: draftKey(draftUrl), queryFn: () => useCases.getReleaseDraft(draftUrl), staleTime: 0 }));
      return { draft, opening: await useCases.openTrial(draft, instanceUrl) };
    },
    onMutate: () => {
      played?.client.clear();
      setPlayed(null);
    },
    onSuccess: ({ draft, opening }) =>
      setPlayed({
        id: ++plays.current,
        draft,
        opening,
        // The trial's pod is in memory: a read that failed fails again.
        client: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
      }),
  });
  useEffect(() => open.mutate(editor.draft!), []);

  // The workspace shows a draft's screens once its draft is read.
  const draft = played?.draft ?? editor.draft!;
  return (
    <TrialScreen
      draft={draft}
      opening={played === null && !open.isError}
      error={open.error}
      problems={played !== null && !played.opening.ok ? played.opening.problems : null}
      targetHref={links.targetHref}
      onReset={() => open.mutate(draft)}
      onReload={() => open.mutate(null)}
    >
      {played?.opening.ok === true && (
        <QueryClientProvider client={played.client}>
          <TrialPlay
            key={played.id}
            draft={played.draft}
            trial={played.opening.trial}
            chapter={chapter}
            review={review}
            links={links}
            onReview={onReview}
            onCourse={onCourse}
            onJump={onJump}
          />
        </QueryClientProvider>
      )}
    </TrialScreen>
  );
}

/**
 * A trial under way: its controls, then the course's page, a chapter's
 * steps or its final review (a chapter the course has not shows the
 * course's page), or a deck's study, each at the trial's clock, which
 * the controls move days ahead. After each control, what is shown is
 * read again and starts afresh. A final review passed leads back to
 * the course's page, which cheers the chapter just completed until
 * another chapter is shown, as the app's does.
 */
function TrialPlay({
  draft,
  trial,
  chapter,
  review,
  links,
  onReview,
  onCourse,
  onJump,
}: {
  draft: ReleaseDraft;
  trial: Trial;
  chapter: string | undefined;
  review: boolean;
  links: TrialLinks;
  onReview: (chapter: string) => void;
  onCourse: () => void;
  onJump: (chapter: string) => void;
}) {
  const { t, errorText } = useI18n();
  const queryClient = useQueryClient();
  const [days, setDays] = useState(0);
  // Each control's change starts the screen shown afresh.
  const [run, setRun] = useState(0);
  const [justCompleted, setJustCompleted] = useState<CompletedChapter | null>(null);
  // The cheer is the course's page's, as the review leads back to it: a chapter shown drops it.
  useEffect(() => {
    if (chapter !== undefined) setJustCompleted(null);
  }, [chapter]);
  const clock = () => new Date(Date.now() + days * DAY_MS);
  const { useCases, instance, deck } = trial;
  const courseQuery = useQuery({
    queryKey: courseKey(deck.url),
    queryFn: () => useCases.getCourse(deck),
    enabled: draft.course,
  });
  const course = courseQuery.data;
  const shown = course?.outline.chapters.find((one) => one.id === chapter) ?? null;
  // Answers go to the chapter shown, else to the one to take next: none once the course is done.
  const answered = shown ?? course?.outline.chapters.find((one) => one.url === course.progress.currentChapterUrl) ?? null;
  const renew = async () => {
    await queryClient.invalidateQueries();
    setRun((current) => current + 1);
  };
  const act = useMutation({ mutationFn: (action: () => Promise<void>) => action(), onSuccess: renew });
  const courseLinks: CourseLinks = {
    courseHref: () => links.courseHref,
    chapterHref: (_instance, _deck, chapterUrl) => links.chapterHref(fragmentIdOf(chapterUrl)),
    reviewHref: (_instance, _deck, chapterUrl) => links.reviewHref(fragmentIdOf(chapterUrl)),
  };

  if (draft.course && course === undefined) {
    return courseQuery.error ? <ErrorMessage error={errorText(courseQuery.error)} /> : <Loading label={t("studio.trial.opening")} />;
  }
  const player = !draft.course ? (
    <StudyContainer
      key={run}
      useCases={useCases}
      instance={instance}
      deck={deck}
      deckLink={links.courseHref}
      // Leaving the session starts another.
      onExit={() => setRun((current) => current + 1)}
    />
  ) : shown === null ? (
    <CourseContainer useCases={useCases} instance={instance} course={course!} justCompleted={justCompleted ?? undefined} />
  ) : review ? (
    <ChapterReviewContainer
      key={`${shown.id} ${run}`}
      useCases={useCases}
      instance={instance}
      course={course!}
      chapter={shown}
      onCompleted={(finishedCourse) => {
        setJustCompleted({ chapterUrl: shown.url, finishedCourse });
        onCourse();
      }}
    />
  ) : (
    <ChapterPlayerContainer
      key={`${shown.id} ${run}`}
      useCases={useCases}
      instance={instance}
      course={course!}
      chapter={shown}
      onReview={() => onReview(shown.id)}
    />
  );

  return (
    <>
      <TrialControls
        coursePage={draft.course ? links.courseHref : null}
        chapters={course?.outline.chapters.map((one) => ({ id: one.id, title: one.title })) ?? []}
        answerHint={!draft.course ? "deck" : answered === null ? null : "course"}
        days={days}
        busy={act.isPending}
        error={act.error}
        onJump={(id) =>
          act.mutate(async () => {
            await jumpToChapter(trial, course!, course!.outline.chapters.find((one) => one.id === id)!);
            onJump(id);
          })
        }
        onAnswerAll={(correct) =>
          act.mutate(() => (draft.course ? answerChapter(trial, course!, answered!, correct, clock()) : answerQueue(trial, correct, clock())))
        }
        onAdvance={(more) => {
          setDays(days + more);
          setRun(run + 1);
          void queryClient.invalidateQueries();
        }}
      />
      <CourseLinksContext.Provider value={courseLinks}>
        <Clock.Provider value={clock}>{player}</Clock.Provider>
      </CourseLinksContext.Provider>
    </>
  );
}
