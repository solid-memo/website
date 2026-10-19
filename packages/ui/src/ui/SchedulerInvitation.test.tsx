// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Instance } from "@solid-memo/domain/instance";
import {
  DEFAULT_PREFERENCES,
  NEW_INSTANCE_PREFERENCES,
  type StudyPreferences,
} from "@solid-memo/domain/preferences";
import type { SwitchOutcome, SwitchProgress } from "@solid-memo/domain/schedulerSwitch";
import { alertTexts, unexpectedText } from "../test/liveRegions";
import { makeUseCasesFake } from "../test/useCasesFake";
import { SchedulerInvitation, SchedulerInvitationContainer } from "./SchedulerInvitation";
import { ThemeProvider } from "./theme";

const instance: Instance = {
  url: "https://pod.example/solid-memo/main/",
  name: "Main",
};

const done: SwitchOutcome = { switched: true, decks: 2, replayed: 3, estimated: 1, failed: [] };
const failed: SwitchOutcome = {
  switched: false,
  decks: 1,
  replayed: 0,
  estimated: 0,
  failed: [
    {
      url: "https://pod.example/catalog.ttl#d2",
      title: { en: "Verbs" },
      error: new Error("offline"),
    },
  ],
};

/** In the page's main content, on a device that shows the dark theme. */
function renderContainer(useCases: UseCases) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider choice="dark" onChoose={() => undefined}>
        <main>
          <SchedulerInvitationContainer useCases={useCases} instance={instance} />
        </main>
      </ThemeProvider>
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

function withPreferences(preferences: StudyPreferences, overrides: Partial<UseCases> = {}) {
  return makeUseCasesFake({ getPreferences: vi.fn(async () => preferences), ...overrides });
}

/** Until the preferences are read and shown: the query tells it on a timer of its own. */
async function preferencesSettled(queryClient: QueryClient) {
  await waitFor(() =>
    expect(queryClient.getQueryState(["preferences", instance.url])?.status).not.toBe("pending"),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("SchedulerInvitation", () => {
  it("is a landmark named by its title, saying what FSRS-6 gives, with its two answers", () => {
    const onSwitch = vi.fn();
    const onDismiss = vi.fn();
    render(
      <SchedulerInvitation busy={false} error={null} onSwitch={onSwitch} onDismiss={onDismiss} />,
    );
    const invitation = screen.getByRole("complementary", {
      name: "Try FSRS-6, the recommended scheduler",
    });
    expect(invitation).toHaveTextContent(
      "FSRS-6 gives each answer a clearly different interval and adapts to how late you review.",
    );
    expect(invitation).toHaveTextContent("you can switch back to SM-2 at any time");
    fireEvent.click(screen.getByRole("button", { name: "Switch to FSRS-6" }));
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(onSwitch).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("keeps its buttons in reach, but does nothing, while busy", () => {
    const onSwitch = vi.fn();
    const onDismiss = vi.fn();
    render(<SchedulerInvitation busy error={null} onSwitch={onSwitch} onDismiss={onDismiss} />);
    const notNow = screen.getByRole("button", { name: "Not now" });
    expect(notNow).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(notNow);
    fireEvent.click(screen.getByRole("button", { name: "Switch to FSRS-6" }));
    expect(onSwitch).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

describe("SchedulerInvitationContainer", () => {
  it("invites a learner on SM-2", async () => {
    renderContainer(withPreferences(DEFAULT_PREFERENCES));
    expect(
      await screen.findByRole("complementary", { name: "Try FSRS-6, the recommended scheduler" }),
    ).toBeInTheDocument();
  });

  it("shows nothing on FSRS-6, once dismissed, while the preferences load or when they cannot be read", async () => {
    for (const preferences of [
      NEW_INSTANCE_PREFERENCES,
      { ...DEFAULT_PREFERENCES, schedulerInvitationDismissed: true },
    ]) {
      const { container, queryClient, unmount } = renderContainer(withPreferences(preferences));
      await preferencesSettled(queryClient);
      expect(container.querySelector("main")).toBeEmptyDOMElement();
      unmount();
    }
    const loading = renderContainer(
      makeUseCasesFake({ getPreferences: vi.fn(() => new Promise<never>(() => undefined)) }),
    );
    expect(loading.container.querySelector("main")).toBeEmptyDOMElement();
    loading.unmount();
    const unreadable = renderContainer(
      makeUseCasesFake({
        getPreferences: vi.fn(async () => {
          throw new Error("pod unreachable");
        }),
      }),
    );
    await preferencesSettled(unreadable.queryClient);
    expect(unreadable.container.querySelector("main")).toBeEmptyDOMElement();
  });

  it("remembers Not now in the preferences, and is gone at once", async () => {
    let settle: () => void = () => undefined;
    const useCases = withPreferences(DEFAULT_PREFERENCES, {
      dismissSchedulerInvitation: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            settle = resolve;
          }),
      ),
    });
    const { container } = renderContainer(useCases);
    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));
    await waitFor(() =>
      expect(useCases.dismissSchedulerInvitation).toHaveBeenCalledWith(instance.url),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Not now" })).toHaveAttribute(
        "aria-disabled",
        "true",
      ),
    );
    settle();
    await waitFor(() => expect(container.querySelector("main")).toBeEmptyDOMElement());
    expect(useCases.getPreferences).toHaveBeenCalledTimes(2);
  });

  it("says why Not now could not be saved, and stays", async () => {
    renderContainer(
      withPreferences(DEFAULT_PREFERENCES, {
        dismissSchedulerInvitation: vi.fn(async () => {
          throw new Error("pod refused");
        }),
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));
    await waitFor(() => expect(alertTexts()).toEqual([unexpectedText("pod refused")]));
    expect(screen.getByRole("button", { name: "Not now" })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("switches to FSRS-6 with its progress, then says how it went until closed, in the theme this device shows", async () => {
    const stored = { ...DEFAULT_PREFERENCES, newCardsPerDay: 9 };
    let report: (progress: SwitchProgress) => void = () => undefined;
    let finish: (outcome: SwitchOutcome) => void = () => undefined;
    const getPreferences = vi.fn(async () => stored);
    const useCases = makeUseCasesFake({
      getPreferences,
      switchScheduler: vi.fn((_url, _prefs, onProgress) => {
        report = onProgress!;
        return new Promise<SwitchOutcome>((resolve) => {
          finish = resolve;
        });
      }),
    });
    const { container, queryClient } = renderContainer(useCases);
    const reviewsKey = ["reviews", "https://pod.example/reviews/deck-1.ttl"];
    queryClient.setQueryData(reviewsKey, []);
    queryClient.setQueryData(["studyQueue", "deck-1"], {});

    fireEvent.click(await screen.findByRole("button", { name: "Switch to FSRS-6" }));
    expect(await screen.findByRole("region", { name: "Switching to FSRS-6" })).toBeInTheDocument();
    expect(useCases.switchScheduler).toHaveBeenCalledWith(
      instance.url,
      { ...stored, scheduler: "fsrs6", theme: "dark" },
      expect.any(Function),
    );
    report({ step: "decks", done: 1, total: 3, part: { done: 1, total: 2 } });
    expect(await screen.findByText("1 of 2 decks")).toBeInTheDocument();

    getPreferences.mockResolvedValue({ ...stored, scheduler: "fsrs6" });
    finish(done);
    const result = await screen.findByRole("region", { name: "Switched to FSRS-6" });
    expect(result).toHaveTextContent("FSRS-6 now schedules your reviews.");
    expect(result).toHaveTextContent("Every card stays due on the day it was due.");
    // What the switch wrote is read again, and no queue made before it is studied.
    expect(queryClient.getQueryState(reviewsKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryData(["studyQueue", "deck-1"])).toBeUndefined();

    const close = screen.getByRole("button", { name: "Done" });
    close.focus();
    fireEvent.click(close);
    // FSRS-6 is in use now: nothing more to invite to.
    await waitFor(() => expect(container.querySelector("main")).toBeEmptyDOMElement());
    // Focus goes on in the screen (its heading, where it has one), not back to the page's top.
    expect(container.querySelector("main")).toHaveFocus();
  });

  it("names the decks it could not switch, to try again, or closes back to the invitation", async () => {
    const useCases = withPreferences(DEFAULT_PREFERENCES, {
      switchScheduler: vi
        .fn()
        .mockResolvedValueOnce(failed)
        .mockResolvedValueOnce(failed)
        .mockResolvedValueOnce(done),
    });
    renderContainer(useCases);
    fireEvent.click(await screen.findByRole("button", { name: "Switch to FSRS-6" }));
    const result = await screen.findByRole("region", { name: "Switch not finished" });
    expect(result).toHaveTextContent("1 deck could not be switched now:");
    expect(result).toHaveTextContent("SM-2 still schedules your reviews.");

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(useCases.switchScheduler).toHaveBeenCalledTimes(2));
    expect(vi.mocked(useCases.switchScheduler).mock.calls[1]![1]).toEqual({
      ...DEFAULT_PREFERENCES,
      scheduler: "fsrs6",
      theme: "dark",
    });
    fireEvent.click(await screen.findByRole("button", { name: "Close" }));
    fireEvent.click(await screen.findByRole("button", { name: "Switch to FSRS-6" }));
    expect(await screen.findByRole("region", { name: "Switched to FSRS-6" })).toBeInTheDocument();
  });

  it("says why the answer tried last failed: a failed Not now after a failed switch, and back", async () => {
    renderContainer(
      withPreferences(DEFAULT_PREFERENCES, {
        switchScheduler: vi.fn(async () => {
          throw new Error("log unreadable");
        }),
        dismissSchedulerInvitation: vi.fn(async () => {
          throw new Error("pod refused");
        }),
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Switch to FSRS-6" }));
    await waitFor(() => expect(alertTexts()).toEqual([unexpectedText("log unreadable")]));
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    await waitFor(() => expect(alertTexts()).toEqual([unexpectedText("pod refused")]));
    fireEvent.click(screen.getByRole("button", { name: "Switch to FSRS-6" }));
    await waitFor(() => expect(alertTexts()).toEqual([unexpectedText("log unreadable")]));
  });

  it("says why the switch could not start, and stays", async () => {
    renderContainer(
      withPreferences(DEFAULT_PREFERENCES, {
        switchScheduler: vi.fn(async () => {
          throw new Error("log unreadable");
        }),
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Switch to FSRS-6" }));
    await waitFor(() => expect(alertTexts()).toEqual([unexpectedText("log unreadable")]));
    expect(
      screen.getByRole("complementary", { name: "Try FSRS-6, the recommended scheduler" }),
    ).toBeInTheDocument();
  });
});
