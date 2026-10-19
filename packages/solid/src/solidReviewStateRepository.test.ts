// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildThing,
  getThing,
  getThingAll,
  getUrl,
  mockSolidDatasetFrom,
  saveSolidDatasetAt,
  setThing,
  type SolidDataset,
} from "@inrupt/solid-client";
import { createSolidReviewStateRepository } from "./solidReviewStateRepository";
import { getSolidDatasetOrNull, keptDataset } from "./datasets";
import {
  toFsrsState,
  toFsrsStateThing,
  toReviewState,
  toReviewStateThing,
} from "./mappers/reviewStateMapper";
import type { Deck } from "@solid-memo/domain/deck";
import type { PromptStates } from "@solid-memo/domain/grading";
import { namedFsrsSubject, namedReviewSubject } from "@solid-memo/domain/reviewRecord";
import type { FsrsState, ReviewState } from "@solid-memo/domain/review";
import { SM } from "./vocab";

const FSRS = "https://fsrs.example/ns#fsrs";

vi.mock("@inrupt/solid-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@inrupt/solid-client")>();
  return { ...actual, saveSolidDatasetAt: vi.fn() };
});
vi.mock("./datasets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./datasets")>()),
  getSolidDatasetOrNull: vi.fn(),
  keptDataset: vi.fn(),
}));

const INSTANCE = "https://pod.example/solid-memo/a/";

const deck: Deck = {
  id: "deck-1",
  url: `${INSTANCE}catalog.ttl#deck-1`,
  title: { en: "Kanji N5" },
  cardsDocumentUrl: `${INSTANCE}decks/deck-1.ttl`,
  reviewsDocumentUrl: `${INSTANCE}reviews/deck-1.ttl`,
  direction: "front-to-back",
  createdAt: "2026-09-21T10:00:00.000Z",
  formatVersion: 1,
  authors: [],
};

const state: ReviewState = {
  cardId: "card-1",
  direction: "front-to-back",
  easeFactor: 2.36,
  intervalDays: 6,
  repetitions: 2,
  due: "2026-09-27",
  firstReviewedAt: "2026-09-15T08:00:00.000Z",
  lastReviewedAt: "2026-09-21T08:12:00.000Z",
  formatVersion: 2,
};

/** The FSRS-6 state of the same prompt, fresh: of the same last review. */
const fsrs: FsrsState = {
  cardId: "card-1",
  direction: "front-to-back",
  stability: 9.25,
  difficulty: 4.5,
  due: "2026-09-30",
  firstReviewedAt: state.firstReviewedAt,
  lastReviewedAt: state.lastReviewedAt,
  formatVersion: 1,
};

/** The deck's states, SM-2's alone. */
const sm2s = (sm2: ReviewState[]) => ({ sm2, fsrs: [] });

function reviewsDataset() {
  return setThing(mockSolidDatasetFrom(deck.reviewsDocumentUrl), named(state));
}

function makeRepository(
  checkWrite?: Parameters<typeof createSolidReviewStateRepository>[0]["checkWrite"],
  /** null: the repository's own. */
  randomId: (() => string) | null = () => "r1",
) {
  return createSolidReviewStateRepository({
    fetch: vi.fn() as unknown as typeof globalThis.fetch,
    ...(checkWrite === undefined ? {} : { checkWrite }),
    ...(randomId === null ? {} : { randomId }),
  });
}

/** A state of the deck written at the subject the fragment rule names. */
function named(written: ReviewState) {
  return toReviewStateThing(
    deck,
    written,
    null,
    namedReviewSubject(deck.reviewsDocumentUrl, written),
  );
}

/** An FSRS-6 state of the deck written at the subject this app names for it. */
function namedFsrs(written: FsrsState) {
  return toFsrsStateThing(deck, written, null, namedFsrsSubject(deck.reviewsDocumentUrl, written));
}

/** A state of the deck written at `subject`, which another app may have named any way. */
function stateAt(subject: string, written: ReviewState = state) {
  return toReviewStateThing(deck, written, null, `${deck.reviewsDocumentUrl}#${subject}`);
}

/** Another scheduler's state at `subject`: no SM-2 fields Solid Memo could read. */
function otherSchedulerAt(subject: string) {
  return buildThing({ url: `${deck.reviewsDocumentUrl}#${subject}` })
    .addUrl("http://www.w3.org/1999/02/22-rdf-syntax-ns#type", SM.ReviewState)
    .addUrl(SM.reviewOf, `${deck.cardsDocumentUrl}#card-1`)
    .addUrl(SM.scheduler, FSRS)
    .addDecimal("https://fsrs.example/ns#stability", 4.2)
    .build();
}

function documentOf(...things: ReturnType<typeof stateAt>[]) {
  return things.reduce(
    (dataset, thing) => setThing(dataset, thing),
    mockSolidDatasetFrom(deck.reviewsDocumentUrl),
  );
}

function savedDataset(): SolidDataset {
  return vi.mocked(saveSolidDatasetAt).mock.calls[0][1] as SolidDataset;
}

/** Write `state` as a grade of its prompt that makes it whatever is stored. */
function writeState(repository: ReturnType<typeof makeRepository>, of: Deck, written: ReviewState) {
  return repository.gradeReviewState(
    of,
    { cardId: written.cardId, direction: written.direction },
    () => ({ sm2: written }),
  );
}

beforeEach(() => {
  vi.mocked(getSolidDatasetOrNull).mockReset();
  vi.mocked(keptDataset).mockReset();
  vi.mocked(saveSolidDatasetAt).mockReset();
});

/** A prompt with no state of either kind. */
const NONE: PromptStates = { sm2: null, fsrs: null };

describe("listReviewStates", () => {
  it("returns an empty list when the document does not exist", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await expect(makeRepository().listReviewStates(deck)).resolves.toEqual(sm2s([]));
  });

  it("maps stored review states", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(reviewsDataset());
    await expect(makeRepository().listReviewStates(deck)).resolves.toEqual(sm2s([state]));
  });

  it("maps the FSRS-6 states beside them, each kind on its own", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(setThing(reviewsDataset(), namedFsrs(fsrs)));
    await expect(makeRepository().listReviewStates(deck)).resolves.toEqual({
      sm2: [state],
      fsrs: [fsrs],
    });
  });
});

describe("getReviewState", () => {
  it("returns null when the document does not exist", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await expect(
      makeRepository().getReviewState(deck, { cardId: "card-1", direction: "front-to-back" }),
    ).resolves.toEqual(NONE);
  });

  it("returns null when the card has no state", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(reviewsDataset());
    await expect(
      makeRepository().getReviewState(deck, { cardId: "card-unknown", direction: "front-to-back" }),
    ).resolves.toEqual(NONE);
  });

  it("returns the card's state", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(reviewsDataset());
    await expect(
      makeRepository().getReviewState(deck, { cardId: "card-1", direction: "front-to-back" }),
    ).resolves.toEqual({ sm2: state, fsrs: null });
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(setThing(reviewsDataset(), namedFsrs(fsrs)));
    await expect(
      makeRepository().getReviewState(deck, { cardId: "card-1", direction: "front-to-back" }),
    ).resolves.toEqual({ sm2: state, fsrs });
  });

  it("tells the card's two directions apart", async () => {
    const reverse: ReviewState = { ...state, direction: "back-to-front", due: "2026-10-01" };
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(setThing(reviewsDataset(), named(reverse)));
    const repository = makeRepository();
    await expect(
      repository.getReviewState(deck, { cardId: "card-1", direction: "back-to-front" }),
    ).resolves.toEqual({ sm2: reverse, fsrs: null });
    await expect(
      repository.getReviewState(deck, { cardId: "card-1", direction: "front-to-back" }),
    ).resolves.toEqual({ sm2: state, fsrs: null });
  });
});

describe("gradeReviewState", () => {
  it("creates the document on first save", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);

    await writeState(makeRepository(), deck, state);

    const [saveUrl, saved] = vi.mocked(saveSolidDatasetAt).mock.calls[0];
    expect(saveUrl).toBe(deck.reviewsDocumentUrl);
    const thing = getThing(saved as SolidDataset, `${deck.reviewsDocumentUrl}#card-1`)!;
    expect(toReviewState(thing, deck)).toEqual(state);
  });

  it("replaces the card's subject in an existing document", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(reviewsDataset());
    const updated: ReviewState = { ...state, repetitions: 3, due: "2026-10-10" };

    await writeState(makeRepository(), deck, updated);

    const [, saved] = vi.mocked(saveSolidDatasetAt).mock.calls[0];
    const thing = getThing(saved as SolidDataset, `${deck.reviewsDocumentUrl}#card-1`)!;
    expect(toReviewState(thing, deck)).toEqual(updated);
  });

  it("edits the document as last read or written, when its version is known, reading nothing", async () => {
    vi.mocked(keptDataset).mockReturnValue(reviewsDataset());
    const updated: ReviewState = { ...state, repetitions: 3, due: "2026-10-10" };

    await writeState(makeRepository(), deck, updated);

    expect(getSolidDatasetOrNull).not.toHaveBeenCalled();
    expect(keptDataset).toHaveBeenCalledWith(deck.reviewsDocumentUrl, expect.any(Function));
    const thing = getThing(savedDataset(), `${deck.reviewsDocumentUrl}#card-1`)!;
    expect(toReviewState(thing, deck)).toEqual(updated);
  });

  it("reads the document again and edits that once the version kept is out of date (412)", async () => {
    const other: ReviewState = { ...state, cardId: "card-2" };
    vi.mocked(keptDataset).mockReturnValue(reviewsDataset());
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(setThing(reviewsDataset(), named(other)));
    vi.mocked(saveSolidDatasetAt).mockRejectedValueOnce({ statusCode: 412 });

    await writeState(makeRepository(), deck, { ...state, repetitions: 3 });

    expect(getSolidDatasetOrNull).toHaveBeenCalledOnce();
    expect(saveSolidDatasetAt).toHaveBeenCalledTimes(2);
    const [, saved] = vi.mocked(saveSolidDatasetAt).mock.calls[1];
    expect(getThing(saved as SolidDataset, `${deck.reviewsDocumentUrl}#card-2`)).not.toBeNull();
  });

  it("passes on another failure of the edit of what is kept, reading nothing", async () => {
    vi.mocked(keptDataset).mockReturnValue(reviewsDataset());
    vi.mocked(saveSolidDatasetAt).mockRejectedValueOnce({ statusCode: 500 });

    await expect(writeState(makeRepository(), deck, state)).rejects.toEqual({
      statusCode: 500,
    });
    expect(getSolidDatasetOrNull).not.toHaveBeenCalled();
  });
});

describe("grading", () => {
  it("grades the state the document holds of the prompt, or none, and says what it wrote and of what", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(reviewsDataset());
    const grade = vi.fn(({ sm2: current }: PromptStates) => ({
      sm2: {
        ...(current ?? state),
        cardId: current === null ? "card-2" : current.cardId,
        repetitions: (current?.repetitions ?? 0) + 1,
      },
    }));
    const repository = makeRepository();

    await expect(
      repository.gradeReviewState(deck, { cardId: "card-1", direction: "front-to-back" }, grade),
    ).resolves.toEqual({
      state: { sm2: { ...state, repetitions: 3 } },
      current: { sm2: state, fsrs: null },
    });
    await expect(
      repository.gradeReviewState(deck, { cardId: "card-2", direction: "front-to-back" }, grade),
    ).resolves.toMatchObject({
      current: NONE,
      state: { sm2: { cardId: "card-2", repetitions: 1 } },
    });
  });

  it("grades again the state the document holds when read again after a 412: another device's grade is built on, not undone", async () => {
    const theirs: ReviewState = {
      ...state,
      repetitions: 5,
      lastReviewedAt: "2026-09-21T09:00:00.000Z",
    };
    vi.mocked(keptDataset).mockReturnValue(reviewsDataset());
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      setThing(mockSolidDatasetFrom(deck.reviewsDocumentUrl), named(theirs)),
    );
    vi.mocked(saveSolidDatasetAt).mockRejectedValueOnce({ statusCode: 412 });
    const grade = vi.fn(({ sm2: current }: PromptStates) => ({
      sm2: { ...current!, repetitions: current!.repetitions + 1 },
    }));

    const graded = await makeRepository().gradeReviewState(
      deck,
      { cardId: "card-1", direction: "front-to-back" },
      grade,
    );

    expect(grade.mock.calls.map(([current]) => current.sm2)).toEqual([state, theirs]);
    expect(graded).toEqual({
      state: { sm2: { ...theirs, repetitions: 6 } },
      current: { sm2: theirs, fsrs: null },
    });
    const [, saved] = vi.mocked(saveSolidDatasetAt).mock.calls[1];
    const thing = getThing(saved as SolidDataset, `${deck.reviewsDocumentUrl}#card-1`)!;
    expect(toReviewState(thing, deck)).toEqual({ ...theirs, repetitions: 6 });
  });
});

describe("applyReviewChanges", () => {
  const other: ReviewState = { ...state, cardId: "card-2" };

  function twoStates() {
    return setThing(reviewsDataset(), named(other));
  }

  it("saves and removes states in a single write", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(twoStates());
    const restored: ReviewState = { ...state, due: "2026-09-21" };

    await makeRepository().applyReviewChanges(deck, {
      save: [restored],
      remove: [{ cardId: "card-2", direction: "front-to-back" }],
    });

    expect(saveSolidDatasetAt).toHaveBeenCalledOnce();
    const [saveUrl, saved] = vi.mocked(saveSolidDatasetAt).mock.calls[0];
    expect(saveUrl).toBe(deck.reviewsDocumentUrl);
    const dataset = saved as SolidDataset;
    expect(toReviewState(getThing(dataset, `${deck.reviewsDocumentUrl}#card-1`)!, deck)).toEqual(
      restored,
    );
    expect(getThing(dataset, `${deck.reviewsDocumentUrl}#card-2`)).toBeNull();
  });

  it("checks the states it saves, and saves nothing when the check refuses", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(twoStates());
    const checkWrite = vi.fn(async () => {
      throw new Error("does not conform");
    });
    await expect(
      makeRepository(checkWrite).applyReviewChanges(deck, { save: [state], remove: [] }),
    ).rejects.toThrow("does not conform");
    expect(checkWrite).toHaveBeenCalledWith(
      expect.anything(),
      [`${deck.reviewsDocumentUrl}#card-1`],
      "pod",
    );
    await expect(writeState(makeRepository(checkWrite), deck, state)).rejects.toThrow(
      "does not conform",
    );
    expect(checkWrite).toHaveBeenLastCalledWith(
      expect.anything(),
      [`${deck.reviewsDocumentUrl}#card-1`],
      "pod",
    );
    expect(saveSolidDatasetAt).not.toHaveBeenCalled();
  });

  it("creates a deck's reviews document with its states in one write, each naming its card, checked first, reading nothing", async () => {
    const checkWrite = vi.fn(async () => undefined);
    const back: ReviewState = { ...state, direction: "back-to-front" };
    await makeRepository(checkWrite).createReviewStates(deck, sm2s([state, back]));
    expect(getSolidDatasetOrNull).not.toHaveBeenCalled();
    expect(checkWrite).toHaveBeenCalledWith(
      expect.anything(),
      [`${deck.reviewsDocumentUrl}#card-1`, `${deck.reviewsDocumentUrl}#card-1@back-to-front`],
      "pod",
    );
    expect(saveSolidDatasetAt).toHaveBeenCalledOnce();
    const [saveUrl, saved] = vi.mocked(saveSolidDatasetAt).mock.calls[0]!;
    expect(saveUrl).toBe(deck.reviewsDocumentUrl);
    const dataset = saved as SolidDataset;
    expect(toReviewState(getThing(dataset, `${deck.reviewsDocumentUrl}#card-1`)!, deck)).toEqual(
      state,
    );
    expect(
      getUrl(getThing(dataset, `${deck.reviewsDocumentUrl}#card-1@back-to-front`)!, SM.reviewOf),
    ).toBe(`${deck.cardsDocumentUrl}#card-1`);
  });

  it("does nothing when the reviews document does not exist and there is nothing to save", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await makeRepository().applyReviewChanges(deck, {
      save: [],
      remove: [{ cardId: "card-2", direction: "front-to-back" }],
    });
    expect(saveSolidDatasetAt).not.toHaveBeenCalled();
  });

  it("creates the reviews document for states to save, as a card moved in with its progress brings", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await makeRepository().applyReviewChanges(deck, { save: [state], remove: [] });
    const [url, saved] = vi.mocked(saveSolidDatasetAt).mock.calls[0];
    expect(url).toBe(deck.reviewsDocumentUrl);
    expect(
      toReviewState(getThing(saved as SolidDataset, `${deck.reviewsDocumentUrl}#card-1`)!, deck),
    ).toEqual(state);
  });
});

describe("states that name their card", () => {
  it("read a state another app named any way by its card and direction", async () => {
    const reverse: ReviewState = { ...state, direction: "back-to-front" };
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(documentOf(stateAt("rs-7", reverse)));
    await expect(
      makeRepository().getReviewState(deck, { cardId: "card-1", direction: "back-to-front" }),
    ).resolves.toEqual({ sm2: reverse, fsrs: null });
  });

  it("read one state per card and direction: the one named for it, else the first by IRI", async () => {
    const named: ReviewState = { ...state, due: "2026-10-01" };
    const first: ReviewState = { ...state, due: "2026-10-02" };
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      documentOf(
        stateAt("rs-9", { ...state, due: "2026-10-03" }),
        stateAt("card-1", named),
        stateAt("rs-1", first),
      ),
    );
    await expect(makeRepository().listReviewStates(deck)).resolves.toEqual(sm2s([named]));
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      documentOf(stateAt("rs-9", { ...state, due: "2026-10-03" }), stateAt("rs-1", first)),
    );
    await expect(makeRepository().listReviewStates(deck)).resolves.toEqual(sm2s([first]));
  });

  it("write a review onto the subject read for it, adding no second state", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(documentOf(stateAt("rs-7")));
    const updated: ReviewState = { ...state, repetitions: 3 };
    await writeState(makeRepository(), deck, updated);
    const saved = savedDataset();
    expect(getThing(saved, `${deck.reviewsDocumentUrl}#card-1`)).toBeNull();
    expect(toReviewState(getThing(saved, `${deck.reviewsDocumentUrl}#rs-7`)!, deck)).toEqual(
      updated,
    );
  });

  it("write every state naming its card, direction and SM-2", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await writeState(makeRepository(), deck, { ...state, direction: "back-to-front" });
    const thing = getThing(savedDataset(), `${deck.reviewsDocumentUrl}#card-1@back-to-front`)!;
    expect(getUrl(thing, SM.reviewOf)).toBe(`${deck.cardsDocumentUrl}#card-1`);
    expect(getUrl(thing, SM.reviewDirection)).toBe(SM.backToFront);
    expect(getUrl(thing, SM.scheduler)).toBe(SM.sm2);
  });

  it("never read, write over or remove another scheduler's state", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(documentOf(otherSchedulerAt("card-1")));
    const repository = makeRepository();
    await expect(repository.listReviewStates(deck)).resolves.toEqual(sm2s([]));
    await writeState(repository, deck, state);
    const saved = savedDataset();
    expect(getUrl(getThing(saved, `${deck.reviewsDocumentUrl}#card-1`)!, SM.scheduler)).toBe(FSRS);
    expect(toReviewState(getThing(saved, `${deck.reviewsDocumentUrl}#review-r1`)!, deck)).toEqual(
      state,
    );

    vi.mocked(saveSolidDatasetAt).mockReset();
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(saved as never);
    await repository.applyReviewChanges(deck, {
      save: [],
      remove: [{ cardId: "card-1", direction: "front-to-back" }],
    });
    expect(getThingAll(savedDataset()).map((thing) => thing.url)).toEqual([
      `${deck.reviewsDocumentUrl}#card-1`,
    ]);
  });

  it("write a new subject when the one named for the state holds another card's", async () => {
    const card2: ReviewState = { ...state, cardId: "card-2" };
    // Named #card-1, but of card 2 by its sm:reviewOf, which wins.
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(documentOf(stateAt("card-1", card2)));
    const repository = makeRepository(undefined, null);
    await expect(repository.listReviewStates(deck)).resolves.toEqual(sm2s([card2]));
    await writeState(repository, deck, state);
    const saved = savedDataset();
    expect(toReviewState(getThing(saved, `${deck.reviewsDocumentUrl}#card-1`)!, deck)).toEqual(
      card2,
    );
    const added = getThingAll(saved).find(
      (thing) => thing.url !== `${deck.reviewsDocumentUrl}#card-1`,
    )!;
    expect(added.url).toMatch(/#review-[0-9a-f-]{36}$/);
    expect(toReviewState(added, deck)).toEqual(state);
  });

  it("write over a state named for it that cannot be read, as before", async () => {
    const broken = buildThing(stateAt("card-1")).removeAll(SM.easeFactor).build();
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(documentOf(broken));
    await writeState(makeRepository(), deck, state);
    expect(getThingAll(savedDataset()).map((thing) => thing.url)).toEqual([
      `${deck.reviewsDocumentUrl}#card-1`,
    ]);
  });

  it("leave a second state of a card and direction a day reset removes, which the app never read", async () => {
    const reverse: ReviewState = { ...state, direction: "back-to-front" };
    const theirs: ReviewState = { ...state, due: "2026-10-05" };
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      documentOf(
        stateAt("card-1"),
        stateAt("rs-1", theirs),
        stateAt("rs-2", reverse),
        stateAt("card-2", { ...state, cardId: "card-2" }),
      ),
    );
    await makeRepository().applyReviewChanges(deck, {
      save: [],
      remove: [{ cardId: "card-1", direction: "front-to-back" }],
    });
    expect(getThingAll(savedDataset()).map((thing) => thing.url)).toEqual([
      `${deck.reviewsDocumentUrl}#rs-1`,
      `${deck.reviewsDocumentUrl}#rs-2`,
      `${deck.reviewsDocumentUrl}#card-2`,
    ]);
  });

  it("remove every SM-2 state of a card and direction, read or not, when asked for every one, another scheduler's kept", async () => {
    const reverse: ReviewState = { ...state, direction: "back-to-front" };
    const theirs: ReviewState = { ...state, due: "2026-10-05" };
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      documentOf(
        stateAt("card-1"),
        stateAt("rs-1", theirs),
        stateAt("rs-2", reverse),
        otherSchedulerAt("fsrs-1"),
        stateAt("card-2", { ...state, cardId: "card-2" }),
      ),
    );
    await makeRepository().applyReviewChanges(deck, {
      save: [],
      remove: [{ cardId: "card-1", direction: "front-to-back" }],
      every: true,
    });
    expect(getThingAll(savedDataset()).map((thing) => thing.url)).toEqual([
      `${deck.reviewsDocumentUrl}#rs-2`,
      `${deck.reviewsDocumentUrl}#fsrs-1`,
      `${deck.reviewsDocumentUrl}#card-2`,
    ]);
  });

  it("read a state naming its card in the cards document before an upgrade moved it, and write the link anew", async () => {
    const upgraded: Deck = { ...deck, cardsDocumentUrl: `${INSTANCE}decks/deck-1-u1.ttl` };
    // Written before the upgrade, its link to the card in deck-1.ttl.
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(documentOf(stateAt("rs-7")));
    const repository = makeRepository();
    await expect(repository.listReviewStates(upgraded)).resolves.toEqual(sm2s([state]));
    const updated: ReviewState = { ...state, repetitions: 3 };
    await writeState(repository, upgraded, updated);
    const thing = getThing(savedDataset(), `${deck.reviewsDocumentUrl}#rs-7`)!;
    expect(getUrl(thing, SM.reviewOf)).toBe(`${upgraded.cardsDocumentUrl}#card-1`);
    expect(getThingAll(savedDataset())).toHaveLength(1);
  });

  it("write many states in one save, each onto its own subject", async () => {
    const states = Array.from(
      { length: 300 },
      (_, i): ReviewState => ({ ...state, cardId: `card-${i}` }),
    );
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      documentOf(...states.slice(0, 150).map((s, i) => stateAt(`rs-${i}`, s))),
    );
    await makeRepository().applyReviewChanges(deck, {
      save: states.map((s) => ({ ...s, repetitions: 3 })),
      remove: [],
    });
    const saved = savedDataset();
    expect(getThingAll(saved)).toHaveLength(300);
    expect(toReviewState(getThing(saved, `${deck.reviewsDocumentUrl}#rs-7`)!, deck)).toMatchObject({
      cardId: "card-7",
      repetitions: 3,
    });
    expect(
      toReviewState(getThing(saved, `${deck.reviewsDocumentUrl}#card-200`)!, deck),
    ).toMatchObject({ repetitions: 3 });
  });
});

describe("FSRS-6 states, this app's own", () => {
  const key = { cardId: "card-1", direction: "front-to-back" } as const;
  const graded: FsrsState = { ...fsrs, stability: 21.5, due: "2026-10-12" };

  it("are graded with the SM-2 state in the same edit, each at its own subject, both checked", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(setThing(reviewsDataset(), namedFsrs(fsrs)));
    const checkWrite = vi.fn(async () => undefined);
    const next: ReviewState = { ...state, repetitions: 3 };
    const grade = vi.fn((_current: PromptStates) => ({ sm2: next, fsrs: graded }));
    await expect(makeRepository(checkWrite).gradeReviewState(deck, key, grade)).resolves.toEqual({
      state: { sm2: next, fsrs: graded },
      current: { sm2: state, fsrs },
    });
    expect(grade).toHaveBeenCalledWith({ sm2: state, fsrs });
    expect(saveSolidDatasetAt).toHaveBeenCalledOnce();
    const saved = savedDataset();
    const at = getThing(saved, `${deck.reviewsDocumentUrl}#card-1@fsrs6`)!;
    expect(toFsrsState(at, deck)).toEqual(graded);
    expect(getUrl(at, SM.scheduler)).toBe(SM.fsrs6);
    expect(toReviewState(getThing(saved, `${deck.reviewsDocumentUrl}#card-1`)!, deck)).toEqual(
      next,
    );
    expect(checkWrite).toHaveBeenCalledWith(
      saved,
      [`${deck.reviewsDocumentUrl}#card-1`, `${deck.reviewsDocumentUrl}#card-1@fsrs6`],
      "pod",
    );
  });

  it("are left as they are by a grade that gives none", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(setThing(reviewsDataset(), namedFsrs(fsrs)));
    await writeState(makeRepository(), deck, { ...state, repetitions: 3 });
    expect(
      toFsrsState(getThing(savedDataset(), `${deck.reviewsDocumentUrl}#card-1@fsrs6`)!, deck),
    ).toEqual(fsrs);
  });

  it("are written at a new subject when the one named for them holds something else", async () => {
    // Another app's subject where this app would name the FSRS-6 state.
    const theirs = buildThing({ url: `${deck.reviewsDocumentUrl}#card-1@fsrs6` })
      .addStringNoLocale("https://other.example/#note", "mine")
      .build();
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(documentOf(named(state), theirs));
    await makeRepository().applyReviewChanges(deck, {
      save: [],
      remove: [],
      fsrs: { save: [graded], remove: [] },
    });
    const saved = savedDataset();
    expect(toFsrsState(getThing(saved, `${deck.reviewsDocumentUrl}#review-r1`)!, deck)).toEqual(
      graded,
    );
    expect(getThing(saved, `${deck.reviewsDocumentUrl}#card-1@fsrs6`)).toEqual(theirs);
  });

  it("are written over at the subject named for them when it holds one that cannot be read", async () => {
    const broken = buildThing(namedFsrs(fsrs)).removeAll(SM.stability).build();
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(documentOf(named(state), broken));
    await makeRepository().applyReviewChanges(deck, {
      save: [],
      remove: [],
      fsrs: { save: [graded], remove: [] },
    });
    expect(getThingAll(savedDataset()).map((thing) => thing.url)).toEqual([
      `${deck.reviewsDocumentUrl}#card-1`,
      `${deck.reviewsDocumentUrl}#card-1@fsrs6`,
    ]);
  });

  it("are restored or removed by a day reset beside SM-2's, only the one read", async () => {
    const other: FsrsState = { ...fsrs, cardId: "card-2" };
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      documentOf(
        named(state),
        namedFsrs(fsrs),
        // A second FSRS-6 state of card 1, never read: it stays.
        toFsrsStateThing(
          deck,
          { ...fsrs, due: "2026-11-01" },
          null,
          `${deck.reviewsDocumentUrl}#x`,
        ),
        namedFsrs(other),
      ),
    );
    await makeRepository().applyReviewChanges(deck, {
      save: [],
      remove: [],
      fsrs: { save: [{ ...other, due: "2026-09-29" }], remove: [key] },
    });
    const saved = savedDataset();
    expect(getThingAll(saved).map((thing) => thing.url)).toEqual([
      `${deck.reviewsDocumentUrl}#card-1`,
      `${deck.reviewsDocumentUrl}#x`,
      `${deck.reviewsDocumentUrl}#card-2@fsrs6`,
    ]);
    expect(
      toFsrsState(getThing(saved, `${deck.reviewsDocumentUrl}#card-2@fsrs6`)!, deck)!.due,
    ).toBe("2026-09-29");
  });

  it("are created with SM-2's in a new document", async () => {
    await makeRepository().createReviewStates(deck, { sm2: [state], fsrs: [fsrs] });
    expect(getThingAll(savedDataset()).map((thing) => thing.url)).toEqual([
      `${deck.reviewsDocumentUrl}#card-1`,
      `${deck.reviewsDocumentUrl}#card-1@fsrs6`,
    ]);
  });

  it("create the reviews document when only FSRS-6 states are to be saved", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await makeRepository().applyReviewChanges(deck, {
      save: [],
      remove: [],
      fsrs: { save: [fsrs], remove: [] },
    });
    expect(getThingAll(savedDataset()).map((thing) => thing.url)).toEqual([
      `${deck.reviewsDocumentUrl}#card-1@fsrs6`,
    ]);
  });

  it("go with every state of their card, another scheduler's kept", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      documentOf(
        named(state),
        namedFsrs(fsrs),
        toFsrsStateThing(deck, fsrs, null, `${deck.reviewsDocumentUrl}#rs-2`),
        otherSchedulerAt("other-1"),
        namedFsrs({ ...fsrs, cardId: "card-2" }),
      ),
    );
    await makeRepository().applyReviewChanges(deck, { save: [], remove: [key], every: true });
    expect(getThingAll(savedDataset()).map((thing) => thing.url)).toEqual([
      `${deck.reviewsDocumentUrl}#other-1`,
      `${deck.reviewsDocumentUrl}#card-2@fsrs6`,
    ]);
  });

  it("stay when only the SM-2 state read is removed, without every", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(documentOf(named(state), namedFsrs(fsrs)));
    await makeRepository().applyReviewChanges(deck, { save: [], remove: [key] });
    expect(getThingAll(savedDataset()).map((thing) => thing.url)).toEqual([
      `${deck.reviewsDocumentUrl}#card-1@fsrs6`,
    ]);
  });
});

describe("upgradeReviewStates", () => {
  /** A state as an older app wrote it: format 1, at its own subject, another app's triple beside it. */
  function older(written: ReviewState) {
    return buildThing(named(written))
      .setInteger(SM.formatVersion, 1)
      .addStringNoLocale("https://other.example/#note", "kept")
      .build();
  }
  const current: ReviewState = { ...state, cardId: "card-2" };

  it("brings each outdated state up to this app's format as read, at its own subject, in one checked save", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(documentOf(older(state), named(current)));
    const checkWrite = vi.fn(async () => undefined);
    await expect(makeRepository(checkWrite).upgradeReviewStates(deck)).resolves.toBe(true);
    expect(saveSolidDatasetAt).toHaveBeenCalledOnce();
    const saved = savedDataset();
    const upgraded = getThing(saved, `${deck.reviewsDocumentUrl}#card-1`)!;
    expect(toReviewState(upgraded, deck)).toEqual(state);
    expect(upgraded.predicates["https://other.example/#note"]).toBeDefined();
    expect(checkWrite).toHaveBeenCalledWith(saved, [`${deck.reviewsDocumentUrl}#card-1`], "pod");
  });

  it("writes nothing when no state is outdated, or there is no reviews document", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(documentOf(named(current)));
    await expect(makeRepository().upgradeReviewStates(deck)).resolves.toBe(false);
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await expect(makeRepository().upgradeReviewStates(deck)).resolves.toBe(false);
    expect(saveSolidDatasetAt).not.toHaveBeenCalled();
  });
});

describe("writeFsrsStates", () => {
  const fsrsAt = `${deck.reviewsDocumentUrl}#card-1@fsrs6`;
  /** Each state made of the document's SM-2 states, as a switch makes them. */
  const fromSm2 = vi.fn(({ sm2 }: { sm2: ReviewState[] }) =>
    sm2.map((each): FsrsState => ({ ...fsrs, cardId: each.cardId, due: each.due })),
  );

  beforeEach(() => {
    fromSm2.mockClear();
  });

  it("writes the states made of the document as read, over the app's own, in one checked save", async () => {
    // A snapshot stays only when the state written has one.
    const { stability, difficulty, due } = fsrs;
    const snapshot = { stability, difficulty, due, lastReviewedAt: state.firstReviewedAt };
    const stale: FsrsState = { ...fsrs, stability: 1, previous: snapshot };
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(documentOf(named(state), namedFsrs(stale)));
    const checkWrite = vi.fn(async () => undefined);

    await makeRepository(checkWrite).writeFsrsStates(deck, fromSm2);

    expect(fromSm2).toHaveBeenCalledWith({ sm2: [state], fsrs: [stale] });
    expect(saveSolidDatasetAt).toHaveBeenCalledOnce();
    const saved = savedDataset();
    expect(toFsrsState(getThing(saved, fsrsAt)!, deck)).toEqual({ ...fsrs, due: state.due });
    expect(toReviewState(getThing(saved, `${deck.reviewsDocumentUrl}#card-1`)!, deck)).toEqual(
      state,
    );
    expect(checkWrite).toHaveBeenCalledWith(saved, [fsrsAt], "pod");
  });

  it("reads and makes the states again when the document changed meanwhile (412), three times in all", async () => {
    const theirs: ReviewState = { ...state, due: "2026-10-01" };
    vi.mocked(getSolidDatasetOrNull)
      .mockResolvedValueOnce(documentOf(named(state)))
      .mockResolvedValue(documentOf(named(theirs)));
    vi.mocked(saveSolidDatasetAt).mockRejectedValueOnce({ statusCode: 412 });

    await makeRepository().writeFsrsStates(deck, fromSm2);

    expect(fromSm2).toHaveBeenCalledTimes(2);
    const [, saved] = vi.mocked(saveSolidDatasetAt).mock.calls[1];
    expect(toFsrsState(getThing(saved as SolidDataset, fsrsAt)!, deck)?.due).toBe("2026-10-01");

    vi.mocked(saveSolidDatasetAt).mockReset().mockRejectedValue({ statusCode: 412 });
    await expect(makeRepository().writeFsrsStates(deck, fromSm2)).rejects.toThrow();
    expect(saveSolidDatasetAt).toHaveBeenCalledTimes(3);
  });

  it("passes on another failure at once", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(documentOf(named(state)));
    vi.mocked(saveSolidDatasetAt).mockRejectedValue({ statusCode: 500 });
    await expect(makeRepository().writeFsrsStates(deck, fromSm2)).rejects.toEqual({
      statusCode: 500,
    });
    expect(saveSolidDatasetAt).toHaveBeenCalledOnce();
  });

  it("writes nothing when there is no document, or no state to write", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await makeRepository().writeFsrsStates(deck, fromSm2);
    expect(fromSm2).not.toHaveBeenCalled();
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(documentOf());
    await makeRepository().writeFsrsStates(deck, fromSm2);
    expect(fromSm2).toHaveBeenCalledOnce();
    expect(saveSolidDatasetAt).not.toHaveBeenCalled();
  });
});
