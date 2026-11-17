// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Instance } from "@solid-memo/domain/instance";
import type { LangText } from "@solid-memo/domain/langText";
import { summarize, type ValidationReport } from "@solid-memo/domain/validation";
import { DataCheckNotice } from "./DataCheckNotice";
import { I18nProvider } from "./i18n";
import { RepairContainer } from "./RepairContainer";
import { makeUseCasesFake } from "../test/useCasesFake";

const instance: Instance = { url: "https://pod.example/solid-memo/a/", name: "Main" };
const CATALOG = `${instance.url}catalog.ttl`;
const report: ValidationReport = {
  instanceUrl: instance.url,
  violationCount: 3,
  conforms: false,
  documents: [],
};
const repair = (subject: string) => ({
  kind: "describe-deck" as const,
  documentUrl: CATALOG,
  subjectUrl: `${CATALOG}#${subject}`,
  version: 3,
});
const second = {
  message: { sv: "Ett andra fel." },
  severity: "violation" as const,
  constraint: "Or",
};
const problem = {
  documentUrl: `${instance.url}decks/deck-1.ttl`,
  subjectUrl: `${instance.url}decks/deck-1.ttl#x`,
  violations: [
    {
      message: {
        en: "Each side of a card needs text or a picture.",
        sv: "Varje sida av ett kort behöver text eller en bild.",
      },
      severity: "violation" as const,
      constraint: "Or",
    },
  ],
};

function renderRepair(useCases: UseCases) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RepairContainer useCases={useCases} instance={instance} report={report} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RepairContainer", () => {
  it("repairs every problem it can with one click", async () => {
    const useCases = makeUseCasesFake({
      planRepair: vi.fn(() => ({
        repairs: [repair("deck-1"), repair("deck-2")],
        unrepairable: [],
      })),
    });
    renderRepair(useCases);
    expect(screen.getAllByText("3 violations in 0 documents.")[0]).toBeVisible();
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent(
      `Give the deck the default description: ${CATALOG}#deck-1`,
    );
    fireEvent.click(screen.getByRole("button", { name: "Repair 2 problems" }));
    await waitFor(() => {
      expect(useCases.applyRepairs).toHaveBeenCalledWith(instance.url, [
        repair("deck-1"),
        repair("deck-2"),
      ]);
    });
  });

  it("removes a problem it cannot repair only when the user confirms, and shows a failure", async () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    const useCases = makeUseCasesFake({
      planRepair: vi.fn(() => ({
        repairs: [],
        unrepairable: [{ ...problem, violations: [...problem.violations, second] }],
      })),
      applyRepairs: vi.fn(async () => {
        throw new Error("write refused");
      }),
    });
    renderRepair(useCases);
    expect(screen.getByText(/Each side of a card needs text or a picture\./)).toHaveTextContent(
      "Each side of a card needs text or a picture. Ett andra fel.",
    );
    expect(screen.getByText("Ett andra fel.")).toHaveAttribute("lang", "sv");
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(useCases.applyRepairs).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => {
      expect(useCases.applyRepairs).toHaveBeenCalledWith(instance.url, [
        {
          kind: "remove-subject",
          documentUrl: problem.documentUrl,
          subjectUrl: problem.subjectUrl,
          version: 1,
        },
      ]);
    });
    expect(await screen.findByText("write refused")).toBeInTheDocument();
  });

  it("lists at most 50 of what it can repair and of what needs a decision, and repairs them all", async () => {
    const many = (prefix: string, count: number) =>
      Array.from({ length: count }, (_, index) => `${prefix}${index}`);
    const repairs = many("deck-", 51).map(repair);
    const useCases = makeUseCasesFake({
      planRepair: vi.fn(() => ({
        repairs,
        unrepairable: many(`${problem.subjectUrl}-`, 52).map((subjectUrl) => ({
          ...problem,
          subjectUrl,
        })),
      })),
    });
    renderRepair(useCases);
    expect(screen.getAllByRole("listitem")).toHaveLength(100);
    expect(
      screen.getByText("And 1 more problem Solid Memo can repair, not listed here."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("And 2 more problems that need your decision, not listed here."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Repair 51 problems" }));
    await waitFor(() => {
      expect(useCases.applyRepairs).toHaveBeenCalledWith(instance.url, repairs);
    });
  });

  it("names at most 50 results of a problem that needs a decision", () => {
    const results = Array.from({ length: 52 }, (_, index) => ({
      ...problem.violations[0]!,
      message: { en: `Result ${index}.` },
    }));
    const useCases = makeUseCasesFake({
      planRepair: vi.fn(() => ({
        repairs: [],
        unrepairable: [{ ...problem, violations: results }],
      })),
    });
    renderRepair(useCases);
    const item = screen.getByRole("listitem");
    expect(item).toHaveTextContent("Result 49.");
    expect(item).not.toHaveTextContent("Result 50.");
    expect(item).toHaveTextContent("And 2 more results, not listed here.");
  });

  it("plans the repair once for a report, however often it is drawn", () => {
    const useCases = makeUseCasesFake({
      planRepair: vi.fn(() => ({ repairs: [repair("deck-1")], unrepairable: [] })),
    });
    const queryClient = new QueryClient();
    const view = (label: string) => (
      <QueryClientProvider client={queryClient}>
        <p>{label}</p>
        <RepairContainer useCases={useCases} instance={instance} report={report} />
      </QueryClientProvider>
    );
    const { rerender } = render(view("first"));
    rerender(view("second"));
    expect(screen.getByText("second")).toBeInTheDocument();
    expect(useCases.planRepair).toHaveBeenCalledOnce();
  });

  it("shows progress while repairing", async () => {
    const useCases = makeUseCasesFake({
      planRepair: vi.fn(() => ({ repairs: [repair("deck-1")], unrepairable: [] })),
      applyRepairs: vi.fn(() => new Promise<void>(() => undefined)),
    });
    renderRepair(useCases);
    fireEvent.click(screen.getByRole("button", { name: "Repair 1 problem" }));
    expect(await screen.findByRole("button", { name: "Repairing…" })).toBeDisabled();
  });
});

describe("DataCheckNotice", () => {
  it("names the decks set aside, one or several", () => {
    const queryClient = new QueryClient();
    const notice = (setAside: LangText[]) =>
      render(
        <QueryClientProvider client={queryClient}>
          <DataCheckNotice
            useCases={makeUseCasesFake()}
            instance={instance}
            report={report}
            policy="block-subject"
            setAside={setAside}
            arrangementSetAside={false}
          />
        </QueryClientProvider>,
      );
    notice([{ en: "Kanji" }, { en: "Capitals" }]);
    expect(screen.getByRole("region", { name: "Data check" })).toHaveTextContent(
      "Kanji, Capitals are set aside until repaired",
    );
  });

  it("marks a set-aside deck's name with its language when that is not the page's", () => {
    render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <QueryClientProvider client={new QueryClient()}>
          <DataCheckNotice
            useCases={makeUseCasesFake()}
            instance={instance}
            report={report}
            policy="block-subject"
            arrangementSetAside={false}
            setAside={[{ en: "Capitals", sv: "Huvudstäder" }, { en: "Kanji" }]}
          />
        </QueryClientProvider>
      </I18nProvider>,
    );
    expect(screen.getByText("Kanji")).toHaveAttribute("lang", "en");
    expect(screen.getByText(/Huvudstäder/)).not.toHaveAttribute("lang");
  });

  it("draws the repair, and only what is wrong of the report, once opened", async () => {
    const catalog = `${instance.url}catalog.ttl`;
    const strays = Array.from({ length: 1000 }, (_, index) => ({
      url: `${catalog}#x${index}`,
      status: "untyped" as const,
    }));
    const failing = { ...problem.violations[0]!, path: "http://purl.org/dc/terms/description" };
    const large = summarize(instance.url, [
      {
        url: catalog,
        status: "checked",
        subjects: [
          ...strays,
          {
            url: `${catalog}#deck-1`,
            status: "checked",
            shape: "deck",
            version: 3,
            violations: [failing],
          },
        ],
      },
    ]);
    const useCases = makeUseCasesFake({
      planRepair: vi.fn(() => ({ repairs: [], unrepairable: [] })),
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <DataCheckNotice
          useCases={useCases}
          instance={instance}
          report={large}
          policy="block-subject"
          setAside={[]}
          arrangementSetAside={false}
        />
      </QueryClientProvider>,
    );
    const notice = screen.getByRole("region", { name: "Data check" });
    expect(useCases.planRepair).not.toHaveBeenCalled();
    expect(notice.querySelectorAll("li")).toHaveLength(0);
    const open = (summary: HTMLElement, to = true) => {
      const details = summary.closest("details")!;
      details.open = to;
      fireEvent(details, new Event("toggle"));
    };
    open(within(notice).getByText("Repair"));
    await waitFor(() => {
      expect(useCases.planRepair).toHaveBeenCalledWith(large);
    });
    expect(notice.querySelectorAll("li")).toHaveLength(0);
    open(await within(notice).findByText("The problems, document by document"));
    const items = await within(notice).findAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent(`${catalog}#deck-1`);
    expect(notice).not.toHaveTextContent("not a Solid Memo subject");
    open(within(notice).getByText("Repair"), false);
    await waitFor(() => {
      expect(notice.querySelectorAll("li")).toHaveLength(0);
    });
    expect(notice.querySelector("details")).not.toHaveAttribute("open");
  });
});
