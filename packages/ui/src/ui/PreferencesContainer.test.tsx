// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PreferencesContainer } from "./PreferencesContainer";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Instance } from "@solid-memo/domain/instance";
import { DEFAULT_PREFERENCES, type StudyPreferences } from "@solid-memo/domain/preferences";
import type { SwitchOutcome, SwitchProgress } from "@solid-memo/domain/schedulerSwitch";
import { makeUseCasesFake } from "../test/useCasesFake";

const instance: Instance = {
  url: "https://pod.example/solid-memo/a/",
  name: "Japanese study",
};

function renderContainer(useCases: UseCases) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onBack = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <PreferencesContainer useCases={useCases} instance={instance} onBack={onBack} />
    </QueryClientProvider>,
  );
  return { onBack, queryClient };
}

describe("PreferencesContainer", () => {
  it("shows a loading state, then the form", async () => {
    renderContainer(
      makeUseCasesFake({
        getPreferences: vi.fn(() => new Promise<StudyPreferences>(() => {})),
      }),
    );
    expect(screen.getByText("Loading preferences…")).toBeInTheDocument();
  });

  it("shows an error when loading fails", async () => {
    renderContainer(
      makeUseCasesFake({
        getPreferences: vi.fn(async () => {
          throw new Error("prefs unreachable");
        }),
      }),
    );
    expect(await screen.findByText("prefs unreachable")).toBeInTheDocument();
  });

  it("saves and returns to the deck list", async () => {
    const useCases = makeUseCasesFake();
    const { onBack, queryClient } = renderContainer(useCases);
    const queueKey = ["studyQueue", "https://pod.example/catalog.ttl#deck-1"];
    queryClient.setQueryData(queueKey, { due: [], newCards: [], studiedToday: 0 });

    fireEvent.input(await screen.findByLabelText("New cards per day"), {
      target: { value: "7" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Save" }).closest("form")!);

    await waitFor(() => {
      expect(onBack).toHaveBeenCalledOnce();
    });
    expect(queryClient.getQueryData(queueKey)).toBeUndefined();
    expect(useCases.savePreferences).toHaveBeenCalledWith(instance.url, {
      newCardsPerDay: 7,
      maxReviewsPerDay: 200,
      dayBoundaryHour: 4,
      answerScale: "sm2",
      developerMode: false,
      invalidDataPolicy: "block-subject" as const,
      theme: "system",
      scheduler: "sm2",
      desiredRetention: 0.9,
      schedulerInvitationDismissed: false,
    });
  });

  it("shows a save error", async () => {
    renderContainer(
      makeUseCasesFake({
        savePreferences: vi.fn(async () => {
          throw new Error("write refused");
        }),
      }),
    );

    fireEvent.submit((await screen.findByRole("button", { name: "Save" })).closest("form")!);
    expect(await screen.findByText("write refused")).toBeInTheDocument();
  });

  describe("a change of scheduler", () => {
    const fsrsPrefs = { ...DEFAULT_PREFERENCES, scheduler: "fsrs6" as const };
    const done: SwitchOutcome = {
      switched: true,
      decks: 2,
      replayed: 3,
      estimated: 1,
      failed: [],
    };

    it("switches to FSRS-6 with its progress, then says how it went until closed", async () => {
      let report: (progress: SwitchProgress) => void = () => undefined;
      let finish: (outcome: SwitchOutcome) => void = () => undefined;
      const useCases = makeUseCasesFake({
        switchScheduler: vi.fn((_url, _prefs, onProgress) => {
          report = onProgress!;
          return new Promise<SwitchOutcome>((resolve) => {
            finish = resolve;
          });
        }),
      });
      const { onBack, queryClient } = renderContainer(useCases);
      const reviewsKey = ["reviews", "https://pod.example/reviews/deck-1.ttl"];
      queryClient.setQueryData(reviewsKey, []);

      fireEvent.click(await screen.findByLabelText(/^FSRS-6/));
      fireEvent.submit(screen.getByRole("button", { name: "Save" }).closest("form")!);

      expect(
        await screen.findByRole("region", { name: "Switching to FSRS-6" }),
      ).toBeInTheDocument();
      expect(useCases.switchScheduler).toHaveBeenCalledWith(
        instance.url,
        fsrsPrefs,
        expect.any(Function),
      );
      expect(useCases.savePreferences).not.toHaveBeenCalled();
      report({ step: "decks", done: 1, total: 3, part: { done: 1, total: 2 } });
      expect(await screen.findByText("1 of 2 decks")).toBeInTheDocument();

      finish(done);
      const result = await screen.findByRole("region", { name: "Switched to FSRS-6" });
      expect(result).toHaveTextContent("FSRS-6 now schedules your reviews.");
      expect(result).toHaveTextContent("3 cards were worked out from all your answers to them.");
      expect(result).toHaveTextContent(
        "1 card, whose answers are not all in your history, was estimated from SM-2.",
      );
      expect(result).toHaveTextContent("Every card stays due on the day it was due.");
      // What the switch wrote is read again.
      expect(queryClient.getQueryState(reviewsKey)?.isInvalidated).toBe(true);
      expect(onBack).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: "Done" }));
      expect(onBack).toHaveBeenCalledOnce();
    });

    it("names the decks a switch to FSRS-6 could not write, to try again or close", async () => {
      const failed: SwitchOutcome = {
        switched: false,
        decks: 1,
        replayed: 0,
        estimated: 4,
        failed: [
          {
            url: "https://pod.example/catalog.ttl#deck-2",
            title: { en: "Verbs" },
            error: new Error("offline"),
          },
        ],
      };
      const useCases = makeUseCasesFake({
        switchScheduler: vi.fn().mockResolvedValueOnce(failed).mockResolvedValueOnce(done),
      });
      const { onBack } = renderContainer(useCases);
      fireEvent.click(await screen.findByLabelText(/^FSRS-6/));
      fireEvent.submit(screen.getByRole("button", { name: "Save" }).closest("form")!);

      const result = await screen.findByRole("region", { name: "Switch not finished" });
      expect(result).toHaveTextContent("1 deck could not be switched now:");
      expect(result).toHaveTextContent(/Verbs: Something went wrong\..*offline/);
      expect(result).toHaveTextContent("SM-2 still schedules your reviews.");
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(await screen.findByRole("region", { name: "Switched to FSRS-6" })).toBeInTheDocument();
      expect(vi.mocked(useCases.switchScheduler).mock.calls[1]![1]).toEqual(fsrsPrefs);

      vi.mocked(useCases.switchScheduler).mockResolvedValueOnce(failed);
      fireEvent.click(screen.getByRole("button", { name: "Done" }));
      expect(onBack).toHaveBeenCalledOnce();
    });

    it("closes a switch not finished back to the form, with the choices saved", async () => {
      const useCases = makeUseCasesFake({
        switchScheduler: vi.fn(async () => ({
          switched: false,
          decks: 0,
          replayed: 0,
          estimated: 0,
          failed: [{ url: "d", title: { en: "Verbs" }, error: new Error("offline") }],
        })),
      });
      const { onBack } = renderContainer(useCases);
      fireEvent.click(await screen.findByLabelText(/^FSRS-6/));
      fireEvent.input(screen.getByLabelText("Desired retention (%)"), {
        target: { value: "85" },
      });
      fireEvent.input(screen.getByLabelText("New cards per day"), { target: { value: "7" } });
      fireEvent.submit(screen.getByRole("button", { name: "Save" }).closest("form")!);
      fireEvent.click(await screen.findByRole("button", { name: "Close" }));
      expect(await screen.findByRole("button", { name: "Save" })).toBeInTheDocument();
      expect(screen.getByLabelText(/^FSRS-6/)).toBeChecked();
      expect(screen.getByLabelText("Desired retention (%)")).toHaveValue(85);
      expect(screen.getByLabelText("New cards per day")).toHaveValue(7);
      expect(onBack).not.toHaveBeenCalled();
    });

    it("switches back to SM-2 at once, showing no progress", async () => {
      const useCases = makeUseCasesFake({
        getPreferences: vi.fn(async () => fsrsPrefs),
      });
      const { onBack } = renderContainer(useCases);
      fireEvent.click(await screen.findByLabelText(/^SM-2/));
      fireEvent.submit(screen.getByRole("button", { name: "Save" }).closest("form")!);
      await waitFor(() => {
        expect(onBack).toHaveBeenCalledOnce();
      });
      expect(useCases.switchScheduler).toHaveBeenCalledWith(instance.url, DEFAULT_PREFERENCES);
      expect(screen.queryByRole("region", { name: "Switching to FSRS-6" })).toBeNull();
    });

    it("shows the form again, with the choices saved and the error, when a switch to FSRS-6 fails", async () => {
      const useCases = makeUseCasesFake({
        switchScheduler: vi.fn(async () => {
          throw new Error("log unreadable");
        }),
      });
      renderContainer(useCases);
      fireEvent.click(await screen.findByLabelText(/^FSRS-6/));
      fireEvent.input(screen.getByLabelText("Desired retention (%)"), {
        target: { value: "85" },
      });
      fireEvent.input(screen.getByLabelText("New cards per day"), { target: { value: "7" } });
      fireEvent.submit(screen.getByRole("button", { name: "Save" }).closest("form")!);
      expect(await screen.findByText("log unreadable")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
      expect(screen.getByLabelText(/^FSRS-6/)).toBeChecked();
      expect(screen.getByLabelText("Desired retention (%)")).toHaveValue(85);
      expect(screen.getByLabelText("New cards per day")).toHaveValue(7);
      expect(useCases.switchScheduler).toHaveBeenCalledWith(
        instance.url,
        { ...fsrsPrefs, newCardsPerDay: 7, desiredRetention: 0.85 },
        expect.any(Function),
      );
    });
  });
});
