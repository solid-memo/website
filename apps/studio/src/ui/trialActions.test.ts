import { describe, expect, it, vi } from "vitest";
import type { Trial } from "@solid-memo/application/trial";
import type { Prompt } from "@solid-memo/domain/deck";
import { makeUseCasesFake } from "@solid-memo/ui/test/useCasesFake";
import { CH1, courseCards, courseDeck, courseInstance, makeCourse } from "@solid-memo/ui/test/course";
import { answerChapter, answerQueue, jumpToChapter } from "./trialActions";

const NOW = new Date("2026-10-10T10:00:00.000Z");

function makeTrial(): Trial {
  return { useCases: makeUseCasesFake(), instance: courseInstance, deck: courseDeck };
}

describe("answerChapter", () => {
  it("answers every question of the chapter right, its review's too, and completes it", async () => {
    const trial = makeTrial();
    const course = makeCourse();
    await answerChapter(trial, course, course.outline.chapters[0]!, true, NOW);
    const answered = vi.mocked(trial.useCases.answerCourseQuestion).mock.calls;
    expect(answered.map(([, , card, choice, now]) => [card.id, choice, now])).toEqual([
      ["q-1", { correct: true }, NOW],
      ["q-2", { correct: true }, NOW],
      ["q-3", { correct: true }, NOW],
      ["r-1", { correct: true }, NOW],
    ]);
    expect(answered[0]![1]).toBe(course.deck);
    expect(trial.useCases.completeChapter).toHaveBeenCalledWith(course.deck, CH1);
  });

  it("answers them wrong with a wrong option each, and completes nothing", async () => {
    const trial = makeTrial();
    const course = makeCourse();
    await answerChapter(trial, course, course.outline.chapters[1]!, false, NOW);
    expect(trial.useCases.answerCourseQuestion).toHaveBeenCalledExactlyOnceWith(
      courseInstance.url,
      course.deck,
      courseCards[4],
      { correct: false, distractorId: "q-4-d1" },
      NOW,
    );
    expect(trial.useCases.completeChapter).not.toHaveBeenCalled();
  });
});

describe("jumpToChapter", () => {
  it("restarts the course, then completes each chapter before the one jumped to", async () => {
    const trial = makeTrial();
    const course = makeCourse([], [CH1]);
    await jumpToChapter(trial, course, course.outline.chapters[1]!);
    expect(trial.useCases.setCompletedChapters).toHaveBeenCalledWith(course.deck, { kind: "restart" });
    expect(vi.mocked(trial.useCases.completeChapter).mock.calls.map(([, chapter]) => chapter)).toEqual([CH1]);
    await jumpToChapter(trial, course, course.outline.chapters[0]!);
    expect(trial.useCases.completeChapter).toHaveBeenCalledOnce();
  });
});

describe("answerQueue", () => {
  const prompt = (id: string): Prompt => ({
    card: { id, url: `${courseDeck.cardsDocumentUrl}#${id}`, front: { en: id }, back: { en: id }, createdAt: NOW.toISOString(), formatVersion: 5 },
    direction: "front-to-back",
  });

  it("answers every prompt to study now, due and new, right or wrong", async () => {
    const trial = makeTrial();
    vi.mocked(trial.useCases.getStudyQueue).mockResolvedValue({ due: [prompt("a")], newPrompts: [prompt("b")], studiedToday: 0 });
    await answerQueue(trial, true, NOW);
    await answerQueue(trial, false, NOW);
    expect(trial.useCases.getStudyQueue).toHaveBeenCalledWith(courseInstance.url, courseDeck, NOW);
    expect(vi.mocked(trial.useCases.recordReview).mock.calls.map(([, , p, quality, now]) => [p.card.id, quality, now])).toEqual([
      ["a", 5, NOW],
      ["b", 5, NOW],
      ["a", 1, NOW],
      ["b", 1, NOW],
    ]);
  });
});
