// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { render } from "preact";
import { expect, fn, spyOn, userEvent, waitFor, within } from "storybook/test";
import { AppError } from "@solid-memo/domain/appError";
import { POD_PROVIDERS } from "@solid-memo/domain/podProvider";
import type { Session } from "@solid-memo/domain/session";
import { AppShell, SOLID_MEMO, STUDIO, type WorkspaceProps } from "./App";
import { MAIN_ID } from "./SkipLink";
import { makeUseCasesFake } from "../test/useCasesFake";
import { storyWebId, storyWebIdDocument } from "../test/stories/webId";

const session: Session = { webId: storyWebId };

/** A workspace of the story's own: the masthead it is given, then what it is given to start with. */
function StoryWorkspace({ session, banner, children }: WorkspaceProps) {
  return (
    <>
      <header class="site-header">{banner}</header>
      <main id={MAIN_ID}>
        {children}
        <p>The workspace of {session.webId}</p>
      </main>
    </>
  );
}

/** A workspace that fails as it renders, as a screen with a bug would. */
function BrokenWorkspace(): never {
  throw new Error("The deck list failed to render.");
}

/** Restored on this device: the learner, already logged in. */
const restoredUseCases = makeUseCasesFake({
  restoreSession: fn(async () => ({ session, origin: "restored" as const })),
  viewWebIdDocument: fn(async () => storyWebIdDocument),
});

const meta = {
  title: "App/AppShell",
  component: AppShell,
  args: {
    useCases: makeUseCasesFake(),
    source: {
      repoUrl: "https://github.com/solid-memo/website",
      version: "0.0.0",
      commitSha: "8faa7e1bd2e6de2b6570d692fd2865bb4b3217ad",
    },
    providers: POD_PROVIDERS,
    identity: SOLID_MEMO,
    workspace: StoryWorkspace,
  },
  parameters: {
    controls: { exclude: ["useCases", "source", "providers", "identity", "workspace"] },
  },
  // The app is taken down after the story, so its listeners (the hash, the browser's
  // theme) don't follow the next one, and the page's title put back.
  beforeEach: ({ canvasElement }) => {
    const title = document.title;
    return () => {
      render(null, canvasElement);
      document.title = title;
    };
  },
} satisfies Meta<typeof AppShell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The landing page, signed out: try as a guest, the maker's note, log in, create a Pod. */
export const Landing: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("heading", { name: "Log in with your Pod" }),
    ).toBeInTheDocument();
  },
};

/** The session being restored. */
export const RestoringSession: Story = {
  args: {
    useCases: makeUseCasesFake({ restoreSession: fn(() => new Promise<never>(() => {})) }),
  },
  play: async ({ args, canvasElement }) => {
    await waitFor(() => expect(args.useCases.restoreSession).toHaveBeenCalled());
    await expect(within(canvasElement).getByText("Restoring session…")).toBeInTheDocument();
  },
};

/** Logged in: the masthead with the profile's name above the workspace; logging out goes back to the landing. */
export const SignedIn: Story = {
  args: { useCases: restoredUseCases },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(`The workspace of ${storyWebId}`)).toBeInTheDocument();
    await expect(await canvas.findByText("Alice")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Log out" }));
    await expect(args.useCases.logout).toHaveBeenCalled();
    await expect(
      await canvas.findByRole("heading", { name: "Log in with your Pod" }),
    ).toBeInTheDocument();
  },
};

/** Just back from logging in: the connected Pod, then on into the workspace. */
export const Connected: Story = {
  args: {
    useCases: makeUseCasesFake({
      restoreSession: fn(async () => ({ session, origin: "login" as const })),
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Continue" }));
    await expect(await canvas.findByText(`The workspace of ${storyWebId}`)).toBeInTheDocument();
  },
};

/** A guest's study started from the landing, with the guest's masthead and the question before discarding it. */
export const Guest: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Try it without logging in" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Discard" }));
    await expect(await canvas.findByRole("button", { name: "Delete it" })).toBeInTheDocument();
  },
};

/** The provider never sent the learner back: a link back to it, and the stored session to forget. */
export const ProviderNotReturning: Story = {
  args: {
    useCases: makeUseCasesFake({
      restoreSession: fn(async () => {
        throw new AppError("restoreNotReturned", { issuer: "https://pod.example/" });
      }),
      hasStoredSession: fn(async () => true),
    }),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText(/Your provider did not send you back/),
    ).toBeInTheDocument();
    await userEvent.click(await canvas.findByRole("button", { name: "Forget this session" }));
    await waitFor(() => expect(args.useCases.forgetStoredSession).toHaveBeenCalled());
  },
};

/** Logging in at a provider stopped: the landing says why. */
export const LoginFailed: Story = {
  args: {
    useCases: makeUseCasesFake({
      loginWithProvider: fn(async () => {
        throw new AppError("loginProviderRefused");
      }),
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: POD_PROVIDERS[0]!.name }));
    await expect(
      await canvas.findByText(/Your provider's settings name an address/),
    ).toBeInTheDocument();
  },
};

/** A workspace that fails while it renders gives way to "Something went wrong" under the masthead. */
export const WorkspaceFailed: Story = {
  args: { useCases: restoredUseCases, workspace: BrokenWorkspace },
  // The boundary logs what failed: kept out of the story's console.
  beforeEach: () => {
    const quiet = spyOn(console, "error").mockImplementation(fn());
    return () => quiet.mockRestore();
  },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("button", { name: "Log out" }),
    ).toBeInTheDocument();
  },
};

/** The Studio's landing, under its own name, with its way back to Solid Memo. */
export const StudioLanding: Story = {
  args: { identity: STUDIO },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("link", { name: "Back to Solid Memo" }),
    ).toBeInTheDocument();
  },
};
