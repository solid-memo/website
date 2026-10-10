import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { draftUrlOf } from "@solid-memo/domain/release/draftLayout";
import { GUEST_INSTANCE_URL } from "@solid-memo/domain/guest";
import type { ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { ReleasePublishScreen } from "./ReleasePublishScreen";
import { courseDraft, instanceA } from "../test/fixtures";

const TARGET = `${instanceA.url}releases/solid/v1.ttl`;
const links = { checkHref: "#/check", libraryCheckHref: "#/check-library", healthHref: "#/health" };

type Props = Parameters<typeof ReleasePublishScreen>[0];

const idle = () => ({ pending: false, error: null, run: vi.fn() });

function renderScreen(overrides: Partial<Props> = {}) {
  const props: Props = {
    draft: courseDraft(),
    hold: null,
    saving: false,
    errors: 0,
    links,
    publish: idle(),
    isPublic: undefined,
    makePublic: idle(),
    startNext: idle(),
    download: idle(),
    downloaded: null,
    ...overrides,
  };
  render(<ReleasePublishScreen {...props} />);
  return props;
}

const released = (draft: ReleaseDraft = courseDraft()): ReleaseDraft => ({ ...draft, root: { ...draft.root, releasedAs: TARGET } });

describe("ReleasePublishScreen", () => {
  it("publishes in the instance's releases folder only once the user says it will be public", () => {
    const { publish } = renderScreen();
    expect(screen.getByRole("heading", { level: 3, name: "Publish" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Folder in your Pod" })).toHaveValue(`${instanceA.url}releases/`);
    expect(screen.getByText(`The release will be published at ${TARGET}.`)).toBeInTheDocument();
    expect(screen.getByText(/The release check finds no errors/)).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Publish to my Pod" });
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /this release will be public/ }));
    fireEvent.click(button);
    expect(publish.run).toHaveBeenCalledWith(TARGET);
  });

  it("publishes in a folder the user types, and refuses an address that is no folder's", () => {
    const { publish } = renderScreen();
    const folder = screen.getByRole("textbox", { name: "Folder in your Pod" });
    fireEvent.click(screen.getByRole("checkbox", { name: /this release will be public/ }));
    fireEvent.input(folder, { target: { value: "https://pod.example/public" } });
    expect(screen.getByText("Give the folder's web address, starting with https:// or http:// and ending in /.")).toBeInTheDocument();
    expect(folder).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Publish to my Pod" })).toBeDisabled();
    fireEvent.submit(folder.closest("form")!);
    expect(publish.run).not.toHaveBeenCalled();
    fireEvent.input(folder, { target: { value: " https://pod.example/public/ " } });
    fireEvent.click(screen.getByRole("button", { name: "Publish to my Pod" }));
    expect(publish.run).toHaveBeenCalledWith("https://pod.example/public/solid/v1.ttl");
  });

  it("holds publishing while the check finds errors, a change waits to be saved, or the catalogue may not be written", () => {
    renderScreen({ errors: 2 });
    expect(screen.getByRole("link", { name: "The release check finds 2 errors. Fix them before you publish." })).toHaveAttribute("href", "#/check");
    fireEvent.click(screen.getByRole("checkbox", { name: /this release will be public/ }));
    expect(screen.getByRole("button", { name: "Publish to my Pod" })).toBeDisabled();
  });

  it("says why publishing waits, while it checks, saves or publishes, and why it failed", () => {
    const { publish } = renderScreen({ errors: undefined, saving: true, hold: "setAside", publish: { pending: true, error: "The pod is down.", run: vi.fn() } });
    expect(screen.getByText("Checking the draft…")).toBeInTheDocument();
    expect(screen.getByText("Checking and publishing the release…")).toBeInTheDocument();
    expect(screen.getByText("The pod is down.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Repair it on the health screen." })).toHaveAttribute("href", "#/health");
    fireEvent.submit(screen.getByRole("textbox", { name: "Folder in your Pod" }).closest("form")!);
    expect(publish.run).not.toHaveBeenCalled();
  });

  it("says a change waits to be saved", () => {
    renderScreen({ saving: true });
    expect(screen.getByText("Waiting for your changes to be saved…")).toBeInTheDocument();
  });

  it("offers a guest only the file: their pod is this browser's", () => {
    renderScreen({ draft: { ...courseDraft(), url: draftUrlOf(GUEST_INSTANCE_URL, "solid", 1) } });
    expect(screen.getByText(/A guest's study is kept in this browser alone/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish to my Pod" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download .ttl" })).toBeInTheDocument();
  });

  it("shows a draft released where its release is, public, and starts its next version", () => {
    const { startNext } = renderScreen({ draft: released(), isPublic: true });
    expect(screen.getByRole("link", { name: TARGET })).toHaveAttribute("href", TARGET);
    expect(screen.getByText("Anyone with its address can read it.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Copy the link ${TARGET}` })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start the next version" }));
    expect(startNext.run).toHaveBeenCalledWith(TARGET);
  });

  it("holds starting the next version while the catalogue may not be written, and says why", () => {
    const { startNext } = renderScreen({ draft: released(), isPublic: true, hold: "setAside" });
    expect(screen.getByRole("link", { name: "Repair it on the health screen." })).toHaveAttribute("href", "#/health");
    const button = screen.getByRole("button", { name: "Start the next version" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(startNext.run).not.toHaveBeenCalled();
  });

  it("says a release is not public, and tries again to make it so", () => {
    const { makePublic } = renderScreen({ draft: released(), isPublic: false });
    expect(screen.getByText(/Only you can read it: your Pod did not make it public/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Make it public" }));
    expect(makePublic.run).toHaveBeenCalledWith(TARGET);
  });

  it("asks whether a release is public, and does each action once at a time", () => {
    const pending = { pending: true, error: "Refused.", run: vi.fn() };
    const { makePublic, startNext, download } = renderScreen({ draft: released(), isPublic: undefined, makePublic: pending, startNext: { ...pending }, download: { ...pending } });
    expect(screen.getByText("Asking whether anyone can read it…")).toBeInTheDocument();
    expect(screen.getByText("Making the release public…")).toBeInTheDocument();
    expect(screen.getByText("Starting the next version…")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start the next version" }));
    fireEvent.click(screen.getByRole("button", { name: "Download .ttl" }));
    expect(startNext.run).not.toHaveBeenCalled();
    expect(download.run).not.toHaveBeenCalled();
    expect(makePublic.run).not.toHaveBeenCalled();
  });

  it("holds making public again while it is made so", () => {
    const { makePublic } = renderScreen({ draft: released(), isPublic: false, makePublic: { pending: true, error: null, run: vi.fn() } });
    fireEvent.click(screen.getByRole("button", { name: "Make it public" }));
    expect(makePublic.run).not.toHaveBeenCalled();
  });

  it("saves the release as a file for the library, with the steps of a pull request", () => {
    const { download } = renderScreen({ downloaded: { name: "solid-v1.ttl", url: "https://solid-memo.com/decks/solid/v1.ttl" } });
    fireEvent.click(screen.getByRole("button", { name: "Download .ttl" }));
    expect(download.run).toHaveBeenCalled();
    expect(screen.getByText("solid-v1.ttl")).toBeInTheDocument();
    expect(screen.getByText("decks/solid/v1.ttl")).toBeInTheDocument();
    expect(screen.getByText("npm run library:check -- --base main")).toBeInTheDocument();
    expect(screen.getByText("npm run check && npm run crosscheck")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Check the draft for the library first" })).toHaveAttribute("href", "#/check-library");
  });
});
