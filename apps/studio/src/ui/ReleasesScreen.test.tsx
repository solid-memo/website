import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { ReleasesScreen } from "./ReleasesScreen";
import { instanceA } from "../test/fixtures";

const SOLID = `${instanceA.url}releases/solid/v2.ttl`;
const ELSEWHERE = "https://pod.example/public/course.ttl";

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
    makingPublic: null,
    publicError: null,
    onMakePublic: vi.fn(),
    starting: null,
    startError: null,
    onStartNext: vi.fn(),
    ...overrides,
  };
  render(<ReleasesScreen {...props} />);
  return props;
}

describe("ReleasesScreen", () => {
  it("lists each release by its address, who can read it, and starts the next version of one", () => {
    const { onStartNext, onMakePublic } = renderScreen();
    expect(screen.getByRole("heading", { level: 2, name: "Releases published from Deck set A" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "solid, version 2" })).toHaveAttribute("href", SOLID);
    // A release its address names otherwise is named by its address.
    expect(screen.getByRole("link", { name: ELSEWHERE })).toHaveAttribute("href", ELSEWHERE);
    expect(screen.getByRole("cell", { name: "Everyone" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `Make ${ELSEWHERE} public` }));
    expect(onMakePublic).toHaveBeenCalledWith(ELSEWHERE);
    fireEvent.click(screen.getByRole("button", { name: "Start the next version of solid, version 2" }));
    expect(onStartNext).toHaveBeenCalledWith(SOLID);
    expect(screen.getByRole("button", { name: `Copy the link ${SOLID}` })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Drafts of releases" })).toHaveAttribute("href", "#/drafts");
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

  it("holds starting a next version while one starts, or the catalogue may not be written", () => {
    renderScreen({ starting: SOLID, startError: "Unreadable." });
    expect(screen.getByText("Starting the next version…")).toBeInTheDocument();
    expect(screen.getByText("Unreadable.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start the next version of solid, version 2" })).toBeDisabled();
  });

  it("says why the catalogue may not be written", () => {
    renderScreen({ hold: "setAside" });
    expect(screen.getByRole("link", { name: "Repair it on the health screen." })).toHaveAttribute("href", "#/health");
    expect(screen.getByRole("button", { name: "Start the next version of solid, version 2" })).toBeDisabled();
  });
});
