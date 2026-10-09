import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { WorkspaceProps } from "@solid-memo/ui/App";
import { makeUseCasesFake } from "@solid-memo/ui/test/useCasesFake";
import { App, type StudioModule } from "./App";

const session = { webId: "https://alice.example/profile/card#me" };

/** A stand-in for the Studio's code: its banner, and a heading to know it by. */
function FakeStudioWorkspace({ banner }: WorkspaceProps) {
  return (
    <>
      <header>{banner}</header>
      <main>
        <h2>The Studio's screens</h2>
      </main>
    </>
  );
}

const studioModule: StudioModule = { StudioWorkspace: FakeStudioWorkspace };

function renderApp(useCases: UseCases, loadStudio: () => Promise<StudioModule>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <App useCases={useCases} commitSha={null} loadStudio={loadStudio} />
    </QueryClientProvider>,
  );
}

/** The user follows a link to `hash`, within the page. */
function follow(hash: string) {
  act(() => {
    window.history.pushState(null, "", hash);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

describe("App", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", window.location.pathname);
  });

  it("is Solid Memo, and never fetches the Studio, outside the Studio's routes", async () => {
    const loadStudio = vi.fn(async () => studioModule);
    renderApp(makeUseCasesFake(), loadStudio);
    expect(await screen.findByRole("heading", { level: 1, name: "Solid Memo" })).toBeInTheDocument();
    expect(screen.getByText("Spaced-repetition flashcards that live in your own Solid Pod.")).toBeInTheDocument();
    expect(loadStudio).not.toHaveBeenCalled();
  });

  it("names the Studio at its routes, and fetches its code", async () => {
    window.history.replaceState(null, "", "#/studio");
    const loadStudio = vi.fn(async () => studioModule);
    renderApp(makeUseCasesFake(), loadStudio);
    expect(await screen.findByRole("heading", { level: 1, name: "Solid Memo Studio" })).toBeInTheDocument();
    expect(within(screen.getByRole("banner")).getByRole("link", { name: "Back to Solid Memo" })).toHaveAttribute("href", "#/");
    expect(loadStudio).toHaveBeenCalledOnce();
  });

  it("goes from Solid Memo to the Studio and back in one session, fetching the Studio once", async () => {
    const useCases = makeUseCasesFake({ restoreSession: vi.fn(async () => ({ session, origin: "restored" as const })) });
    const loadStudio = vi.fn(async () => studioModule);
    renderApp(useCases, loadStudio);
    expect(await screen.findByRole("link", { name: "Solid Memo" })).toHaveAttribute("href", "#/");

    follow("#/studio?instance=a");
    expect(await screen.findByRole("heading", { name: "The Studio's screens" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Solid Memo Studio" })).toHaveAttribute("href", "#/studio");

    follow("#/");
    expect(await screen.findByRole("link", { name: "Solid Memo" })).toHaveAttribute("href", "#/");
    expect(screen.queryByRole("heading", { name: "The Studio's screens" })).toBeNull();

    follow("#/studio/instances");
    expect(await screen.findByRole("heading", { name: "The Studio's screens" })).toBeInTheDocument();
    expect(useCases.restoreSession).toHaveBeenCalledOnce();
    expect(loadStudio).toHaveBeenCalledOnce();
  });

  it("says the Studio is opening while its code is on its way, under the masthead", async () => {
    window.history.replaceState(null, "", "#/studio");
    const useCases = makeUseCasesFake({ restoreSession: vi.fn(async () => ({ session, origin: "restored" as const })) });
    let arrive!: (module: StudioModule) => void;
    renderApp(useCases, () => new Promise((resolve) => (arrive = resolve)));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Opening the Studio…"));
    expect(screen.getByRole("link", { name: "Solid Memo Studio" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("id");
    await act(async () => arrive(studioModule));
    expect(await screen.findByRole("heading", { name: "The Studio's screens" })).toBeInTheDocument();
  });

  it("says so when the Studio's code cannot be fetched", async () => {
    window.history.replaceState(null, "", "#/studio");
    const useCases = makeUseCasesFake({ restoreSession: vi.fn(async () => ({ session, origin: "restored" as const })) });
    renderApp(useCases, () => Promise.reject(new TypeError("Failed to fetch dynamically imported module")));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("The Studio could not be opened. Reload the page to try again."),
    );
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
  });
});
