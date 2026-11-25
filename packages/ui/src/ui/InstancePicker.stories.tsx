// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { GUEST_INSTANCE_URL } from "@solid-memo/domain/guest";
import type { Instance } from "@solid-memo/domain/instance";
import { AskFirst, type LossQuestion } from "./askFirst";
import { InstancePicker } from "./InstancePicker";
import { REGISTRATION_OPTIONS } from "../test/fakes/instances";
import { storyInstance } from "../test/storyData";

/** Another instance in the user's pod. */
const languages: Instance = { url: "https://pod.example/solid-memo/languages/", name: "Languages" };

/** An instance on someone else's server, outside the user's storages. */
const shared: Instance = {
  url: "https://other-pod.example/solid-memo/team/",
  name: "Team decks, shared by a colleague for the onboarding of everyone who joins this year",
};

/** Asks as a dialog of the app's own would, the user confirming each question. */
const confirmEach = fn((question: LossQuestion) => question.onConfirm());

const meta = {
  title: "Instances/InstancePicker",
  component: InstancePicker,
  args: {
    instances: [storyInstance, languages, shared],
    options: REGISTRATION_OPTIONS,
    removable: fn((instance: Instance) => instance.url !== GUEST_INSTANCE_URL),
    deletable: fn((instance: Instance) => instance.url.startsWith("https://pod.example/")),
    outsidePod: fn((instance: Instance) => instance.url.startsWith("https://other-pod.example/")),
    busy: false,
    error: null,
    onSelect: fn(),
    newInstanceHref: "#/storages",
    onAttach: fn(),
    onDelete: fn(),
    onDetach: fn(),
  },
  parameters: { controls: { exclude: ["removable", "deletable", "outsidePod", "purpose"] } },
} satisfies Meta<typeof InstancePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The user's instances: two in their pod, one outside it that can't be deleted; one opened. */
export const Instances: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Languages" }));
    await expect(args.onSelect).toHaveBeenCalledWith(languages);
  },
};

/** What the instance is picked for, said under the heading. */
export const WithPurpose: Story = {
  args: { purpose: null },
  render: (args) => (
    <InstancePicker {...args} purpose="Pick the instance to publish the deck from." />
  ),
};

/** No instances yet. */
export const Empty: Story = { args: { instances: [] } };

/** A guest's own instance, kept in the browser: it can only be deleted. */
export const Guest: Story = {
  args: {
    instances: [{ url: GUEST_INSTANCE_URL, name: "Trying it out" }],
    deletable: fn((instance: Instance) => instance.url === GUEST_INSTANCE_URL),
  },
};

/** An instance taken off the list once the user confirms it. */
export const Remove: Story = {
  render: (args) => (
    <AskFirst.Provider value={confirmEach}>
      <InstancePicker {...args} />
    </AskFirst.Provider>
  ),
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: /remove.*languages/i }),
    );
    await expect(args.onDetach).toHaveBeenCalledWith(languages);
  },
};

/** An instance on its way out: its buttons wait. */
export const Busy: Story = { args: { busy: true } };

/** A deletion kept the folder, as it holds the instance's releases, and some documents. */
export const KeptFolder: Story = {
  args: {
    instances: [storyInstance],
    keptFolder: "https://pod.example/solid-memo/languages/",
    keptReleases: true,
    keptDocuments: 2,
  },
};

/** Attaching an instance failed. */
export const AttachFailed: Story = {
  args: {
    error:
      "That address is not a Solid Memo instance. Check that you pasted the address of an instance's folder, ending in /.",
  },
};
