// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildThing,
  createThing,
  getBoolean,
  getInteger,
  getStringNoLocale,
  getThing,
  getUrl,
  mockSolidDatasetFrom,
  saveSolidDatasetAt,
  setThing,
  type SolidDataset,
  type ThingBuilder,
  type ThingPersisted,
} from "@inrupt/solid-client";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import { createSolidPreferencesRepository } from "./solidPreferencesRepository";
import { getSolidDatasetOrNull } from "./datasets";
import { RDF, SM } from "./vocab";

vi.mock("@inrupt/solid-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@inrupt/solid-client")>();
  return { ...actual, saveSolidDatasetAt: vi.fn() };
});
vi.mock("./datasets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./datasets")>()),
  getSolidDatasetOrNull: vi.fn(),
}));

const INSTANCE = "https://pod.example/solid-memo/a/";
const DOCUMENT = `${INSTANCE}preferences.ttl`;

function makeRepository(
  checkWrite?: Parameters<typeof createSolidPreferencesRepository>[0]["checkWrite"],
) {
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
    await expect(makeRepository().getPreferences(INSTANCE)).resolves.toBeNull();
  });

  it("returns null when the document has no #it subject", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(mockSolidDatasetFrom(DOCUMENT));
    await expect(makeRepository().getPreferences(INSTANCE)).resolves.toBeNull();
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
        scheduler: "sm2" as const,
        desiredRetention: 0.9,
        schedulerInvitationDismissed: false,
        palette: SM.standardPalette,
        textSize: "default" as const,
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
    await expect(
      makeRepository(checkWrite).savePreferences(INSTANCE, DEFAULT_PREFERENCES),
    ).rejects.toThrow("does not conform");
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
    scheduler: "sm2" as const,
    desiredRetention: 0.9,
    schedulerInvitationDismissed: false,
    palette: SM.standardPalette,
    textSize: "default" as const,
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
    expect(getInteger(thing, SM.formatVersion)).toBe(6);
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
    expect(getInteger(thing, SM.formatVersion)).toBe(6);
  });

  it("writes the whole document, not a PATCH, which node-solid-server stores a true in as false", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(mockSolidDatasetFrom(DOCUMENT));
    const fetch = vi.fn(async () => new Response("", { status: 205 }));
    await createSolidPreferencesRepository({
      fetch: fetch as unknown as typeof globalThis.fetch,
    }).savePreferences(INSTANCE, { ...preferences, schedulerInvitationDismissed: true });

    // The PATCH @inrupt/solid-client would send for the edit goes out as a PUT of the document.
    const [, , options] = vi.mocked(saveSolidDatasetAt).mock.calls[0];
    await options!.fetch!(DOCUMENT, { method: "PATCH", body: "INSERT DATA {};" });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(DOCUMENT);
    expect(init.method).toBe("PUT");
    expect(String(init.body)).toContain("schedulerInvitationDismissed> true");
  });

  it("keeps a stored choice to skip the Connected screen, which it never writes", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      setThing(
        mockSolidDatasetFrom(DOCUMENT),
        buildThing(createThing({ url: `${DOCUMENT}#it` }))
          .addBoolean(SM.connectedScreenSkipped, true)
          .build(),
      ),
    );

    await makeRepository().savePreferences(INSTANCE, preferences);

    const [, saved] = vi.mocked(saveSolidDatasetAt).mock.calls[0];
    const thing = getThing(saved as SolidDataset, `${DOCUMENT}#it`)!;
    expect(getBoolean(thing, SM.connectedScreenSkipped)).toBe(true);
  });
});

describe("markConnectedScreen", () => {
  const SUBJECT = `${DOCUMENT}#it`;

  /** Preferences stored at `version`, with the choice when `skipped` is given, and another app's triple. */
  function stored(version: number, skipped?: boolean) {
    const builder = buildThing(createThing({ url: SUBJECT }))
      .addIri(RDF.type, SM.Preferences)
      .addInteger(SM.formatVersion, version)
      .addInteger(SM.newCardsPerDay, 7)
      .addStringNoLocale("https://other.example/#note", "kept");
    return setThing(
      mockSolidDatasetFrom(DOCUMENT),
      (skipped === undefined
        ? builder
        : builder.addBoolean(SM.connectedScreenSkipped, skipped)
      ).build(),
    );
  }

  function saved() {
    const [saveUrl, dataset] = vi.mocked(saveSolidDatasetAt).mock.calls[0];
    expect(saveUrl).toBe(DOCUMENT);
    return getThing(dataset as SolidDataset, SUBJECT)!;
  }

  it("sets the choice on the preferences as stored, their format and every other triple kept, checked first", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(stored(5));
    const checkWrite = vi.fn(async () => undefined);
    await expect(
      makeRepository(checkWrite).markConnectedScreen(INSTANCE, true, null),
    ).resolves.toBe("written");
    const thing = saved();
    expect(getBoolean(thing, SM.connectedScreenSkipped)).toBe(true);
    expect(getInteger(thing, SM.formatVersion)).toBe(5);
    expect(getInteger(thing, SM.newCardsPerDay)).toBe(7);
    expect(getStringNoLocale(thing, "https://other.example/#note")).toBe("kept");
    expect(checkWrite).toHaveBeenCalledWith(expect.anything(), [SUBJECT], "pod");
  });

  it("removes it to show the screen again, leaving no triple", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(stored(6, true));
    await expect(makeRepository().markConnectedScreen(INSTANCE, false, null)).resolves.toBe(
      "written",
    );
    expect(getBoolean(saved(), SM.connectedScreenSkipped)).toBeNull();
  });

  it("writes nothing when the preferences already say so", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(stored(6, true));
    await expect(makeRepository().markConnectedScreen(INSTANCE, true, null)).resolves.toBe(
      "unchanged",
    );
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(stored(6));
    await expect(makeRepository().markConnectedScreen(INSTANCE, false, null)).resolves.toBe(
      "unchanged",
    );
    expect(saveSolidDatasetAt).not.toHaveBeenCalled();
  });

  it("refuses preferences a newer version of the app wrote, before sending anything", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(stored(7));
    await expect(makeRepository().markConnectedScreen(INSTANCE, true, null)).rejects.toMatchObject({
      code: "writtenByNewerApp",
    });
    expect(saveSolidDatasetAt).not.toHaveBeenCalled();
  });

  it("gives preferences that do not fit their shape the choice alone, never the defaults, and it reads back", async () => {
    // Format 2 must state every field: this one states one.
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(stored(2));
    const repository = makeRepository();
    await repository.markConnectedScreen(INSTANCE, true, DEFAULT_PREFERENCES);
    const thing = saved();
    expect(getBoolean(thing, SM.connectedScreenSkipped)).toBe(true);
    expect(getInteger(thing, SM.formatVersion)).toBe(2);
    expect(getInteger(thing, SM.maxReviewsPerDay)).toBeNull();

    // They still read as no preferences, but the choice counts at the next login.
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      setThing(mockSolidDatasetFrom(DOCUMENT), thing),
    );
    await expect(repository.getPreferences(INSTANCE)).resolves.toBeNull();
    await expect(repository.connectedScreenSkipped(INSTANCE)).resolves.toBe(true);
  });

  it("makes the preferences it is given, with the choice, where there are none", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await expect(
      makeRepository().markConnectedScreen(INSTANCE, true, {
        ...DEFAULT_PREFERENCES,
        theme: "dark",
      }),
    ).resolves.toBe("written");
    const thing = saved();
    expect(getBoolean(thing, SM.connectedScreenSkipped)).toBe(true);
    expect(getInteger(thing, SM.formatVersion)).toBe(6);
    expect(getUrl(thing, SM.theme)).toBe(SM.darkTheme);
  });

  it("writes nothing where there are no preferences and none are given", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await expect(makeRepository().markConnectedScreen(INSTANCE, true, null)).resolves.toBe("none");
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(mockSolidDatasetFrom(DOCUMENT));
    await expect(makeRepository().markConnectedScreen(INSTANCE, true, null)).resolves.toBe("none");
    expect(saveSolidDatasetAt).not.toHaveBeenCalled();
  });

  it("writes the whole document, not a PATCH, which node-solid-server stores a true in as false", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(stored(6));
    const fetch = vi.fn(async () => new Response("", { status: 205 }));
    await createSolidPreferencesRepository({
      fetch: fetch as unknown as typeof globalThis.fetch,
    }).markConnectedScreen(INSTANCE, true, null);
    const [, , options] = vi.mocked(saveSolidDatasetAt).mock.calls[0];
    await options!.fetch!(DOCUMENT, { method: "PATCH", body: "INSERT DATA {};" });
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("PUT");
    expect(String(init.body)).toContain("connectedScreenSkipped> true");
  });
});

describe("connectedScreenSkipped", () => {
  const SUBJECT = `${DOCUMENT}#it`;

  /** A subject at `version` holding only its type and this value of the choice. */
  function holding(
    version: number,
    add: (b: ThingBuilder<ThingPersisted>) => ThingBuilder<ThingPersisted>,
  ) {
    return setThing(
      mockSolidDatasetFrom(DOCUMENT),
      add(
        buildThing(createThing({ url: SUBJECT }))
          .addIri(RDF.type, SM.Preferences)
          .addInteger(SM.formatVersion, version),
      ).build(),
    );
  }

  it("is false with no document, or no subject in it", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await expect(makeRepository().connectedScreenSkipped(INSTANCE)).resolves.toBe(false);
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(mockSolidDatasetFrom(DOCUMENT));
    await expect(makeRepository().connectedScreenSkipped(INSTANCE)).resolves.toBe(false);
  });

  it("reads a true whatever the format, a newer one too, and whether or not they fit their shape", async () => {
    for (const version of [2, 6, 7]) {
      vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
        holding(version, (b) => b.addBoolean(SM.connectedScreenSkipped, true)),
      );
      await expect(makeRepository().connectedScreenSkipped(INSTANCE)).resolves.toBe(true);
    }
  });

  it("reads anything but a true as showing the screen", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(holding(6, (b) => b));
    await expect(makeRepository().connectedScreenSkipped(INSTANCE)).resolves.toBe(false);
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      holding(6, (b) => b.addStringNoLocale(SM.connectedScreenSkipped, "yes")),
    );
    await expect(makeRepository().connectedScreenSkipped(INSTANCE)).resolves.toBe(false);
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
    expect(getInteger(thing, SM.formatVersion)).toBe(6);
    expect(checkWrite).toHaveBeenCalledWith(saved, [`${DOCUMENT}#it`], "pod");
  });

  it("writes nothing for preferences up to date, none, or no preferences document", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(mockSolidDatasetFrom(DOCUMENT));
    await makeRepository().savePreferences(INSTANCE, DEFAULT_PREFERENCES);
    const current = vi.mocked(saveSolidDatasetAt).mock.calls[0][1] as Parameters<
      typeof setThing
    >[0];
    vi.mocked(saveSolidDatasetAt).mockReset();
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(current as never);
    await expect(makeRepository().upgradePreferences(INSTANCE)).resolves.toBe(false);
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(mockSolidDatasetFrom(DOCUMENT));
    await expect(makeRepository().upgradePreferences(INSTANCE)).resolves.toBe(false);
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      setThing(
        mockSolidDatasetFrom(DOCUMENT),
        buildThing(createThing({ url: `${DOCUMENT}#it` }))
          .addInteger(SM.newCardsPerDay, 7)
          .build(),
      ),
    );
    await expect(makeRepository().upgradePreferences(INSTANCE)).resolves.toBe(false);
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await expect(makeRepository().upgradePreferences(INSTANCE)).resolves.toBe(false);
    expect(saveSolidDatasetAt).not.toHaveBeenCalled();
  });
});
