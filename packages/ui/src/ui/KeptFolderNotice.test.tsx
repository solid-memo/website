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

  it("is nothing when no folder was kept", () => {
    const { container } = render(<KeptFolderNotice url={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("speaks Swedish", () => {
    render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <KeptFolderNotice url={FOLDER} />
        <KeptFolderNotice url={FOLDER} releases />
      </I18nProvider>,
    );
    const [other, releases] = screen.getAllByRole("status");
    expect(other).toHaveTextContent("Solid Memo tog bort sina egna data och behöll mappen i din Pod");
    expect(other).toHaveTextContent("en annan app har lagt filer där.");
    expect(releases).toHaveTextContent("där finns de utgåvor som publicerats från den, som andra kan läsa.");
  });
});
