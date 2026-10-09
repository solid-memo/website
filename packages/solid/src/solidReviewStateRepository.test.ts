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
import { getSolidDatasetOrNull } from "./datasets";
import {
  toReviewState,
  toReviewStateThing,
} from "./mappers/reviewStateMapper";
import type { Deck } from "@solid-memo/domain/deck";
import { namedReviewSubject } from "@solid-memo/domain/reviewRecord";
import type { ReviewState } from "@solid-memo/domain/review";
import { SM } from "./vocab";

const FSRS = "https://fsrs.example/ns#fsrs";

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

function reviewsDataset() {
  return setThing(
    mockSolidDatasetFrom(deck.reviewsDocumentUrl),
    named(state),
  );
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
  return toReviewStateThing(deck, written, null, namedReviewSubject(deck.reviewsDocumentUrl, written));
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
  return things.reduce((dataset, thing) => setThing(dataset, thing), mockSolidDatasetFrom(deck.reviewsDocumentUrl));
}

function savedDataset(): SolidDataset {
  return vi.mocked(saveSolidDatasetAt).mock.calls[0][1] as SolidDataset;
}

beforeEach(() => {
  vi.mocked(getSolidDatasetOrNull).mockReset();
  vi.mocked(saveSolidDatasetAt).mockReset();
});

describe("listReviewStates", () => {
  it("returns an empty list when the document does not exist", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await expect(makeRepository().listReviewStates(deck)).resolves.toEqual(
      [],
    );
  });

  it("maps stored review states", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(reviewsDataset());
    await expect(makeRepository().listReviewStates(deck)).resolves.toEqual([
      state,
    ]);
  });
});

describe("getReviewState", () => {
  it("returns null when the document does not exist", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await expect(
      makeRepository().getReviewState(deck, { cardId: "card-1", direction: "front-to-back" }),
    ).resolves.toBeNull();
  });

  it("returns null when the card has no state", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(reviewsDataset());
    await expect(
      makeRepository().getReviewState(deck, { cardId: "card-unknown", direction: "front-to-back" }),
    ).resolves.toBeNull();
  });

  it("returns the card's state", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(reviewsDataset());
    await expect(
      makeRepository().getReviewState(deck, { cardId: "card-1", direction: "front-to-back" }),
    ).resolves.toEqual(state);
  });

  it("tells the card's two directions apart", async () => {
    const reverse: ReviewState = { ...state, direction: "back-to-front", due: "2026-10-01" };
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      setThing(reviewsDataset(), named(reverse)),
    );
    const repository = makeRepository();
    await expect(
      repository.getReviewState(deck, { cardId: "card-1", direction: "back-to-front" }),
    ).resolves.toEqual(reverse);
    await expect(
      repository.getReviewState(deck, { cardId: "card-1", direction: "front-to-back" }),
    ).resolves.toEqual(state);
  });
});

describe("saveReviewState", () => {
  it("creates the document on first save", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);

    await makeRepository().saveReviewState(deck, state);

    const [saveUrl, saved] = vi.mocked(saveSolidDatasetAt).mock.calls[0];
    expect(saveUrl).toBe(deck.reviewsDocumentUrl);
    const thing = getThing(
      saved as SolidDataset,
      `${deck.reviewsDocumentUrl}#card-1`,
    )!;
    expect(toReviewState(thing, deck)).toEqual(state);
  });

  it("replaces the card's subject in an existing document", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(reviewsDataset());
    const updated: ReviewState = { ...state, repetitions: 3, due: "2026-10-10" };

    await makeRepository().saveReviewState(deck, updated);

    const [, saved] = vi.mocked(saveSolidDatasetAt).mock.calls[0];
    const thing = getThing(
      saved as SolidDataset,
      `${deck.reviewsDocumentUrl}#card-1`,
    )!;
    expect(toReviewState(thing, deck)).toEqual(updated);
  });
});

describe("applyReviewChanges", () => {
  const other: ReviewState = { ...state, cardId: "card-2" };

  function twoStates() {
    return setThing(
      reviewsDataset(),
      named(other),
    );
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
    expect(
      toReviewState(getThing(dataset, `${deck.reviewsDocumentUrl}#card-1`)!, deck),
    ).toEqual(restored);
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
    expect(checkWrite).toHaveBeenCalledWith(expect.anything(), [`${deck.reviewsDocumentUrl}#card-1`]);
    await expect(makeRepository(checkWrite).saveReviewState(deck, state)).rejects.toThrow("does not conform");
    expect(checkWrite).toHaveBeenLastCalledWith(expect.anything(), [`${deck.reviewsDocumentUrl}#card-1`]);
    expect(saveSolidDatasetAt).not.toHaveBeenCalled();
  });

  it("creates a deck's reviews document with its states in one write, each naming its card, checked first, reading nothing", async () => {
    const checkWrite = vi.fn(async () => undefined);
    const back: ReviewState = { ...state, direction: "back-to-front" };
    await makeRepository(checkWrite).createReviewStates(deck, [state, back]);
    expect(getSolidDatasetOrNull).not.toHaveBeenCalled();
    expect(checkWrite).toHaveBeenCalledWith(expect.anything(), [
      `${deck.reviewsDocumentUrl}#card-1`,
      `${deck.reviewsDocumentUrl}#card-1@back-to-front`,
    ]);
    expect(saveSolidDatasetAt).toHaveBeenCalledOnce();
    const [saveUrl, saved] = vi.mocked(saveSolidDatasetAt).mock.calls[0]!;
    expect(saveUrl).toBe(deck.reviewsDocumentUrl);
    const dataset = saved as SolidDataset;
    expect(toReviewState(getThing(dataset, `${deck.reviewsDocumentUrl}#card-1`)!, deck)).toEqual(state);
    expect(getUrl(getThing(dataset, `${deck.reviewsDocumentUrl}#card-1@back-to-front`)!, SM.reviewOf)).toBe(
      `${deck.cardsDocumentUrl}#card-1`,
    );
  });

  it("does nothing when the reviews document does not exist", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await makeRepository().applyReviewChanges(deck, {
      save: [state],
      remove: [{ cardId: "card-2", direction: "front-to-back" }],
    });
    expect(saveSolidDatasetAt).not.toHaveBeenCalled();
  });
});

describe("states that name their card", () => {
  it("read a state another app named any way by its card and direction", async () => {
    const reverse: ReviewState = { ...state, direction: "back-to-front" };
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(documentOf(stateAt("rs-7", reverse)));
    await expect(
      makeRepository().getReviewState(deck, { cardId: "card-1", direction: "back-to-front" }),
    ).resolves.toEqual(reverse);
  });

  it("read one state per card and direction: the one named for it, else the first by IRI", async () => {
    const named: ReviewState = { ...state, due: "2026-10-01" };
    const first: ReviewState = { ...state, due: "2026-10-02" };
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      documentOf(stateAt("rs-9", { ...state, due: "2026-10-03" }), stateAt("card-1", named), stateAt("rs-1", first)),
    );
    await expect(makeRepository().listReviewStates(deck)).resolves.toEqual([named]);
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      documentOf(stateAt("rs-9", { ...state, due: "2026-10-03" }), stateAt("rs-1", first)),
    );
    await expect(makeRepository().listReviewStates(deck)).resolves.toEqual([first]);
  });

  it("write a review onto the subject read for it, adding no second state", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(documentOf(stateAt("rs-7")));
    const updated: ReviewState = { ...state, repetitions: 3 };
    await makeRepository().saveReviewState(deck, updated);
    const saved = savedDataset();
    expect(getThing(saved, `${deck.reviewsDocumentUrl}#card-1`)).toBeNull();
    expect(toReviewState(getThing(saved, `${deck.reviewsDocumentUrl}#rs-7`)!, deck)).toEqual(updated);
  });

  it("write every state naming its card, direction and SM-2", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await makeRepository().saveReviewState(deck, { ...state, direction: "back-to-front" });
    const thing = getThing(savedDataset(), `${deck.reviewsDocumentUrl}#card-1@back-to-front`)!;
    expect(getUrl(thing, SM.reviewOf)).toBe(`${deck.cardsDocumentUrl}#card-1`);
    expect(getUrl(thing, SM.reviewDirection)).toBe(SM.backToFront);
    expect(getUrl(thing, SM.scheduler)).toBe(SM.sm2);
  });

  it("never read, write over or remove another scheduler's state", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(documentOf(otherSchedulerAt("card-1")));
    const repository = makeRepository();
    await expect(repository.listReviewStates(deck)).resolves.toEqual([]);
    await repository.saveReviewState(deck, state);
    const saved = savedDataset();
    expect(getUrl(getThing(saved, `${deck.reviewsDocumentUrl}#card-1`)!, SM.scheduler)).toBe(FSRS);
    expect(toReviewState(getThing(saved, `${deck.reviewsDocumentUrl}#review-r1`)!, deck)).toEqual(state);

    vi.mocked(saveSolidDatasetAt).mockReset();
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(saved as never);
    await repository.applyReviewChanges(deck, { save: [], remove: [{ cardId: "card-1", direction: "front-to-back" }] });
    expect(getThingAll(savedDataset()).map((thing) => thing.url)).toEqual([`${deck.reviewsDocumentUrl}#card-1`]);
  });

  it("write a new subject when the one named for the state holds another card's", async () => {
    const card2: ReviewState = { ...state, cardId: "card-2" };
    // Named #card-1, but of card 2 by its sm:reviewOf, which wins.
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(documentOf(stateAt("card-1", card2)));
    const repository = makeRepository(undefined, null);
    await expect(repository.listReviewStates(deck)).resolves.toEqual([card2]);
    await repository.saveReviewState(deck, state);
    const saved = savedDataset();
    expect(toReviewState(getThing(saved, `${deck.reviewsDocumentUrl}#card-1`)!, deck)).toEqual(card2);
    const added = getThingAll(saved).find((thing) => thing.url !== `${deck.reviewsDocumentUrl}#card-1`)!;
    expect(added.url).toMatch(/#review-[0-9a-f-]{36}$/);
    expect(toReviewState(added, deck)).toEqual(state);
  });

  it("write over a state named for it that cannot be read, as before", async () => {
    const broken = buildThing(stateAt("card-1")).removeAll(SM.easeFactor).build();
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(documentOf(broken));
    await makeRepository().saveReviewState(deck, state);
    expect(getThingAll(savedDataset()).map((thing) => thing.url)).toEqual([`${deck.reviewsDocumentUrl}#card-1`]);
  });

  it("leave a second state of a card and direction a day reset removes, which the app never read", async () => {
    const reverse: ReviewState = { ...state, direction: "back-to-front" };
    const theirs: ReviewState = { ...state, due: "2026-10-05" };
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      documentOf(stateAt("card-1"), stateAt("rs-1", theirs), stateAt("rs-2", reverse), stateAt("card-2", { ...state, cardId: "card-2" })),
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

  it("read a state naming its card in the cards document before an upgrade moved it, and write the link anew", async () => {
    const upgraded: Deck = { ...deck, cardsDocumentUrl: `${INSTANCE}decks/deck-1-u1.ttl` };
    // Written before the upgrade, its link to the card in deck-1.ttl.
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(documentOf(stateAt("rs-7")));
    const repository = makeRepository();
    await expect(repository.listReviewStates(upgraded)).resolves.toEqual([state]);
    const updated: ReviewState = { ...state, repetitions: 3 };
    await repository.saveReviewState(upgraded, updated);
    const thing = getThing(savedDataset(), `${deck.reviewsDocumentUrl}#rs-7`)!;
    expect(getUrl(thing, SM.reviewOf)).toBe(`${upgraded.cardsDocumentUrl}#card-1`);
    expect(getThingAll(savedDataset())).toHaveLength(1);
  });

  it("write many states in one save, each onto its own subject", async () => {
    const states = Array.from({ length: 300 }, (_, i): ReviewState => ({ ...state, cardId: `card-${i}` }));
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(documentOf(...states.slice(0, 150).map((s, i) => stateAt(`rs-${i}`, s))));
    await makeRepository().applyReviewChanges(deck, { save: states.map((s) => ({ ...s, repetitions: 3 })), remove: [] });
    const saved = savedDataset();
    expect(getThingAll(saved)).toHaveLength(300);
    expect(toReviewState(getThing(saved, `${deck.reviewsDocumentUrl}#rs-7`)!, deck)).toMatchObject({ cardId: "card-7", repetitions: 3 });
    expect(toReviewState(getThing(saved, `${deck.reviewsDocumentUrl}#card-200`)!, deck)).toMatchObject({ repetitions: 3 });
  });
});
