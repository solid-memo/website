import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { CardScreen } from "./CardScreen";
import type { Card } from "@solid-memo/domain/deck";
import { alertTexts, statusTexts } from "../test/liveRegions";
import { I18nProvider } from "./i18n";
import { recentLanguages } from "./remembered";
import { SM } from "@solid-memo/vocab/vocab.generated";

beforeEach(() => localStorage.clear());

const card: Card = {
  id: "card-1",
  url: "https://pod.example/solid-memo/a/decks/deck-1.ttl#card-1",
  front: { ja: "水" },
  back: { en: "water" },
  createdAt: "2026-09-21T10:00:00.000Z",
  formatVersion: 1,
};
const FLAG = "https://flagcdn.com/af.svg";
const MAP = "https://img.example/af-map.png";

function renderScreen(
  overrides: Partial<Parameters<typeof CardScreen>[0]> = {},
) {
  const props = {
    card,
    busy: false,
    saved: false,
    error: null,
    onSave: vi.fn(),
    onRemove: vi.fn(),
    ...overrides,
  };
  const view = render(<CardScreen {...props} />);
  return { ...view, props };
}

/** The picker of a field's main text. */
const picker = (fieldId: string) => document.getElementById(`${fieldId}-language-0`)!;

/** Chooses the language of a field's main text by its code — a radio's, else typed as another — and closes its picker. */
function chooseLanguage(fieldId: string, tag: string) {
  fireEvent.click(picker(fieldId));
  const panel = document.getElementById(`${fieldId}-language-0-panel`)!;
  const radio = panel.querySelector<HTMLInputElement>(`input[type=radio][value="${tag}"]`);
  if (radio === null) {
    fireEvent.click(screen.getByRole("radio", { name: "Other language…" }));
    fireEvent.input(screen.getByLabelText("Language code, e.g. fi, pt-BR"), { target: { value: tag } });
  } else {
    fireEvent.click(radio);
  }
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
}

describe("CardScreen", () => {
  it("marks the title with a decorative icon", () => {
    const { container } = renderScreen();
    expect(container.querySelector("h2 svg.icon")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("shows the card and an editor prefilled with it", () => {
    const { container } = renderScreen();
    expect(screen.getByRole("heading", { name: "Card" })).toBeInTheDocument();
    expect(container.querySelector(".card-front")).toHaveTextContent("水");
    expect(container.querySelector(".card-back")).toHaveTextContent("water");
    expect(screen.getByLabelText("Front")).toHaveValue("水");
    expect(screen.getByLabelText("Back")).toHaveValue("water");
  });

  it("marks the main text of the field a link opens the page at as where the user arrives", () => {
    renderScreen({ arrival: "back" });
    expect(document.getElementById("card-back")).toHaveAttribute("data-arrival");
    expect(document.getElementById("card-front")).not.toHaveAttribute("data-arrival");
  });

  it("saves the edited card with trimmed values", () => {
    const { props } = renderScreen();
    fireEvent.input(screen.getByLabelText("Front"), {
      target: { value: "  火 " },
    });
    fireEvent.input(screen.getByLabelText("Back"), {
      target: { value: " fire  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(props.onSave).toHaveBeenCalledWith({ front: { ja: "火" }, back: { en: "fire" } });
  });

  it("edits a side in the language the reader is shown, keeping its other languages", () => {
    const { props } = renderScreen({ card: { ...card, back: { en: "water", ja: "みず" } } });
    expect(screen.getByLabelText("Back")).toHaveValue("water");
    fireEvent.input(screen.getByLabelText("Back"), { target: { value: "fire" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(props.onSave).toHaveBeenCalledWith({ front: { ja: "水" }, back: { en: "fire", ja: "みず" } });
  });

  it("keeps a side saved with no language as it is while it is untouched", () => {
    const { props } = renderScreen({ card: { ...card, front: { "": "水" } } });
    expect(picker("card-front")).toHaveTextContent("Language: not stated");
    expect(picker("card-front")).toHaveAccessibleDescription("State which language this text is in.");
    expect(screen.getByLabelText("Front")).not.toHaveAttribute("lang");
    fireEvent.input(screen.getByLabelText("Back"), { target: { value: "fire" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(props.onSave).toHaveBeenCalledWith({ front: { "": "水" }, back: { en: "fire" } });
  });

  it("states a side's language without retyping it", () => {
    const { props } = renderScreen({ card: { ...card, front: { "": "水" } } });
    chooseLanguage("card-front", "ja");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(props.onSave).toHaveBeenCalledWith({ front: { ja: "水" }, back: { en: "water" } });
  });

  it("asks the language of a side saved with none once it is edited, or given a translation", () => {
    const { props } = renderScreen({ card: { ...card, front: { "": "水" } } });
    fireEvent.input(screen.getByLabelText("Front"), { target: { value: "火" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(props.onSave).not.toHaveBeenCalled();
    expect(alertTexts()).toEqual(["Choose the language of the front."]);
    expect(picker("card-front")).toHaveFocus();
    expect(picker("card-front")).toHaveAttribute("aria-invalid", "true");
    expect(picker("card-front")).toHaveAccessibleDescription(
      "State which language this text is in. Choose the language of the front.",
    );
    fireEvent.input(screen.getByLabelText("Front"), { target: { value: "水" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Translations (0)" })[0]!);
    fireEvent.click(screen.getAllByRole("button", { name: "Add a translation" })[0]!);
    fireEvent.input(screen.getByLabelText("Translation, its language not chosen"), { target: { value: "みず" } });
    fireEvent.click(document.getElementById("card-front-language-1")!);
    fireEvent.click(screen.getByRole("radio", { name: "Other language…" }));
    fireEvent.input(screen.getByLabelText("Language code, e.g. fi, pt-BR"), { target: { value: "ja-hira" } });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(alertTexts()).toEqual([
      "This text does not say which language it is in, so it cannot have translations. Choose its language first.",
    ]);
    expect(picker("card-front")).toHaveFocus();
    chooseLanguage("card-front", "ja");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(props.onSave).toHaveBeenCalledWith({ front: { ja: "水", "ja-hira": "みず" }, back: { en: "water" } });
  });

  it("edits each text in the language the reader is shown, marked with it and saying it", () => {
    const both = { en: "Meaning", sv: "Betydelse" };
    const { container } = render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <CardScreen
          card={{ ...card, front: { en: "water", sv: "vatten" }, back: { en: "fire" }, frontNote: both, backLabel: both, backNote: both }}
          busy={false}
          saved={false}
          error={null}
          onSave={vi.fn()}
          onRemove={vi.fn()}
        />
      </I18nProvider>,
    );
    const front = container.querySelector("#card-front")!;
    expect(front).toHaveValue("vatten");
    expect(front).not.toHaveAttribute("lang");
    expect(front).toHaveAccessibleDescription("Språk: svenska Varje sida behöver text, en bild eller båda.");
    expect(screen.getAllByRole("button", { name: "Översättningar (1)" })).toHaveLength(4);
    expect(container.querySelector("#card-front-note")).toHaveValue("Betydelse");
    const back = container.querySelector("#card-back")!;
    expect(back).toHaveAttribute("lang", "en");
    expect(back).toHaveAccessibleDescription("Språk: engelska Varje sida behöver text, en bild eller båda.");
    // The faces show Swedish where there is some, and mark the English.
    expect(container.querySelector(".card-front p:not(.card-note)")).not.toHaveAttribute("lang");
    expect(container.querySelector(".card-back p:not(.card-label):not(.card-note)")).toHaveAttribute("lang", "en");
  });

  it("asks the language of a new note rather than take the page's, and remembers it for the next once saved", () => {
    const onSave = vi.fn();
    const screenOf = (saved: boolean) => (
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <CardScreen card={card} busy={false} saved={saved} error={null} onSave={onSave} onRemove={vi.fn()} />
      </I18nProvider>
    );
    const { rerender } = render(screenOf(false));
    fireEvent.input(screen.getByLabelText("Anteckning på baksidan (valfritt)"), { target: { value: "Ett element." } });
    fireEvent.click(screen.getByRole("button", { name: "Spara" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(alertTexts()).toEqual(["Välj språket för anteckningen under baksidan."]);
    fireEvent.click(picker("card-back-note"));
    fireEvent.click(screen.getByRole("radio", { name: "svenska (sv)" }));
    fireEvent.click(screen.getByRole("button", { name: "Spara" }));
    expect(onSave).toHaveBeenCalledWith({ front: { ja: "水" }, back: { en: "water" }, backNote: { sv: "Ett element." } });
    // Not until the save succeeds.
    expect(recentLanguages("own")).toEqual([]);
    rerender(screenOf(true));
    expect(recentLanguages("own")).toEqual(["sv"]);
  });

  it("keeps a picture's URL typed before what is known of the deck comes", () => {
    const { props, rerender } = renderScreen();
    fireEvent.input(screen.getByLabelText("Back picture (URL, optional)"), { target: { value: MAP } });
    rerender(<CardScreen {...props} languages={{ own: "sv", unstatedCounts: { front: 0, back: 0 } }} />);
    expect(screen.getByLabelText("Back picture (URL, optional)")).toHaveValue(MAP);
    fireEvent.input(screen.getByLabelText("Back picture (URL, optional)"), { target: { value: "" } });
    fireEvent.input(screen.getByLabelText("Front picture (URL, optional)"), { target: { value: FLAG } });
    rerender(<CardScreen {...props} languages={{ own: "fi", unstatedCounts: { front: 0, back: 0 } }} />);
    expect(screen.getByLabelText("Front picture (URL, optional)")).toHaveValue(FLAG);
  });

  it("starts a text new to the card in the language the deck's cards have, suggesting the deck name's", () => {
    const { props } = renderScreen({
      deckTitle: { ja: "漢字" },
      languages: { own: "sv", unstatedCounts: { front: 0, back: 0 } },
    });
    expect(picker("card-back-label")).toHaveTextContent("Language: Swedish");
    fireEvent.input(screen.getByLabelText("Label (optional)"), { target: { value: "Betydelse" } });
    fireEvent.click(picker("card-front-note"));
    expect(screen.getAllByRole("radio").slice(0, 2).map((radio) => radio.getAttribute("value"))).toEqual(["sv", "ja"]);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(props.onSave).toHaveBeenCalledWith({ front: { ja: "水" }, back: { en: "water" }, backLabel: { sv: "Betydelse" } });
  });

  it("edits a note saved the same in English and another language in each language on its own", () => {
    const same = { ...card, backNote: { en: "Ett element.", sv: "Ett element." } };
    const { props } = renderScreen({ card: same });
    expect(screen.getByLabelText("Back note (optional)")).toHaveValue("Ett element.");
    expect(screen.queryByText(/Saved as the same text/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(props.onSave).toHaveBeenCalledWith({ front: { ja: "水" }, back: { en: "water" }, backNote: { en: "Ett element.", sv: "Ett element." } });
  });

  it("edits a note's English and keeps its other languages; clearing the English clears the note", () => {
    const { props } = renderScreen({
      card: { ...card, backNote: { en: "An element.", sv: "Ett element." }, backLabel: { en: "Meaning", sv: "Betydelse" } },
    });
    expect(screen.getByLabelText("Back note (optional)")).toHaveValue("An element.");
    fireEvent.input(screen.getByLabelText("Back note (optional)"), { target: { value: "One of the five elements." } });
    fireEvent.input(screen.getByLabelText("Label (optional)"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(props.onSave).toHaveBeenCalledWith({
      front: { ja: "水" },
      back: { en: "water" },
      backNote: { en: "One of the five elements.", sv: "Ett element." },
    });
  });

  it("shows each side's note and the back's label, prefills them and saves them", () => {
    const { props, container } = renderScreen({
      card: { ...card, frontNote: { en: "Kanji" }, backLabel: { en: "Meaning" }, backNote: { en: "An element." } },
    });
    expect(container.querySelector(".card-front .card-note")).toHaveTextContent("Kanji");
    expect(container.querySelector(".card-back .card-label")).toHaveTextContent("Meaning");
    expect(container.querySelector(".card-back .card-note")).toHaveTextContent("An element.");
    expect(screen.getByLabelText("Front note (optional)")).toHaveValue("Kanji");
    expect(screen.getByLabelText("Label (optional)")).toHaveValue("Meaning");
    expect(screen.getByLabelText("Back note (optional)")).toHaveValue("An element.");
    fireEvent.input(screen.getByLabelText("Front note (optional)"), { target: { value: " N5 " } });
    fireEvent.input(screen.getByLabelText("Back note (optional)"), { target: { value: " One of the five elements. " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(props.onSave).toHaveBeenCalledWith({
      front: { ja: "水" },
      frontNote: { en: "N5" },
      backLabel: { en: "Meaning" },
      back: { en: "water" },
      backNote: { en: "One of the five elements." },
    });
  });

  it("edits a text saved with a line break, in any of its languages, in a textarea that keeps it", () => {
    const { props } = renderScreen({
      card: {
        ...card,
        back: { en: "water\nH₂O" },
        backNote: { en: "An element.", sv: "Ett av\nde fem elementen." },
        frontNote: { en: "Kanji" },
      },
    });
    expect(screen.getByLabelText("Back").tagName).toBe("TEXTAREA");
    expect(screen.getByLabelText("Back")).toHaveValue("water\nH₂O");
    expect(screen.getByLabelText("Back note (optional)").tagName).toBe("TEXTAREA");
    expect(screen.getByLabelText("Front").tagName).toBe("INPUT");
    expect(screen.getByLabelText("Front note (optional)").tagName).toBe("INPUT");
    expect(screen.getByLabelText("Label (optional)").tagName).toBe("INPUT");
    // What was saved decides, so the field stays a textarea as its breaks are typed away.
    fireEvent.input(screen.getByLabelText("Back note (optional)"), { target: { value: "An element.\n\nOne of five." } });
    fireEvent.input(screen.getByLabelText("Back"), { target: { value: "water" } });
    expect(screen.getByLabelText("Back").tagName).toBe("TEXTAREA");
    fireEvent.input(screen.getByLabelText("Back"), { target: { value: "water\n\n  H₂O\n" } });
    fireEvent.keyDown(screen.getByLabelText("Back"), { key: "Enter", ctrlKey: true });
    expect(props.onSave).toHaveBeenCalledWith({
      front: { ja: "水" },
      frontNote: { en: "Kanji" },
      back: { en: "water\n\n  H₂O" },
      backNote: { en: "An element.\n\nOne of five.", sv: "Ett av\nde fem elementen." },
    });
  });

  it("edits any text saved with a break in a textarea, the label and a picture's description too, a carriage return alone a break", () => {
    renderScreen({
      card: {
        ...card,
        front: { ja: "水\r火" },
        backLabel: { en: "Element,\nnoun" },
        frontImageUrl: FLAG,
        frontImageDescription: { en: "A flag\nwaving" },
        backImageUrl: MAP,
        backImageDescription: { en: "A map" },
      },
    });
    expect(screen.getByLabelText("Front").tagName).toBe("TEXTAREA");
    expect(screen.getByLabelText("Label (optional)").tagName).toBe("TEXTAREA");
    expect(screen.getByLabelText("Front picture description (optional)").tagName).toBe("TEXTAREA");
    expect(screen.getByLabelText("Back picture description (optional)").tagName).toBe("INPUT");
  });

  it("keeps a textarea, and its focus, once the text is saved without its breaks", () => {
    const { props, rerender } = renderScreen({ card: { ...card, back: { en: "water\nH₂O" } } });
    const back = screen.getByLabelText("Back");
    back.focus();
    fireEvent.input(back, { target: { value: "water" } });
    fireEvent.keyDown(back, { key: "Enter", ctrlKey: true });
    expect(props.onSave).toHaveBeenCalledWith({ front: { ja: "水" }, back: { en: "water" } });
    rerender(<CardScreen {...props} card={{ ...card, back: { en: "water" } }} saved />);
    expect(screen.getByLabelText("Back")).toBe(back);
    expect(back.tagName).toBe("TEXTAREA");
    expect(document.activeElement).toBe(back);
  });

  it("shows a picture card and prefills its picture fields", () => {
    const { container } = renderScreen({
      card: {
        ...card,
        front: {},
        frontImageUrl: FLAG,
        back: { "": "Afghanistan" },
        backImageUrl: MAP,
      },
    });
    const front = container.querySelector(".card-front img")!;
    expect(front).toHaveAttribute("src", FLAG);
    expect(front).toHaveAttribute("alt", "Picture on the front of the card");
    expect(container.querySelector(".card-back img")).toHaveAttribute(
      "alt",
      "Picture on the back of the card",
    );
    expect(container.querySelector(".card-back")).toHaveTextContent(
      "Afghanistan",
    );
    expect(screen.getByLabelText("Front")).toHaveValue("");
    expect(screen.getByLabelText("Front picture (URL, optional)")).toHaveValue(FLAG);
    expect(screen.getByLabelText("Back picture (URL, optional)")).toHaveValue(MAP);
  });

  it("describes each picture by the card's description, prefills it and saves it, keeping its other languages", () => {
    const { props, container } = renderScreen({
      card: {
        ...card,
        frontImageUrl: FLAG,
        frontImageDescription: { en: "A black, red and green flag", sv: "En svart, röd och grön flagga" },
        backImageUrl: MAP,
        backImageDescription: { sv: "En karta" },
      },
    });
    expect(container.querySelector(".card-front img")).toHaveAttribute("alt", "A black, red and green flag");
    expect(container.querySelector(".card-back img")).toHaveAttribute("alt", "En karta");
    const front = screen.getByLabelText("Front picture description (optional)");
    expect(front).toHaveValue("A black, red and green flag");
    expect(front).toHaveAccessibleDescription(
      "Language: English Read out in place of the picture to anyone who cannot see it. Describe what it shows without giving the answer away.",
    );
    const back = screen.getByLabelText("Back picture description (optional)");
    expect(back).toHaveValue("En karta");
    expect(back).toHaveAttribute("lang", "sv");
    fireEvent.input(front, { target: { value: " A flag with an emblem " } });
    fireEvent.input(back, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(props.onSave).toHaveBeenCalledWith({
      front: { ja: "水" },
      back: { en: "water" },
      frontImageUrl: FLAG,
      frontImageDescription: { en: "A flag with an emblem", sv: "En svart, röd och grön flagga" },
      backImageUrl: MAP,
    });
  });

  it("saves a new picture's description in the language chosen, and none without a picture", () => {
    const { props } = renderScreen();
    fireEvent.input(screen.getByLabelText("Back picture (URL, optional)"), { target: { value: MAP } });
    fireEvent.input(screen.getByLabelText("Back picture description (optional)"), { target: { value: "A map" } });
    chooseLanguage("card-back-image-description", "en");
    fireEvent.input(screen.getByLabelText("Front picture description (optional)"), { target: { value: "Nothing to describe" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(props.onSave).toHaveBeenCalledWith({
      front: { ja: "水" },
      back: { en: "water" },
      backImageUrl: MAP,
      backImageDescription: { en: "A map" },
    });
  });

  it("saves a picture, dropping an emptied one", () => {
    const { props } = renderScreen({
      card: { ...card, backImageUrl: MAP },
    });
    fireEvent.input(screen.getByLabelText("Front picture (URL, optional)"), {
      target: { value: FLAG },
    });
    fireEvent.input(screen.getByLabelText("Back picture (URL, optional)"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(props.onSave).toHaveBeenCalledWith({
      front: { ja: "水" },
      back: { en: "water" },
      frontImageUrl: FLAG,
    });
  });

  it("refuses to save an incomplete card and says why", () => {
    const { props } = renderScreen();
    fireEvent.input(screen.getByLabelText("Back"), { target: { value: " " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(props.onSave).not.toHaveBeenCalled();
    expect(alertTexts()).toEqual(["The back needs text or an image."]);
  });

  it("saves the card with its wrong options once they are changed, and without them while they are not", () => {
    const options = { ...card, distractors: [{ id: "card-1-d1", text: { en: "fire" } }] };
    const { props } = renderScreen({ card: options });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(props.onSave).toHaveBeenLastCalledWith({ front: { ja: "水" }, back: { en: "water" } });
    fireEvent.click(screen.getByRole("button", { name: "Add a wrong option" }));
    fireEvent.input(screen.getByLabelText("Wrong option"), { target: { value: "earth" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(props.onSave).toHaveBeenLastCalledWith({
      front: { ja: "水" },
      back: { en: "water" },
      distractors: [
        { id: "card-1-d1", text: { en: "fire" } },
        { id: "card-1-d2", text: { en: "earth" } },
      ],
    });
  });

  it("shows the wrong options as the card is read afresh while they are not changed here, and states them only once they are", () => {
    const options = { ...card, distractors: [{ id: "card-1-d1", text: { en: "fire" } }] };
    const { props, rerender } = renderScreen({ card: options });
    // Changed elsewhere (the Studio) meanwhile: an option added, one retired.
    const afresh = { ...card, distractors: [{ id: "card-1-d1", text: { en: "fire" }, retired: true as const }, { id: "card-1-d2", text: { en: "air" } }] };
    rerender(<CardScreen {...props} card={afresh} />);
    expect(screen.getByRole("button", { name: "Restore the wrong option “fire”" })).toBeInTheDocument();
    expect(screen.getByText("air")).toBeInTheDocument();
    fireEvent.input(screen.getByLabelText("Back"), { target: { value: "H2O" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(props.onSave).toHaveBeenLastCalledWith({ front: { ja: "水" }, back: { en: "H2O" } });
    // Changed here, then saved: the card read afresh is shown again.
    fireEvent.click(screen.getByRole("button", { name: "Restore the wrong option “fire”" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(props.onSave).toHaveBeenLastCalledWith(
      expect.objectContaining({ distractors: [{ id: "card-1-d1", text: { en: "fire" } }, { id: "card-1-d2", text: { en: "air" } }] }),
    );
    rerender(<CardScreen {...props} card={options} saved />);
    expect(screen.queryByText("air")).toBeNull();
  });

  it("leaves out its heading and the wrong options for a page that has its own", () => {
    renderScreen({ card: { ...card, distractors: [{ id: "card-1-d1", text: { en: "fire" } }] }, heading: false, withDistractors: false });
    expect(screen.queryByRole("heading", { name: "Card" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Wrong options" })).toBeNull();
  });

  it("only retires a wrong option the deck's release published, refusing to delete it", () => {
    renderScreen({ card: { ...card, distractors: [{ id: "card-1-d1", text: { en: "fire" } }] }, published: new Set(["card-1-d1"]) });
    expect(screen.getByRole("button", { name: "Retire the wrong option “fire”" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete the wrong option “fire”" }));
    expect(alertTexts()).toContain("This wrong option is in the release the deck came from, so it cannot be deleted. Retire it instead.");
  });

  it("names a picture-only card by its back in the removal prompt", () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    renderScreen({
      card: { ...card, front: {}, frontImageUrl: FLAG, back: { "": "Afghanistan" } },
    });
    fireEvent.click(screen.getByRole("button", { name: "Remove card" }));
    expect(confirm).toHaveBeenCalledWith(
      'Remove the card "Afghanistan"? This cannot be undone.',
    );
  });

  it("removes the card after confirmation", () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    const { props } = renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Remove card" }));
    expect(confirm).toHaveBeenCalledWith(
      'Remove the card "水"? This cannot be undone.',
    );
    expect(props.onRemove).toHaveBeenCalledOnce();
  });

  it("keeps the card when the confirmation is declined", () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    const { props } = renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Remove card" }));
    expect(props.onRemove).not.toHaveBeenCalled();
  });

  it("says a retired card is no longer studied, and says nothing of it otherwise", () => {
    renderScreen();
    expect(screen.queryByRole("note")).toBeNull();
    renderScreen({ card: { ...card, retired: true } });
    expect(screen.getByRole("note")).toHaveTextContent("It is kept, with its review history, but no longer studied.");
  });

  it("confirms each save in a status line mounted throughout", () => {
    const { rerender, props } = renderScreen();
    // The save's line is the screen's last status, after the form's own (its Markdown's).
    const status = screen.getAllByRole("status").at(-1)!;
    expect(statusTexts()).toEqual([]);
    rerender(<CardScreen {...props} saved />);
    expect(screen.getAllByRole("status").at(-1)).toBe(status);
    expect(status).toHaveTextContent("Saved.");
  });

  it("shows busy state and errors", () => {
    renderScreen({ busy: true, error: "write refused" });
    expect(screen.getByLabelText("Front")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Remove card" })).toHaveAttribute("aria-disabled", "true");
    expect(alertTexts()).toEqual(["write refused"]);
    expect(statusTexts()).toEqual([]);
  });

  it("keeps the pressed button focused while it saves, and ignores it meanwhile", () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    const { props, rerender } = renderScreen();
    const save = screen.getByRole("button", { name: "Save" });
    save.focus();
    fireEvent.click(save);
    rerender(<CardScreen {...props} busy />);
    expect(save).toHaveFocus();
    fireEvent.click(save);
    fireEvent.click(screen.getByRole("button", { name: "Remove card" }));
    expect(props.onSave).toHaveBeenCalledOnce();
    expect(confirm).not.toHaveBeenCalled();
    expect(props.onRemove).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  describe("in Markdown", () => {
    const toggle = () => screen.getByRole("checkbox", { name: "Format with Markdown" });
    const marked: Card = { ...card, back: { en: "`H2O`" }, textFormat: SM.markdown };

    it("shows a card in Markdown with the toggle on, and saves it unchanged without stating its format again", () => {
      const { props } = renderScreen({ card: marked });
      expect(toggle()).toBeChecked();
      expect(screen.getByLabelText("Back").tagName).toBe("TEXTAREA");
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(props.onSave).toHaveBeenCalledWith({ front: { ja: "水" }, back: { en: "`H2O`" } });
    });

    it("saves a card in Markdown switched off as plain text, keeping its textareas", () => {
      const { props, container } = renderScreen({ card: marked });
      fireEvent.click(toggle());
      expect(screen.getByLabelText("Back").tagName).toBe("TEXTAREA");
      expect(container.querySelector(".card-preview")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(props.onSave).toHaveBeenCalledWith({ front: { ja: "水" }, back: { en: "`H2O`" }, textFormat: SM.plainText });
    });

    it("says when a plain card switched on reads differently, and saves it in Markdown", () => {
      const { props } = renderScreen({ card: { ...card, back: { en: "H*2*O" } } });
      fireEvent.click(toggle());
      expect(screen.getByText("Some of this card's text reads differently as Markdown: check the preview.")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(props.onSave).toHaveBeenCalledWith({ front: { ja: "水" }, back: { en: "H*2*O" }, textFormat: SM.markdown });
    });

    it("says nothing of reading differently for a card already in Markdown", () => {
      renderScreen({ card: { ...marked, back: { en: "**H2O**" } } });
      expect(screen.queryByText(/reads differently/)).toBeNull();
    });

    it("holds the back of a card with wrong options to one paragraph, and previews it as an option", () => {
      const { container } = renderScreen({
        card: { ...marked, distractors: [{ id: "card-1-d1", text: { en: "`CO2`" } }] },
      });
      expect(container.querySelector(".card-preview-option")).toHaveTextContent("As an option: H2O");
      fireEvent.input(screen.getByLabelText("Back"), { target: { value: "H2O\n\nwater" } });
      expect(container.querySelector("#card-back-hints")).toHaveTextContent(
        "This card's back is one of the options of a question: keep it to one paragraph, as the others are.",
      );
    });

    it("keeps Markdown switched before what is known of the deck comes", () => {
      const { props, rerender } = renderScreen();
      fireEvent.click(toggle());
      rerender(<CardScreen {...props} languages={{ own: "sv", unstatedCounts: { front: 0, back: 0 } }} />);
      expect(toggle()).toBeChecked();
    });
  });
});
