// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { AppError } from "@solid-memo/domain/appError";
import type { Deck } from "@solid-memo/domain/deck";
import { GUEST_INSTANCE_URL } from "@solid-memo/domain/guest";
import {
  atVersion,
  changedOrCreatedElsewhere,
  cutOffOf,
  finishCutOffImport,
  pauseBefore,
  pauseMs,
  writeInOrder,
} from "./writes";

const deckAt = (instance: string) => ({ url: `${instance}catalog.ttl#deck-1` }) as Deck;
const POD_DECK = deckAt("https://pod.example/memo/");
const GUEST_DECK = deckAt(GUEST_INSTANCE_URL);
const DOCUMENTS = ["https://pod.example/memo/a.ttl", "https://pod.example/memo/b.ttl"];
const lost = new Error("lost");

function repository(entry: () => Promise<Deck | null>, deleted = async () => undefined) {
  return { readDeck: vi.fn(entry), deleteDocument: vi.fn(deleted) };
}

describe("changedOrCreatedElsewhere", () => {
  it("is a 412 either way: the document changed since it was read, or was made since it was read as absent", () => {
    expect(changedOrCreatedElsewhere(new AppError("changedElsewhere"))).toBe(true);
    expect(changedOrCreatedElsewhere(new AppError("createdElsewhere"))).toBe(true);
    expect(changedOrCreatedElsewhere(new AppError("writeRefused"))).toBe(false);
    expect(changedOrCreatedElsewhere(new Error("changedElsewhere"))).toBe(false);
  });
});

describe("atVersion", () => {
  it("makes a write only at the version read, and any when the pod gave none", () => {
    expect(atVersion('"v1"')).toEqual({ version: '"v1"' });
    expect(atVersion(null)).toEqual({});
  });
});

describe("writeInOrder", () => {
  const changed = () => new AppError("changedElsewhere", { url: "https://pod.example/a.ttl" });
  const created = () => new AppError("createdElsewhere", { url: "https://pod.example/a.ttl" });

  /** A write set whose writes log their names as they are sent, `fail` failing the named one's first `times` tries. */
  function writes(fail: Record<string, (() => unknown)[]> = {}) {
    const sent: string[] = [];
    const write = (name: string) => async () => {
      const failure = fail[name]?.shift();
      if (failure !== undefined) throw failure();
      sent.push(name);
    };
    const plan = vi.fn(async (attempt: number) => ({
      result: `plan ${attempt}`,
      writes: [write("cards"), undefined, write("reviews")],
    }));
    return { sent, plan };
  }
  const pause = () => vi.fn(async (_attempt: number) => undefined);

  it("sends each write in order, none where there is none, and says how many went", async () => {
    const { sent, plan } = writes();
    const reached = vi.fn();
    await expect(writeInOrder(plan, { pause: pause(), reached })).resolves.toEqual({
      result: "plan 1",
      sent: 2,
    });
    expect(sent).toEqual(["cards", "reviews"]);
    expect(reached.mock.calls).toEqual([
      [0, "plan 1"],
      [1, "plan 1"],
      [2, "plan 1"],
    ]);
  });

  it("plans again on a 412 while nothing was sent, after a longer pause each time, three times in all", async () => {
    const waits = pause();
    const { sent, plan } = writes({ cards: [changed, created] });
    await expect(writeInOrder(plan, { pause: waits })).resolves.toEqual({
      result: "plan 3",
      sent: 2,
    });
    expect(sent).toEqual(["cards", "reviews"]);
    expect(waits.mock.calls).toEqual([[2], [3]]);

    const busy = writes({ cards: [changed, changed, changed] });
    const failure = writeInOrder(busy.plan, { pause: pause() });
    await expect(failure).rejects.toMatchObject({ code: "changedElsewhere" });
    expect(busy.plan).toHaveBeenCalledTimes(3);
    expect(cutOffOf(await failure.catch((error: unknown) => error))).toEqual({
      sent: 0,
      failedAt: 0,
    });
  });

  it("plans again on a 412 its plan meets, as when it is refused for a write made from an older read", async () => {
    const plan = vi
      .fn<() => Promise<{ result: string; writes: [] }>>()
      .mockRejectedValueOnce(changed())
      .mockResolvedValueOnce({ result: "planned", writes: [] });
    await expect(writeInOrder(plan, { pause: pause() })).resolves.toEqual({
      result: "planned",
      sent: 0,
    });
  });

  it("passes on any other failure at once, saying how far it got", async () => {
    const { sent, plan } = writes({ reviews: [() => new Error("offline")] });
    const failure = await writeInOrder(plan, { pause: pause() }).catch((error: unknown) => error);
    expect(failure).toEqual(new Error("offline"));
    expect(plan).toHaveBeenCalledOnce();
    expect(sent).toEqual(["cards"]);
    expect(cutOffOf(failure)).toEqual({ sent: 1, failedAt: 2 });
  });

  it("plans again once a write was sent only when asked to", async () => {
    const once = writes({ reviews: [changed] });
    await expect(writeInOrder(once.plan, { pause: pause() })).rejects.toMatchObject({
      code: "changedElsewhere",
    });
    expect(once.plan).toHaveBeenCalledOnce();

    const again = writes({ reviews: [changed] });
    await expect(
      writeInOrder(again.plan, { pause: pause(), replanAfterSent: true }),
    ).resolves.toEqual({ result: "plan 2", sent: 2 });
    expect(again.sent).toEqual(["cards", "cards", "reviews"]);
  });

  it("plans again on the failures and as often as the policy says", async () => {
    const taken = writes({ cards: [created, created] });
    const placeTaken = (error: unknown) =>
      error instanceof AppError && error.code === "createdElsewhere";
    await expect(
      writeInOrder(taken.plan, { pause: pause(), replanOn: placeTaken, attempts: 2 }),
    ).rejects.toMatchObject({ code: "createdElsewhere" });
    expect(taken.plan).toHaveBeenCalledTimes(2);

    const changedOnce = writes({ cards: [changed] });
    await expect(
      writeInOrder(changedOnce.plan, { pause: pause(), replanOn: placeTaken }),
    ).rejects.toMatchObject({ code: "changedElsewhere" });
    expect(changedOnce.plan).toHaveBeenCalledOnce();

    const once = writes({ cards: [changed] });
    await expect(writeInOrder(once.plan, { pause: pause(), attempts: 1 })).rejects.toMatchObject({
      code: "changedElsewhere",
    });
    expect(once.plan).toHaveBeenCalledOnce();
  });

  it("says a failure of its plan sent nothing, and knows nothing of a failure of another's", async () => {
    const failure = await writeInOrder(async () => {
      throw new Error("offline");
    }).catch((error: unknown) => error);
    expect(cutOffOf(failure)).toEqual({ sent: 0, failedAt: null });
    expect(cutOffOf(new Error("elsewhere"))).toEqual({ sent: 0, failedAt: null });
    await expect(
      writeInOrder(async () => ({
        result: null,
        writes: [
          async () => {
            throw "offline";
          },
        ],
      })),
    ).rejects.toBe("offline");
    expect(cutOffOf("offline")).toEqual({ sent: 0, failedAt: null });
  });
});

describe("pauseMs", () => {
  it("is a random time up to 25 ms before the second try, twice as long at most for each after", () => {
    expect([2, 3, 4].map((attempt) => pauseMs(attempt, () => 0))).toEqual([0, 0, 0]);
    expect([2, 3, 4].map((attempt) => pauseMs(attempt, () => 0.5))).toEqual([12.5, 25, 50]);
    expect([2, 3, 4].map((attempt) => pauseMs(attempt, () => 0.999))).toEqual([
      24.975, 49.95, 99.9,
    ]);
  });
});

describe("pauseBefore", () => {
  it("waits that time by the clock", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      let done = false;
      const paused = pauseBefore(3).then(() => (done = true));
      await vi.advanceTimersByTimeAsync(24);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await paused;
      expect(done).toBe(true);
    } finally {
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
  });
});

describe("finishCutOffImport", () => {
  it("is the deck when its entry was written after all, and deletes nothing", async () => {
    const found = repository(async () => POD_DECK);
    await expect(finishCutOffImport(found, POD_DECK, DOCUMENTS, lost)).resolves.toBe(POD_DECK);
    expect(found.deleteDocument).not.toHaveBeenCalled();
  });

  it("deletes the documents and lets the failure stand when the entry is not there", async () => {
    const absent = repository(async () => null);
    await expect(finishCutOffImport(absent, POD_DECK, DOCUMENTS, lost)).rejects.toBe(lost);
    expect(absent.deleteDocument).toHaveBeenCalledTimes(2);
  });

  it("does not ask after the entry of a write that was refused", async () => {
    const absent = repository(async () => null);
    const refused = new AppError("dataNotConforming");
    await expect(finishCutOffImport(absent, POD_DECK, DOCUMENTS, refused)).rejects.toBe(refused);
    expect(absent.readDeck).not.toHaveBeenCalled();
  });

  it("names every document it could not delete", async () => {
    const stuck = repository(
      async () => null,
      async () => {
        throw new Error("offline");
      },
    );
    await expect(finishCutOffImport(stuck, POD_DECK, DOCUMENTS, lost)).rejects.toMatchObject({
      code: "importDocumentLeft",
      vars: { url: DOCUMENTS.join(", ") },
    });
  });

  it("keeps the documents, and says the outcome is unknown, when the catalog can't be read", async () => {
    const unread = repository(async () => {
      throw new Error("offline");
    });
    await expect(finishCutOffImport(unread, POD_DECK, DOCUMENTS, lost)).rejects.toMatchObject({
      code: "importOutcomeUnknown",
      vars: { url: DOCUMENTS.join(", ") },
    });
    expect(unread.deleteDocument).not.toHaveBeenCalled();
  });

  it("lets the failure stand when the catalog can't be read and no document was written", async () => {
    const unread = repository(async () => {
      throw new Error("offline");
    });
    await expect(finishCutOffImport(unread, POD_DECK, [], lost)).rejects.toBe(lost);
  });

  it("gives a guest a text that asks nothing of a document", async () => {
    const stuck = repository(
      async () => null,
      async () => {
        throw new Error("aborted");
      },
    );
    await expect(finishCutOffImport(stuck, GUEST_DECK, DOCUMENTS, lost)).rejects.toMatchObject({
      code: "guestImportDocumentLeft",
    });
    const unread = repository(async () => {
      throw new Error("aborted");
    });
    await expect(finishCutOffImport(unread, GUEST_DECK, DOCUMENTS, lost)).rejects.toMatchObject({
      code: "guestImportOutcomeUnknown",
    });
  });
});
