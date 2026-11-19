// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/preact";
import { ReadOnlyNotice, ReadOnlyScope } from "./ReadOnly";

describe("ReadOnlyNotice", () => {
  it("says nothing while all may be changed", () => {
    const { container } = render(
      <ReadOnlyNotice reason={null} subject="deck" healthHref="#/health" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("says the data is being checked, with no link: nothing is known not to conform yet", () => {
    render(<ReadOnlyNotice reason="checking" subject="deck" healthHref="#/health" />);
    expect(
      screen.getByText(/being checked\. Nothing can be changed until the check is done\./),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("says the data could not be checked, and that Solid Memo's “Warn only” changes it unchecked", () => {
    render(<ReadOnlyNotice reason="unchecked" subject="deck" healthHref="#/health" />);
    expect(screen.getByText(/could not be checked, so nothing can be changed/)).toHaveClass(
      "warning",
    );
    expect(screen.getByText(/choose “Warn only” in Solid Memo's preferences/)).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("says what is set aside until it is fixed outside the app, with a link to what does not conform", () => {
    const { unmount } = render(
      <ReadOnlyNotice reason="setAside" subject="deck" healthHref="#/health?deck=d" />,
    );
    expect(screen.getByText(/This deck has invalid data, so it is set aside/)).toHaveTextContent(
      "until it is fixed outside Solid Memo.",
    );
    expect(
      screen.getByRole("link", { name: "See what does not conform on the health screen." }),
    ).toHaveAttribute("href", "#/health?deck=d");
    unmount();
    const decks = render(
      <ReadOnlyNotice reason="setAside" subject="decks" healthHref="#/health" />,
    );
    expect(screen.getByText(/Decks with invalid data are set aside/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "See what does not conform on the health screen." }),
    ).toBeInTheDocument();
    decks.unmount();
    render(<ReadOnlyNotice reason="setAside" subject="catalogue" healthHref="#/health" />);
    expect(screen.getByText(/catalog or one of its groups has invalid data/)).toBeInTheDocument();
  });

  it.each(["deck", "decks", "catalogue"] as const)(
    "says the whole instance is blocked, whatever the subject (%s), linking to the instance's health",
    (subject) => {
      render(<ReadOnlyNotice reason="blocked" subject={subject} healthHref="#/health" />);
      expect(
        screen.getByText(/your preferences keep it closed until it is fixed outside Solid Memo/),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "See what does not conform on the health screen." }),
      ).toBeInTheDocument();
    },
  );
});

describe("ReadOnlyScope", () => {
  it("holds every control in it while it may not change, links still followed, and frees them after", () => {
    const { rerender } = render(
      <ReadOnlyScope reason="setAside" subject="deck" healthHref="#/health">
        <input aria-label="Name" />
        <button type="button">Save</button>
        <a href="#/elsewhere">Elsewhere</a>
      </ReadOnlyScope>,
    );
    expect(screen.getByRole("textbox", { name: "Name" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Elsewhere" })).toHaveAttribute("href", "#/elsewhere");
    screen.getByRole<HTMLInputElement>("textbox", { name: "Name" }).value = "kept";
    rerender(
      <ReadOnlyScope reason={null} subject="deck" healthHref="#/health">
        <input aria-label="Name" />
        <button type="button">Save</button>
        <a href="#/elsewhere">Elsewhere</a>
      </ReadOnlyScope>,
    );
    expect(screen.getByRole("textbox", { name: "Name" })).toBeEnabled();
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("kept");
    expect(screen.queryByText(/set aside/)).toBeNull();
  });
});
