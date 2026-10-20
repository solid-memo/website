// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/preact";
import { I18nProvider } from "./i18n";
import { KeptFolderNotice } from "./KeptFolderNotice";

const FOLDER = "https://pod.example/solid-memo/main/";

describe("KeptFolderNotice", () => {
  it("says the folder was kept for another app's files, linking it", () => {
    render(<KeptFolderNotice url={FOLDER} />);
    const notice = screen.getByRole("status");
    expect(notice).toHaveClass("warning");
    expect(notice).toHaveTextContent(
      "Solid Memo deleted its own data and kept the folder in your Pod (opens in a new tab): another app put files there.",
    );
    expect(within(notice).getByRole("link")).toHaveAttribute("href", FOLDER);
  });

  it("says the folder was kept for the releases published from the instance", () => {
    render(<KeptFolderNotice url={FOLDER} releases />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Solid Memo deleted its own data and kept the folder in your Pod (opens in a new tab): the releases published from it are there, which others may be reading. Anything another app put there is kept too.",
    );
  });

  it("is nothing when no folder and no document was kept", () => {
    const { container } = render(<KeptFolderNotice url={null} documents={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says how many documents were kept for another app's data in them, after the folder", () => {
    render(<KeptFolderNotice url={FOLDER} documents={2} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "another app put files there. 2 documents were kept because they also hold other apps' data.",
    );
  });

  it("says a document was kept when the folder is gone", () => {
    render(<KeptFolderNotice url={null} documents={1} />);
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent(
      /^1 document was kept because it also holds another app's data\.$/,
    );
    expect(within(notice).queryByRole("link")).toBeNull();
  });

  it("speaks Swedish", () => {
    render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <KeptFolderNotice url={FOLDER} />
        <KeptFolderNotice url={FOLDER} releases documents={3} />
      </I18nProvider>,
    );
    const [other, releases] = screen.getAllByRole("status");
    expect(releases).toHaveTextContent(
      "3 dokument behölls eftersom de även innehåller andra appars data.",
    );
    expect(other).toHaveTextContent(
      "Solid Memo tog bort sina egna data och behöll mappen i din Pod",
    );
    expect(other).toHaveTextContent("en annan app har lagt filer där.");
    expect(releases).toHaveTextContent(
      "där finns de utgåvor som publicerats från den, som andra kan läsa.",
    );
  });
});
