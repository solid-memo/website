// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/preact";
import type { ComponentChildren } from "preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ConnectedScreenChoice } from "@solid-memo/application/preferences";
import type { SolidAccount } from "@solid-memo/domain/account";
import { queryKeys } from "../queryKeys";
import { CONNECTED_SCREEN_WAIT_MS, useConnectedScreen } from "./useConnectedScreen";

const session = { webId: "https://alice.example/profile/card#me" };
const instance = { url: "https://alice.example/solid-memo/main/", name: "Main" };
const found: SolidAccount = {
  webId: session.webId,
  podUrl: "https://alice.example/",
};
const accountOf = (
  data: SolidAccount | undefined,
  more: { error?: unknown; isFetching?: boolean } = {},
) => ({
  data,
  error: null,
  isFetching: false,
  ...more,
});

/** A choice that is answered when the test says. */
function held() {
  let answer!: (choice: ConnectedScreenChoice) => void;
  let fail!: (error: Error) => void;
  const promise = new Promise<ConnectedScreenChoice>((resolve, reject) => {
    answer = resolve;
    fail = reject;
  });
  return { promise, answer, fail };
}

function setup({
  choice = async (): Promise<ConnectedScreenChoice> => ({ instances: [instance], skipped: false }),
  skip = async () => undefined,
  account = accountOf(found),
}: {
  choice?: () => Promise<ConnectedScreenChoice>;
  skip?: () => Promise<void>;
  account?: ReturnType<typeof accountOf>;
} = {}) {
  const queryClient = new QueryClient();
  const useCases = { connectedScreenChoice: vi.fn(choice), skipConnectedScreen: vi.fn(skip) };
  const onEnter = vi.fn();
  const wrapper = ({ children }: { children?: ComponentChildren }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    (props: { account: ReturnType<typeof accountOf>; connecting: boolean }) =>
      useConnectedScreen({ useCases, session, onEnter, ...props }),
    { wrapper, initialProps: { account, connecting: true } },
  );
  return { ...hook, queryClient, useCases, onEnter };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("useConnectedScreen", () => {
  it("waits for the choice once storage is found, then shows the screen with the box", async () => {
    const choice = held();
    const { result } = setup({ choice: () => choice.promise });
    expect(result.current.waiting).toBe(true);
    expect(result.current.offerSkip).toBe(false);
    await act(async () => choice.answer({ instances: [instance], skipped: false }));
    await waitFor(() => expect(result.current.waiting).toBe(false));
    expect(result.current.offerSkip).toBe(true);
  });

  it("does not wait while the account is read, nor for a missing Pod or an error", () => {
    const choice = held();
    const { result, rerender } = setup({
      choice: () => choice.promise,
      account: accountOf(found, { isFetching: true }),
    });
    expect(result.current.waiting).toBe(false);
    rerender({ account: accountOf({ webId: session.webId }), connecting: true });
    expect(result.current.waiting).toBe(false);
    rerender({ account: accountOf(undefined, { error: new Error("offline") }), connecting: true });
    expect(result.current.waiting).toBe(false);
  });

  it("offers no box to a learner with no instances, or when the choice cannot be read", async () => {
    const none = setup({ choice: async () => ({ instances: [], skipped: false }) });
    await waitFor(() => expect(none.result.current.waiting).toBe(false));
    expect(none.result.current.offerSkip).toBe(false);
    const failing = setup({
      choice: async () => {
        throw new Error("offline");
      },
    });
    await waitFor(() => expect(failing.result.current.waiting).toBe(false));
    expect(failing.result.current.offerSkip).toBe(false);
    expect(failing.onEnter).not.toHaveBeenCalled();
  });

  it("enters the app when every instance says to skip the screen, its instances listed already", async () => {
    const { result, onEnter, queryClient } = setup({
      choice: async () => ({ instances: [instance], skipped: true }),
    });
    expect(result.current.waiting).toBe(true);
    await waitFor(() => expect(onEnter).toHaveBeenCalledOnce());
    expect(queryClient.getQueryData(queryKeys.instances(session.webId))).toEqual([instance]);
  });

  it("shows the screen after the wait, and keeps it though the choice then says to skip it", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const choice = held();
    const { result, onEnter } = setup({ choice: () => choice.promise });
    expect(result.current.waiting).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CONNECTED_SCREEN_WAIT_MS);
    });
    expect(result.current.waiting).toBe(false);
    await act(async () => {
      choice.answer({ instances: [instance], skipped: true });
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(result.current.waiting).toBe(false);
    expect(onEnter).not.toHaveBeenCalled();
  });

  it("reads the choice again on Try again, and waits for it again", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const first = held();
    const second = held();
    const answers = [first, second];
    const { result, onEnter } = setup({ choice: () => answers.shift()!.promise });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CONNECTED_SCREEN_WAIT_MS);
    });
    expect(result.current.waiting).toBe(false);
    await act(async () => {
      first.fail(new Error("offline"));
      await vi.advanceTimersByTimeAsync(10);
    });
    act(() => result.current.retry());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(result.current.waiting).toBe(true);
    await act(async () => {
      second.answer({ instances: [instance], skipped: true });
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(onEnter).toHaveBeenCalledOnce();
  });

  it("does not read the choice again when the window regains focus", async () => {
    const { result, useCases } = setup();
    await waitFor(() => expect(result.current.offerSkip).toBe(true));
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(useCases.connectedScreenChoice).toHaveBeenCalledOnce();
  });

  it("enters on Continue, and saves the choice to skip the screen afterwards in every instance", async () => {
    const { result, useCases, onEnter, queryClient } = setup();
    await waitFor(() => expect(result.current.offerSkip).toBe(true));
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    act(() => result.current.enter(true));
    expect(onEnter).toHaveBeenCalledOnce();
    expect(queryClient.getQueryData(queryKeys.instances(session.webId))).toEqual([instance]);
    expect(useCases.skipConnectedScreen).toHaveBeenCalledWith([instance]);
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.allPreferences() }),
    );
  });

  it("enters though the choice cannot be saved", async () => {
    const { result, onEnter, queryClient } = setup({
      skip: async () => {
        throw new Error("403");
      },
    });
    await waitFor(() => expect(result.current.offerSkip).toBe(true));
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    act(() => result.current.enter(true));
    expect(onEnter).toHaveBeenCalledOnce();
    await waitFor(() => expect(invalidate).toHaveBeenCalled());
  });

  it("saves nothing on Continue without the box checked, or on Continue anyway before the choice is read", () => {
    const choice = held();
    const { result, useCases, onEnter, queryClient } = setup({
      choice: () => choice.promise,
      account: accountOf({ webId: session.webId }),
    });
    act(() => result.current.enter(false));
    expect(onEnter).toHaveBeenCalledOnce();
    expect(useCases.skipConnectedScreen).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(queryKeys.instances(session.webId))).toBeUndefined();
  });

  it("saves in no instance when the choice was never read", () => {
    const choice = held();
    const { result, useCases } = setup({
      choice: () => choice.promise,
      account: accountOf({ webId: session.webId }),
    });
    act(() => result.current.enter(true));
    expect(useCases.skipConnectedScreen).toHaveBeenCalledWith([]);
  });

  it("reads no choice when not logging in", () => {
    const queryClient = new QueryClient();
    const useCases = { connectedScreenChoice: vi.fn(), skipConnectedScreen: vi.fn() };
    const { result } = renderHook(
      () =>
        useConnectedScreen({
          useCases,
          session: null,
          connecting: false,
          account: accountOf(undefined),
          onEnter: vi.fn(),
        }),
      {
        wrapper: ({ children }: { children?: ComponentChildren }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      },
    );
    expect(result.current.waiting).toBe(false);
    expect(useCases.connectedScreenChoice).not.toHaveBeenCalled();
  });
});
