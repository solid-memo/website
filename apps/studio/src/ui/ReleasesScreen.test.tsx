// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/preact";
import type { ReleaseDraftSummary } from "@solid-memo/domain/release/draftLayout";
import { ReleasesScreen } from "./ReleasesScreen";
import { instanceA } from "../test/fixtures";
import { WithKeys } from "../test/keys";

const SOLID = `${instanceA.url}releases/solid/v2.ttl`;
const ELSEWHERE = "https://pod.example/public/course.ttl";
const source: ReleaseDraftSummary = {
  url: `${instanceA.url}drafts/solid/v2/release.ttl`,
  instanceUrl: instanceA.url,
  name: "solid",
  version: 2,
  readable: true,
  title: { en: "Solid basics" },
  course: true,
  releasedAs: SOLID,
};

type Props = Parameters<typeof ReleasesScreen>[0];

function renderScreen(overrides: Partial<Props> = {}) {
  const props: Props = {
    instance: instanceA,
    releases: [
      { url: SOLID, public: true },
      { url: ELSEWHERE, public: false },
    ],
    hold: null,
    healthHref: "#/health",
    draftsHref: "#/drafts",
    draftOf: (url) => (url === SOLID ? { draft: source, href: "#/draft/solid" } : null),
    makingPublic: null,
    publicError: null,
    onMakePublic: vi.fn(),
    starting: null,
    startError: null,
    onStartNext: vi.fn(),
    ...overrides,
  };
  render(
    <WithKeys>
      <ReleasesScreen {...props} />
    </WithKeys>,
  );
  return props;
}

describe("ReleasesScreen", () => {
  it("lists each release by its address, who can read it, and starts the next version of one", () => {
    const { onStartNext, onMakePublic } = renderScreen();
    expect(
      screen.getByRole("heading", { level: 2, name: "Releases published from Deck set A" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "solid, version 2" })).toHaveAttribute("href", SOLID);
    // A release its address names otherwise is named by its address.
    expect(screen.getByRole("link", { name: ELSEWHERE })).toHaveAttribute("href", ELSEWHERE);
    expect(screen.getByRole("cell", { name: "Everyone" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `Make ${ELSEWHERE} public` }));
    expect(onMakePublic).toHaveBeenCalledWith(ELSEWHERE);
    fireEvent.click(
      screen.getByRole("button", { name: "Start the next version of solid, version 2" }),
    );
    expect(onStartNext).toHaveBeenCalledWith(SOLID);
    expect(screen.getByRole("button", { name: `Copy the link ${SOLID}` })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Drafts of releases" })).toHaveAttribute(
      "href",
      "#/drafts",
    );
  });

  it("links each release to the draft it was published from, while the instance has it", () => {
    renderScreen();
    expect(screen.getByRole("link", { name: "Solid basics, version 2" })).toHaveAttribute(
      "href",
      "#/draft/solid",
    );
    expect(screen.getByText("Not among this instance's drafts")).toBeInTheDocument();
    // A draft of no title, by its name.
    renderScreen({ draftOf: () => ({ draft: { ...source, title: {} }, href: "#/draft/solid" }) });
    expect(screen.getAllByRole("link", { name: "solid, version 2" })).toHaveLength(4);
  });

  it("opens the release at the cursor with Enter, as its name's link does", () => {
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => undefined);
    renderScreen();
    document.body.focus();
    fireEvent.keyDown(document.body, { key: "j" });
    fireEvent.keyDown(document.body, { key: "j" });
    document.body.focus();
    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(assign).toHaveBeenCalledWith(ELSEWHERE);
    // A row's button keeps its own Enter.
    assign.mockClear();
    const startNext = screen.getAllByRole("button", { name: /^Start the next version/ })[0]!;
    startNext.focus();
    fireEvent.keyDown(startNext, { key: "Enter" });
    expect(assign).not.toHaveBeenCalled();
    assign.mockRestore();
  });

  it("sorts by a column's header, then the other way, then as listed, but by its actions", () => {
    const third = `${instanceA.url}releases/apps/v1.ttl`;
    renderScreen({
      releases: [
        { url: SOLID, public: true },
        { url: ELSEWHERE, public: false },
        { url: third, public: true },
      ],
    });
    const table = within(screen.getByRole("table", { name: "Releases published from Deck set A" }));
    const order = () =>
      table.getAllByRole("rowheader").map((cell) => cell.querySelector("a")!.textContent);
    expect(table.queryByRole("button", { name: "Actions" })).toBeNull();
    fireEvent.click(table.getByRole("button", { name: "Release" }));
    expect(order()).toEqual(["apps, version 1", ELSEWHERE, "solid, version 2"]);
    fireEvent.click(table.getByRole("button", { name: "Readable by" }));
    expect(order()).toEqual(["solid, version 2", "apps, version 1", ELSEWHERE]);
    fireEvent.click(table.getByRole("button", { name: "Draft" }));
    expect(order()).toEqual(["solid, version 2", ELSEWHERE, "apps, version 1"]);
    fireEvent.click(table.getByRole("button", { name: "Draft" }));
    fireEvent.click(table.getByRole("button", { name: "Draft" }));
    expect(order()).toEqual(["solid, version 2", ELSEWHERE, "apps, version 1"]);
  });

  it("filters the releases by name or address, case and accents aside, and says when none matches", () => {
    renderScreen();
    const filter = screen.getByRole("searchbox", { name: "Filter by name or address" });
    fireEvent.input(filter, { target: { value: "SOLÍD" } });
    expect(screen.getAllByRole("rowheader")).toHaveLength(1);
    fireEvent.input(filter, { target: { value: "public/" } });
    expect(screen.getByRole("rowheader")).toHaveTextContent(ELSEWHERE);
    fireEvent.input(filter, { target: { value: "rivers " } });
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("No release matches “rivers”.")).toBeInTheDocument();
  });

  it("says when there are none", () => {
    renderScreen({ releases: [] });
    expect(screen.getByText("This instance has published no releases yet.")).toBeInTheDocument();
  });

  it("does one thing at a time, says what, and why it failed", () => {
    renderScreen({ makingPublic: ELSEWHERE, publicError: "Refused." });
    expect(screen.getByText("Making the release public…")).toBeInTheDocument();
    expect(screen.getByText("Refused.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Make ${ELSEWHERE} public` })).toBeDisabled();
  });

  it("holds starting a next version while one starts, or the catalog may not be written", () => {
    renderScreen({ starting: SOLID, startError: "Unreadable." });
    expect(screen.getByText("Starting the next version…")).toBeInTheDocument();
    expect(screen.getByText("Unreadable.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start the next version of solid, version 2" }),
    ).toBeDisabled();
  });

  it("says why the catalog may not be written", () => {
    renderScreen({ hold: "setAside" });
    expect(screen.getByRole("link", { name: "Repair it on the health screen." })).toHaveAttribute(
      "href",
      "#/health",
    );
    expect(
      screen.getByRole("button", { name: "Start the next version of solid, version 2" }),
    ).toBeDisabled();
  });
});
