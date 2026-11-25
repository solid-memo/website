// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { DAILY_MESSAGES, DAYS_PER_MESSAGE, messageOfDay } from "./dailyMessages";

/** The days from `from` on, `count` of them, as "YYYY-MM-DD". */
function days(from: string, count: number): string[] {
  const start = Date.parse(from);
  return Array.from({ length: count }, (_, day) =>
    new Date(start + day * 86_400_000).toISOString().slice(0, 10),
  );
}

/** The longest run of days in `picked` that `has` holds for. */
function longestRun<T>(picked: (T | null)[], has: (message: T | null) => boolean): number {
  let longest = 0;
  let run = 0;
  for (const message of picked) {
    run = has(message) ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return longest;
}

// Each message's text in every language is held by the message files' test (i18n.test.tsx).
describe("the daily messages", () => {
  const ids = DAILY_MESSAGES.map(({ id }) => id);

  it("are each told apart by a kebab-case id of their own", () => {
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id))).toEqual([]);
  });

  it("each say their text under dailyMessage.message, by their id in camelCase", () => {
    const misnamed = DAILY_MESSAGES.filter(
      ({ id, text }) =>
        text !==
        `dailyMessage.message.${id.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase())}`,
    );
    expect(misnamed).toEqual([]);
  });
});

describe("messageOfDay", () => {
  const messages = ["a", "b", "c", "d", "e"];
  // Four years, a leap day among them.
  const picked = days("2026-01-01", 4 * 365 + 1).map((day) => messageOfDay(day, messages));

  it("gives one day in each block of three a message, the others none", () => {
    // 2026-01-01, day 20454 since 1970, starts a block.
    for (let block = 0; block + DAYS_PER_MESSAGE <= picked.length; block += DAYS_PER_MESSAGE) {
      const ofBlock = picked.slice(block, block + DAYS_PER_MESSAGE);
      expect(ofBlock.filter((message) => message !== null)).toHaveLength(1);
    }
    expect(longestRun(picked, (message) => message !== null)).toBeLessThanOrEqual(2);
    expect(longestRun(picked, (message) => message === null)).toBeLessThanOrEqual(4);
  });

  // Blocks since 1970 start a round every five; 2026-01-01's, block 6818, is
  // the fourth of its round, so the first whole round starts two messages in.
  const rounds = (shown: (string | null)[]) => {
    const all: (string | null)[][] = [];
    for (let start = 2; start + messages.length <= shown.length; start += messages.length) {
      all.push(shown.slice(start, start + messages.length));
    }
    return all;
  };

  it("shows every message once before any comes back", () => {
    const all = rounds(picked.filter((message) => message !== null));
    expect(all.length).toBeGreaterThan(90);
    for (const round of all) expect(new Set(round).size).toBe(messages.length);
  });

  it("goes through the messages in a different order each round", () => {
    const orders = rounds(picked.filter((message) => message !== null)).map((round) =>
      round.join(""),
    );
    expect(new Set(orders).size).toBeGreaterThan(10);
  });

  it("gives a day the same message each time it is asked", () => {
    expect(days("2026-11-01", 30).map((day) => messageOfDay(day, messages))).toEqual(
      picked.slice(304, 334),
    );
  });

  it("gives no day a message when there are none", () => {
    expect(days("2026-01-01", 30).map((day) => messageOfDay(day, []))).toEqual(
      Array(30).fill(null),
    );
  });
});
