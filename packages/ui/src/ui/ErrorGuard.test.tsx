// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/preact";
import type { Locale } from "@solid-memo/domain/locale";
import { ErrorGuard } from "./ErrorGuard";
import { MAIN_ID } from "./SkipLink";

const source = {
  repoUrl: "https://github.com/solid-memo/website",
  version: "2.3.0",
  commitSha: null,
};

function Broken(): never {
  throw new Error("render failed");
}

function guarded(children = <p>All is well</p>, locale: () => Locale = () => "en") {
  return render(
    <ErrorGuard source={source} appName="Memo Site" locale={locale}>
      {children}
    </ErrorGuard>,
  );
}

/** An error the window hears of, as a click's handler throwing one. */
async function thrown(error: unknown) {
  await act(async () => {
    window.dispatchEvent(new ErrorEvent("error", { error, message: String(error) }));
  });
}

/** A promise rejected with `reason` that no one awaited. */
async function rejected(reason: unknown) {
  const event = Object.assign(new Event("unhandledrejection"), { reason });
  await act(async () => {
    window.dispatchEvent(event);
  });
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ErrorGuard", () => {
  it("shows the app while it works", () => {
    guarded();
    expect(screen.getByText("All is well")).toBeInTheDocument();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("gives the whole page to Something went wrong, in the language read when it failed", () => {
    const locale = vi.fn((): Locale => "de");
    guarded(<Broken />, locale);
    expect(locale).toHaveBeenCalled();
    const heading = screen.getByRole("heading", { level: 1, name: "Etwas ist schiefgelaufen" });
    expect(heading.closest("main")).toHaveAttribute("id", MAIN_ID);
    expect(document.title).toBe("Etwas ist schiefgelaufen – Memo Site");
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeInTheDocument();
  });

  it("tries the app again", () => {
    let broken = true;
    function Fragile() {
      if (broken) throw new Error("render failed");
      return <p>All is well</p>;
    }
    guarded(<Fragile />);
    broken = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("All is well")).toBeInTheDocument();
  });

  it("says an error nothing caught in a notice over the page, which can be closed", async () => {
    guarded(<p>All is well</p>, () => "sv");
    await thrown(new Error("click failed"));
    const notice = screen.getByRole("region", { name: "Fel" });
    expect(screen.getByRole("alert")).toHaveTextContent(/^Något gick fel\. Sidan/);
    expect(notice).toHaveTextContent("Error: Error: click failed");
    expect(screen.getByText("All is well")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stäng" }));
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("says a promise rejected with no one to hear it, each error with its own details", async () => {
    guarded();
    await rejected(new Error("save failed"));
    expect(screen.getByRole("region", { name: "Error" })).toHaveTextContent("save failed");
    await rejected("lost");
    const notice = screen.getByRole("region", { name: "Error" });
    expect(notice).toHaveTextContent("Error: lost");
    expect(notice).not.toHaveTextContent("save failed");
  });

  it("leaves an error event with no error alone: a script from elsewhere, or the browser's own", async () => {
    guarded();
    await thrown(null);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("stops listening once it is gone", async () => {
    const { unmount } = guarded();
    unmount();
    await thrown(new Error("later"));
    await rejected(new Error("later"));
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
});
