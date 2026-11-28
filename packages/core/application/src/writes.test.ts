// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { AppError } from "@solid-memo/domain/appError";
import type { Deck } from "@solid-memo/domain/deck";
import { GUEST_INSTANCE_URL } from "@solid-memo/domain/guest";
import { changedOrCreatedElsewhere, finishCutOffImport, pauseBefore, pauseMs } from "./writes";

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
