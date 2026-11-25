// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import type { DeviceValueUseCases } from "@solid-memo/application/deviceValues";
import { makeDeviceValuesFake } from "../test/fakes/deviceValues";
import { DailyMessageContainer, DISMISSED_KEY } from "./DailyMessage";
import { DAILY_MESSAGES, type DailyMessage, messageOfDay } from "./dailyMessages";
import { DeviceValues } from "./deviceValues";
import { RepoUrl } from "./ReportMistake";
import en from "../i18n/en.json";

/** A message's name under dailyMessage.message. */
const messageName = (text: string) =>
  text.slice("dailyMessage.message.".length) as keyof typeof en.dailyMessage.message;

const REPO = "https://github.com/solid-memo/website";

/** The first day from 2026-11-01 on with a message of `messages`, and the first without. */
function dayWith(messages: readonly DailyMessage[], has = true): string {
  for (let day = Date.parse("2026-11-01"); ; day += 86_400_000) {
    const text = new Date(day).toISOString().slice(0, 10);
    if ((messageOfDay(text, messages) !== null) === has) return text;
  }
}

/** Noon of `day` on the device, well inside its calendar day. */
const noonOf = (day: string) => () => new Date(`${day}T12:00:00`);

/**
 * Above the deck list's heading, as DeckListContainer places it, on
 * `day`, with `device`'s values and the site's repository `repoUrl`.
 */
function renderOn(
  day: string,
  {
    messages = DAILY_MESSAGES,
    device = makeDeviceValuesFake(),
    repoUrl = REPO as string | null,
  }: { messages?: readonly DailyMessage[]; device?: DeviceValueUseCases; repoUrl?: string | null },
) {
  return render(
    <DeviceValues.Provider value={device}>
      <RepoUrl.Provider value={repoUrl}>
        <main>
          <div class="screen">
            <DailyMessageContainer messages={messages} now={noonOf(day)} />
            <h2>Decks</h2>
          </div>
        </main>
      </RepoUrl.Provider>
    </DeviceValues.Provider>,
  );
}

const strip = () => screen.queryByRole("complementary", { name: "Message of the day" });

/** One message alone, so every day with a message has it. */
const only = (message: DailyMessage) => [message];
const DONATE = DAILY_MESSAGES.find(({ id }) => id === "donate")!;
const DISCUSSIONS = DAILY_MESSAGES.find(({ id }) => id === "discussions")!;
const STAR = DAILY_MESSAGES.find(({ id }) => id === "star")!;
const UNDO = DAILY_MESSAGES.find(({ id }) => id === "undo")!;

describe("DailyMessageContainer", () => {
  it("shows nothing on a day without a message", () => {
    renderOn(dayWith(DAILY_MESSAGES, false), {});
    expect(strip()).toBeNull();
  });

  it("shows the day's message, taking no focus", () => {
    const day = dayWith(DAILY_MESSAGES);
    renderOn(day, {});
    const { text } = messageOfDay(day, DAILY_MESSAGES)!;
    expect(strip()).toHaveTextContent(en.dailyMessage.message[messageName(text)]);
    expect(document.activeElement).toBe(document.body);
  });

  it("says a tip in a sentence, without a link", () => {
    renderOn(dayWith(only(UNDO)), { messages: only(UNDO) });
    expect(strip()).toHaveTextContent(
      "Did you know? Pressed the wrong button while studying? U takes your last answer back.",
    );
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("links donating to the About page's word on it, in this tab", () => {
    renderOn(dayWith(only(DONATE)), { messages: only(DONATE) });
    expect(strip()).toHaveTextContent(
      "If you find Solid Memo valuable, you may donate to its maintainer.",
    );
    const link = screen.getByRole("link", { name: "How donations are used" });
    expect(link).toHaveAttribute("href", "about/#why");
    expect(link).toHaveAttribute("hreflang", "en");
    expect(link).not.toHaveAttribute("target");
  });

  it("links to the repository's Discussions and to the repository, in a new tab", () => {
    const { unmount } = renderOn(dayWith(only(DISCUSSIONS)), { messages: only(DISCUSSIONS) });
    expect(screen.getByRole("link", { name: /^Discussions/ })).toHaveAttribute(
      "href",
      `${REPO}/discussions`,
    );
    expect(screen.getByRole("link", { name: /^Discussions/ })).toHaveAttribute("target", "_blank");
    unmount();
    renderOn(dayWith(only(STAR)), { messages: only(STAR) });
    expect(screen.getByRole("link", { name: /^Source code/ })).toHaveAttribute("href", REPO);
  });

  it("leaves out a link to the repository where the site names none", () => {
    renderOn(dayWith(only(STAR)), { messages: only(STAR), repoUrl: null });
    expect(strip()).toHaveTextContent("A star on its source code helps others find it.");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("hides the message for the rest of the day, kept on the device, focus going to the heading", () => {
    const device = makeDeviceValuesFake();
    const day = dayWith(only(UNDO));
    const { unmount } = renderOn(day, { messages: only(UNDO), device });
    const hide = screen.getByRole("button", { name: "Hide for today" });
    hide.focus();
    fireEvent.click(hide);
    expect(strip()).toBeNull();
    expect(device.stored.get(DISMISSED_KEY)).toBe(day);
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Decks" }));
    unmount();
    // Back later the same day: still hidden.
    renderOn(day, { messages: only(UNDO), device });
    expect(strip()).toBeNull();
  });

  it("shows the next day's message though the last one was hidden", () => {
    const device = makeDeviceValuesFake();
    const day = dayWith(only(UNDO));
    device.stored.set(DISMISSED_KEY, "2026-10-31");
    renderOn(day, { messages: only(UNDO), device });
    expect(strip()).toBeInTheDocument();
  });

  it("reads anything kept that is no day as nothing hidden", () => {
    const device = makeDeviceValuesFake();
    device.stored.set(DISMISSED_KEY, "soon");
    renderOn(dayWith(only(UNDO)), { messages: only(UNDO), device });
    expect(strip()).toBeInTheDocument();
  });
});
