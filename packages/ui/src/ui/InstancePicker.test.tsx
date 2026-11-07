// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/preact";
import { statusTexts } from "../test/liveRegions";
import { InstancePicker } from "./InstancePicker";
import type { Instance } from "@solid-memo/domain/instance";

const instances: Instance[] = [
  { url: "https://pod.example/solid-memo/a/", name: "Deck set A" },
  { url: "https://pod.example/solid-memo/b/", name: "Deck set B" },
];

function renderPicker(overrides: Partial<Parameters<typeof InstancePicker>[0]> = {}) {
  const props = {
    instances,
    options: { privateIndexExists: true, publicIndexExists: true },
    busy: false,
    error: null,
    onSelect: vi.fn(),
    newInstanceHref: "#/storages",
    onAttach: vi.fn(),
    onDelete: vi.fn(),
    onDetach: vi.fn(),
    removable: () => true,
    deletable: () => true,
    outsidePod: () => false,
    ...overrides,
  };
  const view = render(<InstancePicker {...props} />);
  return { ...view, props };
}

describe("InstancePicker", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists instances and selects one", () => {
    const { props } = renderPicker();
    fireEvent.click(screen.getByRole("button", { name: "Deck set A" }));
    expect(props.onSelect).toHaveBeenCalledWith(instances[0]);
  });

  it("says what an instance is, under its heading", () => {
    renderPicker();
    expect(screen.getByText(/^An instance is one collection of your decks/)).toHaveClass("hint");
  });

  it("shows an empty state when there are no instances", () => {
    renderPicker({ instances: [] });
    expect(screen.getByText("No instances are registered yet.")).toBeInTheDocument();
  });

  it("links every instance's folder in the Pod, in its row", () => {
    renderPicker();
    const rows = within(screen.getByRole("list")).getAllByRole("listitem");
    instances.forEach((instance, index) => {
      expect(
        within(rows[index]!).getByRole("link", { name: "Open in your Pod (opens in a new tab)" }),
      ).toHaveAttribute("href", instance.url);
    });
  });

  it("says a guest's instance is kept in this browser, and links nowhere", () => {
    renderPicker({
      instances: [{ url: "https://guest.solid-memo.invalid/solid-memo/", name: "My study" }],
    });
    expect(screen.getByText("Kept in this browser")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open in your Pod" })).toBeNull();
  });

  it("links to the new-instance flow", () => {
    renderPicker();
    expect(screen.getByRole("link", { name: "New instance…" })).toHaveAttribute(
      "href",
      "#/storages",
    );
  });

  it("attaches an existing instance with the chosen target", () => {
    const { props, container } = renderPicker();
    fireEvent.input(screen.getByLabelText("Instance container URL"), {
      target: { value: " https://pod.example/solid-memo/c/ " },
    });
    fireEvent.click(screen.getByLabelText("Public type index"));
    fireEvent.submit(container.querySelector("form")!);
    expect(props.onAttach).toHaveBeenCalledWith("https://pod.example/solid-memo/c/", "public");
  });

  it("disables controls while busy and shows errors", () => {
    renderPicker({ busy: true, error: "attach failed" });
    expect(screen.getByRole("button", { name: "Deck set A" })).toBeDisabled();
    // Only aria-disabled, so the button pressed keeps the focus.
    expect(screen.getByRole("button", { name: "Attach" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Delete instance Deck set A" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByText("attach failed")).toBeInTheDocument();
  });

  it("ignores Attach and Delete while busy", () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    const { props, container } = renderPicker({ busy: true });
    fireEvent.submit(container.querySelector("form")!);
    fireEvent.click(screen.getByRole("button", { name: "Delete instance Deck set A" }));
    expect(props.onAttach).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("once an instance is deleted, focuses the one now in its row and says it is gone", () => {
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    const three = [...instances, { url: "https://pod.example/solid-memo/c/", name: "Deck set C" }];
    const { props, rerender } = renderPicker({ instances: three });
    const del = screen.getByRole("button", { name: "Delete instance Deck set B" });
    del.focus();
    fireEvent.click(del);
    rerender(<InstancePicker {...props} busy />);
    expect(del).toHaveFocus();
    // Gone from the list before the mutation settles: the focus waits for it.
    rerender(<InstancePicker {...props} instances={[three[0], three[2]]} busy />);
    expect(statusTexts()).toEqual([]);
    rerender(<InstancePicker {...props} instances={[three[0], three[2]]} busy={false} />);
    expect(screen.getByRole("button", { name: "Deck set C" })).toHaveFocus();
    expect(statusTexts()).toEqual(['Deleted the instance "Deck set B".']);
  });

  it("focuses the instance before when the last is deleted, and New instance when none is left", () => {
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    const { props, rerender } = renderPicker();
    fireEvent.click(screen.getByRole("button", { name: "Delete instance Deck set B" }));
    rerender(<InstancePicker {...props} instances={[instances[0]]} />);
    expect(screen.getByRole("button", { name: "Deck set A" })).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "Delete instance Deck set A" }));
    expect(statusTexts()).toEqual([]);
    rerender(<InstancePicker {...props} instances={[]} />);
    expect(screen.getByRole("link", { name: "New instance…" })).toHaveFocus();
    expect(statusTexts()).toEqual(['Deleted the instance "Deck set A".']);
  });

  it("leaves the focus be when a deletion fails", () => {
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    const { props, rerender } = renderPicker();
    const del = screen.getByRole("button", { name: "Delete instance Deck set A" });
    del.focus();
    fireEvent.click(del);
    rerender(<InstancePicker {...props} busy />);
    rerender(<InstancePicker {...props} error="refused" />);
    expect(del).toHaveFocus();
    expect(statusTexts()).toEqual([]);
  });

  it("offers every instance to remove from the list, and to delete only one in the user's storages", () => {
    renderPicker({ deletable: (instance) => instance === instances[1] });
    const [own, elsewhere] = [
      screen.getByRole("button", { name: "Delete instance Deck set B" }),
      screen.queryByRole("button", { name: "Delete instance Deck set A" }),
    ];
    expect(own).toBeInTheDocument();
    expect(elsewhere).not.toBeInTheDocument();
    for (const { name } of instances)
      expect(
        screen.getByRole("button", { name: `Remove from my list: ${name}` }),
      ).toHaveTextContent("Remove from my list…");
  });

  it("says why a row outside the user's Pod has no delete, and only there", () => {
    renderPicker({ outsidePod: (instance) => instance === instances[0] });
    const [outside, inside] = within(screen.getByRole("list")).getAllByRole("listitem");
    const hint = "Outside your Pod, so Solid Memo cannot delete it.";
    expect(within(outside!).getByText(hint)).toHaveClass("hint");
    expect(within(inside!).queryByText(hint)).toBeNull();
  });

  it("says nothing is removed when the row went but the removal failed, and still moves the focus", () => {
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    const { props, rerender } = renderPicker();

    fireEvent.click(screen.getByRole("button", { name: "Remove from my list: Deck set A" }));
    rerender(<InstancePicker {...props} instances={[instances[1]!]} error="the index refused" />);

    expect(screen.getByRole("button", { name: "Deck set B" })).toHaveFocus();
    expect(statusTexts()).toEqual([]);
    expect(screen.getByText("the index refused")).toBeInTheDocument();
  });

  it("offers no removal from the list of an instance that is not removable", () => {
    renderPicker({ removable: (instance) => instance !== instances[0] });
    expect(screen.queryByRole("button", { name: "Remove from my list: Deck set A" })).toBeNull();
    expect(screen.getByRole("button", { name: "Delete instance Deck set A" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Remove from my list: Deck set B" })).toBeVisible();
  });

  it("removes an instance from the list after the user confirms, says so, and moves the focus", () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    const { props, rerender } = renderPicker();

    fireEvent.click(screen.getByRole("button", { name: "Remove from my list: Deck set A" }));

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("stay where they are"));
    expect(props.onDetach).toHaveBeenCalledWith(instances[0]);
    expect(props.onDelete).not.toHaveBeenCalled();
    rerender(<InstancePicker {...props} instances={[instances[1]!]} />);
    expect(screen.getByRole("button", { name: "Deck set B" })).toHaveFocus();
    expect(statusTexts()).toEqual(['Removed the instance "Deck set A" from your list.']);
  });

  it("does not remove an instance when the user cancels, or while busy", () => {
    vi.stubGlobal(
      "confirm",
      vi.fn(() => false),
    );
    const { props, rerender } = renderPicker();
    const remove = screen.getByRole("button", { name: "Remove from my list: Deck set A" });
    fireEvent.click(remove);
    expect(props.onDetach).not.toHaveBeenCalled();

    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    rerender(<InstancePicker {...props} busy />);
    expect(remove).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(remove);
    expect(props.onDetach).not.toHaveBeenCalled();
  });

  it("deletes an instance after the user confirms", () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    const { props } = renderPicker();

    fireEvent.click(screen.getByRole("button", { name: "Delete instance Deck set B" }));

    expect(confirm).toHaveBeenCalledWith(
      'Delete the instance "Deck set B" and all its decks and cards? This cannot be undone. Files another app put in its folder are kept, and so are the releases published from it.',
    );
    expect(props.onDelete).toHaveBeenCalledWith(instances[1]);
  });

  it("does not delete when the user cancels the confirmation", () => {
    vi.stubGlobal(
      "confirm",
      vi.fn(() => false),
    );
    const { props } = renderPicker();

    fireEvent.click(screen.getByRole("button", { name: "Delete instance Deck set A" }));

    expect(props.onDelete).not.toHaveBeenCalled();
  });
});
