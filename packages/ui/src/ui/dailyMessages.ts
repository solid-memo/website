// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { MessageKey } from "./i18n";

/**
 * Where a daily message's link leads: the About page's word on donating,
 * the repository's Discussions, or the repository itself.
 */
export type DailyMessageLink = "donate" | "discussions" | "repository";

/**
 * A short note the deck list may show for a day (DailyMessageContainer),
 * in every app language: a word on the project, or a feature the user may
 * not know of.
 */
export interface DailyMessage {
  /** Kebab-case, each once. */
  id: string;
  /** dailyMessage.message.<the id in camelCase>. */
  text: MessageKey;
  /** Where its link leads; none for a note without one. */
  link?: DailyMessageLink;
}

/** Every daily message. One is picked for a day by the day alone (messageOfDay). */
export const DAILY_MESSAGES: readonly DailyMessage[] = [
  { id: "donate", text: "dailyMessage.message.donate", link: "donate" },
  { id: "discussions", text: "dailyMessage.message.discussions", link: "discussions" },
  { id: "star", text: "dailyMessage.message.star", link: "repository" },
  { id: "no-servers", text: "dailyMessage.message.noServers" },
  { id: "undo", text: "dailyMessage.message.undo" },
  { id: "pause", text: "dailyMessage.message.pause" },
  { id: "report-mistake", text: "dailyMessage.message.reportMistake" },
  { id: "courses", text: "dailyMessage.message.courses" },
  { id: "statistics", text: "dailyMessage.message.statistics" },
];

/** The days are dealt in blocks of this many, one day of each with a message. */
export const DAYS_PER_MESSAGE = 3;

/** `value` mixed over 32 bits (MurmurHash3's finalizer), so that numbers in a row land far apart. */
function mix(value: number): number {
  let hash = value >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return (hash ^ (hash >>> 16)) >>> 0;
}

/** 0 to `count` − 1, each once, in an order `seed` alone picks (Fisher–Yates). */
function shuffled(count: number, seed: number): number[] {
  const order = Array.from({ length: count }, (_, index) => index);
  for (let last = count - 1; last > 0; last--) {
    const swap = mix(seed * count + last) % (last + 1);
    [order[last], order[swap]] = [order[swap]!, order[last]!];
  }
  return order;
}

/**
 * The message of `day` ("YYYY-MM-DD"), or none. The days since 1970 are
 * dealt in blocks of DAYS_PER_MESSAGE, and one day of each block, picked
 * by the block, has a message: never more than two days with one in a
 * row, never more than four without. The blocks go through `messages`
 * in rounds, each round in an order of its own, so a message comes back
 * only once every other has been shown. Picked by the day alone, it is
 * the same all day, on every device, and needs nothing kept.
 */
export function messageOfDay<T>(day: string, messages: readonly T[]): T | null {
  const days = Math.floor(Date.parse(day) / 86_400_000);
  const block = Math.floor(days / DAYS_PER_MESSAGE);
  if (messages.length === 0 || days - block * DAYS_PER_MESSAGE !== mix(block) % DAYS_PER_MESSAGE) {
    return null;
  }
  const round = Math.floor(block / messages.length);
  return messages[shuffled(messages.length, round)[block - round * messages.length]!]!;
}
