import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { problem } from "@solid-memo/domain/release/problems";
import type { ReleaseCheck } from "@solid-memo/domain/release/releaseCheck";
import { makeUseCasesFake } from "@solid-memo/ui/test/useCasesFake";
import { useReleaseCheck } from "./releaseCheck";
import { courseDraft, DRAFT_URL } from "../test/fixtures";

const draft = courseDraft();

function Probe({ useCases }: { useCases: UseCases }) {
  const check = useReleaseCheck(useCases, draft, "pod");
  return <p>{check.data === undefined ? "checking" : `${check.data.drops.length} dropped`}</p>;
}

/** The check's screen opened, closed, and opened again, with the same query client. */
async function openedTwice(checks: ReleaseCheck[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const checkReleaseDraft = vi.fn(async () => checks.shift()!);
  const useCases = makeUseCasesFake({ checkReleaseDraft });
  const open = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <Probe useCases={useCases} />
      </QueryClientProvider>,
    );
  const first = open();
  await first.findByText(/dropped/);
  first.unmount();
  const second = open();
  await second.findByText(/dropped/);
  return { checkReleaseDraft, second };
}

const check = (drops: ReleaseCheck["drops"]): ReleaseCheck => ({ rules: [], library: [], drops, markdown: [], shapes: null });

describe("useReleaseCheck", () => {
  it("keeps a whole check of a version of the draft", async () => {
    const { checkReleaseDraft } = await openedTwice([check([])]);
    expect(checkReleaseDraft).toHaveBeenCalledTimes(1);
  });

  it("checks again, when it is shown again, a check whose release before could not be read", async () => {
    const unread = problem(DRAFT_URL, { code: "previousUnread", params: { previous: "https://pod.example/v1.ttl" } });
    const { checkReleaseDraft, second } = await openedTwice([check([unread]), check([])]);
    await second.findByText("0 dropped");
    expect(checkReleaseDraft).toHaveBeenCalledTimes(2);
  });
});
