// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/preact";
import { useState } from "preact/hooks";
import { errorDetails, errorReportUrl } from "@solid-memo/domain/errorReport";
import { ErrorBoundary, ErrorReport, errorPlace, SomethingWentWrong } from "./ErrorBoundary";
import { I18nProvider } from "./i18n";

const source = {
  repoUrl: "https://github.com/solid-memo/website",
  version: "2.3.0",
  commitSha: "8faa7e1bd2e6de2b6570d692fd2865bb4b3217ad",
};
const WEBID = "https://alice.pod.example/profile/card#me";
const DECK = "https://alice.pod.example/solid-memo/main/decks/capitals/index.ttl";

/** A screen that throws while it renders as long as `broken.now` says so. */
const broken = { now: true };
function Fragile() {
  if (broken.now) throw new TypeError(`Cannot read ${DECK} for ${WEBID}`);
  return <p>All is well</p>;
}

/** Fragile under a boundary whose fallback says what was thrown and offers a reset. */
function guarded() {
  return render(
    <ErrorBoundary
      fallback={(error, reset) => (
        <>
          <p>Caught: {(error as Error).message}</p>
          <button type="button" onClick={reset}>
            Reset
          </button>
        </>
      )}
    >
      <Fragile />
    </ErrorBoundary>,
  );
}

beforeEach(() => {
  broken.now = true;
  window.location.hash = `#/study?deck=${encodeURIComponent(DECK)}`;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.location.hash = "";
});

describe("ErrorBoundary", () => {
  it("shows its children while they render", () => {
    broken.now = false;
    guarded();
    expect(screen.getByText("All is well")).toBeInTheDocument();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("shows the fallback in place of children that throw, and logs what was thrown", () => {
    guarded();
    expect(screen.getByText(/^Caught: Cannot read/)).toBeInTheDocument();
    expect(console.error).toHaveBeenCalledWith(expect.any(TypeError));
  });

  it("renders the children afresh when reset", () => {
    guarded();
    broken.now = false;
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByText("All is well")).toBeInTheDocument();
  });

  it("renders the children afresh when a route is followed, and stays as it is when nothing failed", async () => {
    guarded();
    broken.now = false;
    await act(async () => {
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(screen.getByText("All is well")).toBeInTheDocument();
    await act(async () => {
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(screen.getByText("All is well")).toBeInTheDocument();
  });

  it("stops listening for routes once it is gone", () => {
    const remove = vi.spyOn(window, "removeEventListener");
    guarded().unmount();
    expect(remove).toHaveBeenCalledWith("hashchange", expect.any(Function));
  });
});

describe("SomethingWentWrong", () => {
  function shown(onTryAgain = vi.fn(), heading?: "h1" | "h2") {
    render(
      <SomethingWentWrong
        error={new Error("broken")}
        source={source}
        onTryAgain={onTryAgain}
        heading={heading}
      />,
    );
    return onTryAgain;
  }

  it("says so under a heading it focuses, and names the tab after it", () => {
    shown();
    const heading = screen.getByRole("heading", { level: 2, name: "Something went wrong" });
    expect(heading).toHaveFocus();
    expect(screen.getByRole("region", { name: "Something went wrong" })).toBeInTheDocument();
    expect(document.title).toBe("Something went wrong – Solid Memo");
  });

  it("is the page's own heading when nothing else is left of the page", () => {
    shown(vi.fn(), "h1");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Something went wrong");
  });

  it("tries again", () => {
    const onTryAgain = shown();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onTryAgain).toHaveBeenCalledOnce();
  });

  it("goes to the start, a route of its own when elsewhere", () => {
    const onTryAgain = shown();
    fireEvent.click(screen.getByRole("button", { name: "Go to the start" }));
    expect(window.location.hash).toBe("#/");
    expect(onTryAgain).not.toHaveBeenCalled();
  });

  it("renders the start afresh when already there", () => {
    window.location.hash = "#/";
    const onTryAgain = shown();
    fireEvent.click(screen.getByRole("button", { name: "Go to the start" }));
    expect(onTryAgain).toHaveBeenCalledOnce();
  });
});

describe("ErrorReport", () => {
  const error = new TypeError(`Cannot read ${DECK} for ${WEBID}`);

  it("copies the details, with no address of the learner's in them, and says so", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<ErrorReport error={error} source={source} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy details" }));
    });
    const details = errorDetails(error, errorPlace(source));
    expect(writeText).toHaveBeenCalledWith(details);
    expect(details).toContain("Route: #/study?deck=");
    expect(details).toContain("Error: TypeError: Cannot read <address> for <address>");
    expect(details).not.toContain("alice");
    expect(screen.getByRole("status")).toHaveTextContent("The details are copied.");
  });

  it("says when the browser would not copy them, which can be read and copied by hand", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn(async () => Promise.reject(new Error("denied"))) },
    });
    render(<ErrorReport error={error} source={source} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy details" }));
    });
    expect(await screen.findByText(/could not be copied/)).toHaveAttribute("role", "status");
    expect(screen.getByText("Technical details")).toBeInTheDocument();
    expect(screen.getByText(/^Version: 2\.3\.0/)).toHaveTextContent("Error: TypeError");
  });

  it("links to the bug form next to Copy details, the details left out of the link", () => {
    render(<ErrorReport error={error} source={source} />);
    const place = errorPlace(source);
    const link = screen.getByRole("link", { name: /Report it/ });
    expect(link).toHaveAttribute("href", errorReportUrl(source.repoUrl, place));
    expect(link.getAttribute("href")).not.toContain("Cannot");
    expect(link.parentElement).toContainElement(
      screen.getByRole("button", { name: "Copy details" }),
    );
    expect(screen.getByText(/paste the copied details into it/)).toBeInTheDocument();
  });

  it("keeps the details as the error came up, whatever route follows", () => {
    function Shown() {
      const [, setCount] = useState(0);
      return (
        <>
          <ErrorReport error={error} source={source} />
          <button type="button" onClick={() => setCount((count) => count + 1)}>
            Again
          </button>
        </>
      );
    }
    render(<Shown />);
    window.location.hash = "#/preferences";
    fireEvent.click(screen.getByRole("button", { name: "Again" }));
    expect(screen.getByText(/^Version:/)).toHaveTextContent("Route: #/study?deck=");
  });

  it("marks the details as English in another language", () => {
    render(
      <I18nProvider locale="sv">
        <ErrorReport error={error} source={source} />
      </I18nProvider>,
    );
    expect(screen.getByRole("button", { name: "Kopiera detaljer" })).toBeInTheDocument();
    expect(screen.getByText(/^Version:/)).toHaveAttribute("lang", "en");
  });
});
