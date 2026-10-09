import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DeckCreatorContainer } from "./DeckCreatorContainer";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import { makeUseCasesFake } from "../test/useCasesFake";
import { rememberLanguage } from "./remembered";

const instance: Instance = {
  url: "https://pod.example/solid-memo/a/",
  name: "Japanese study",
};

const deck: Deck = {
  id: "deck-1",
  url: `${instance.url}catalog.ttl#deck-1`,
  title: { en: "Kana" },
  cardsDocumentUrl: `${instance.url}decks/deck-1.ttl`,
  reviewsDocumentUrl: `${instance.url}reviews/deck-1.ttl`,
  direction: "front-to-back",
  createdAt: "2026-09-21T10:00:00.000Z",
  formatVersion: 1,
  authors: [],
};

function renderContainer(useCases: UseCases) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onDone = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <DeckCreatorContainer
        useCases={useCases}
        instance={instance}
        onDone={onDone}
      />
    </QueryClientProvider>,
  );
  return { onDone };
}

// The deck's name is in the language last chosen for a deck's text on this device.
beforeEach(() => {
  localStorage.clear();
  rememberLanguage("deck", "en");
});

describe("DeckCreatorContainer", () => {
  it("creates the deck and returns to the deck list", async () => {
    const useCases = makeUseCasesFake({
      createDeck: vi.fn(async () => deck),
    });
    const { onDone } = renderContainer(useCases);

    fireEvent.input(screen.getByLabelText("Name"), {
      target: { value: "Kana" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Create deck" }).closest("form")!,
    );

    await waitFor(() => {
      expect(onDone).toHaveBeenCalledOnce();
    });
    expect(useCases.createDeck).toHaveBeenCalledWith(instance.url, { en: "Kana" });
  });

  it("shows a create error and stays on the creator", async () => {
    const useCases = makeUseCasesFake({
      createDeck: vi.fn(async () => {
        throw new Error("save refused");
      }),
    });
    const { onDone } = renderContainer(useCases);

    fireEvent.input(screen.getByLabelText("Name"), {
      target: { value: "X" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Create deck" }).closest("form")!,
    );

    // Said in the alert that was there, empty, all along, so screen readers hear it.
    const alert = document.getElementById("deck-creator-error")!;
    expect(alert).toHaveAttribute("role", "alert");
    expect(alert.textContent).toBe("");
    await waitFor(() => expect(alert).toHaveTextContent("save refused"));
    expect(onDone).not.toHaveBeenCalled();

    // Trying again clears the alert while the save runs, so the same error would be said again.
    vi.mocked(useCases.createDeck).mockReturnValueOnce(new Promise(() => {}));
    fireEvent.submit(
      screen.getByRole("button", { name: "Create deck" }).closest("form")!,
    );
    await waitFor(() => expect(alert.textContent).toBe(""));
  });

});
