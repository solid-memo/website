import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/preact";
import { DeckLanguagesNotice } from "./DeckLanguagesNotice";
import { I18nProvider } from "./i18n";

const href = "#/deck-preferences?instance=a&deck=b&section=languages";

describe("DeckLanguagesNotice", () => {
  it("is a named region saying what is to settle, linking to where it is settled", () => {
    render(<DeckLanguagesNotice issues={{ unstated: 3 }} href={href} />);
    const region = screen.getByRole("region", { name: "Languages of the deck's text" });
    expect(region).toHaveTextContent(
      "Some of this deck's text does not say which language it is in. 3 card sides state no language.",
    );
    expect(within(region).getByRole("link", { name: "Set the languages" })).toHaveAttribute("href", href);
  });

  it("is no live region: it is read as the user reaches it", () => {
    render(<DeckLanguagesNotice issues={{ unstated: 1 }} href={href} />);
    const region = screen.getByRole("region");
    expect(region).not.toHaveAttribute("aria-live");
    expect(region.querySelector("[role=alert], [role=status], [aria-live]")).toBeNull();
  });

  it("counts the card sides, one or many", () => {
    const { rerender } = render(<DeckLanguagesNotice issues={{ unstated: 1 }} href={href} />);
    const counts = () => screen.getByRole("region").querySelector("p")!;
    expect(counts()).toHaveTextContent(/in\. 1 card side states no language\.$/);
    rerender(<DeckLanguagesNotice issues={{ unstated: 2 }} href={href} />);
    expect(counts()).toHaveTextContent(/in\. 2 card sides state no language\.$/);
  });

  it("says the counts are not known when the library release could not be read", () => {
    render(<DeckLanguagesNotice issues={{ unstated: 2 }} href={href} unchecked />);
    const region = screen.getByRole("region", { name: "Languages of the deck's text" });
    expect(region).toHaveTextContent(
      "Some of this deck's text does not say which language it is in. The library release it was copied from " +
        "could not be read, so how much of it is yours to settle is not known.",
    );
    expect(region).not.toHaveTextContent(/card side/);
    expect(within(region).getByRole("link", { name: "Set the languages" })).toHaveAttribute("href", href);
  });

  it("speaks Swedish", () => {
    render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <DeckLanguagesNotice issues={{ unstated: 2 }} href={href} />
      </I18nProvider>,
    );
    const region = screen.getByRole("region", { name: "Språken i kortlekens text" });
    expect(region).toHaveTextContent(
      "En del av kortlekens text anger inte vilket språk den är på. 2 kortsidor anger inget språk.",
    );
    expect(within(region).getByRole("link", { name: "Ange språken" })).toHaveAttribute("href", href);
  });
});
