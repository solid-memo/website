// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { POD_PROVIDERS } from "@solid-memo/domain/podProvider";
import type { WorkspaceProps } from "@solid-memo/ui/App";
import { makeUseCasesFake } from "@solid-memo/ui/test/useCasesFake";
import type { Catalogs } from "@solid-memo/ui/i18n";
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

/** Catalogs as the Studio's are, each language's fetched by `fetch`. */
function catalogs(fetch: () => Promise<{ default: Catalogs["en"] }>): Catalogs {
  return { en: {}, others: { sv: fetch, ko: fetch, de: fetch, es: fetch, fr: fetch } };
}

const studioModule: StudioModule = {
  StudioWorkspace: FakeStudioWorkspace,
  STUDIO_CATALOGS: catalogs(async () => ({ default: {} })),
};

const source = { repoUrl: "https://git.example/memo", version: "0.1.0", commitSha: null };

function renderApp(
  useCases: UseCases,
  loadStudio: () => Promise<StudioModule>,
  appName = "Solid Memo",
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <App
        useCases={useCases}
        source={source}
        appName={appName}
        providers={POD_PROVIDERS}
        loadStudio={loadStudio}
      />
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
    expect(
      await screen.findByRole("heading", { level: 1, name: "Solid Memo" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Spaced-repetition flashcards that live in your own Solid Pod."),
    ).toBeInTheDocument();
    expect(loadStudio).not.toHaveBeenCalled();
  });

  it("is called by the site's own name", async () => {
    renderApp(
      makeUseCasesFake(),
      vi.fn(async () => studioModule),
      "Example School Cards",
    );
    expect(
      await screen.findByRole("heading", { level: 1, name: "Example School Cards" }),
    ).toBeInTheDocument();
  });

  it("names its version and links its repository in the footer", async () => {
    renderApp(
      makeUseCasesFake(),
      vi.fn(async () => studioModule),
    );
    const footer = await screen.findByRole("contentinfo");
    expect(footer).toHaveTextContent("Version 0.1.0");
    expect(
      within(footer).getByRole("link", { name: "Source code (opens in a new tab)" }),
    ).toHaveAttribute("href", "https://git.example/memo");
  });

  it("names the Studio at its routes, and fetches its code", async () => {
    window.history.replaceState(null, "", "#/studio");
    const loadStudio = vi.fn(async () => studioModule);
    renderApp(makeUseCasesFake(), loadStudio);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Solid Memo Studio" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("banner")).getByRole("link", { name: "Back to Solid Memo" }),
    ).toHaveAttribute("href", "#/");
    expect(loadStudio).toHaveBeenCalledOnce();
  });

  it("goes from Solid Memo to the Studio and back in one session, fetching the Studio once", async () => {
    const useCases = makeUseCasesFake({
      restoreSession: vi.fn(async () => ({ session, origin: "restored" as const })),
    });
    const loadStudio = vi.fn(async () => studioModule);
    renderApp(useCases, loadStudio);
    expect(await screen.findByRole("link", { name: "Solid Memo" })).toHaveAttribute("href", "#/");

    follow("#/studio?instance=a");
    expect(
      await screen.findByRole("heading", { name: "The Studio's screens" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Solid Memo Studio" })).toHaveAttribute(
      "href",
      "#/studio",
    );

    follow("#/");
    expect(await screen.findByRole("link", { name: "Solid Memo" })).toHaveAttribute("href", "#/");
    expect(screen.queryByRole("heading", { name: "The Studio's screens" })).toBeNull();

    follow("#/studio/instances");
    expect(
      await screen.findByRole("heading", { name: "The Studio's screens" }),
    ).toBeInTheDocument();
    expect(useCases.restoreSession).toHaveBeenCalledOnce();
    expect(loadStudio).toHaveBeenCalledOnce();
  });

  it("says the Studio is opening while its code is on its way, under the masthead", async () => {
    window.history.replaceState(null, "", "#/studio");
    const useCases = makeUseCasesFake({
      restoreSession: vi.fn(async () => ({ session, origin: "restored" as const })),
    });
    let arrive!: (module: StudioModule) => void;
    renderApp(useCases, () => new Promise((resolve) => (arrive = resolve)));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Opening the Studio…"),
    );
    expect(screen.getByRole("link", { name: "Solid Memo Studio" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("id");
    await act(async () => arrive(studioModule));
    expect(
      await screen.findByRole("heading", { name: "The Studio's screens" }),
    ).toBeInTheDocument();
  });

  it("says so when the Studio's code cannot be fetched", async () => {
    window.history.replaceState(null, "", "#/studio");
    const useCases = makeUseCasesFake({
      restoreSession: vi.fn(async () => ({ session, origin: "restored" as const })),
    });
    renderApp(useCases, () =>
      Promise.reject(new TypeError("Failed to fetch dynamically imported module")),
    );
    await waitFor(() =>
      expect(within(screen.getByRole("main")).getByRole("alert")).toHaveTextContent(
        "The Studio could not be opened. Reload the page to try again.",
      ),
    );
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
  });

  it("says so when the Studio's messages cannot be fetched", async () => {
    window.history.replaceState(null, "", "#/studio");
    const useCases = makeUseCasesFake({
      restoreSession: vi.fn(async () => ({ session, origin: "restored" as const })),
    });
    const offline = vi
      .fn<() => Promise<{ default: Catalogs["en"] }>>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue({ default: {} });
    renderApp(useCases, async () => ({ ...studioModule, STUDIO_CATALOGS: catalogs(offline) }));
    await waitFor(() =>
      expect(within(screen.getByRole("main")).getByRole("alert")).toHaveTextContent(
        "The Studio could not be opened. Reload the page to try again.",
      ),
    );
    expect(screen.queryByRole("heading", { name: "The Studio's screens" })).toBeNull();
  });

  it("shows no app, nor restores a session or fetches the Studio, inside another page's frame", async () => {
    window.history.replaceState(null, "", "#/studio");
    const top = vi.spyOn(window, "top", "get").mockReturnValue({} as Window);
    try {
      const useCases = makeUseCasesFake();
      const loadStudio = vi.fn(async () => studioModule);
      renderApp(useCases, loadStudio, "Memo Site");
      const link = screen.getByRole("link", { name: "Open it in a new tab" });
      expect(link).toHaveAttribute("href", window.location.href);
      expect(link).toHaveAttribute("target", "_blank");
      expect(screen.queryByRole("button")).toBeNull();
      expect(useCases.restoreSession).not.toHaveBeenCalled();
      expect(loadStudio).not.toHaveBeenCalled();
    } finally {
      top.mockRestore();
    }
  });
});
