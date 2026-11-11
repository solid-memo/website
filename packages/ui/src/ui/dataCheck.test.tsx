// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/preact";
import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import type { InvalidDataPolicy } from "@solid-memo/domain/invalidDataPolicy";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import {
  summarize,
  unreadableDocument,
  type ValidationReport,
} from "@solid-memo/domain/validation";
import { makeUseCasesFake } from "../test/useCasesFake";
import { useDataCheck } from "./dataCheck";

const INSTANCE = "https://pod.example/solid-memo/a/";

function deckOf(id: string): Deck {
  return {
    id,
    url: `${INSTANCE}catalog.ttl#${id}`,
    title: { en: id },
    cardsDocumentUrl: `${INSTANCE}decks/${id}.ttl`,
    reviewsDocumentUrl: `${INSTANCE}reviews/${id}.ttl`,
    direction: "front-to-back",
    createdAt: "2026-09-21T10:00:00.000Z",
    formatVersion: 6,
    authors: [],
  };
}

const bad = deckOf("bad");
const good = deckOf("good");

/** A report with the bad deck's cards document invalid, the catalog too when asked, and another app's subject only warned about. */
function invalid(catalog = false): ValidationReport {
  const violation = {
    message: { en: "Less than 1 values" },
    severity: "violation" as const,
    constraint: "MinCount",
  };
  return {
    instanceUrl: INSTANCE,
    violationCount: catalog ? 2 : 1,
    conforms: false,
    documents: [
      {
        url: bad.cardsDocumentUrl,
        status: "checked",
        subjects: [
          {
            url: `${bad.cardsDocumentUrl}#c1`,
            status: "checked",
            shape: "card",
            version: 5,
            violations: [violation],
          },
        ],
      },
      {
        url: good.cardsDocumentUrl,
        status: "checked",
        subjects: [{ url: `${good.cardsDocumentUrl}#theirs`, status: "foreign", violations: [] }],
      },
      ...(catalog
        ? [
            {
              url: `${INSTANCE}catalog.ttl`,
              status: "checked" as const,
              subjects: [
                {
                  url: `${INSTANCE}catalog.ttl#catalog`,
                  status: "checked" as const,
                  shape: "catalog" as const,
                  version: 1,
                  violations: [violation],
                },
              ],
            },
          ]
        : []),
    ],
  } as ValidationReport;
}

function Probe({ useCases, instanceUrl }: { useCases: UseCases; instanceUrl: string | null }) {
  const check = useDataCheck(useCases, instanceUrl);
  return (
    <p>
      {[
        `policy ${check.policy}`,
        `instance ${check.readOnly() ?? "open"}`,
        `bad ${check.readOnly(bad) ?? "open"}`,
        `good ${check.readOnly(good) ?? "open"}`,
        `arrangement ${check.arrangementSetAside ? "aside" : "open"}`,
        `error ${check.error === null ? "none" : check.error.message}`,
        `unclaimed ${check.unclaimed.length}`,
      ].join(", ")}
    </p>
  );
}

function renderProbe(overrides: Partial<UseCases>, instanceUrl: string | null = INSTANCE) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Probe useCases={makeUseCasesFake(overrides)} instanceUrl={instanceUrl} />
    </QueryClientProvider>,
  );
}

const withPolicy = (invalidDataPolicy: InvalidDataPolicy) =>
  vi.fn(async () => ({ ...DEFAULT_PREFERENCES, invalidDataPolicy }));

describe("useDataCheck", () => {
  it("holds everything while the check is made, as under blocking the instance until the preferences are read", async () => {
    const checkInstance = vi.fn(() => new Promise<ValidationReport>(() => undefined));
    renderProbe({ checkInstance });
    expect(
      screen.getByText(/policy block-instance, instance checking, bad checking/),
    ).toBeInTheDocument();
    expect(await screen.findByText(/policy block-subject, instance checking/)).toBeInTheDocument();
    // Coming back to the tab while it is made does not make it again.
    try {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    } finally {
      focusManager.setFocused(undefined);
    }
    expect(checkInstance).toHaveBeenCalledTimes(1);
  });

  it("waits for no instance", () => {
    renderProbe({}, null);
    expect(screen.getByText(/instance checking/)).toBeInTheDocument();
  });

  it("sets aside only the deck with invalid data, another app's subjects only warned about", async () => {
    renderProbe({ checkInstance: vi.fn(async () => invalid()) });
    expect(
      await screen.findByText(
        "policy block-subject, instance open, bad setAside, good open, arrangement open, error none, unclaimed 0",
      ),
    ).toBeInTheDocument();
  });

  it("names the decks whose documents are unclaimed, though the data conforms", async () => {
    const unclaimed = [
      { deckUrl: good.url, title: good.title, documents: [good.cardsDocumentUrl], outsidePod: [] },
    ];
    renderProbe({
      checkInstance: vi.fn(async () => ({
        instanceUrl: INSTANCE,
        documents: [],
        violationCount: 0,
        conforms: true,
        unclaimed,
      })),
    });
    expect(await screen.findByText(/instance open, .*unclaimed 1/)).toBeInTheDocument();
  });

  it("sets the arrangement aside when the catalog is invalid", async () => {
    renderProbe({ checkInstance: vi.fn(async () => invalid(true)) });
    expect(await screen.findByText(/arrangement aside/)).toBeInTheDocument();
  });

  it("blocks every deck under blocking the instance, and none under only warning", async () => {
    const { unmount } = renderProbe({
      getPreferences: withPolicy("block-instance"),
      checkInstance: vi.fn(async () => invalid()),
    });
    expect(
      await screen.findByText(/instance blocked, bad blocked, good blocked/),
    ).toBeInTheDocument();
    unmount();
    renderProbe({
      getPreferences: withPolicy("warn-only"),
      checkInstance: vi.fn(() => new Promise<ValidationReport>(() => undefined)),
    });
    expect(
      await screen.findByText(/policy warn-only, instance open, bad open, good open/),
    ).toBeInTheDocument();
  });

  it("holds everything, as while checking, when the check fails under a policy that holds data back, and says why", async () => {
    const failing = () => vi.fn(async () => Promise.reject(new Error("offline")));
    for (const policy of ["block-subject", "block-instance"] as const) {
      const { unmount } = renderProbe({
        getPreferences: withPolicy(policy),
        checkInstance: failing(),
      });
      expect(
        await screen.findByText(
          `policy ${policy}, instance unchecked, bad unchecked, good unchecked, arrangement open, error offline, unclaimed 0`,
        ),
      ).toBeInTheDocument();
      unmount();
    }
    renderProbe({ getPreferences: withPolicy("warn-only"), checkInstance: failing() });
    expect(
      await screen.findByText(
        /policy warn-only, instance open, bad open, good open, .*error offline/,
      ),
    ).toBeInTheDocument();
  });

  it("makes a failed check again when the user comes back to the tab, and a check made only then", async () => {
    const checkInstance = vi
      .fn<UseCases["checkInstance"]>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(invalid());
    renderProbe({ checkInstance });
    expect(await screen.findByText(/instance unchecked, .*error offline/)).toBeInTheDocument();
    try {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      expect(
        await screen.findByText(/instance open, bad setAside, good open, .*error none/),
      ).toBeInTheDocument();
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      expect(checkInstance).toHaveBeenCalledTimes(2);
    } finally {
      focusManager.setFocused(undefined);
    }
  });

  it("holds everything when a check made again fails, though the earlier report is kept", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const checkInstance = vi
      .fn<UseCases["checkInstance"]>()
      .mockResolvedValueOnce(invalid())
      .mockRejectedValue(new Error("offline"));
    function Kept({ useCases }: { useCases: UseCases }) {
      const check = useDataCheck(useCases, INSTANCE);
      return (
        <p>{`report ${check.report === null ? "none" : "kept"}, good ${check.readOnly(good) ?? "open"}, error ${check.error?.message ?? "none"}`}</p>
      );
    }
    render(
      <QueryClientProvider client={queryClient}>
        <Kept useCases={makeUseCasesFake({ checkInstance })} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("report kept, good open, error none")).toBeInTheDocument();
    await queryClient.invalidateQueries();
    expect(
      await screen.findByText("report kept, good unchecked, error offline"),
    ).toBeInTheDocument();
  });

  // One document the check could not read holds back only what it is part of.
  it("sets aside only the deck naming a document the check could not read, and checks again when the user comes back", async () => {
    const unread = summarize(INSTANCE, [
      { url: good.cardsDocumentUrl, status: "checked", subjects: [] },
      unreadableDocument(bad.reviewsDocumentUrl, "403 Forbidden"),
    ]);
    const checkInstance = vi.fn(async () => unread);
    const { unmount } = renderProbe({ checkInstance });
    expect(
      await screen.findByText(
        "policy block-subject, instance open, bad setAside, good open, arrangement open, error none, unclaimed 0",
      ),
    ).toBeInTheDocument();
    try {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      await vi.waitFor(() => expect(checkInstance).toHaveBeenCalledTimes(2));
    } finally {
      focusManager.setFocused(undefined);
    }
    unmount();
    renderProbe({ getPreferences: withPolicy("block-instance"), checkInstance });
    expect(
      await screen.findByText(/instance blocked, bad blocked, good blocked/),
    ).toBeInTheDocument();
  });

  it("walks the report once, however many decks ask and however often they render", async () => {
    const decks = Array.from({ length: 50 }, (_, i) => deckOf(`deck-${i}`));
    const report = invalid(true);
    let walks = 0;
    const counted = {
      ...report,
      get documents() {
        walks += 1;
        return report.documents;
      },
    } as ValidationReport;
    function Many({ useCases, round }: { useCases: UseCases; round: number }) {
      const check = useDataCheck(useCases, INSTANCE);
      const aside = [bad, ...decks].filter((deck) => check.readOnly(deck) === "setAside");
      return (
        <p>
          {`round ${round}, aside ${aside.length}, arrangement ${check.arrangementSetAside ? "aside" : "open"}`}
        </p>
      );
    }
    const useCases = makeUseCasesFake({ checkInstance: vi.fn(async () => counted) });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const tree = (round: number) => (
      <QueryClientProvider client={queryClient}>
        <Many useCases={useCases} round={round} />
      </QueryClientProvider>
    );
    const { rerender } = render(tree(0));
    expect(await screen.findByText("round 0, aside 1, arrangement aside")).toBeInTheDocument();
    for (let round = 1; round <= 10; round += 1) rerender(tree(round));
    expect(screen.getByText("round 10, aside 1, arrangement aside")).toBeInTheDocument();
    expect(walks).toBe(1);
  });

  it("falls back to the default policy when the preferences cannot be read", async () => {
    renderProbe({
      getPreferences: vi.fn(async () => Promise.reject(new Error("offline"))),
      checkInstance: vi.fn(async () => invalid()),
    });
    expect(
      await screen.findByText(/policy block-subject, instance open, bad setAside/),
    ).toBeInTheDocument();
  });
});
