// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { keepStudyFiguresFresh } from "./studyFigures";

const INSTANCE = "https://pod.example/solid-memo/a/";
const OTHER = "https://pod.example/solid-memo/b/";

/** A client holding fresh statistics, a deck's too, and card progress, of two instances. */
function clientWithFigures(): QueryClient {
  const queryClient = new QueryClient();
  for (const key of [
    ["statistics", INSTANCE],
    ["statistics", INSTANCE, `${INSTANCE}deck/`],
    ["cardProgress", INSTANCE, undefined],
    ["cardProgress", OTHER, `${OTHER}deck/`],
    ["decks", INSTANCE],
  ]) {
    queryClient.setQueryData(key, {});
  }
  return queryClient;
}

function invalidated(queryClient: QueryClient, key: readonly unknown[]): boolean | undefined {
  return queryClient.getQueryState(key)?.isInvalidated;
}

describe("keepStudyFiguresFresh", () => {
  it("has the statistics and the cards' progress read again after any change, not other reads", async () => {
    const queryClient = clientWithFigures();
    keepStudyFiguresFresh(queryClient);
    // Adding a card, say: nothing about it names the statistics.
    await new MutationObserver(queryClient, { mutationFn: async () => "added" }).mutate();
    expect(invalidated(queryClient, ["statistics", INSTANCE])).toBe(true);
    expect(invalidated(queryClient, ["statistics", INSTANCE, `${INSTANCE}deck/`])).toBe(true);
    expect(invalidated(queryClient, ["cardProgress", INSTANCE, undefined])).toBe(true);
    expect(invalidated(queryClient, ["cardProgress", OTHER, `${OTHER}deck/`])).toBe(true);
    expect(invalidated(queryClient, ["decks", INSTANCE])).toBe(false);
  });

  it("has them read again after a change that failed, which may have been partly written", async () => {
    const queryClient = clientWithFigures();
    keepStudyFiguresFresh(queryClient);
    const failing = new MutationObserver(queryClient, {
      mutationFn: async () => Promise.reject(new Error("offline")),
    });
    await expect(failing.mutate()).rejects.toThrow("offline");
    expect(invalidated(queryClient, ["statistics", INSTANCE])).toBe(true);
    expect(invalidated(queryClient, ["cardProgress", INSTANCE, undefined])).toBe(true);
  });

  it("leaves them alone while a change is on its way, and once unsubscribed", async () => {
    const queryClient = clientWithFigures();
    const stop = keepStudyFiguresFresh(queryClient);
    let finish: () => void = () => undefined;
    const pending = new MutationObserver(queryClient, {
      mutationFn: () => new Promise<void>((resolve) => (finish = resolve)),
    }).mutate();
    await Promise.resolve();
    expect(invalidated(queryClient, ["statistics", INSTANCE])).toBe(false);
    stop();
    finish();
    await pending;
    expect(invalidated(queryClient, ["statistics", INSTANCE])).toBe(false);
  });
});
