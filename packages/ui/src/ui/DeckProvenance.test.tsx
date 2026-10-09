import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/preact";
import { DeckProvenance } from "./DeckProvenance";
import { I18nProvider } from "./i18n";

const CC0 = "https://creativecommons.org/publicdomain/zero/1.0/";

describe("DeckProvenance", () => {
  it("names the authors and links the licence", () => {
    const { container } = render(
      <DeckProvenance authors={["Anton Wiklund", "A friend"]} license={CC0} />,
    );
    expect(container.textContent).toBe("By Anton Wiklund, A friend · CC0 1.0 (opens in a new tab)");
    expect(screen.getByRole("link", { name: "CC0 1.0 (opens in a new tab)" })).toHaveAttribute(
      "href",
      CC0,
    );
  });

  it("links an author named with an address", () => {
    render(<DeckProvenance authors={["Anton Wiklund <anton@example.com>"]} />);
    expect(screen.getByRole("link", { name: "Anton Wiklund" })).toHaveAttribute(
      "href",
      "mailto:anton@example.com",
    );
  });

  it("says when the deck was last updated, after the byline", () => {
    const { container, rerender } = render(
      <DeckProvenance
        authors={["Anton Wiklund"]}
        license={CC0}
        modifiedAt="2026-09-27T20:12:13.000Z"
      />,
    );
    expect(container.textContent).toBe(
      "By Anton Wiklund · CC0 1.0 (opens in a new tab) · Updated September 27, 2026",
    );
    rerender(<DeckProvenance authors={[]} modifiedAt="2026-09-27T20:12:13.000Z" />);
    expect(container.textContent).toBe("Updated September 27, 2026");
  });

  it("shows authors alone or the licence alone", () => {
    const { container, rerender } = render(
      <DeckProvenance authors={["Anton Wiklund"]} />,
    );
    expect(container.textContent).toBe("By Anton Wiklund");
    rerender(<DeckProvenance authors={[]} license={CC0} />);
    expect(container.textContent).toBe("CC0 1.0 (opens in a new tab)");
  });

  it("shows the description under the byline, with its URLs as links", () => {
    const { container } = render(
      <DeckProvenance
        authors={["Anton Wiklund"]}
        description={{ en: "Flags from https://flagcdn.com, listed at https://flagpedia.net/index. Enjoy!" }}
      />,
    );
    expect(container.textContent).toBe(
      "By Anton WiklundFlags from https://flagcdn.com (opens in a new tab), listed at https://flagpedia.net/index (opens in a new tab). Enjoy!",
    );
    expect(
      screen.getAllByRole("link").map((link) => link.getAttribute("href")),
    ).toEqual(["https://flagcdn.com", "https://flagpedia.net/index"]);
    expect(screen.getByRole("link", { name: "https://flagcdn.com (opens in a new tab)" })).toHaveAttribute(
      "target",
      "_blank",
    );
  });

  it("shows a description alone, as plain text when it has no URL", () => {
    const { container } = render(
      <DeckProvenance authors={[]} description={{ en: "Just a deck." }} />,
    );
    expect(container.querySelector(".deck-description")).toHaveTextContent(
      "Just a deck.",
    );
    expect(screen.getByRole("group", { name: "Description" })).toHaveTextContent("Just a deck.");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("shows the description in the reader's language, marked when that is not the page's", () => {
    const { container } = render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <DeckProvenance authors={[]} description={{ en: "Just a deck." }} />
        <DeckProvenance authors={[]} description={{ en: "A deck.", sv: "En kortlek." }} />
      </I18nProvider>,
    );
    const [english, swedish] = container.querySelectorAll(".deck-description");
    expect(english).toHaveAttribute("lang", "en");
    expect(swedish).toHaveTextContent("En kortlek.");
    expect(swedish).not.toHaveAttribute("lang");
    expect(screen.getAllByRole("group", { name: "Beskrivning" })).toEqual([english, swedish]);
  });

  it("renders nothing when nothing is stated", () => {
    const { container } = render(<DeckProvenance authors={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
