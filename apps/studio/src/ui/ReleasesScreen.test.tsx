// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/preact";
import type { ReleaseDraftSummary } from "@solid-memo/domain/release/draftLayout";
import { I18nProvider } from "@solid-memo/ui/i18n";
import { ReleasesScreen } from "./ReleasesScreen";
import { instanceA } from "../test/fixtures";
import { WithKeys } from "../test/keys";
import { countSorts } from "../test/sorts";

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

/** The accessible name of an ExternalLink to the web. */
const newTab = (text: string) => `${text} (opens in a new tab)`;

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
  const element = (changed: Partial<Props> = {}) => (
    <WithKeys>
      <ReleasesScreen {...props} {...changed} />
    </WithKeys>
  );
  const { rerender } = render(element());
  return { ...props, rerender: (changed: Partial<Props>) => rerender(element(changed)) };
}

describe("ReleasesScreen", () => {
  it("lists each release by its address, who can read it, and starts the next version of one", () => {
    const { onStartNext, onMakePublic } = renderScreen();
    expect(
      screen.getByRole("heading", { level: 2, name: "Releases published from Deck set A" }),
    ).toBeInTheDocument();
    const named = screen.getByRole("link", { name: newTab("solid, version 2") });
    expect(named).toHaveAttribute("href", SOLID);
    expect(named).toHaveAttribute("target", "_blank");
    expect(named).toHaveAttribute("rel", "noopener noreferrer");
    // A release its address names otherwise is named by its address.
    expect(screen.getByRole("link", { name: newTab(ELSEWHERE) })).toHaveAttribute(
      "href",
      ELSEWHERE,
    );
    expect(screen.getByRole("cell", { name: "Everyone" })).toBeInTheDocument();
    // Made public only once the user says so: Cancel leaves it as it is.
    fireEvent.click(screen.getByRole("button", { name: `Make ${ELSEWHERE} public` }));
    const asked = screen.getByRole("dialog", { name: "Make the release public" });
    expect(asked).toHaveTextContent(
      `Anyone with its address will be able to read ${ELSEWHERE}. The Studio can't make it private again.`,
    );
    fireEvent.click(within(asked).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onMakePublic).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: `Make ${ELSEWHERE} public` }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Make the release public" })).getByRole("button", {
        name: "Make it public",
      }),
    );
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
    expect(screen.getAllByRole("link", { name: "solid, version 2" })).toHaveLength(2);
  });

  it("opens the release at the cursor with Enter in a new tab, as its name's link does", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => undefined);
    renderScreen();
    document.body.focus();
    fireEvent.keyDown(document.body, { key: "j" });
    fireEvent.keyDown(document.body, { key: "j" });
    document.body.focus();
    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(open).toHaveBeenCalledWith(ELSEWHERE, "_blank", "noopener,noreferrer");
    // A row's button keeps its own Enter.
    open.mockClear();
    const startNext = screen.getAllByRole("button", { name: /^Start the next version/ })[0]!;
    startNext.focus();
    fireEvent.keyDown(startNext, { key: "Enter" });
    expect(open).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
    open.mockRestore();
    assign.mockRestore();
  });

  it("names the host of a release on another origin, which its name alone does not", () => {
    const planted = "https://other.example:8443/capitals/v2.ttl";
    renderScreen({
      releases: [
        { url: planted, public: null },
        { url: SOLID, public: true },
      ],
    });
    const [other, own] = screen.getAllByRole("rowheader") as [HTMLElement, HTMLElement];
    expect(
      within(other).getByRole("link", { name: newTab("capitals, version 2") }),
    ).toHaveAttribute("href", planted);
    expect(other).toHaveTextContent("On another server: other.example:8443");
    expect(own).not.toHaveTextContent("On another server");
  });

  it("neither links nor opens a release whose address hides its host, and names the host", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => undefined);
    const hiding = "https://solid-memo.com@other.example/capitals/v2.ttl";
    renderScreen({ releases: [{ url: hiding, public: null }] });
    const row = screen.getByRole("rowheader");
    expect(within(row).queryByRole("link")).toBeNull();
    expect(row).toHaveTextContent("capitals, version 2");
    expect(row).toHaveTextContent("On another server: other.example");
    document.body.focus();
    fireEvent.keyDown(document.body, { key: "j" });
    document.body.focus();
    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(open).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
    open.mockRestore();
    assign.mockRestore();
  });

  it("keeps the keys going past a row with no link, whose Enter does nothing", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const first = "https://a.example/first/v1.ttl";
    const hiding = "https://solid-memo.com@other.example/hiding/v1.ttl";
    const third = "https://c.example/third/v1.ttl";
    renderScreen({
      releases: [
        { url: first, public: null },
        { url: hiding, public: null },
        { url: third, public: null },
      ],
    });
    (document.activeElement as HTMLElement).blur();
    const key = (name: string) =>
      fireEvent.keyDown(document.activeElement as HTMLElement, { key: name });
    key("j");
    expect(document.activeElement).toHaveAttribute("href", first);
    // On the row with no link, the focus leaves the row before it.
    key("j");
    expect(document.activeElement).toBe(document.body);
    expect(screen.getAllByRole("row")[2]).toHaveClass("cursor");
    key("Enter");
    expect(open).not.toHaveBeenCalled();
    // And the next row is reached, and back.
    key("j");
    expect(document.activeElement).toHaveAttribute("href", third);
    key("k");
    expect(document.activeElement).toBe(document.body);
    key("k");
    expect(document.activeElement).toHaveAttribute("href", first);
    open.mockRestore();
  });

  it("does not link a release on the instance's own host whose address has a user name", () => {
    const own = new URL(instanceA.url).host;
    const hiding = `https://user@${own}/capitals/v2.ttl`;
    renderScreen({ releases: [{ url: hiding, public: true }] });
    const row = screen.getByRole("rowheader");
    expect(within(row).queryByRole("link")).toBeNull();
    expect(row).toHaveTextContent("capitals, version 2");
    expect(row).not.toHaveTextContent("On another server");
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
      table
        .getAllByRole("rowheader")
        .map((cell) => cell.querySelector("a")!.firstChild!.textContent);
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

  it("sorts again only when the releases or the sort change, not on any other render", () => {
    const sorts = countSorts();
    const { rerender } = renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Release" }));
    const sorted = sorts();
    expect(sorted).toBeGreaterThan(0);
    rerender({ makingPublic: SOLID });
    expect(sorts()).toBe(sorted);
    rerender({ releases: [{ url: SOLID, public: false }] });
    expect(sorts()).toBe(sorted + 1);
  });

  it("orders the releases anew in another language", () => {
    const other = `${instanceA.url}releases/other/v1.ttl`;
    const titled = (title: string) => ({ draft: { ...source, title: { en: title } }, href: "#/d" });
    const props = {
      releases: [
        { url: SOLID, public: true },
        { url: other, public: true },
      ],
      draftOf: (url: string) => titled(url === SOLID ? "Zebra" : "Ägg"),
    };
    const inLocale = (locale: "en" | "sv") => (
      <I18nProvider locale={locale} onChoose={() => undefined}>
        <WithKeys>
          <ReleasesScreen
            instance={instanceA}
            hold={null}
            healthHref="#/health"
            draftsHref="#/drafts"
            makingPublic={null}
            publicError={null}
            onMakePublic={vi.fn()}
            starting={null}
            startError={null}
            onStartNext={vi.fn()}
            {...props}
          />
        </WithKeys>
      </I18nProvider>
    );
    const order = () =>
      screen.getAllByRole("rowheader").map((cell) => cell.textContent.split(",", 1)[0]);
    const { rerender } = render(inLocale("en"));
    fireEvent.click(screen.getByRole("button", { name: "Draft" }));
    expect(order()).toEqual(["other", "solid"]);
    rerender(inLocale("sv"));
    expect(order()).toEqual(["solid", "other"]);
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

  it("says a release on another server was not checked, and offers no way to make it public", () => {
    const other = "https://other.example/releases/solid/v1.ttl";
    renderScreen({ releases: [{ url: other, public: null }] });
    expect(screen.getByRole("row", { name: new RegExp(other) })).toHaveTextContent(
      "Not checked: on another server",
    );
    expect(screen.queryByRole("button", { name: `Make ${other} public` })).toBeNull();
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
