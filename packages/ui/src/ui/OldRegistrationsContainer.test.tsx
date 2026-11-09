// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Instance, OldRegistrations } from "@solid-memo/domain/instance";
import { OldRegistrationsContainer } from "./OldRegistrationsContainer";
import { makeUseCasesFake } from "../test/useCasesFake";

const instance: Instance = { url: "https://pod.example/solid-memo/main/", name: "Main" };
const session = { webId: "https://alice.example/profile/card#me" };

function renderContainer(useCases: UseCases) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <OldRegistrationsContainer useCases={useCases} session={session} instance={instance} />
    </QueryClientProvider>,
  );
}

const some: OldRegistrations = {
  registrations: [
    { dataClass: "catalog", index: "private" },
    { dataClass: "reviewState", index: "private" },
    { dataClass: "draft", index: "private" },
    { dataClass: "deck", index: "public" },
    { dataClass: "card", index: "public" },
    { dataClass: "answer", index: "public" },
  ],
  unreadableIndexes: [],
};
const none: OldRegistrations = { registrations: [], unreadableIndexes: [] };

describe("OldRegistrationsContainer", () => {
  it("lists the registrations earlier versions wrote, and removes them on the user's say, then says so", async () => {
    const removeOldRegistrations = vi.fn(async () => undefined);
    const useCases = makeUseCasesFake({
      oldRegistrations: vi
        .fn<UseCases["oldRegistrations"]>()
        .mockResolvedValueOnce(some)
        .mockResolvedValue(none),
      removeOldRegistrations,
    });
    renderContainer(useCases);
    const section = await screen.findByRole("region", { name: "Old registrations" });
    expect(section).toHaveTextContent(
      "It now registers only the instance, and reaches the rest from it. Removing these changes none of your data, and removes only Solid Memo's own entries.",
    );
    expect(
      within(section)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "This instance's catalog of decks: in your private type index",
      "Review states: in your private type index",
      "Drafts of releases: in your private type index",
      "Decks: in your public type index",
      "Cards: in your public type index",
      "Answers: in your public type index",
    ]);
    expect(useCases.oldRegistrations).toHaveBeenCalledWith(session, instance);
    // Nothing is removed until asked.
    expect(removeOldRegistrations).not.toHaveBeenCalled();

    fireEvent.click(within(section).getByRole("button", { name: "Remove old registrations" }));
    const status = await within(section).findByText("Removed.");
    expect(status).toHaveAttribute("role", "status");
    // The button that had the focus is gone; the note takes it.
    await waitFor(() => expect(status).toHaveFocus());
    expect(removeOldRegistrations).toHaveBeenCalledExactlyOnceWith(session, instance);
    expect(within(section).queryByRole("list")).toBeNull();
    expect(within(section).queryByRole("button")).toBeNull();
    expect(section).not.toHaveTextContent("Earlier versions");
    expect(screen.getByRole("region", { name: "Old registrations" })).toBe(section);
  });

  it("shows nothing while reading, nor when there are none, nor when they cannot be read", async () => {
    for (const oldRegistrations of [
      vi.fn(async () => none),
      vi.fn(async (): Promise<OldRegistrations> => {
        throw new Error("403 Forbidden");
      }),
    ]) {
      const useCases = makeUseCasesFake({ oldRegistrations });
      const { container, unmount } = renderContainer(useCases);
      expect(container).toBeEmptyDOMElement();
      await waitFor(() => expect(oldRegistrations).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it("says which type index could not be read, with nothing to remove from it", async () => {
    const useCases = makeUseCasesFake({
      oldRegistrations: vi.fn(async () => ({
        registrations: [],
        unreadableIndexes: ["public" as const],
      })),
    });
    renderContainer(useCases);
    const section = await screen.findByRole("region", { name: "Old registrations" });
    expect(
      within(section).getByText(
        "Your public type index could not be read, so what it holds is not shown here, and nothing is removed from it.",
      ),
    ).toBeInTheDocument();
    expect(within(section).queryByRole("list")).toBeNull();
    expect(within(section).queryByRole("button")).toBeNull();
  });

  it("says it is removing, and shows what went wrong", async () => {
    let fail: (error: Error) => void = () => undefined;
    const useCases = makeUseCasesFake({
      oldRegistrations: vi.fn(async () => ({ ...some, unreadableIndexes: ["public" as const] })),
      removeOldRegistrations: vi.fn(
        () =>
          new Promise<void>((_, reject) => {
            fail = reject;
          }),
      ),
    });
    renderContainer(useCases);
    fireEvent.click(await screen.findByRole("button", { name: "Remove old registrations" }));
    expect(await screen.findByRole("button", { name: "Removing…" })).toBeDisabled();
    fail(new Error("The index refused"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("The index refused"));
    expect(screen.getByRole("button", { name: "Remove old registrations" })).toBeEnabled();
    expect(screen.getByText(/Your public type index could not be read/)).toBeInTheDocument();
  });
});
