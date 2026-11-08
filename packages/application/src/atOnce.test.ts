// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { inTurns, mapAtOnce, READS_AT_ONCE } from "./atOnce";

/** `each` that counts how many run at once, each waiting a turn of the event loop. */
function counted<T>() {
  let running = 0;
  let most = 0;
  const each = async (item: T) => {
    most = Math.max(most, ++running);
    await new Promise((resolve) => setTimeout(resolve, 0));
    running--;
    return item;
  };
  return { each, most: () => most };
}

describe("mapAtOnce", () => {
  it("maps every item, in order, READS_AT_ONCE of them at most at once", async () => {
    const items = Array.from({ length: 40 }, (_, at) => at);
    const { each, most } = counted<number>();
    await expect(mapAtOnce(items, each)).resolves.toEqual(items);
    expect(most()).toBe(READS_AT_ONCE);
  });

  it("runs as many at once as it is told, and none for no items", async () => {
    const { each, most } = counted<string>();
    await expect(mapAtOnce(["a", "b", "c"], each, 2)).resolves.toEqual(["a", "b", "c"]);
    expect(most()).toBe(2);
    await expect(mapAtOnce([], each)).resolves.toEqual([]);
  });

  it("fails with the first failure, starting no item after it", async () => {
    const started: number[] = [];
    const failure = new Error("unreadable");
    await expect(
      mapAtOnce(
        Array.from({ length: 10 }, (_, at) => at),
        async (item) => {
          started.push(item);
          if (item === 1) throw failure;
          await new Promise((resolve) => setTimeout(resolve, 0));
          return item;
        },
        2,
      ),
    ).rejects.toBe(failure);
    expect(started).toEqual([0, 1]);
  });
});

describe("inTurns", () => {
  it("runs all the work asked of it, READS_AT_ONCE at most at once, in the order asked", async () => {
    const turn = inTurns();
    const { each, most } = counted<number>();
    const started: number[] = [];
    const items = Array.from({ length: 40 }, (_, at) => at);
    const done = await Promise.all(
      items.map((item) =>
        turn(() => {
          started.push(item);
          return each(item);
        }),
      ),
    );
    expect(done).toEqual(items);
    expect(started).toEqual(items);
    expect(most()).toBe(READS_AT_ONCE);
  });

  it("ends a turn whose work fails, and lets the next start", async () => {
    const turn = inTurns(1);
    const failure = new Error("unreadable");
    const first = turn(async () => {
      throw failure;
    });
    const second = turn(async () => "read");
    await expect(first).rejects.toBe(failure);
    await expect(second).resolves.toBe("read");
    // Every turn is free again.
    const { each, most } = counted<string>();
    await expect(Promise.all(["a", "b"].map((item) => turn(() => each(item))))).resolves.toEqual([
      "a",
      "b",
    ]);
    expect(most()).toBe(1);
  });
});
