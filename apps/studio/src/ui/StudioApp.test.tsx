import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { makeUseCasesFake } from "@solid-memo/ui/test/useCasesFake";
import { StudioApp } from "./StudioApp";
import { instanceA, session } from "../test/fixtures";

function renderApp(useCases: UseCases) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <StudioApp
        useCases={useCases}
        commitSha="8faa7e1bd2e6de2b6570d692fd2865bb4b3217ad"
      />
    </QueryClientProvider>,
  );
}

describe("StudioApp", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", window.location.pathname);
  });

  it("logs in as Solid Memo does, under its own name", async () => {
    renderApp(makeUseCasesFake());
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Solid Memo Studio",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Manage the decks in your Solid Pod."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "I already have a Pod" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("banner")).getByRole("link", {
        name: "Back to Solid Memo",
      }),
    ).toHaveAttribute("href", "../#/");
    await waitFor(() =>
      expect(document.title).toBe("Log in – Solid Memo Studio"),
    );
  });

  it("opens the Studio in a session restored on the site, in the user's language", async () => {
    const useCases = makeUseCasesFake({
      language: vi.fn(() => "sv" as const),
      restoreSession: vi.fn(async () => ({
        session,
        origin: "restored" as const,
      })),
      listInstances: vi.fn(async () => [instanceA]),
    });
    renderApp(useCases);
    expect(
      await screen.findByRole("link", { name: "Solid Memo Studio" }),
    ).toHaveAttribute("href", "#/");
    expect(
      within(screen.getByRole("banner")).getByRole("link", {
        name: "Tillbaka till Solid Memo",
      }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Kortlekar" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(document.title).toBe("Kortlekar – Solid Memo Studio"),
    );
  });
});
