import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { StudyScreen } from "./StudyScreen";
import { I18nProvider } from "./i18n";
import type { Card, Prompt } from "@solid-memo/domain/deck";
import { SM } from "@solid-memo/vocab/vocab.generated";

const card: Card = {
  id: "card-1",
  url: "https://pod.example/solid-memo/a/decks/deck-1.ttl#card-1",
  front: { "": "水" },
  back: { "": "water" },
  createdAt: "2026-09-21T10:00:00.000Z",
  formatVersion: 1,
};

function renderScreen(
  overrides: Partial<Parameters<typeof StudyScreen>[0]> = {},
) {
  const props = {
    deckName: "Kanji N5",
    deckHref: "#/deck?deck=d",
    prompt: { card, direction: "front-to-back" } as Prompt | null,
    position: 1,
    total: 3,
    putBack: false,
    answerScale: "sm2" as const,
    busy: false,
    error: null,
    onAnswer: vi.fn(),
    onExit: vi.fn(),
    ...overrides,
  };
  const view = render(<StudyScreen {...props} />);
  return { ...view, props };
}

describe("StudyScreen", () => {
  it("links the deck's name to the deck's page", () => {
    renderScreen();
    expect(screen.getByRole("link", { name: "Kanji N5" })).toHaveAttribute(
      "href",
      "#/deck?deck=d",
    );
  });

  it("marks the deck's name with its language when it is not the page's", () => {
    renderScreen({ deckName: "Huvudstäder", deckLang: "sv" });
    expect(screen.getByRole("link", { name: "Huvudstäder" })).toHaveAttribute("lang", "sv");
  });

  it("shows the front and hides the back until revealed", () => {
    renderScreen();
    expect(
      screen.getByRole("heading", { name: "Study: Kanji N5" }),
    ).toBeInTheDocument();
    expect(screen.getByText("水")).toBeInTheDocument();
    expect(screen.queryByText("water")).toBeNull();
    expect(screen.getByText("Card 1 of 3")).toBeInTheDocument();
  });

  it("shows a picture card: the flag on the front, the name once revealed", () => {
    const { container } = renderScreen({
      prompt: {
        card: {
          ...card,
          front: {},
          frontImageUrl: "https://flagcdn.com/af.svg",
          back: { "": "Afghanistan" },
        },
        direction: "front-to-back",
      },
    });
    expect(container.querySelector(".card-front img")).toHaveAttribute(
      "src",
      "https://flagcdn.com/af.svg",
    );
    expect(screen.queryByText("Afghanistan")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
    expect(screen.getByText("Afghanistan")).toBeInTheDocument();
  });

  it("shows the question's note only once the answer is revealed, and the answer's with it", () => {
    const { container } = renderScreen({
      prompt: { card: { ...card, frontNote: { en: "Kanji" }, backLabel: { en: "Meaning" }, backNote: { en: "An element." } }, direction: "front-to-back" },
    });
    expect(container.querySelector(".card-front .card-note")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
    expect(container.querySelector(".card-front .card-note")).toHaveTextContent("Kanji");
    expect(container.querySelector(".card-back .card-label")).toHaveTextContent("Meaning");
    expect(container.querySelector(".card-back .card-note")).toHaveTextContent("An element.");
  });

  it("asks a back→front prompt from the back and answers with the front", () => {
    const { container } = renderScreen({
      prompt: { card, direction: "back-to-front" },
    });
    const back = container.querySelector(".card-back")!;
    expect(back).toHaveTextContent("water");
    expect(back).toHaveClass("card-question");
    expect(screen.queryByText("水")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
    const front = container.querySelector(".card-front")!;
    expect(front).toHaveTextContent("水");
    expect(front).toHaveClass("card-answer");
  });

  it("reveals the back and offers quality grades", () => {
    const { props } = renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
    expect(screen.getByText("water")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "4 — Good" }));
    expect(props.onAnswer).toHaveBeenCalledWith(4);
  });

  it("offers Again / Hard / Good / Easy on the minimal scale", () => {
    const { props } = renderScreen({ answerScale: "minimal" });
    fireEvent.click(screen.getByRole("button", { name: "Reveal" }));

    const buttons = screen
      .getAllByRole("button")
      .filter((b) => b.closest(".quality-buttons") !== null);
    expect(buttons.map((b) => b.textContent)).toEqual([
      "Again",
      "Hard",
      "Good",
      "Easy",
    ]);
    expect(buttons.map((b) => b.dataset.grade)).toEqual(["1", "3", "4", "5"]);

    fireEvent.click(screen.getByRole("button", { name: "Again" }));
    expect(props.onAnswer).toHaveBeenLastCalledWith(1);
    fireEvent.click(screen.getByRole("button", { name: "Hard" }));
    expect(props.onAnswer).toHaveBeenLastCalledWith(3);
    fireEvent.click(screen.getByRole("button", { name: "Good" }));
    expect(props.onAnswer).toHaveBeenLastCalledWith(4);
    fireEvent.click(screen.getByRole("button", { name: "Easy" }));
    expect(props.onAnswer).toHaveBeenLastCalledWith(5);
  });

  it("hides the answer again when the same card comes round a second time", () => {
    const { rerender, props } = renderScreen({ position: 1, total: 2 });
    fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
    expect(screen.getByText("water")).toBeInTheDocument();

    rerender(<StudyScreen {...props} position={2} total={2} />);
    expect(screen.queryByText("water")).toBeNull();
    expect(screen.getByRole("button", { name: "Reveal" })).toBeInTheDocument();
  });

  it("shows the finished state after the last card", () => {
    renderScreen({ prompt: null, position: 4, total: 3 });
    expect(
      screen.getByText("Session finished — all cards reviewed."),
    ).toBeInTheDocument();
  });

  it("shows the empty state when nothing is due", () => {
    renderScreen({ prompt: null, position: 1, total: 0 });
    expect(
      screen.getByText("Nothing to study today — come back tomorrow!"),
    ).toHaveFocus();
  });

  it("ends the session", () => {
    const { props } = renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "End session" }));
    expect(props.onExit).toHaveBeenCalledOnce();
  });

  it("only marks Reveal disabled while busy, and ignores it", () => {
    renderScreen({ busy: true });
    const reveal = screen.getByRole("button", { name: "Reveal" });
    expect(reveal).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(reveal);
    expect(screen.queryByText("water")).toBeNull();
  });

  it("keeps the pressed grade focused while its answer saves, and ignores more presses", () => {
    const { rerender, props } = renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
    const good = screen.getByRole("button", { name: "4 — Good" });
    good.focus();
    fireEvent.click(good);
    rerender(<StudyScreen {...props} busy />);
    expect(good).toHaveAttribute("aria-disabled", "true");
    expect(good).toHaveFocus();
    fireEvent.click(good);
    expect(props.onAnswer).toHaveBeenCalledOnce();
  });

  it("alerts errors", () => {
    renderScreen({ error: "review failed" });
    expect(screen.getByRole("alert")).toHaveTextContent("review failed");
  });

  it("focuses the question, unnamed so its text is read, when a card comes up", () => {
    const { rerender, props } = renderScreen();
    const first = document.activeElement!;
    expect(first).toHaveClass("study-face");
    expect(first).toHaveTextContent("Question: 水");
    expect(first).not.toHaveAttribute("role");
    expect(first).not.toHaveAttribute("aria-label");

    rerender(<StudyScreen {...props} position={2} />);
    expect(document.activeElement).toHaveClass("study-face");
    expect(document.activeElement).not.toBe(first);
    expect(document.activeElement).toHaveTextContent("Question: 水");
  });

  it("focuses the answer once revealed, not a grade, and labels the grades", () => {
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
    expect(document.activeElement).toHaveTextContent("Answer: water");
    expect(document.activeElement!.closest(".quality-buttons")).toBeNull();
    const grades = screen.getByRole("group", {
      name: "How well did you remember it?",
    });
    expect(grades).toHaveClass("quality-buttons");
    expect(grades.querySelectorAll("button")).toHaveLength(6);
  });

  it("says the position in one status line, and when the last card was put back", () => {
    const { rerender, props } = renderScreen({ position: 2, total: 4, putBack: true });
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(
      "Card 2 of 4. You'll see the last card again later in this session.",
    );
    rerender(<StudyScreen {...props} position={3} putBack={false} />);
    expect(status).toHaveTextContent(/^Card 3 of 4$/);
  });

  it("says the session is over by focusing the message, outside the status line", () => {
    const { rerender, props } = renderScreen({ position: 3, total: 3 });
    const status = screen.getByRole("status");
    rerender(<StudyScreen {...props} prompt={null} position={4} />);
    expect(screen.getByRole("status")).toBe(status);
    expect(status).toBeEmptyDOMElement();
    const end = screen.getByText("Session finished — all cards reviewed.");
    expect(end).toHaveFocus();
    expect(status).not.toContainElement(end);
  });

  it("reveals with Space while the focus is in the card, and says so", () => {
    renderScreen();
    expect(screen.getByText("Press Space to reveal the answer.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reveal" })).toHaveAttribute(
      "aria-keyshortcuts",
      "Space",
    );
    fireEvent.keyDown(document.activeElement!, { key: "x" });
    fireEvent.keyDown(document.activeElement!, { key: " ", ctrlKey: true });
    expect(screen.queryByText("water")).toBeNull();
    fireEvent.keyDown(document.activeElement!, { key: " " });
    expect(document.activeElement).toHaveTextContent("Answer: water");
  });

  it("leaves Space on an enlarged picture to the picture, which shrinks rather than revealing", () => {
    renderScreen({
      prompt: { card: { ...card, frontImageUrl: "https://flagcdn.com/af.svg" }, direction: "front-to-back" },
    });
    vi.spyOn(screen.getByRole("img"), "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 40,
      height: 20,
    } as DOMRect);
    // A tap that does not focus the button, as in Safari: the focus is still on the question.
    const enlarge = screen.getByRole("button", { name: "Enlarge picture" });
    fireEvent.click(enlarge);
    expect(enlarge).toHaveAttribute("aria-expanded", "true");
    // Space goes to the button, so it presses it (keydown, then the click it makes).
    fireEvent.keyDown(document.activeElement!, { key: " " });
    fireEvent.click(document.activeElement!);
    expect(enlarge).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("water")).toBeNull();
  });

  it("shrinks the answer's enlarged picture on Escape, leaving the card on screen", () => {
    const { props } = renderScreen({
      prompt: { card: { ...card, backImageUrl: "https://flagcdn.com/af.svg" }, direction: "front-to-back" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
    vi.spyOn(screen.getByRole("img"), "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 40,
      height: 20,
    } as DOMRect);
    const enlarge = screen.getByRole("button", { name: "Enlarge picture" });
    fireEvent.click(enlarge);
    fireEvent.keyDown(enlarge, { key: "Escape" });
    expect(enlarge).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("water")).toBeInTheDocument();
    expect(props.onAnswer).not.toHaveBeenCalled();
  });

  it("leaves the keys on a code block or link in a card in Markdown to them", () => {
    const { props } = renderScreen({
      prompt: {
        card: {
          ...card,
          textFormat: SM.markdown,
          front: { en: "Which [command](https://git-scm.com/docs)?\n\n```\ngit diff --staged\n```" },
          back: { en: "`git diff --staged`" },
        },
        direction: "front-to-back",
      },
    });
    fireEvent.keyDown(screen.getByRole("region", { name: "Code" }), { key: " " });
    fireEvent.keyDown(screen.getByRole("link", { name: /command/ }), { key: " " });
    expect(screen.queryByRole("button", { name: "Reveal" })).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement!, { key: " " });
    expect(screen.queryByRole("button", { name: "Reveal" })).toBeNull();
    fireEvent.keyDown(screen.getByRole("region", { name: "Code" }), { key: "4" });
    expect(props.onAnswer).not.toHaveBeenCalled();
  });

  it("leaves Space on Reveal to the button itself", () => {
    renderScreen();
    fireEvent.keyDown(screen.getByRole("button", { name: "Reveal" }), { key: " " });
    expect(screen.queryByText("water")).toBeNull();
  });

  it("answers an SM-2 grade by its own number, and ignores other keys", () => {
    const { props } = renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
    expect(screen.getByText("Press 0 to 5 to answer.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "0 — Blackout" })).toHaveAttribute(
      "aria-keyshortcuts",
      "0",
    );
    fireEvent.keyDown(document.activeElement!, { key: "9" });
    fireEvent.keyDown(document.activeElement!, { key: " " });
    expect(props.onAnswer).not.toHaveBeenCalled();
    fireEvent.keyDown(document.activeElement!, { key: "0" });
    expect(props.onAnswer).toHaveBeenCalledWith(0);
  });

  it("answers the minimal scale with 1 to 4", () => {
    const { props } = renderScreen({ answerScale: "minimal" });
    fireEvent.keyDown(document.activeElement!, { key: " " });
    expect(screen.getByText("Press 1 to 4 to answer.")).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement!, { key: "1" });
    expect(props.onAnswer).toHaveBeenLastCalledWith(1);
    fireEvent.keyDown(document.activeElement!, { key: "4" });
    expect(props.onAnswer).toHaveBeenLastCalledWith(5);
  });

  it("ignores the keys while an answer saves", () => {
    const { rerender, props } = renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
    rerender(<StudyScreen {...props} busy />);
    fireEvent.keyDown(document.activeElement!, { key: "4" });
    expect(props.onAnswer).not.toHaveBeenCalled();
  });

  it("speaks Swedish", () => {
    render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <StudyScreen
          deckName="Kanji N5"
          deckHref="#/deck?deck=d"
          prompt={{ card, direction: "front-to-back" }}
          position={1}
          total={3}
          putBack={false}
          answerScale="minimal"
          busy={false}
          error={null}
          onAnswer={vi.fn()}
          onExit={vi.fn()}
        />
      </I18nProvider>,
    );
    expect(screen.getByRole("heading", { name: "Studera: Kanji N5" })).toBeInTheDocument();
    expect(screen.getByText("Kort 1 av 3")).toBeInTheDocument();
    expect(screen.getByText("Tryck på mellanslag för att visa svaret.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Visa svar" }));
    expect(screen.getByRole("button", { name: "Igen" })).toBeInTheDocument();
    expect(screen.getByText("Tryck 1 till 4 för att svara.")).toBeInTheDocument();
    expect(document.activeElement).toHaveTextContent("Svar: water");
    expect(
      screen.getByRole("group", { name: "Hur väl mindes du det?" }),
    ).toBeInTheDocument();
  });
});
