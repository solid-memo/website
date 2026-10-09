import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/preact";
import { ReadOnlyNotice, ReadOnlyScope } from "./ReadOnly";

describe("ReadOnlyNotice", () => {
  it("says nothing while all may be changed", () => {
    const { container } = render(<ReadOnlyNotice reason={null} subject="deck" healthHref="#/health" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says the data is being checked, with no link: there is nothing to repair yet", () => {
    render(<ReadOnlyNotice reason="checking" subject="deck" healthHref="#/health" />);
    expect(screen.getByText(/being checked\. Nothing can be changed until the check is done\./)).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("says what is set aside, with a link to repair it", () => {
    const { unmount } = render(<ReadOnlyNotice reason="setAside" subject="deck" healthHref="#/health?deck=d" />);
    expect(screen.getByText(/This deck has invalid data, so it is set aside/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Repair it on the health screen." })).toHaveAttribute("href", "#/health?deck=d");
    unmount();
    const decks = render(<ReadOnlyNotice reason="setAside" subject="decks" healthHref="#/health" />);
    expect(screen.getByText(/Decks with invalid data are set aside/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Repair them on the health screen." })).toBeInTheDocument();
    decks.unmount();
    render(<ReadOnlyNotice reason="setAside" subject="catalogue" healthHref="#/health" />);
    expect(screen.getByText(/catalogue or one of its groups has invalid data/)).toBeInTheDocument();
  });

  it.each(["deck", "decks", "catalogue"] as const)("says the whole instance is blocked, whatever the subject (%s), the instance to repair", (subject) => {
    render(<ReadOnlyNotice reason="blocked" subject={subject} healthHref="#/health" />);
    expect(screen.getByText(/your preferences keep it closed until it is repaired/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Repair it on the health screen." })).toBeInTheDocument();
  });
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
