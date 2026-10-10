import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import { problem } from "@solid-memo/domain/release/problems";
import type { ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { makeUseCasesFake } from "@solid-memo/ui/test/useCasesFake";
import type { DraftEditor } from "./draftEditor";
import { ReleasePublishContainer } from "./ReleasePublishContainer";
import { courseDraft, DRAFT_URL, invalidReport } from "../test/fixtures";

const TARGET = "https://pod.example/solid-memo/a/releases/solid/v1.ttl";
const links = { checkHref: "#/check", libraryCheckHref: "#/check-library", healthHref: "#/health" };

function renderContainer(useCases: UseCases, draft: ReleaseDraft = courseDraft()) {
  const editor: DraftEditor = { draft, error: null, readOnly: null, edit: vi.fn(() => null), saving: false, failure: null };
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ReleasePublishContainer useCases={useCases} editor={editor} links={links} onStarted={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe("ReleasePublishContainer", () => {
  it("asks whether a draft's release is public, as no one", async () => {
    const useCases = makeUseCasesFake({ isReleasePublic: vi.fn(async () => false) });
    renderContainer(useCases, { ...courseDraft(), root: { ...courseDraft().root, releasedAs: TARGET } });
    expect(await screen.findByText(/Only you can read it/)).toBeInTheDocument();
    expect(useCases.isReleasePublic).toHaveBeenCalledWith(TARGET);
  });

  it("counts the errors of the release check's rules, not its warnings", async () => {
    const error = problem(DRAFT_URL, { code: "unshaped", params: {} });
    const warning = problem(DRAFT_URL, { code: "unshaped", params: {} }, { severity: "warning" });
    const useCases = makeUseCasesFake({
      checkReleaseDraft: vi.fn(async () => ({ rules: [error, warning], library: [error], drops: [error], markdown: [warning], shapes: null })),
    });
    renderContainer(useCases);
    expect(await screen.findByRole("link", { name: "The release check finds 2 errors. Fix them before you publish." })).toBeInTheDocument();
  });

  it("holds publishing while the instance's catalogue is set aside", async () => {
    const useCases = makeUseCasesFake({
      getPreferences: vi.fn(async () => ({ ...DEFAULT_PREFERENCES, invalidDataPolicy: "block-subject" as const })),
      checkInstance: vi.fn(async () => invalidReport([], { catalogue: true })),
    });
    renderContainer(useCases);
    expect(await screen.findByText(/catalogue or one of its groups has invalid data/)).toBeInTheDocument();
  });
});
