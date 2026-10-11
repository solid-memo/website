// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/preact";
import { ContextTabs } from "./ContextTabs";

const tabs = [
  { key: "cards", href: "#/cards", label: "Cards", current: "page" },
  { key: "schedule", href: "#/schedule", label: "Schedule", current: false },
] as const;

describe("ContextTabs", () => {
  it("are links in a named navigation, the one shown current", () => {
    render(<ContextTabs label="Deck" tabs={tabs} />);
    const nav = screen.getByRole("navigation", { name: "Deck" });
    expect(nav).toHaveClass("studio-tabs");
    expect(within(nav).getByRole("link", { name: "Cards" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("link", { name: "Schedule" })).not.toHaveAttribute("aria-current");
    // Followed as links are.
    expect(fireEvent.click(within(nav).getByRole("link", { name: "Schedule" }))).toBe(true);
  });

  it("mark the one the page shown is under as current, but not as the page", () => {
    render(<ContextTabs label="Deck" tabs={[{ ...tabs[0], current: "true" }, tabs[1]]} />);
    expect(screen.getByRole("link", { name: "Cards" })).toHaveAttribute("aria-current", "true");
  });

  it("leave where a tab goes to their owner, when it says", () => {
    const onFollow = vi.fn();
    render(<ContextTabs label="Deck" tabs={tabs} onFollow={onFollow} />);
    expect(fireEvent.click(screen.getByRole("link", { name: "Schedule" }))).toBe(false);
    expect(onFollow).toHaveBeenCalledWith("schedule");
  });
});
