import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { AppError } from "@solid-memo/domain/appError";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import type { ReleaseDraftSummary } from "@solid-memo/domain/release/draftLayout";
import { makeUseCasesFake } from "@solid-memo/ui/test/useCasesFake";
import { DraftsContainer, draftsKey } from "./DraftsContainer";
import { draftKey } from "./draftEditor";
import { courseDraft, instanceA, invalidReport, makeDeck } from "../test/fixtures";
import { answer } from "../test/dialogs";

const kanji = makeDeck("deck-1", { en: "Kanji N5" });
const solid: ReleaseDraftSummary = {
  url: `${instanceA.url}drafts/solid/v1/release.ttl`,
  instanceUrl: instanceA.url,
  name: "solid",
  version: 1,
  readable: true,
  title: { en: "Solid" },
  course: true,
};

function renderContainer(useCases: UseCases, queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const onCreated = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <DraftsContainer
        useCases={useCases}
        instance={instanceA}
        healthHref="#/health"
        releasesHref="#/releases"
        draftHref={(draft) => `#/draft/${draft.name}`}
        onCreated={onCreated}
      />
    </QueryClientProvider>,
  );
  return { invalidate, onCreated };
}

describe("DraftsContainer", () => {
  it("lists the instance's drafts, makes a new one and reads them afresh, staying to offer the next version of the release it is a copy of", async () => {
    const useCases = makeUseCasesFake({
      listDecks: vi.fn(async () => [kanji]),
      listReleaseDrafts: vi.fn(async () => [solid]),
      createReleaseDraft: vi.fn(async () => ({ draft: { ...solid, name: "kanji", title: { en: "Kanji N5" } }, basedOn: "https://x.example/v1.ttl" })),
    });
    const { invalidate, onCreated } = renderContainer(useCases);
    expect(screen.getByText("Reading the drafts…")).toBeInTheDocument();
    expect(await screen.findByRole("rowheader", { name: "Solid" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "A deck of this instance" }));
    fireEvent.click(screen.getByRole("button", { name: "Create the draft" }));
    expect(await screen.findByText("Created the draft Kanji N5, version 1.")).toBeInTheDocument();
    expect(useCases.createReleaseDraft).toHaveBeenCalledWith(instanceA.url, { kind: "fromDeck", deck: kanji });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: draftsKey(instanceA.url) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["validation", instanceA.url] });
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("deletes a draft once confirmed, and says why one could not be made or deleted", async () => {
    const useCases = makeUseCasesFake({
      listReleaseDrafts: vi.fn(async () => [solid]),
      createReleaseDraft: vi.fn(async () => {
        throw new AppError("releaseUnreadable", { url: "https://x.example/" });
      }),
    });
    vi.mocked(useCases.deleteReleaseDraft).mockRejectedValueOnce(new AppError("draftGone"));
    renderContainer(useCases);
    fireEvent.click(await screen.findByRole("button", { name: "Delete the draft Solid, version 1" }));
    answer("Delete the draft", "Delete");
    expect(await screen.findByText("That draft no longer exists. Perhaps it was deleted in another tab or app.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Delete the draft Solid, version 1" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Delete the draft Solid, version 1" }));
    answer("Delete the draft", "Delete");
    expect(await screen.findByText("Deleted the draft Solid, version 1.")).toBeInTheDocument();
    expect(useCases.deleteReleaseDraft).toHaveBeenCalledWith(solid);
    fireEvent.click(screen.getByRole("radio", { name: "The next version of a release" }));
    fireEvent.input(screen.getByRole("textbox", { name: "Address of the release" }), { target: { value: "https://x.example/" } });
    fireEvent.click(screen.getByRole("button", { name: "Create the draft" }));
    expect(await screen.findByText(/Solid Memo cannot read a release at https:\/\/x.example\//)).toBeInTheDocument();
  });

  it("forgets what was read of a draft deleted, so a new draft at its URL is read afresh, and opens the new one", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const useCases = makeUseCasesFake({
      listDecks: vi.fn(async () => [kanji]),
      listReleaseDrafts: vi.fn(async () => [solid]),
      createReleaseDraft: vi.fn(async () => ({ draft: solid })),
    });
    queryClient.setQueryData(draftKey(solid.url), courseDraft());
    const { onCreated } = renderContainer(useCases, queryClient);
    fireEvent.click(await screen.findByRole("button", { name: "Delete the draft Solid, version 1" }));
    answer("Delete the draft", "Delete");
    expect(await screen.findByText("Deleted the draft Solid, version 1.")).toBeInTheDocument();
    expect(queryClient.getQueryData(draftKey(solid.url))).toBeUndefined();
    // Read in another tab meanwhile, say: a new draft at the URL is not that one.
    queryClient.setQueryData(draftKey(solid.url), courseDraft());
    fireEvent.click(screen.getByRole("radio", { name: "A deck of this instance" }));
    fireEvent.click(screen.getByRole("button", { name: "Create the draft" }));
    expect(await screen.findByText("Created the draft Solid, version 1.")).toBeInTheDocument();
    expect(queryClient.getQueryData(draftKey(solid.url))).toBeUndefined();
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ draft: solid }));
  });

  it("says which draft it is deleting while it does", async () => {
    let finish: () => void = () => undefined;
    const useCases = makeUseCasesFake({ listReleaseDrafts: vi.fn(async () => [solid]) });
    vi.mocked(useCases.deleteReleaseDraft).mockImplementationOnce(() => new Promise((resolve) => (finish = () => resolve())));
    renderContainer(useCases);
    fireEvent.click(await screen.findByRole("button", { name: "Delete the draft Solid, version 1" }));
    answer("Delete the draft", "Delete");
    expect(await screen.findByText("Deleting the draft Solid…")).toBeInTheDocument();
    finish();
    expect(await screen.findByText("Deleted the draft Solid, version 1.")).toBeInTheDocument();
  });

  it("holds every change while the instance's catalog is set aside", async () => {
    const useCases = makeUseCasesFake({
      getPreferences: vi.fn(async () => ({ ...DEFAULT_PREFERENCES, invalidDataPolicy: "block-subject" as const })),
      checkInstance: vi.fn(async () => invalidReport([], { catalog: true })),
      listReleaseDrafts: vi.fn(async () => [solid]),
    });
    renderContainer(useCases);
    expect(await screen.findByText(/catalog or one of its groups has invalid data/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete the draft Solid, version 1" })).toBeDisabled();
  });

  it("says why the drafts could not be read", async () => {
    const useCases = makeUseCasesFake({ listReleaseDrafts: vi.fn(async () => Promise.reject(new AppError("cannotCheck"))) });
    renderContainer(useCases);
    expect(await screen.findByText("Solid Memo could not check your Pod. Check your connection and try again.")).toBeInTheDocument();
  });

  it("says why the decks could not be read", async () => {
    const useCases = makeUseCasesFake({ listDeckTree: vi.fn(async () => Promise.reject(new AppError("cannotCheck"))) });
    renderContainer(useCases);
    expect(await screen.findByText("Solid Memo could not check your Pod. Check your connection and try again.")).toBeInTheDocument();
  });
});
