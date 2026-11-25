// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { AppError } from "@solid-memo/domain/appError";
import { GUEST_INSTANCE_URL, GUEST_SESSION } from "@solid-memo/domain/guest";
import type { Instance } from "@solid-memo/domain/instance";
import { AskFirst, type LossQuestion } from "./askFirst";
import { InstancePickerContainer } from "./InstancePickerContainer";
import { makeUseCasesFake } from "../test/useCasesFake";
import { storyInstance } from "../test/storyData";

/** Another instance in the user's pod. */
const languages: Instance = { url: "https://pod.example/solid-memo/languages/", name: "Languages" };

/** The user's storages, where their instances are. */
const listStorages = () =>
  fn(async () => [{ url: "https://pod.example/", source: "profile" as const }]);

/** Asks as a dialog of the app's own would, the user confirming each question. */
const confirmEach = fn((question: LossQuestion) => question.onConfirm());

const meta = {
  title: "Instances/InstancePickerContainer",
  component: InstancePickerContainer,
  args: {
    useCases: makeUseCasesFake({ listStorages: listStorages() }),
    session: { webId: "https://pod.example/profile/card#me" },
    instances: [storyInstance, languages],
    newInstanceHref: "#/storages",
    onOpen: fn(),
  },
  parameters: { controls: { exclude: ["useCases", "session", "purpose"] } },
} satisfies Meta<typeof InstancePickerContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The user's instances in their pod, each one to open, remove or delete. */
export const Instances: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("button", { name: /delete.*languages/i }),
    ).toBeInTheDocument();
  },
};

/** An instance deleted once confirmed: its folder kept, as it holds another app's files. */
export const Deleted: Story = {
  args: {
    useCases: makeUseCasesFake({
      listStorages: listStorages(),
      deleteInstance: fn(async () => ({
        keptFolder: languages.url,
        keptReleases: false,
        keptDocuments: [],
      })),
    }),
  },
  render: (args) => (
    <AskFirst.Provider value={confirmEach}>
      <InstancePickerContainer {...args} />
    </AskFirst.Provider>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: /delete.*languages/i }));
    await expect(await canvas.findByText(/another app put files there/)).toBeInTheDocument();
  },
};

/** Attaching an instance by an address that isn't one. */
export const AttachFailed: Story = {
  args: {
    useCases: makeUseCasesFake({
      listStorages: listStorages(),
      attachInstanceByUrl: fn(async () => {
        throw new AppError("notAnInstanceNoMeta");
      }),
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText(/attach/i, { selector: "summary" }));
    await userEvent.type(canvas.getByRole("textbox"), "https://pod.example/notes/");
    await userEvent.click(canvas.getByRole("button", { name: /^attach/i }));
    await expect(await canvas.findByRole("alert")).toBeInTheDocument();
  },
};

/** A guest's own instance: only offered to delete. */
export const Guest: Story = {
  args: {
    useCases: makeUseCasesFake({
      listStorages: fn(async () => [
        { url: "https://guest.solid-memo.invalid/", source: "profile" as const },
      ]),
    }),
    session: GUEST_SESSION,
    instances: [{ url: GUEST_INSTANCE_URL, name: "Trying it out" }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("button", { name: /delete.*trying it out/i }),
    ).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: /remove/i })).toBeNull();
  },
};

/** What the instance is picked for, said under the heading. */
export const WithPurpose: Story = {
  args: { purpose: null },
  render: (args) => (
    <InstancePickerContainer {...args} purpose="Pick the instance to open in the Studio." />
  ),
};
