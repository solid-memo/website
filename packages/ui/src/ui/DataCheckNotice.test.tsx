// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import type { Instance } from "@solid-memo/domain/instance";
import type { LangText } from "@solid-memo/domain/langText";
import { summarize, type ValidationReport } from "@solid-memo/domain/validation";
import { DataCheckNotice } from "./DataCheckNotice";
import { I18nProvider } from "./i18n";
import { LIST_LIMIT } from "./bounded";

const instance: Instance = { url: "https://pod.example/solid-memo/a/", name: "Main" };
const report: ValidationReport = {
  instanceUrl: instance.url,
  violationCount: 3,
  conforms: false,
  documents: [],
};

function renderNotice(setAside: LangText[], shown = report) {
  render(
    <DataCheckNotice
      instance={instance}
      report={shown}
      policy="block-subject"
      setAside={setAside}
      arrangementSetAside={false}
    />,
  );
  return screen.getByRole("region", { name: "Data check" });
}

describe("DataCheckNotice", () => {
  it("names the decks set aside, and says the app leaves the data as it is, offering no repair", () => {
    const notice = renderNotice([{ en: "Kanji" }, { en: "Capitals" }]);
    expect(notice).toHaveTextContent("Kanji, Capitals are set aside until their data is fixed");
    expect(notice).toHaveTextContent(
      "Solid Memo leaves this data as it is: it must be fixed outside the app, with another tool.",
    );
    expect(within(notice).queryByRole("button")).toBeNull();
  });

  it("names at most LIST_LIMIT decks set aside, and how many more there are", () => {
    const titles = Array.from({ length: LIST_LIMIT + 2 }, (_, index) => ({ en: `Deck ${index}` }));
    const notice = renderNotice(titles);
    expect(notice).toHaveTextContent(
      `Deck ${LIST_LIMIT - 1} and 2 more are set aside until their data is fixed`,
    );
    expect(notice).not.toHaveTextContent(`Deck ${LIST_LIMIT},`);
    expect(notice).not.toHaveTextContent(`Deck ${LIST_LIMIT + 1}`);
  });

  it("marks a set-aside deck's name with its language when that is not the page's", () => {
    render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <DataCheckNotice
          instance={instance}
          report={report}
          policy="block-subject"
          arrangementSetAside={false}
          setAside={[{ en: "Capitals", sv: "Huvudstäder" }, { en: "Kanji" }]}
        />
      </I18nProvider>,
    );
    expect(screen.getByText("Kanji")).toHaveAttribute("lang", "en");
    expect(screen.getByText(/Huvudstäder/)).not.toHaveAttribute("lang");
  });

  it("draws only what is wrong of the report, once opened", async () => {
    const catalog = `${instance.url}catalog.ttl`;
    const strays = Array.from({ length: 1000 }, (_, index) => ({
      url: `${catalog}#x${index}`,
      status: "untyped" as const,
    }));
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
            violations: [
              {
                message: { en: "Each side of a card needs text or a picture." },
                severity: "violation",
                constraint: "Or",
                path: "http://purl.org/dc/terms/description",
              },
            ],
          },
        ],
      },
    ]);
    const notice = renderNotice([], large);
    expect(notice.querySelectorAll("li")).toHaveLength(0);
    const open = (summary: HTMLElement, to = true) => {
      const details = summary.closest("details")!;
      details.open = to;
      fireEvent(details, new Event("toggle"));
    };
    open(within(notice).getByText("The problems, document by document"));
    const items = await within(notice).findAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent(`${catalog}#deck-1`);
    expect(notice).not.toHaveTextContent("not a Solid Memo subject");
    open(within(notice).getByText("The problems, document by document"), false);
    await waitFor(() => {
      expect(notice.querySelectorAll("li")).toHaveLength(0);
    });
  });
});
