import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildThing,
  createThing,
  getBoolean,
  getInteger,
  getStringNoLocale,
  getThing,
  mockSolidDatasetFrom,
  saveSolidDatasetAt,
  setThing,
  type SolidDataset,
} from "@inrupt/solid-client";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import { createSolidPreferencesRepository } from "./solidPreferencesRepository";
import { getSolidDatasetOrNull } from "./datasets";
import { RDF, SM } from "./vocab";

vi.mock("@inrupt/solid-client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@inrupt/solid-client")>();
  return { ...actual, saveSolidDatasetAt: vi.fn() };
});
vi.mock("./datasets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./datasets")>()),
  getSolidDatasetOrNull: vi.fn(),
}));

const INSTANCE = "https://pod.example/solid-memo/a/";
const DOCUMENT = `${INSTANCE}preferences.ttl`;

function makeRepository(checkWrite?: Parameters<typeof createSolidPreferencesRepository>[0]["checkWrite"]) {
  return createSolidPreferencesRepository({
    fetch: vi.fn() as unknown as typeof globalThis.fetch,
    ...(checkWrite === undefined ? {} : { checkWrite }),
  });
}

beforeEach(() => {
  vi.mocked(getSolidDatasetOrNull).mockReset();
  vi.mocked(saveSolidDatasetAt).mockReset();
});

describe("getPreferences", () => {
  it("returns null when the document does not exist", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await expect(
      makeRepository().getPreferences(INSTANCE),
    ).resolves.toBeNull();
  });

  it("returns null when the document has no #it subject", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      mockSolidDatasetFrom(DOCUMENT),
    );
    await expect(
      makeRepository().getPreferences(INSTANCE),
    ).resolves.toBeNull();
  });

  it("maps a stored document", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      setThing(
        mockSolidDatasetFrom(DOCUMENT),
        buildThing(createThing({ url: `${DOCUMENT}#it` }))
          .addIri(RDF.type, SM.Preferences)
          .addInteger(SM.newCardsPerDay, 5)
          .addInteger(SM.maxReviewsPerDay, 42)
          .addInteger(SM.dayBoundaryHour, 3)
          .addStringNoLocale(SM.answerScale, "minimal")
          .addBoolean(SM.developerMode, true)
          .build(),
      ),
    );
    await expect(makeRepository().getPreferences(INSTANCE)).resolves.toEqual({
      preferences: {
        newCardsPerDay: 5,
        maxReviewsPerDay: 42,
        dayBoundaryHour: 3,
        answerScale: "minimal",
        developerMode: true,
        invalidDataPolicy: "block-subject" as const,
        theme: "system" as const,
      },
      formatVersion: 1,
    });
  });
});

describe("savePreferences, checked", () => {
  it("checks the preferences subject and saves nothing when the check refuses", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    const checkWrite = vi.fn(async () => {
      throw new Error("does not conform");
    });
    await expect(makeRepository(checkWrite).savePreferences(INSTANCE, DEFAULT_PREFERENCES)).rejects.toThrow("does not conform");
    expect(checkWrite).toHaveBeenCalledWith(expect.anything(), [`${DOCUMENT}#it`], "pod");
    expect(saveSolidDatasetAt).not.toHaveBeenCalled();
  });
});

describe("savePreferences", () => {
  const preferences = {
    newCardsPerDay: 5,
    maxReviewsPerDay: 42,
    dayBoundaryHour: 3,
    answerScale: "minimal" as const,
    developerMode: true,
    invalidDataPolicy: "block-instance" as const,
    theme: "system" as const,
  };

  it("creates the document on first save", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);

    await makeRepository().savePreferences(INSTANCE, preferences);

    const [saveUrl, saved] = vi.mocked(saveSolidDatasetAt).mock.calls[0];
    expect(saveUrl).toBe(DOCUMENT);
    const thing = getThing(saved as SolidDataset, `${DOCUMENT}#it`)!;
    expect(getInteger(thing, SM.newCardsPerDay)).toBe(5);
    expect(getInteger(thing, SM.maxReviewsPerDay)).toBe(42);
    expect(getInteger(thing, SM.dayBoundaryHour)).toBe(3);
    expect(getStringNoLocale(thing, SM.answerScale)).toBe("minimal");
    expect(getBoolean(thing, SM.developerMode)).toBe(true);
    expect(getInteger(thing, SM.formatVersion)).toBe(4);
  });

  it("rewrites the subject in place in an existing document, keeping foreign triples", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      setThing(
        mockSolidDatasetFrom(DOCUMENT),
        buildThing(createThing({ url: `${DOCUMENT}#it` }))
          .addInteger(SM.newCardsPerDay, 99)
          .addStringNoLocale("https://other.example/#note", "kept")
          .build(),
      ),
    );

    await makeRepository().savePreferences(INSTANCE, preferences);

    const [, saved] = vi.mocked(saveSolidDatasetAt).mock.calls[0];
    const thing = getThing(saved as SolidDataset, `${DOCUMENT}#it`)!;
    expect(getInteger(thing, SM.newCardsPerDay)).toBe(5);
    expect(getStringNoLocale(thing, "https://other.example/#note")).toBe("kept");
    expect(getInteger(thing, SM.formatVersion)).toBe(4);
  });
});

describe("upgradePreferences", () => {
  /** Preferences as an older app wrote them: format 1, a field left out, another app's triple beside them. */
  function older() {
    return setThing(
      mockSolidDatasetFrom(DOCUMENT),
      buildThing(createThing({ url: `${DOCUMENT}#it` }))
        .addIri(RDF.type, SM.Preferences)
        .addInteger(SM.newCardsPerDay, 7)
        .addStringNoLocale("https://other.example/#note", "kept")
        .build(),
    );
  }

  it("brings outdated preferences up to this app's format as read, in place, checked first", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(older());
    const checkWrite = vi.fn(async () => undefined);
    await expect(makeRepository(checkWrite).upgradePreferences(INSTANCE)).resolves.toBe(true);
    const [saveUrl, saved] = vi.mocked(saveSolidDatasetAt).mock.calls[0];
    expect(saveUrl).toBe(DOCUMENT);
    const thing = getThing(saved as SolidDataset, `${DOCUMENT}#it`)!;
    expect(getInteger(thing, SM.newCardsPerDay)).toBe(7);
    expect(getInteger(thing, SM.maxReviewsPerDay)).toBe(DEFAULT_PREFERENCES.maxReviewsPerDay);
    expect(getStringNoLocale(thing, "https://other.example/#note")).toBe("kept");
    expect(getInteger(thing, SM.formatVersion)).toBe(4);
    expect(checkWrite).toHaveBeenCalledWith(saved, [`${DOCUMENT}#it`], "pod");
  });

  it("writes nothing for preferences up to date, none, or no preferences document", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(mockSolidDatasetFrom(DOCUMENT));
    await makeRepository().savePreferences(INSTANCE, DEFAULT_PREFERENCES);
    const current = vi.mocked(saveSolidDatasetAt).mock.calls[0][1] as Parameters<typeof setThing>[0];
    vi.mocked(saveSolidDatasetAt).mockReset();
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(current as never);
    await expect(makeRepository().upgradePreferences(INSTANCE)).resolves.toBe(false);
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(mockSolidDatasetFrom(DOCUMENT));
    await expect(makeRepository().upgradePreferences(INSTANCE)).resolves.toBe(false);
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      setThing(mockSolidDatasetFrom(DOCUMENT), buildThing(createThing({ url: `${DOCUMENT}#it` })).addInteger(SM.newCardsPerDay, 7).build()),
    );
    await expect(makeRepository().upgradePreferences(INSTANCE)).resolves.toBe(false);
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await expect(makeRepository().upgradePreferences(INSTANCE)).resolves.toBe(false);
    expect(saveSolidDatasetAt).not.toHaveBeenCalled();
  });
});
