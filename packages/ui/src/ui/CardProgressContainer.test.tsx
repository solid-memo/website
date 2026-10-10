import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CardProgressReport } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import { makeUseCasesFake } from "../test/useCasesFake";
import { CardProgressContainer } from "./CardProgressContainer";

const INSTANCE = { url: "https://pod.example/solid-memo/a/", name: "A" };
const deckOf = (id: string, title: string): Deck => ({
  id,
  url: `${INSTANCE.url}catalog.ttl#${id}`,
  title: { en: title },
  cardsDocumentUrl: `${INSTANCE.url}decks/${id}.ttl`,
  reviewsDocumentUrl: `${INSTANCE.url}reviews/${id}.ttl`,
  createdAt: "",
  formatVersion: 4,
  direction: "front-to-back",
  authors: [],
});
const capitals = deckOf("deck-1", "Capitals");
const rivers = deckOf("deck-2", "Rivers");
const report: CardProgressReport = {
  today: "2026-09-21",
  decks: [
    {
      deck: capitals,
      progress: { new: 2, young: 1, mature: 0 },
      forecast: [
        { studyDay: "2026-09-21", due: 1, reviews: 1 },
        { studyDay: "2026-09-22", due: 0, reviews: 0 },
      ],
    },
    {
      deck: rivers,
      progress: { new: 0, young: 1, mature: 3 },
      forecast: [
        { studyDay: "2026-09-21", due: 0, reviews: 0 },
        { studyDay: "2026-09-22", due: 2, reviews: 1 },
      ],
    },
  ],
};

function withQueries(node: preact.ComponentChildren) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{node}</QueryClientProvider>,
  );
}

describe("CardProgressContainer", () => {
  it("shows every deck's maturity and forecast together, then each deck's maturity", async () => {
    const useCases = makeUseCasesFake({ getCardProgress: vi.fn(async () => report) });
    const { container } = withQueries(<CardProgressContainer useCases={useCases} instance={INSTANCE} />);
    expect(screen.getByRole("heading", { name: "Where your cards stand" })).toBeInTheDocument();
    expect(screen.getByText("Loading your cards' progress…")).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: "2 new, 2 young and 3 mature." })).toBeInTheDocument();
    expect(useCases.getCardProgress).toHaveBeenCalledWith(INSTANCE.url, expect.any(Date), {});
    expect(container.querySelector('g[data-bar="2026-09-21"] rect.bar')).not.toBeNull();
    expect(container.querySelectorAll(".bar-chart rect.bar")).toHaveLength(2);
    expect(screen.getByRole("cell", { name: "2" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Maturity by deck" })).toBeInTheDocument();
    const decks = within(container.querySelector<HTMLElement>(".maturity-decks")!).getAllByRole("figure");
    expect(decks.map((figure) => figure.querySelector("figcaption")!.textContent)).toEqual(["Capitals", "Rivers"]);
    expect(within(decks[1]!).getByRole("img", { name: "0 new, 1 young and 3 mature." })).toBeInTheDocument();
  });

  it("shows one deck's progress alone, all new before its first answer", async () => {
    const useCases = makeUseCasesFake({
      getCardProgress: vi.fn(async () => ({
        today: "2026-09-21",
        decks: [{ deck: capitals, progress: { new: 4, young: 0, mature: 0 }, forecast: [] }],
      })),
    });
    const { container } = withQueries(<CardProgressContainer useCases={useCases} instance={INSTANCE} deck={capitals} />);
    expect(await screen.findByRole("img", { name: "4 new, 0 young and 0 mature." })).toBeInTheDocument();
    expect(useCases.getCardProgress).toHaveBeenCalledWith(INSTANCE.url, expect.any(Date), { deck: capitals });
    expect(container.querySelectorAll(".bar-chart rect.bar")).toHaveLength(0);
    expect(container.querySelectorAll(".bar-chart g[data-bar]")).toHaveLength(30);
    expect(screen.queryByRole("heading", { name: "Maturity by deck" })).toBeNull();
  });

  it("leaves out the decks' own bars when there are no decks", async () => {
    withQueries(<CardProgressContainer useCases={makeUseCasesFake()} instance={INSTANCE} />);
    expect(await screen.findByRole("img", { name: "0 new, 0 young and 0 mature." })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Maturity by deck" })).toBeNull();
  });

  it("says quietly when the progress cannot be read", async () => {
    const useCases = makeUseCasesFake({ getCardProgress: vi.fn(async () => Promise.reject(new Error("offline"))) });
    withQueries(<CardProgressContainer useCases={useCases} instance={INSTANCE} />);
    expect(await screen.findByText("Your cards' progress cannot be read just now.")).toBeInTheDocument();
    expect(screen.queryByText("offline")).toBeNull();
  });
});
