import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TrialOpening } from "@solid-memo/application/trial";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Prompt } from "@solid-memo/domain/deck";
import { problem } from "@solid-memo/domain/release/problems";
import type { ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { makeUseCasesFake } from "@solid-memo/ui/test/useCasesFake";
import { CH1, courseDeck, courseInstance, makeCourse } from "@solid-memo/ui/test/course";
import { courseDraft, DRAFT_URL, instanceA } from "../test/fixtures";
import { draftKey } from "./draftEditor";
import { TrialContainer, type TrialLinks } from "./TrialContainer";

const DAY_MS = 24 * 60 * 60 * 1000;

const links: TrialLinks = {
  courseHref: "#/trial",
  chapterHref: (chapter) => `#/trial/${chapter}`,
  reviewHref: (chapter) => `#/trial/${chapter}/review`,
  targetHref: (target) => `#/${target.screen}`,
};

function opened(trialUseCases: UseCases): TrialOpening {
  return { ok: true, trial: { useCases: trialUseCases, instance: courseInstance, deck: courseDeck } };
}

function renderTrial({
  draft = courseDraft(),
  openTrial,
  chapter,
  review = false,
}: {
  draft?: ReleaseDraft;
  openTrial: UseCases["openTrial"];
  chapter?: string;
  review?: boolean;
}) {
  const useCases = makeUseCasesFake({ getReleaseDraft: vi.fn(async () => draft), openTrial: vi.fn(openTrial) });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(draftKey(DRAFT_URL), draft);
  const onReview = vi.fn();
  const onCourse = vi.fn();
  const onJump = vi.fn();
  const element = (chapter: string | undefined, review: boolean) => (
    <QueryClientProvider client={queryClient}>
      <TrialContainer
        useCases={useCases}
        draftUrl={DRAFT_URL}
        chapter={chapter}
        review={review}
        links={links}
        onReview={onReview}
        onCourse={onCourse}
        onJump={onJump}
      />
    </QueryClientProvider>
  );
  const view = render(element(chapter, review));
  return { useCases, onReview, onCourse, onJump, show: (chapter: string | undefined, review = false) => view.rerender(element(chapter, review)) };
}

/** A course's trial use cases: the course as the fake answers and completions leave it. */
function courseTrial(): UseCases {
  let completed: string[] = [];
  const answered: string[] = [];
  return makeUseCasesFake({
    getCourse: vi.fn(async () => makeCourse(answered, completed)),
    answerCourseQuestion: vi.fn(async (_instance, _deck, card) => {
      answered.push(card.id);
      return { effect: "introduce" as const, state: null };
    }),
    completeChapter: vi.fn(async (deck, chapterUrl) => {
      completed = [...completed, chapterUrl];
      return { ...deck, completedChapters: completed };
    }),
  });
}

describe("TrialContainer", () => {
  it("plays the draft as edited in a sandbox: the course's page, its chapters linked in the trial", async () => {
    const trial = courseTrial();
    const { useCases } = renderTrial({ openTrial: async () => opened(trial) });
    expect(screen.getByText("Setting up the trial…")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Start the course" })).toHaveAttribute("href", "#/trial/ch-1");
    expect(useCases.openTrial).toHaveBeenCalledWith(courseDraft(), instanceA.url);
    expect(trial.getCourse).toHaveBeenCalledWith(courseDeck);
    expect(screen.getByRole("link", { name: "The course's page" })).toHaveAttribute("href", "#/trial");
  });

  it("plays a chapter at the trial's clock, moved days ahead, then on to its final review", async () => {
    const trial = courseTrial();
    const { onReview, show } = renderTrial({ openTrial: async () => opened(trial), chapter: "ch-2" });
    expect(await screen.findByRole("heading", { level: 2, name: "Pods" })).toBeInTheDocument();
    fireEvent.input(screen.getByRole("spinbutton", { name: "Days ahead" }), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Advance" }));
    expect(await screen.findByText("The trial is 2 days ahead.")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "On to the question" }));
    fireEvent.click(screen.getByRole("radio", { name: "A store" }));
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    fireEvent.click(await screen.findByRole("button", { name: "On to the final review" }));
    expect(onReview).toHaveBeenCalledWith("ch-2");
    const at = vi.mocked(trial.answerCourseQuestion).mock.calls[0]![4];
    expect(Math.abs(at.getTime() - Date.now() - 2 * DAY_MS)).toBeLessThan(60_000);

    show("ch-2", true);
    expect(await screen.findByRole("heading", { level: 2, name: "Final review: Pods" })).toBeInTheDocument();
    // A chapter the course has not: its page.
    show("ch-gone");
    expect(await screen.findByRole("link", { name: "Continue" })).toBeInTheDocument();
  });

  it("leads a final review passed back to the course's page, which cheers the chapter until another is shown", async () => {
    const trial = courseTrial();
    const { onCourse, show } = renderTrial({ openTrial: async () => opened(trial), chapter: "ch-2", review: true });
    fireEvent.click(await screen.findByRole("button", { name: "Start the final review" }));
    fireEvent.click(screen.getByRole("radio", { name: "A store" }));
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    await waitFor(() => expect(onCourse).toHaveBeenCalled());
    expect(trial.completeChapter).toHaveBeenCalledWith(expect.objectContaining({ url: courseDeck.url }), `${CH1.slice(0, -1)}2`);

    show(undefined);
    expect(await screen.findByText("Well done! You have completed Pods.")).toBeInTheDocument();
    // The trial has no deck list to go back to.
    expect(screen.queryByRole("link", { name: "Back to decks" })).toBeNull();
    show("ch-1");
    expect(await screen.findByRole("heading", { level: 2, name: "Linked data" })).toBeInTheDocument();
    show(undefined);
    expect(await screen.findByRole("link", { name: "Continue" })).toBeInTheDocument();
    expect(screen.queryByText("Well done! You have completed Pods.")).toBeNull();
  });

  it("answers the chapter to take next all at once, and jumps to a chapter as one who completed those before it", async () => {
    const trial = courseTrial();
    const { onJump } = renderTrial({ openTrial: async () => opened(trial) });
    fireEvent.click(await screen.findByRole("button", { name: "Answer all right" }));
    await waitFor(() => expect(trial.completeChapter).toHaveBeenCalledWith(expect.objectContaining({ url: courseDeck.url }), CH1));
    expect(vi.mocked(trial.answerCourseQuestion).mock.calls.map(([, , card]) => card.id)).toEqual(["q-1", "q-2", "q-3", "r-1"]);
    // The course is read again: the next chapter is open.
    expect(await screen.findByRole("link", { name: "Continue" })).toHaveAttribute("href", "#/trial/ch-2");
    await screen.findByText("The trial is at today's date.");
    fireEvent.change(screen.getByRole("combobox", { name: "Chapter" }), { target: { value: "ch-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Open the chapter" }));
    await waitFor(() => expect(onJump).toHaveBeenCalledWith("ch-2"));
    expect(trial.setCompletedChapters).toHaveBeenCalledWith(expect.objectContaining({ url: courseDeck.url }), { kind: "restart" });
  });

  it("offers no answers once the course is done", async () => {
    const trial = makeUseCasesFake({ getCourse: vi.fn(async () => makeCourse([], [CH1, `${CH1.slice(0, -1)}2`])) });
    renderTrial({ openTrial: async () => opened(trial) });
    expect(await screen.findByRole("link", { name: "The course's page" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Answer all right" })).toBeNull();
  });

  it("plays a deck's study, linked to the trial, answers all of it at once, and starts another session once one is left", async () => {
    const draft = { ...courseDraft(), course: false };
    const prompt: Prompt = {
      card: { id: "a", url: `${courseDeck.cardsDocumentUrl}#a`, front: { en: "Sweden" }, back: { en: "Stockholm" }, createdAt: "2026-10-10T10:00:00.000Z", formatVersion: 5 },
      direction: "front-to-back",
    };
    const trial = makeUseCasesFake({ getStudyQueue: vi.fn(async () => ({ due: [prompt], newPrompts: [], studiedToday: 0 })) });
    renderTrial({ draft, openTrial: async () => opened(trial) });
    expect(await screen.findByRole("link", { name: "Solid fundamentals" })).toHaveAttribute("href", "#/trial");
    expect(trial.getCourse).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Answer all wrong" }));
    await waitFor(() => expect(trial.recordReview).toHaveBeenCalledWith(courseInstance.url, courseDeck, prompt, 1, expect.any(Date)));
    const sessions = vi.mocked(trial.getStudyQueue).mock.calls.length;
    fireEvent.click(await screen.findByRole("button", { name: "End session" }));
    await waitFor(() => expect(vi.mocked(trial.getStudyQueue).mock.calls.length).toBeGreaterThan(sessions));
  });

  it("starts over in a new sandbox, and plays the draft as the pod has it when reloaded", async () => {
    const draft = courseDraft();
    const { useCases } = renderTrial({ draft, openTrial: async () => opened(courseTrial()) });
    await screen.findByRole("link", { name: "Start the course" });
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    await waitFor(() => expect(useCases.openTrial).toHaveBeenCalledTimes(2));
    expect(vi.mocked(useCases.openTrial).mock.calls[1]![0]).toBe(draft);
    await screen.findByRole("link", { name: "Start the course" });
    const changed = { ...draft, root: { ...draft.root, title: { en: "Solid, again" } } };
    vi.mocked(useCases.getReleaseDraft).mockResolvedValue(changed);
    fireEvent.click(screen.getByRole("button", { name: "Reload the draft" }));
    await waitFor(() => expect(useCases.openTrial).toHaveBeenCalledTimes(3));
    expect(vi.mocked(useCases.openTrial).mock.calls[2]![0]).toEqual(changed);
    expect(useCases.getReleaseDraft).toHaveBeenCalledWith(DRAFT_URL);
  });

  it("lists what keeps the draft from being played, and says why a trial or its course could not be read", async () => {
    const chapterless = problem(`${DRAFT_URL}#ch-apps`, { code: "chapterWithoutStep", params: {} });
    renderTrial({ openTrial: async () => ({ ok: false, problems: [chapterless] }) });
    expect(await screen.findByRole("link", { name: "Has no step in use." })).toHaveAttribute("href", "#/chapter");
  });

  it("says why a trial could not be opened", async () => {
    renderTrial({
      openTrial: async () => {
        throw new Error("no room");
      },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("no room");
  });

  it("says why its course could not be read", async () => {
    const trial = makeUseCasesFake({ getCourse: vi.fn(async () => Promise.reject(new Error("unreadable"))) });
    renderTrial({ openTrial: async () => opened(trial) });
    expect(await screen.findByRole("alert")).toHaveTextContent("unreadable");
  });
});
