import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import type { InvalidDataPolicy } from "@solid-memo/domain/invalidDataPolicy";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import type { ValidationReport } from "@solid-memo/domain/validation";
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

/** A report with the bad deck's cards document invalid, the catalogue too when asked, and another app's subject only warned about. */
function invalid(catalogue = false): ValidationReport {
  const violation = { message: { en: "Less than 1 values" }, severity: "violation" as const, constraint: "MinCount" };
  return {
    instanceUrl: INSTANCE,
    violationCount: catalogue ? 2 : 1,
    conforms: false,
    documents: [
      {
        url: bad.cardsDocumentUrl,
        status: "checked",
        subjects: [{ url: `${bad.cardsDocumentUrl}#c1`, status: "checked", shape: "card", version: 5, violations: [violation] }],
      },
      {
        url: good.cardsDocumentUrl,
        status: "checked",
        subjects: [{ url: `${good.cardsDocumentUrl}#theirs`, status: "foreign", violations: [] }],
      },
      ...(catalogue
        ? [
            {
              url: `${INSTANCE}catalog.ttl`,
              status: "checked" as const,
              subjects: [{ url: `${INSTANCE}catalog.ttl#catalog`, status: "checked" as const, shape: "catalog" as const, version: 1, violations: [violation] }],
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

const withPolicy = (invalidDataPolicy: InvalidDataPolicy) => vi.fn(async () => ({ ...DEFAULT_PREFERENCES, invalidDataPolicy }));

describe("useDataCheck", () => {
  it("holds everything while the check is made, as under blocking the instance until the preferences are read", async () => {
    renderProbe({ checkInstance: vi.fn(() => new Promise<ValidationReport>(() => undefined)) });
    expect(screen.getByText(/policy block-instance, instance checking, bad checking/)).toBeInTheDocument();
    expect(await screen.findByText(/policy block-subject, instance checking/)).toBeInTheDocument();
  });

  it("waits for no instance", () => {
    renderProbe({}, null);
    expect(screen.getByText(/instance checking/)).toBeInTheDocument();
  });

  it("sets aside only the deck with invalid data, another app's subjects only warned about", async () => {
    renderProbe({ checkInstance: vi.fn(async () => invalid()) });
    expect(
      await screen.findByText("policy block-subject, instance open, bad setAside, good open, arrangement open, error none"),
    ).toBeInTheDocument();
  });

  it("sets the arrangement aside when the catalogue is invalid", async () => {
    renderProbe({ checkInstance: vi.fn(async () => invalid(true)) });
    expect(await screen.findByText(/arrangement aside/)).toBeInTheDocument();
  });

  it("blocks every deck under blocking the instance, and none under only warning", async () => {
    const { unmount } = renderProbe({ getPreferences: withPolicy("block-instance"), checkInstance: vi.fn(async () => invalid()) });
    expect(await screen.findByText(/instance blocked, bad blocked, good blocked/)).toBeInTheDocument();
    unmount();
    renderProbe({ getPreferences: withPolicy("warn-only"), checkInstance: vi.fn(() => new Promise<ValidationReport>(() => undefined)) });
    expect(await screen.findByText(/policy warn-only, instance open, bad open, good open/)).toBeInTheDocument();
  });

  it("sets nothing aside when the check fails, and says why", async () => {
    renderProbe({ checkInstance: vi.fn(async () => Promise.reject(new Error("offline"))) });
    expect(await screen.findByText(/instance open, bad open, good open, arrangement open, error offline/)).toBeInTheDocument();
  });

  it("falls back to the default policy when the preferences cannot be read", async () => {
    renderProbe({ getPreferences: vi.fn(async () => Promise.reject(new Error("offline"))), checkInstance: vi.fn(async () => invalid()) });
    expect(await screen.findByText(/policy block-subject, instance open, bad setAside/)).toBeInTheDocument();
  });
});
