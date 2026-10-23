// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { makeUseCasesFake } from "../test/useCasesFake";
import { keepStudyFiguresFresh, statisticsQuery, todayFiguresQuery } from "./studyFigures";

const INSTANCE = "https://pod.example/solid-memo/a/";
const OTHER = "https://pod.example/solid-memo/b/";

/** A client holding fresh statistics, a deck's too, card progress, of two instances, and a card's answers. */
function clientWithFigures(): QueryClient {
  const queryClient = new QueryClient();
  for (const key of [
    ["statistics", INSTANCE],
    ["statistics", INSTANCE, `${INSTANCE}deck/`],
    ["cardProgress", INSTANCE, undefined],
    ["cardProgress", OTHER, `${OTHER}deck/`],
    ["cardAnswers", `${INSTANCE}deck/`, "card-1"],
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
  it("has the statistics, the cards' progress and their answers read again after any change, not other reads", async () => {
    const queryClient = clientWithFigures();
    keepStudyFiguresFresh(queryClient);
    // Adding a card, say: nothing about it names the statistics.
    await new MutationObserver(queryClient, { mutationFn: async () => "added" }).mutate();
    expect(invalidated(queryClient, ["statistics", INSTANCE])).toBe(true);
    expect(invalidated(queryClient, ["statistics", INSTANCE, `${INSTANCE}deck/`])).toBe(true);
    expect(invalidated(queryClient, ["cardProgress", INSTANCE, undefined])).toBe(true);
    expect(invalidated(queryClient, ["cardProgress", OTHER, `${OTHER}deck/`])).toBe(true);
    expect(invalidated(queryClient, ["cardAnswers", `${INSTANCE}deck/`, "card-1"])).toBe(true);
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

describe("statisticsQuery", () => {
  it("reads the range asked for, of the instance or of a deck", async () => {
    const useCases = makeUseCasesFake();
    const deckUrl = `${INSTANCE}catalog.ttl#deck-1`;
    expect(statisticsQuery(useCases, INSTANCE, "12m").queryKey).toEqual([
      "statistics",
      INSTANCE,
      "range",
      "12m",
    ]);
    expect(statisticsQuery(useCases, INSTANCE, "all").queryKey).toEqual([
      "statistics",
      INSTANCE,
      "range",
      "all",
    ]);
    expect(statisticsQuery(useCases, INSTANCE, "30d", deckUrl).queryKey).toEqual([
      "statistics",
      INSTANCE,
      deckUrl,
      "30d",
    ]);
    await statisticsQuery(useCases, INSTANCE, "12m").queryFn();
    expect(useCases.getStatistics).toHaveBeenLastCalledWith(INSTANCE, expect.any(Date), {});
    await statisticsQuery(useCases, INSTANCE, "90d", deckUrl).queryFn();
    expect(useCases.getStatistics).toHaveBeenLastCalledWith(INSTANCE, expect.any(Date), {
      range: 90,
      deckUrl,
    });
  });
});

describe("todayFiguresQuery", () => {
  it("reads the today strip's figures under a key of its own, which a change made clears", async () => {
    const useCases = makeUseCasesFake();
    const query = todayFiguresQuery(useCases, INSTANCE);
    expect(query.queryKey).toEqual(["statistics", INSTANCE, "today"]);
    expect(query.queryKey).not.toEqual(statisticsQuery(useCases, INSTANCE, "12m").queryKey);
    await query.queryFn();
    expect(useCases.getTodayFigures).toHaveBeenLastCalledWith(INSTANCE, expect.any(Date));
    const queryClient = new QueryClient();
    queryClient.setQueryData(query.queryKey, await query.queryFn());
    keepStudyFiguresFresh(queryClient);
    await new MutationObserver(queryClient, { mutationFn: async () => undefined }).mutate();
    expect(queryClient.getQueryState(query.queryKey)?.isInvalidated).toBe(true);
  });
});
