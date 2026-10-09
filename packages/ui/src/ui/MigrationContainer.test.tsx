import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MigrationContainer } from "./MigrationContainer";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import type { MigrationPlan } from "@solid-memo/domain/migration";
import type { UpdateOutcome, UpdateProgress } from "@solid-memo/domain/instanceUpdate";
import { makeUseCasesFake } from "../test/useCasesFake";
import { AppError } from "@solid-memo/domain/appError";
import { I18nProvider } from "./i18n";

const instance: Instance = {
  url: "https://pod.example/solid-memo/a/",
  name: "Main",
};
const deck: Deck = {
  id: "deck-1",
  url: `${instance.url}catalog.ttl#deck-1`,
  title: { en: "Kanji N5" },
  cardsDocumentUrl: `${instance.url}decks/deck-1.ttl`,
  reviewsDocumentUrl: `${instance.url}reviews/deck-1.ttl`,
  direction: "front-to-back",
  createdAt: "2026-09-21T10:00:00.000Z",
  formatVersion: 1,
  authors: [],
};
const nothing = { reviewCount: 0, preferencesOutdated: false, instanceOutdated: false, catalogMissing: false };
const session = { webId: "https://alice.example/profile/card#me" };
const outdated: MigrationPlan = {
  decks: [{ deck, deckOutdated: true, cardCount: 3, reviewCount: 0 }],
  deckCount: 1,
  cardCount: 3,
  ...nothing,
};
const current: MigrationPlan = { decks: [], deckCount: 0, cardCount: 0, ...nothing };

function renderContainer(useCases: UseCases) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  render(
    <QueryClientProvider client={queryClient}>
      <MigrationContainer useCases={useCases} session={session} instance={instance} />
    </QueryClientProvider>,
  );
  return { invalidate, queryClient };
}

describe("MigrationContainer", () => {
  it("shows nothing while planning, when nothing is outdated, or when the check fails", async () => {
    const useCases = makeUseCasesFake({
      planMigration: vi.fn(async () => current),
    });
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <MigrationContainer useCases={useCases} session={session} instance={instance} />
      </QueryClientProvider>,
    );
    expect(container).toBeEmptyDOMElement();
    await waitFor(() => {
      expect(useCases.planMigration).toHaveBeenCalledWith(instance.url);
    });
    expect(container).toBeEmptyDOMElement();

    const failing = render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MigrationContainer
          useCases={makeUseCasesFake({
            planMigration: vi.fn(async () => {
              throw new Error("pod unreachable");
            }),
          })}
          session={session}
          instance={instance}
        />
      </QueryClientProvider>,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(failing.container).toBeEmptyDOMElement();
  });

  it("asks before updating, and does nothing when the user says not now", async () => {
    const useCases = makeUseCasesFake({ planMigration: vi.fn(async () => outdated) });
    renderContainer(useCases);
    // Shown with the screen, the notice leaves the focus be; it says how the update goes.
    const notice = await screen.findByRole("region", { name: "Format update" });
    expect(notice).not.toHaveFocus();
    expect(notice).toHaveTextContent("Updating brings each document up to date on its own, where it is, one after another");
    expect(notice).toHaveTextContent("one that cannot be updated now is left as it is, and you can try again");
    expect(notice).not.toHaveTextContent(/backup|copy/);
    fireEvent.click(screen.getByRole("button", { name: "Update 1 deck" }));
    // The question takes the notice's place and its focus, read out as its description.
    const confirm = screen.getByRole("region", { name: "Start the update" });
    expect(confirm).toHaveTextContent("Solid Memo updates the documents of Main one by one, each where it is");
    expect(confirm).toHaveTextContent("Every document can be read throughout, whether it is updated yet or not.");
    expect(confirm).toHaveTextContent("where your Pod checks this, only if nothing else changed it since Solid Memo read it.");
    expect(confirm).toHaveTextContent("is left as it is, and you can try again: then only what is still outdated is updated.");
    expect(confirm).toHaveTextContent("Every address stays the same");
    expect(confirm).not.toHaveTextContent(/backup|restore|put back/i);
    expect(confirm).toHaveFocus();
    expect(confirm).toHaveAccessibleDescription(/How the update keeps your data safe/);
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.getByRole("button", { name: "Update 1 deck" })).toBeEnabled();
    expect(screen.getByRole("region", { name: "Format update" })).toHaveFocus();
    expect(useCases.updateInstance).not.toHaveBeenCalled();
  });

  it("runs the update once started, showing its progress document by document, then reads everything again and says it is done", async () => {
    let finish: (outcome: UpdateOutcome) => void = () => undefined;
    let report: ((progress: UpdateProgress) => void) | undefined;
    let plan = outdated;
    const useCases = makeUseCasesFake({
      planMigration: vi.fn(async () => plan),
      updateInstance: vi.fn((_s, _i, onProgress) => {
        report = onProgress;
        return new Promise<UpdateOutcome>((resolve) => (finish = resolve));
      }),
    });
    const { invalidate } = renderContainer(useCases);
    fireEvent.click(await screen.findByRole("button", { name: "Update 1 deck" }));
    fireEvent.click(screen.getByRole("button", { name: "Start the update" }));
    await waitFor(() => expect(screen.getByRole("region", { name: "Updating" })).toHaveTextContent("Finding what to update…"));
    expect(screen.getByRole("region", { name: "Updating" })).toHaveFocus();
    await waitFor(() => expect(report).toBeDefined());
    act(() => report!({ step: "write", done: 1, total: 3, part: { done: 3, total: 10 } }));
    expect(screen.getByRole("region", { name: "Updating" })).toHaveTextContent("Updating your documents…3 of 10 documents");
    expect(screen.getByRole("progressbar", { name: "Update progress" })).toHaveAttribute("value", "1.3");
    act(() => report!({ step: "write", done: 1, total: 3, part: { done: 0, total: 1 } }));
    expect(screen.getByRole("region", { name: "Updating" })).toHaveTextContent("0 of 1 document");
    act(() => report!({ step: "register", done: 2, total: 3 }));
    expect(screen.getByRole("status")).toHaveTextContent(/^Making your data findable by other apps…$/);
    expect(within(screen.getByRole("region", { name: "Updating" })).getAllByRole("listitem").map((step) => step.textContent)).toEqual([
      "✓Finding what to update (done)",
      "✓Updating your documents (done)",
      "➜Making your data findable by other apps (in progress)",
    ]);
    expect(screen.getByRole("region", { name: "Updating" })).toHaveTextContent(
      "Should it be cut off, every document can still be read, updated or not, and you can update the rest later.",
    );
    plan = current;
    act(() => finish({ updated: [{ url: deck.cardsDocumentUrl, holds: "cards", deck: deck.title }], failed: [] }));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith());
    expect(await screen.findByRole("status")).toHaveTextContent(/^Your data is up to date\.$/);
    expect(useCases.updateInstance).toHaveBeenCalledWith(session, instance, expect.any(Function));
  });

  it("lists the documents it could not update, each with why, and tries again, or goes back to the offer", async () => {
    const changed = new AppError("changedElsewhere", { url: deck.cardsDocumentUrl });
    const outcomes: UpdateOutcome[] = [
      {
        updated: [{ url: `${instance.url}meta.ttl`, holds: "instance" }],
        failed: [
          { url: deck.cardsDocumentUrl, holds: "cards", deck: deck.title, error: changed },
          { url: deck.reviewsDocumentUrl, holds: "reviews", deck: deck.title, error: new TypeError("Failed to fetch") },
          { url: `${instance.url}preferences.ttl`, holds: "preferences", error: "refused" },
          { url: `${instance.url}catalog.ttl`, holds: "catalog", error: "refused" },
        ],
      },
      { updated: [], failed: [{ url: `${instance.url}meta.ttl`, holds: "instance", error: "refused" }] },
      { updated: [], failed: [] },
    ];
    const useCases = makeUseCasesFake({
      planMigration: vi.fn(async () => outdated),
      updateInstance: vi.fn(async () => outcomes.shift()!),
    });
    const { invalidate } = renderContainer(useCases);
    fireEvent.click(await screen.findByRole("button", { name: "Update 1 deck" }));
    fireEvent.click(screen.getByRole("button", { name: "Start the update" }));
    let result = await screen.findByRole("region", { name: "Update not finished" });
    // It takes the progress's focus, read out with what is left as its description.
    expect(result).toHaveFocus();
    expect(result).toHaveAccessibleDescription(/^4 documents could not be updated now:/);
    expect(within(result).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      expect.stringMatching(/^The cards of Kanji N5: This was changed elsewhere, perhaps in another tab or app, since Solid Memo read it/),
      expect.stringMatching(/^The review states of Kanji N5: /),
      expect.stringMatching(/^Your preferences: /),
      expect.stringMatching(/^The catalogue of the decks: /),
    ]);
    expect(result).toHaveTextContent(
      "1 other document was updated. Every document can be read as it is, updated or not. Trying again updates only what is still outdated.",
    );
    // What it wrote is read again.
    expect(invalidate).toHaveBeenCalledWith();
    fireEvent.click(within(result).getByRole("button", { name: "Try again" }));
    result = await screen.findByRole("region", { name: "Update not finished" });
    expect(result).toHaveTextContent("1 document could not be updated now:The instance record:");
    expect(result).not.toHaveTextContent("other document");
    expect(useCases.updateInstance).toHaveBeenCalledTimes(2);
    fireEvent.click(within(result).getByRole("button", { name: "Close" }));
    expect(screen.getByRole("region", { name: "Format update" })).toHaveFocus();
    // Run again from the offer, it finishes.
    fireEvent.click(screen.getByRole("button", { name: "Update 1 deck" }));
    fireEvent.click(screen.getByRole("button", { name: "Start the update" }));
    await waitFor(() => expect(useCases.updateInstance).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Updating" })).toBeNull());
    expect(screen.queryByRole("region", { name: "Update not finished" })).toBeNull();
  });

  it("says in Swedish what it could not update", async () => {
    const useCases = makeUseCasesFake({
      planMigration: vi.fn(async () => outdated),
      updateInstance: vi.fn(async (): Promise<UpdateOutcome> => ({
        updated: [],
        failed: [{ url: deck.cardsDocumentUrl, holds: "cards", deck: deck.title, error: "refused" }],
      })),
    });
    render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <MigrationContainer useCases={useCases} session={session} instance={instance} />
        </QueryClientProvider>
      </I18nProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Uppdatera 1 kortlek" }));
    fireEvent.click(screen.getByRole("button", { name: "Starta uppdateringen" }));
    const result = await screen.findByRole("region", { name: "Uppdateringen blev inte klar" });
    expect(result).toHaveTextContent("1 dokument kunde inte uppdateras nu:Korten i Kanji N5:");
    expect(result).toHaveTextContent("Varje dokument går att läsa som det är, uppdaterat eller inte.");
    expect(within(result).getByRole("button", { name: "Försök igen" })).toBeInTheDocument();
  });

  it("shows an error thrown by the update, before it wrote anything, on the offer", async () => {
    const useCases = makeUseCasesFake({
      planMigration: vi.fn(async () => outdated),
      updateInstance: vi.fn(async () => {
        throw new Error("catalogue unreadable");
      }),
    });
    renderContainer(useCases);
    fireEvent.click(await screen.findByRole("button", { name: "Update 1 deck" }));
    fireEvent.click(screen.getByRole("button", { name: "Start the update" }));
    expect(await screen.findByText("catalogue unreadable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update 1 deck" })).toBeEnabled();
  });
});
