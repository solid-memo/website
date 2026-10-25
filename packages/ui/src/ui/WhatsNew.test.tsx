// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import type { WhatsNewUseCases } from "@solid-memo/application/whatsNew";
import { makeUseCasesFake } from "../test/useCasesFake";
import type { Highlight } from "./highlights";
import { AppVersion, WhatsNewContainer } from "./WhatsNew";

/** Highlights told by messages the app has, newest first. */
const HIGHLIGHTS: Highlight[] = [
  { id: "newest", text: "schedulerInvitation.title" },
  { id: "middle", text: "schedulerInvitation.notNow" },
  { id: "oldest", text: "schedulerInvitation.switch" },
];

/**
 * On the deck list's screen, as DeckListContainer places it: first,
 * above the course strip, when there are courses, and the list's
 * heading; in version 6.11.0.
 */
function renderContainer(useCases: WhatsNewUseCases, { courses = false } = {}) {
  return render(
    <AppVersion.Provider value="6.11.0">
      <main>
        <div class="screen">
          <WhatsNewContainer useCases={useCases} highlights={HIGHLIGHTS} />
          {courses && <h2>Your courses</h2>}
          <h2>Decks</h2>
        </div>
      </main>
    </AppVersion.Provider>,
  );
}

const card = () => screen.queryByRole("complementary", { name: "New in Solid Memo 6.11.0" });

describe("WhatsNewContainer", () => {
  it("shows nothing when every highlight is seen, having asked of each, newest first", () => {
    const useCases = makeUseCasesFake();
    renderContainer(useCases);
    expect(useCases.unseenHighlights).toHaveBeenCalledWith(["newest", "middle", "oldest"]);
    expect(card()).toBeNull();
  });

  it("lists the highlights not seen, newest first, under the version, taking no focus", () => {
    const useCases = makeUseCasesFake({
      unseenHighlights: vi.fn(() => ["oldest", "newest"]),
    });
    renderContainer(useCases);
    const items = screen.getAllByRole("listitem").map((item) => item.textContent);
    expect(card()).toBeInTheDocument();
    expect(items).toEqual(["Try FSRS-6, the recommended scheduler", "Switch to FSRS-6"]);
    expect(document.activeElement).toBe(document.body);
    // The sparkles are only decoration.
    expect(card()!.querySelector(".whats-new-sparkles")).toHaveAttribute("aria-hidden", "true");
  });

  it("names its Close button with its title, keeps every highlight as seen on Close, and gives focus to the screen's first heading after it", () => {
    const useCases = makeUseCasesFake({ unseenHighlights: vi.fn(() => ["middle"]) });
    renderContainer(useCases);
    const close = screen.getByRole("button", { name: "Close New in Solid Memo 6.11.0" });
    close.focus();
    fireEvent.click(close);
    expect(useCases.dismissHighlights).toHaveBeenCalledWith(["newest", "middle", "oldest"]);
    expect(card()).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Decks" }));
  });

  it("gives focus on Close to the course strip's heading when there are courses", () => {
    const useCases = makeUseCasesFake({ unseenHighlights: vi.fn(() => ["middle"]) });
    renderContainer(useCases, { courses: true });
    const close = screen.getByRole("button", { name: "Close New in Solid Memo 6.11.0" });
    close.focus();
    fireEvent.click(close);
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Your courses" }));
  });
});
