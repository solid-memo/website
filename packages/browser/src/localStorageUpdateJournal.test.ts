import { describe, expect, it } from "vitest";
import { createLocalStorageUpdateJournal } from "./localStorageUpdateJournal";

const SOURCE = "https://guest.solid-memo.invalid/solid-memo/";
const STAGING = "https://pod.example/solid-memo/main/";

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, value),
  };
}

describe("createLocalStorageUpdateJournal", () => {
  it("remembers the copy a move of a guest's study is writing until it ends", () => {
    const storage = memoryStorage();
    const journal = createLocalStorageUpdateJournal(() => storage);
    expect(journal.staging(SOURCE)).toBeNull();
    journal.begin(SOURCE, STAGING);
    expect(journal.staging(SOURCE)).toBe(STAGING);
    expect(JSON.parse(storage.getItem(`solid-memo:update:${SOURCE}`)!)).toMatchObject({ stagingUrl: STAGING });
    journal.end(SOURCE);
    expect(journal.staging(SOURCE)).toBeNull();
  });

  it("ignores an entry it cannot read", () => {
    const storage = memoryStorage();
    const journal = createLocalStorageUpdateJournal(() => storage);
    storage.setItem(`solid-memo:update:${SOURCE}`, JSON.stringify({ stagingUrl: 3 }));
    expect(journal.staging(SOURCE)).toBeNull();
    storage.setItem(`solid-memo:update:${SOURCE}`, "{");
    expect(journal.staging(SOURCE)).toBeNull();
  });

  it("does without storage that is missing or refuses", () => {
    const journal = createLocalStorageUpdateJournal(() => {
      throw new Error("SecurityError");
    });
    expect(() => journal.begin(SOURCE, STAGING)).not.toThrow();
    expect(() => journal.end(SOURCE)).not.toThrow();
    expect(journal.staging(SOURCE)).toBeNull();
  });

  it("uses the browser's localStorage by default", () => {
    const journal = createLocalStorageUpdateJournal();
    journal.begin(SOURCE, STAGING);
    expect(journal.staging(SOURCE)).toBe(STAGING);
    journal.end(SOURCE);
  });
});
