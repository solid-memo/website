// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import type { UseCases } from "@solid-memo/application/useCases";
import { AppError } from "@solid-memo/domain/appError";
import type { GuestTransferProgress } from "@solid-memo/domain/guest";
import type { Instance } from "@solid-memo/domain/instance";
import type { Session } from "@solid-memo/domain/session";
import { GuestStudyOffer } from "./GuestStudyOffer";
import { makeUseCasesFake } from "../test/useCasesFake";
import { arabicDeck, kanjiDeck, koreanDeck } from "../test/storyData";

/** The user logged in, where a guest studied before. */
const session: Session = { webId: "https://pod.example/profile/card#me" };

/** The instance the guest studied in. */
const guestInstance: Instance = {
  url: "https://guest.solid-memo.invalid/solid-memo/",
  name: "My study",
};

/** An instance the user has in their Pod. */
const main: Instance = { url: "https://pod.example/solid-memo/main/", name: "Main" };

/** Where a new instance would go. */
const newInstanceUrl = "https://pod.example/solid-memo/main/";

/** A guest who studied three decks, and a user whose Pod has a storage and no instance yet. */
function guestFake(overrides: Partial<UseCases> = {}): UseCases {
  return makeUseCasesFake({
    findGuestStudy: fn(async () => ({ instances: [{ instance: guestInstance, deckCount: 3 }] })),
    listStorages: fn(async () => [{ url: "https://pod.example/", source: "profile" as const }]),
    ...overrides,
  });
}

/** Opens the form that moves the study into a new instance, once it knows where. */
async function openNewInstanceForm(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(await canvas.findByRole("button", { name: "Move it into my Pod" }));
  const location = await canvas.findByLabelText("Location in your Pod");
  await waitFor(() => expect(location).toHaveValue(newInstanceUrl));
  return canvas;
}

/** Opens the form that adds the study to the user's instance, once it read the decks. */
async function openMergeForm(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(await canvas.findByRole("button", { name: "Move it into my Pod" }));
  await canvas.findByRole("group", { name: "Decks to add" });
  return canvas;
}

/** A user with an instance, and the guest's decks, one already there from the same release. */
const mergeUseCases = {
  listInstances: fn(async () => [main]),
  planGuestMerge: fn(async () => ({
    decks: [
      { deck: kanjiDeck, sameRelease: [] },
      { deck: arabicDeck, sameRelease: [] },
      { deck: koreanDeck, sameRelease: [{ ...koreanDeck, url: `${main.url}catalog.ttl#korean` }] },
    ],
    drafts: 2,
  })),
};

const meta = {
  title: "Study/GuestStudyOffer",
  component: GuestStudyOffer,
  args: { useCases: guestFake(), session },
  parameters: { controls: { exclude: ["useCases", "session"] } },
} satisfies Meta<typeof GuestStudyOffer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The offer: the study the guest left, to move, discard or leave for now. */
export const Offer: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Not now" }));
    await expect(canvas.queryByRole("region")).toBeNull();
  },
};

/** Discarding asks first. */
export const DiscardQuestion: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Discard it" }));
    await expect(canvas.getByText(/This cannot be undone/)).toBeInTheDocument();
  },
};

/** The study couldn't be read: it can still be discarded. */
export const ReadFailed: Story = {
  args: {
    useCases: guestFake({
      findGuestStudy: fn(async () => {
        throw new AppError("podNoAnswer");
      }),
    }),
  },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(/did not answer in time/),
    ).toBeInTheDocument();
  },
};

/** The guest's pod holds no instance of its own: nothing to move, only to discard. */
export const NothingToMove: Story = {
  args: { useCases: guestFake({ findGuestStudy: fn(async () => ({ instances: [] })) }) },
};

/** A move cut off by a closed tab left a copy, offered for removal above the offer. */
export const InterruptedMove: Story = {
  args: {
    useCases: guestFake({ findInterruptedGuestMove: fn(async () => newInstanceUrl) }),
  },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("region", { name: "Interrupted move" }),
    ).toBeInTheDocument();
  },
};

/** The form for a user with no instance: where in their Pod a new one goes. */
export const NewInstanceForm: Story = {
  play: async ({ canvasElement }) => {
    await openNewInstanceForm(canvasElement);
  },
};

/** The form for a user with an instance: the guest's decks to add to it, one already there. */
export const AddToInstanceForm: Story = {
  args: { useCases: guestFake(mergeUseCases) },
  play: async ({ canvasElement }) => {
    await openMergeForm(canvasElement);
  },
};

/** The move under way, step by step. */
export const Moving: Story = {
  args: {
    useCases: guestFake({
      transferGuestStudy: fn(
        (
          _session: Session,
          _instance: Instance,
          _target: unknown,
          onProgress?: (progress: GuestTransferProgress) => void,
        ) => {
          onProgress!({ step: "copy", done: 1, total: 7, part: { done: 1, total: 4 } });
          return new Promise<never>(() => {});
        },
      ),
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = await openNewInstanceForm(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Move it" }));
    await expect(await canvas.findByText("Copying your study…")).toBeInTheDocument();
  },
};

/** The move done: the study is in the Pod now, and its instance opens. */
export const Moved: Story = {
  beforeEach: () => {
    const before = window.location.href;
    return () => window.history.replaceState(window.history.state, "", before);
  },
  play: async ({ canvasElement }) => {
    const canvas = await openNewInstanceForm(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Move it" }));
    await waitFor(() => expect(window.location.hash).toContain(encodeURIComponent(newInstanceUrl)));
  },
};

/** The move failed: where, why, and that the study is still here. */
export const MoveFailed: Story = {
  args: {
    useCases: guestFake({
      transferGuestStudy: fn(async () => ({
        ok: false as const,
        step: "copy" as const,
        error: new AppError("alreadyExists", { url: newInstanceUrl }),
        cleanedUp: true,
      })),
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = await openNewInstanceForm(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Move it" }));
    await expect(await canvas.findByRole("region", { name: "Moving failed" })).toBeInTheDocument();
  },
};

/** Adding to the instance failed: which decks are there now, whole. */
export const AddFailed: Story = {
  args: {
    useCases: guestFake({
      ...mergeUseCases,
      mergeGuestStudy: fn(async () => ({
        ok: false as const,
        instance: main,
        step: "decks" as const,
        error: new AppError("guestStudyChanged"),
        added: [{ ...kanjiDeck, url: `${main.url}catalog.ttl#kanji` }],
        copied: [],
      })),
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = await openMergeForm(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Add to Main" }));
    await expect(await canvas.findByRole("region", { name: "Adding failed" })).toBeInTheDocument();
  },
};
