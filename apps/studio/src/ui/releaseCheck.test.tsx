import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { problem } from "@solid-memo/domain/release/problems";
import type { CheckPolicy, ReleaseCheck } from "@solid-memo/domain/release/releaseCheck";
import type { ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
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

describe("useReleaseCheck, as the draft and the policy change", () => {
  function Shown({ useCases, of, policy }: { useCases: UseCases; of: ReleaseDraft | null; policy: CheckPolicy }) {
    const found = useReleaseCheck(useCases, of, policy);
    return <p>{found.data === undefined ? "nothing" : `${found.data.drops.length} dropped`}</p>;
  }

  it("shows the last version's check while a newer one is checked, but not another draft's or policy's, and checks no draft", async () => {
    const pending: ((check: ReleaseCheck) => void)[] = [];
    const checkReleaseDraft = vi.fn(() => new Promise<ReleaseCheck>((resolve) => pending.push(resolve)));
    const useCases = makeUseCasesFake({ checkReleaseDraft });
    const queryClient = new QueryClient();
    const shown = (of: ReleaseDraft | null, policy: CheckPolicy = "pod") => (
      <QueryClientProvider client={queryClient}>
        <Shown useCases={useCases} of={of} policy={policy} />
      </QueryClientProvider>
    );
    const unread = problem(DRAFT_URL, { code: "previousUnread", params: { previous: "https://pod.example/v1.ttl" } });
    const view = render(shown(null));
    expect(checkReleaseDraft).not.toHaveBeenCalled();
    view.rerender(shown(draft));
    pending.shift()!(check([unread]));
    await screen.findByText("1 dropped");
    // A newer version: the last one's, until it is checked.
    view.rerender(shown({ ...draft }));
    expect(screen.getByText("1 dropped")).toBeInTheDocument();
    pending.shift()!(check([]));
    await screen.findByText("0 dropped");
    // Another policy, or another draft: nothing until it is checked.
    view.rerender(shown({ ...draft }, "library"));
    expect(screen.getByText("nothing")).toBeInTheDocument();
    view.rerender(shown({ ...draft, url: `${DRAFT_URL}-other` }));
    expect(screen.getByText("nothing")).toBeInTheDocument();
  });
});
