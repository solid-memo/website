// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildThing,
  createThing,
  type Dataset,
  getBoolean,
  getDecimal,
  getInteger,
  getStringNoLocale,
  getThing,
  getUrl,
  getUrlAll,
  setThing,
  type SubjectBuilder,
} from "./client/rdf";
import { writeDocument } from "./client/resources";
import { datasetFrom, datasetOfTurtle } from "./testing/datasets";
import { createUseCases } from "@solid-memo/application/useCases";
import { makeDeps } from "@solid-memo/application/testing/fakePorts";
import { DEFAULT_PREFERENCES, type StudyPreferences } from "@solid-memo/domain/preferences";
import { toPreferencesThing } from "./mappers/preferencesMapper";
import { createSolidPreferencesRepository } from "./solidPreferencesRepository";
import { getSolidDatasetOrNull } from "./datasets";
import { RDF, SM, SM_NS } from "./vocab";
import { integerLiteral } from "./testing/literals";

vi.mock("./client/resources", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client/resources")>();
  return {
    ...actual, // A write the pod takes as given, with no version.
    writeDocument: vi.fn(async (_url: string, dataset: object) => ({ dataset, etag: undefined })),
  };
});
vi.mock("./datasets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./datasets")>()),
  getSolidDatasetOrNull: vi.fn(),
}));

const INSTANCE = "https://pod.example/solid-memo/a/";
const DOCUMENT = `${INSTANCE}preferences.ttl`;

/** The preferences subject as this app writes them: they fit their shape. */
function fitting(preferences: StudyPreferences) {
  return toPreferencesThing(`${DOCUMENT}#it`, preferences, null);
}

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
  vi.mocked(writeDocument).mockReset();
});

describe("getPreferences", () => {
  it("returns null when the document does not exist", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await expect(makeRepository().getPreferences(INSTANCE)).resolves.toBeNull();
  });

  it("returns null when the document has no #it subject", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(datasetFrom(DOCUMENT));
    await expect(makeRepository().getPreferences(INSTANCE)).resolves.toBeNull();
  });

  it("maps a stored document", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      setThing(
        datasetFrom(DOCUMENT),
        buildThing(createThing({ url: `${DOCUMENT}#it` }))
          .addIri(RDF.type, SM.Preferences)
          .addLiteral(SM.newCardsPerDay, integerLiteral(5))
          .addLiteral(SM.maxReviewsPerDay, integerLiteral(42))
          .addLiteral(SM.dayBoundaryHour, integerLiteral(3))
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
    expect(writeDocument).not.toHaveBeenCalled();
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

    const [saveUrl, saved] = vi.mocked(writeDocument).mock.calls[0];
    expect(saveUrl).toBe(DOCUMENT);
    const thing = getThing(saved as Dataset, `${DOCUMENT}#it`)!;
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
        datasetFrom(DOCUMENT),
        buildThing(fitting({ ...preferences, newCardsPerDay: 99 }))
          .addStringNoLocale("https://other.example/#note", "kept")
          .build(),
      ),
    );

    await makeRepository().savePreferences(INSTANCE, preferences);

    const [, saved] = vi.mocked(writeDocument).mock.calls[0];
    const thing = getThing(saved as Dataset, `${DOCUMENT}#it`)!;
    expect(getInteger(thing, SM.newCardsPerDay)).toBe(5);
    expect(getStringNoLocale(thing, "https://other.example/#note")).toBe("kept");
    expect(getInteger(thing, SM.formatVersion)).toBe(6);
  });

  it("writes the whole document, not a PATCH, which node-solid-server stores a true in as false", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(datasetFrom(DOCUMENT));
    await makeRepository().savePreferences(INSTANCE, {
      ...preferences,
      schedulerInvitationDismissed: true,
    });

    // writeDocument sends such an edit as a PUT of the document (client/resources.ts).
    const [url, saved, options] = vi.mocked(writeDocument).mock.calls[0];
    expect(url).toBe(DOCUMENT);
    expect(options.whole).toBe(true);
    expect(getBoolean(getThing(saved, `${DOCUMENT}#it`)!, SM.schedulerInvitationDismissed)).toBe(
      true,
    );
  });

  it("keeps a stored choice to skip the Connected screen, which it never writes", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      setThing(
        datasetFrom(DOCUMENT),
        buildThing(fitting(preferences)).addBoolean(SM.connectedScreenSkipped, true).build(),
      ),
    );

    await makeRepository().savePreferences(INSTANCE, preferences);

    const [, saved] = vi.mocked(writeDocument).mock.calls[0];
    const thing = getThing(saved as Dataset, `${DOCUMENT}#it`)!;
    expect(getBoolean(thing, SM.connectedScreenSkipped)).toBe(true);
  });
});

describe("markConnectedScreen", () => {
  const SUBJECT = `${DOCUMENT}#it`;

  /** Preferences stored at `version`, with the choice when `skipped` is given, and another app's triple. */
  function stored(version: number, skipped?: boolean) {
    const builder = buildThing(createThing({ url: SUBJECT }))
      .addIri(RDF.type, SM.Preferences)
      .addLiteral(SM.formatVersion, integerLiteral(version))
      .addLiteral(SM.newCardsPerDay, integerLiteral(7))
      .addStringNoLocale("https://other.example/#note", "kept");
    return setThing(
      datasetFrom(DOCUMENT),
      (skipped === undefined
        ? builder
        : builder.addBoolean(SM.connectedScreenSkipped, skipped)
      ).build(),
    );
  }

  function saved() {
    const [saveUrl, dataset] = vi.mocked(writeDocument).mock.calls[0];
    expect(saveUrl).toBe(DOCUMENT);
    return getThing(dataset as Dataset, SUBJECT)!;
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

  it("drops a class a shape describes that another app gave the preferences, so the check holds them to their own shape", async () => {
    const FOAF = "http://xmlns.com/foaf/0.1/";
    const typed = buildThing(getThing(stored(6), SUBJECT)!)
      .addIri(RDF.type, `${FOAF}Agent`)
      .addIri(RDF.type, SM.Card)
      .addIri(RDF.type, `${FOAF}Document`)
      .build();
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(setThing(datasetFrom(DOCUMENT), typed));
    await makeRepository().markConnectedScreen(INSTANCE, true, null);
    expect(getUrlAll(saved(), RDF.type)).toEqual([SM.Preferences, `${FOAF}Document`]);
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
    expect(writeDocument).not.toHaveBeenCalled();
  });

  it("refuses preferences a newer version of the app wrote, before sending anything", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(stored(7));
    await expect(makeRepository().markConnectedScreen(INSTANCE, true, null)).rejects.toMatchObject({
      code: "writtenByNewerApp",
    });
    expect(writeDocument).not.toHaveBeenCalled();
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

    // They still do not fit their shape, but the choice counts at the next login.
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(setThing(datasetFrom(DOCUMENT), thing));
    await expect(repository.getPreferences(INSTANCE)).resolves.toBe("misfit");
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
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(datasetFrom(DOCUMENT));
    await expect(makeRepository().markConnectedScreen(INSTANCE, true, null)).resolves.toBe("none");
    expect(writeDocument).not.toHaveBeenCalled();
  });

  it("writes the whole document, not a PATCH, which node-solid-server stores a true in as false", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(stored(6));
    await makeRepository().markConnectedScreen(INSTANCE, true, null);
    const [, saved, options] = vi.mocked(writeDocument).mock.calls[0];
    expect(options.whole).toBe(true);
    expect(getBoolean(getThing(saved, `${DOCUMENT}#it`)!, SM.connectedScreenSkipped)).toBe(true);
  });
});

describe("connectedScreenSkipped", () => {
  const SUBJECT = `${DOCUMENT}#it`;

  /** A subject at `version` holding only its type and this value of the choice. */
  function holding(version: number, add: (b: SubjectBuilder) => SubjectBuilder) {
    return setThing(
      datasetFrom(DOCUMENT),
      add(
        buildThing(createThing({ url: SUBJECT }))
          .addIri(RDF.type, SM.Preferences)
          .addLiteral(SM.formatVersion, integerLiteral(version)),
      ).build(),
    );
  }

  it("is false with no document, or no subject in it", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await expect(makeRepository().connectedScreenSkipped(INSTANCE)).resolves.toBe(false);
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(datasetFrom(DOCUMENT));
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
      datasetFrom(DOCUMENT),
      buildThing(createThing({ url: `${DOCUMENT}#it` }))
        .addIri(RDF.type, SM.Preferences)
        .addLiteral(SM.newCardsPerDay, integerLiteral(7))
        .addStringNoLocale("https://other.example/#note", "kept")
        .build(),
    );
  }

  it("brings outdated preferences up to this app's format as read, in place, checked first", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(older());
    const checkWrite = vi.fn(async () => undefined);
    await expect(makeRepository(checkWrite).upgradePreferences(INSTANCE)).resolves.toBe(true);
    const [saveUrl, saved] = vi.mocked(writeDocument).mock.calls[0];
    expect(saveUrl).toBe(DOCUMENT);
    const thing = getThing(saved as Dataset, `${DOCUMENT}#it`)!;
    expect(getInteger(thing, SM.newCardsPerDay)).toBe(7);
    expect(getInteger(thing, SM.maxReviewsPerDay)).toBe(DEFAULT_PREFERENCES.maxReviewsPerDay);
    expect(getStringNoLocale(thing, "https://other.example/#note")).toBe("kept");
    expect(getInteger(thing, SM.formatVersion)).toBe(6);
    expect(checkWrite).toHaveBeenCalledWith(saved, [`${DOCUMENT}#it`], "pod");
  });

  it("writes nothing for preferences up to date, none, or no preferences document", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(datasetFrom(DOCUMENT));
    await makeRepository().savePreferences(INSTANCE, DEFAULT_PREFERENCES);
    const current = vi.mocked(writeDocument).mock.calls[0][1] as Parameters<typeof setThing>[0];
    vi.mocked(writeDocument).mockReset();
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(current as never);
    await expect(makeRepository().upgradePreferences(INSTANCE)).resolves.toBe(false);
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(datasetFrom(DOCUMENT));
    await expect(makeRepository().upgradePreferences(INSTANCE)).resolves.toBe(false);
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      setThing(
        datasetFrom(DOCUMENT),
        buildThing(createThing({ url: `${DOCUMENT}#it` }))
          .addLiteral(SM.newCardsPerDay, integerLiteral(7))
          .build(),
      ),
    );
    await expect(makeRepository().upgradePreferences(INSTANCE)).resolves.toBe(false);
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await expect(makeRepository().upgradePreferences(INSTANCE)).resolves.toBe(false);
    expect(writeDocument).not.toHaveBeenCalled();
  });
});

type Misfit = "theme" | "answerScale" | "noFormatVersion" | "formatVersionInt";

/** The format version each misfit is stored with. */
const FORMAT_VERSION: Record<Misfit, string> = {
  theme: "sm:formatVersion 6 ;",
  answerScale: "sm:formatVersion 6 ;",
  noFormatVersion: "",
  formatVersionInt: 'sm:formatVersion "6"^^xsd:int ;',
};

/**
 * The learner's own preferences (FSRS-6, a 2 am day boundary, their own
 * limits and retention, warn only), but for one value their shape does
 * not list (an unknown theme), one it asks for left out (no answer
 * scale), or a format version left out or not an integer, which would
 * read them as format 1 and lose all a later format added: preferences
 * that do not fit their shape.
 */
function misfitTurtle(misfit: Misfit): string {
  return `
@prefix sm: <${SM_NS}> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
<#it> a sm:Preferences ; ${FORMAT_VERSION[misfit]}
  sm:newCardsPerDay 40 ; sm:maxReviewsPerDay 900 ; sm:dayBoundaryHour 2 ;
  ${misfit === "answerScale" ? "" : 'sm:answerScale "sm2" ;'}
  sm:developerMode false ; sm:invalidDataPolicy sm:warnOnly ;
  sm:theme ${misfit === "theme" ? "<https://other.example/ns#sepiaTheme>" : "sm:systemTheme"} ;
  sm:studyScheduler sm:fsrs6 ; sm:desiredRetention "0.95"^^xsd:decimal ;
  sm:schedulerInvitationDismissed false ; sm:palette sm:standardPalette ;
  sm:textSize sm:defaultTextSize .`;
}

/** The preferences subject the last write sent. */
function written() {
  const [url, dataset] = vi.mocked(writeDocument).mock.calls.at(-1)!;
  expect(url).toBe(DOCUMENT);
  return getThing(dataset as Dataset, `${DOCUMENT}#it`)!;
}

/** Whether a subject still holds the learner's own preferences, the ones the defaults would replace. */
function expectTheLearners(thing: ReturnType<typeof written>) {
  expect(getUrl(thing, SM.studyScheduler)).toBe(SM.fsrs6);
  expect(getInteger(thing, SM.dayBoundaryHour)).toBe(2);
  expect(getInteger(thing, SM.newCardsPerDay)).toBe(40);
  expect(getInteger(thing, SM.maxReviewsPerDay)).toBe(900);
  expect(getDecimal(thing, SM.desiredRetention)).toBe(0.95);
  expect(getUrl(thing, SM.invalidDataPolicy)).toBe(SM.warnOnly);
}

describe.each(["theme", "answerScale", "noFormatVersion", "formatVersionInt"] as const)(
  "preferences that do not fit their shape (%s)",
  (misfit) => {
    beforeEach(async () => {
      const stored = await datasetOfTurtle(DOCUMENT, misfitTurtle(misfit));
      vi.mocked(getSolidDatasetOrNull).mockResolvedValue(stored);
    });

    it("read as a misfit, not as none", async () => {
      await expect(makeRepository().getPreferences(INSTANCE)).resolves.toBe("misfit");
    });

    it("are not replaced by a save, before anything is sent", async () => {
      const checkWrite = vi.fn(async () => undefined);
      await expect(
        makeRepository(checkWrite).savePreferences(INSTANCE, DEFAULT_PREFERENCES),
      ).rejects.toMatchObject({ code: "preferencesMisfit" });
      expect(checkWrite).not.toHaveBeenCalled();
      expect(writeDocument).not.toHaveBeenCalled();
    });

    it("are replaced when the user says so, and then fit", async () => {
      const repository = makeRepository();
      await repository.savePreferences(INSTANCE, DEFAULT_PREFERENCES, { replaceMisfit: true });
      const thing = written();
      expect(getUrl(thing, SM.studyScheduler)).toBe(SM.sm2);
      vi.mocked(getSolidDatasetOrNull).mockResolvedValue(setThing(datasetFrom(DOCUMENT), thing));
      await expect(repository.getPreferences(INSTANCE)).resolves.toMatchObject({
        preferences: DEFAULT_PREFERENCES,
      });
    });

    it("gain the answer to the invitation alone, checked first, never the defaults", async () => {
      const checkWrite = vi.fn(async () => undefined);
      await makeRepository(checkWrite).markSchedulerInvitationDismissed(INSTANCE);
      const thing = written();
      expect(checkWrite).toHaveBeenCalledWith(expect.anything(), [`${DOCUMENT}#it`], "pod");
      expect(getBoolean(thing, SM.schedulerInvitationDismissed)).toBe(true);
      expectTheLearners(thing);
      expect(getUrl(thing, SM.theme)).toBe(
        misfit === "theme" ? "https://other.example/ns#sepiaTheme" : SM.systemTheme,
      );
      expect(getStringNoLocale(thing, SM.answerScale)).toBe(
        misfit === "answerScale" ? null : "sm2",
      );
    });

    // GHSA-cxcg-fwr3-28cc: "Not now", a save and a switch of scheduler, through the use cases.
    it("keep the learner's own through Not now, and a save or a switch is refused unless confirmed", async () => {
      const deps = makeDeps();
      const useCases = createUseCases({ ...deps, preferencesRepository: makeRepository() });
      await expect(useCases.preferencesMisfit(INSTANCE)).resolves.toBe(true);
      await expect(useCases.getPreferences(INSTANCE)).resolves.toEqual(DEFAULT_PREFERENCES);

      await useCases.dismissSchedulerInvitation(INSTANCE);
      expect(writeDocument).toHaveBeenCalledOnce();
      expect(getBoolean(written(), SM.schedulerInvitationDismissed)).toBe(true);
      expectTheLearners(written());

      await expect(useCases.savePreferences(INSTANCE, DEFAULT_PREFERENCES)).rejects.toMatchObject({
        code: "preferencesMisfit",
      });
      await expect(
        useCases.switchScheduler(INSTANCE, { ...DEFAULT_PREFERENCES, scheduler: "fsrs6" }),
      ).rejects.toMatchObject({ code: "preferencesMisfit" });
      expect(deps.deckRepository.listDecks).not.toHaveBeenCalled();
      await useCases.chooseTheme("dark", INSTANCE);
      expect(writeDocument).toHaveBeenCalledOnce();

      await useCases.savePreferences(
        INSTANCE,
        { ...DEFAULT_PREFERENCES, newCardsPerDay: 12 },
        { replaceMisfit: true },
      );
      expect(getInteger(written(), SM.newCardsPerDay)).toBe(12);
    });
  },
);

describe("markSchedulerInvitationDismissed", () => {
  it("sets the answer on preferences that fit, every other triple kept", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      setThing(
        datasetFrom(DOCUMENT),
        buildThing(fitting({ ...DEFAULT_PREFERENCES, newCardsPerDay: 9 }))
          .addStringNoLocale("https://other.example/#note", "kept")
          .build(),
      ),
    );
    await makeRepository().markSchedulerInvitationDismissed(INSTANCE);
    const [, , options] = vi.mocked(writeDocument).mock.calls[0];
    expect(options.whole).toBe(true);
    const thing = written();
    expect(getBoolean(thing, SM.schedulerInvitationDismissed)).toBe(true);
    expect(getInteger(thing, SM.newCardsPerDay)).toBe(9);
    expect(getStringNoLocale(thing, "https://other.example/#note")).toBe("kept");
  });

  it("writes nothing where there are no preferences, or they say so already", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await makeRepository().markSchedulerInvitationDismissed(INSTANCE);
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(datasetFrom(DOCUMENT));
    await makeRepository().markSchedulerInvitationDismissed(INSTANCE);
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      setThing(
        datasetFrom(DOCUMENT),
        fitting({ ...DEFAULT_PREFERENCES, schedulerInvitationDismissed: true }),
      ),
    );
    await makeRepository().markSchedulerInvitationDismissed(INSTANCE);
    expect(writeDocument).not.toHaveBeenCalled();
  });

  it("refuses preferences a newer version of the app wrote, before sending anything", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      setThing(
        datasetFrom(DOCUMENT),
        buildThing(fitting(DEFAULT_PREFERENCES)).setInteger(SM.formatVersion, 7).build(),
      ),
    );
    await expect(makeRepository().markSchedulerInvitationDismissed(INSTANCE)).rejects.toMatchObject(
      { code: "writtenByNewerApp" },
    );
    expect(writeDocument).not.toHaveBeenCalled();
  });
});
