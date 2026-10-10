import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { AppError } from "@solid-memo/domain/appError";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import type { ReleaseDraftSummary } from "@solid-memo/domain/release/draftLayout";
import { makeUseCasesFake } from "@solid-memo/ui/test/useCasesFake";
import { draftsKey } from "./DraftsContainer";
import { draftKey } from "./draftEditor";
import { publicKey, publishedKey } from "./releaseActions";
import { ReleasesContainer } from "./ReleasesContainer";
import { instanceA, invalidReport } from "../test/fixtures";

const SOLID = `${instanceA.url}releases/solid/v1.ttl`;
const next: ReleaseDraftSummary = {
  url: `${instanceA.url}drafts/solid/v2/release.ttl`,
  instanceUrl: instanceA.url,
  name: "solid",
  version: 2,
  readable: true,
  title: { en: "Solid" },
  course: true,
};

function renderContainer(useCases: UseCases, onStarted = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const remove = vi.spyOn(queryClient, "removeQueries");
  render(
    <QueryClientProvider client={queryClient}>
      <ReleasesContainer useCases={useCases} instance={instanceA} healthHref="#/health" draftsHref="#/drafts" onStarted={onStarted} />
    </QueryClientProvider>,
  );
  return { invalidate, remove, onStarted };
}

describe("ReleasesContainer", () => {
  it("lists the instance's releases, makes one public again, and reads them afresh", async () => {
    let shared = false;
    const useCases = makeUseCasesFake({
      listPublishedReleases: vi.fn(async () => [{ url: SOLID, public: shared }]),
      makeReleasePublic: vi.fn(async () => {
        shared = true;
      }),
    });
    const { invalidate } = renderContainer(useCases);
    expect(screen.getByText("Reading the releases…")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Make solid, version 1 public" }));
    expect(await screen.findByRole("cell", { name: "Everyone" })).toBeInTheDocument();
    expect(useCases.makeReleasePublic).toHaveBeenCalledWith(SOLID);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: publicKey(SOLID) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: publishedKey(instanceA.url) });
  });

  it("starts the next version of a release, forgets what was read at its draft's URL, and opens it", async () => {
    const useCases = makeUseCasesFake({
      listPublishedReleases: vi.fn(async () => [{ url: SOLID, public: true }]),
      createReleaseDraft: vi.fn(async () => ({ draft: next })),
    });
    const { onStarted, remove, invalidate } = renderContainer(useCases);
    // Nothing is changed until the instance's data check is done.
    const start = await screen.findByRole("button", { name: "Start the next version of solid, version 1" });
    await waitFor(() => expect(start).toBeEnabled());
    fireEvent.click(start);
    await waitFor(() => expect(onStarted).toHaveBeenCalledWith({ draft: next }));
    expect(useCases.createReleaseDraft).toHaveBeenCalledWith(instanceA.url, { kind: "nextVersionOf", url: SOLID });
    expect(remove).toHaveBeenCalledWith({ queryKey: draftKey(next.url) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: draftsKey(instanceA.url) });
  });

  it("says what it does while it does it", async () => {
    let finish = () => undefined as void;
    const useCases = makeUseCasesFake({
      listPublishedReleases: vi.fn(async () => [{ url: SOLID, public: false }]),
      makeReleasePublic: vi.fn(() => new Promise<void>((resolve) => (finish = resolve))),
      createReleaseDraft: vi.fn(() => new Promise<never>(() => undefined)),
    });
    renderContainer(useCases);
    fireEvent.click(await screen.findByRole("button", { name: "Make solid, version 1 public" }));
    expect(await screen.findByText("Making the release public…")).toBeInTheDocument();
    finish();
    await waitFor(() => expect(screen.queryByText("Making the release public…")).not.toBeInTheDocument());
    const start = screen.getByRole("button", { name: "Start the next version of solid, version 1" });
    await waitFor(() => expect(start).toBeEnabled());
    fireEvent.click(start);
    expect(await screen.findByText("Starting the next version…")).toBeInTheDocument();
  });

  it("holds a next version while the instance's catalogue is set aside", async () => {
    const useCases = makeUseCasesFake({
      getPreferences: vi.fn(async () => ({ ...DEFAULT_PREFERENCES, invalidDataPolicy: "block-subject" as const })),
      checkInstance: vi.fn(async () => invalidReport([], { catalogue: true })),
      listPublishedReleases: vi.fn(async () => [{ url: SOLID, public: true }]),
    });
    renderContainer(useCases);
    expect(await screen.findByText(/catalogue or one of its groups has invalid data/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start the next version of solid, version 1" })).toBeDisabled();
  });

  it("says why the releases could not be read", async () => {
    const failing = makeUseCasesFake({ listPublishedReleases: vi.fn(async () => Promise.reject(new AppError("cannotCheck"))) });
    renderContainer(failing);
    expect(await screen.findByText(/Solid Memo could not check your Pod/)).toBeInTheDocument();
  });
});
