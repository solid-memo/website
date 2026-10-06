import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { CardFace, CardRowBack, CardRowFront, CardThumbnail } from "./CardFace";
import { I18nProvider } from "./i18n";

const FLAG = "https://flagcdn.com/af.svg";

describe("CardFace", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows text alone", () => {
    const { container } = render(<CardFace side="front" text={{ "": "水" }} />);
    expect(container.querySelector(".card-face.card-front")).toHaveTextContent(
      "水",
    );
    expect(container.querySelector("img")).toBeNull();
  });

  it("marks text in another language than the page's with its language, and untagged text with none", () => {
    render(
      <CardFace side="front" text={{ sv: "sjuksköterska" }} label={{ en: "Meaning" }} note={{ de: "Beruf" }} />,
    );
    expect(screen.getByText("sjuksköterska")).toHaveAttribute("lang", "sv");
    expect(screen.getByText("Meaning")).not.toHaveAttribute("lang");
    expect(screen.getByText("Beruf")).toHaveAttribute("lang", "de");
    render(<CardFace side="back" text={{ "": "water" }} />);
    expect(screen.getByText("water")).not.toHaveAttribute("lang");
  });

  it("names the face for screen readers: front and back, or question and answer in study", () => {
    const { container, rerender } = render(<CardFace side="front" text={{ "": "水" }} />);
    const name = () => container.querySelector(".card-face > .visually-hidden");
    expect(name()).toHaveTextContent("Front:");
    rerender(<CardFace side="back" text={{ "": "water" }} />);
    expect(name()).toHaveTextContent("Back:");
    rerender(<CardFace side="back" role="question" text={{ "": "water" }} />);
    expect(name()).toHaveTextContent("Question:");
    rerender(<CardFace side="front" role="answer" text={{ "": "水" }} />);
    expect(name()).toHaveTextContent("Answer:");
  });

  it("names the face in Swedish", () => {
    const { container } = render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <CardFace side="back" text={{ "": "water" }} />
        <CardFace side="front" role="question" text={{ "": "水" }} />
      </I18nProvider>,
    );
    const names = [...container.querySelectorAll(".card-face > .visually-hidden")];
    expect(names.map((n) => n.textContent)).toEqual(["Baksida: ", "Fråga: "]);
  });

  it("shows a label above the text", () => {
    const { container } = render(<CardFace side="back" text={{ "": "Finansmäklare" }} label={{ en: "Out of use · replaced by" }} />);
    const [label, text] = container.querySelectorAll(".card-back p");
    expect(label).toHaveClass("card-label");
    expect(label).toHaveTextContent("Out of use · replaced by");
    expect(text).toHaveTextContent("Finansmäklare");
  });

  it("shows a note under the text", () => {
    const { container } = render(<CardFace side="back" text={{ "": "Finansmäklare" }} note={{ en: "Replaced in version 30." }} />);
    expect(container.querySelector(".card-back p.card-note")).toHaveTextContent("Replaced in version 30.");
  });

  it("shows the label and note in the reader's language", () => {
    const { container } = render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <CardFace
          side="back"
          text={{ "": "Finansmäklare" }}
          label={{ en: "Replaced by", sv: "Ersatt av" }}
          note={{ en: "In taxonomy version 30.", sv: "I taxonomiversion 30." }}
        />
      </I18nProvider>,
    );
    expect(container.querySelector(".card-label")).toHaveTextContent("Ersatt av");
    expect(container.querySelector(".card-note")).toHaveTextContent("I taxonomiversion 30.");
  });

  it("shows the text in the reader's language, else in English", () => {
    const text = { en: "The Starry Night — Vincent van Gogh, 1889", sv: "Stjärnenatt — Vincent van Gogh, 1889" };
    const { container, rerender } = render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <CardFace side="back" text={text} />
      </I18nProvider>,
    );
    expect(container.querySelector(".card-back")).toHaveTextContent("Stjärnenatt — Vincent van Gogh, 1889");
    rerender(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <CardFace side="back" text={{ en: "Mona Lisa — Leonardo da Vinci, 1500s" }} />
      </I18nProvider>,
    );
    expect(container.querySelector(".card-back")).toHaveTextContent("Mona Lisa — Leonardo da Vinci, 1500s");
  });

  it("shows a picture alone, described for screen readers", () => {
    render(<CardFace side="back" text={{ "": "" }} imageUrl={FLAG} />);
    const image = screen.getByRole("img", {
      name: "Picture on the back of the card",
    });
    expect(image).toHaveAttribute("src", FLAG);
    expect(image).toHaveClass("card-image");
  });

  it("shows a picture above its text, still announcing the picture", () => {
    const { container } = render(
      <CardFace side="front" text={{ "": "Afghanistan" }} imageUrl={FLAG} />,
    );
    const [name, picture, text] = container.querySelector(".card-face")!.children;
    expect(name).toHaveClass("visually-hidden");
    expect(picture).toHaveClass("picture-zoom");
    expect(picture.querySelector("img")).toHaveAttribute("alt", "Picture on the front of the card");
    expect(text).toHaveTextContent("Afghanistan");
  });

  it("describes a picture by the card's own description, in the reader's language, marked when another", () => {
    const { container, rerender } = render(
      <CardFace side="front" text={{ "": "Which country?" }} imageUrl={FLAG} imageDescription={{ en: "A black, red and green flag", sv: "En svart, röd och grön flagga" }} />,
    );
    const image = () => container.querySelector("img")!;
    expect(image()).toHaveAttribute("alt", "A black, red and green flag");
    expect(image()).not.toHaveAttribute("lang");
    rerender(<CardFace side="back" text={{}} imageUrl={FLAG} imageDescription={{ sv: "En svart, röd och grön flagga" }} />);
    expect(image()).toHaveAttribute("alt", "En svart, röd och grön flagga");
    expect(image()).toHaveAttribute("lang", "sv");
    const empty = render(<CardFace side="back" text={{}} imageUrl={FLAG} imageDescription={{}} />);
    const fallback = empty.container.querySelector("img")!;
    expect(fallback).toHaveAttribute("alt", "Picture on the back of the card");
    expect(fallback).not.toHaveAttribute("lang");
  });

  it("names, rather than loads, a picture that is not a web URL", () => {
    const { container } = render(
      <CardFace side="front" text={{ "": "" }} imageUrl="javascript:alert(1)" />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.getByText("Picture not shown: its address is not a web URL."),
    ).toBeInTheDocument();
  });

  it("enlarges its picture on a tap, the picture still read by its description", () => {
    render(
      <CardFace side="front" text={{ "": "Which country?" }} imageUrl={FLAG} imageDescription={{ sv: "En svart, röd och grön flagga" }} />,
    );
    const button = screen.getByRole("button", { name: "Enlarge picture" });
    expect(screen.getByRole("img", { name: "En svart, röd och grön flagga" })).toHaveAttribute("lang", "sv");
    vi.spyOn(screen.getByRole("img"), "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 40, height: 20 } as DOMRect);
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(document.querySelector(".picture-zoom-layer")).not.toBeNull();
  });
});

describe("CardThumbnail", () => {
  it("renders a small decorative picture for a web URL only", () => {
    const { container, rerender } = render(<CardThumbnail imageUrl={FLAG} />);
    const image = container.querySelector("img.card-thumbnail")!;
    expect(image).toHaveAttribute("src", FLAG);
    expect(image).toHaveAttribute("alt", "");

    rerender(<CardThumbnail imageUrl="data:image/png;base64,AAAA" />);
    expect(container.querySelector("img")).toBeNull();
    rerender(<CardThumbnail />);
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("CardThumbnail alt", () => {
  it("takes a name when the picture is all there is", () => {
    render(<CardThumbnail imageUrl={FLAG} alt="Picture for: Afghanistan" />);
    expect(
      screen.getByRole("img", { name: "Picture for: Afghanistan" }),
    ).toHaveClass("card-thumbnail");
  });
});

describe("CardRowFront", () => {
  const link = (front: Record<string, string>, back: Record<string, string>) =>
    render(
      <a href="#card">
        <CardRowFront front={front} back={back} imageUrl={FLAG} />
      </a>,
    );

  it("keeps the picture decorative beside the front's text", () => {
    const { container } = link({ "": "Kabul" }, { "": "Afghanistan" });
    expect(screen.getByRole("link", { name: "Kabul" })).toBeInTheDocument();
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
  });

  it("names a picture-only front after the back, so its link has a name", () => {
    link({}, { "": "Afghanistan" });
    expect(
      screen.getByRole("link", { name: "Picture for: Afghanistan" }),
    ).toBeInTheDocument();
  });

  it("names a picture-only front by its description, when the card gives one, marked with its language", () => {
    const { container } = render(
      <a href="#card">
        <CardRowFront front={{}} back={{ "": "Afghanistan" }} imageUrl={FLAG} imageDescription={{ sv: "En svart, röd och grön flagga" }} />
      </a>,
    );
    expect(screen.getByRole("link", { name: "En svart, röd och grön flagga" })).toBeInTheDocument();
    expect(container.querySelector("img")).toHaveAttribute("lang", "sv");
  });

  it("keeps a described picture decorative beside the front's text", () => {
    const { container } = render(
      <a href="#card">
        <CardRowFront front={{ "": "Kabul" }} back={{}} imageUrl={FLAG} imageDescription={{ en: "A flag" }} />
      </a>,
    );
    expect(screen.getByRole("link", { name: "Kabul" })).toBeInTheDocument();
    expect(container.querySelector("img")).not.toHaveAttribute("lang");
  });

  it("falls back to the side's label when neither side has text", () => {
    link({}, {});
    expect(
      screen.getByRole("link", { name: "Picture on the front of the card" }),
    ).toBeInTheDocument();
  });

  it("names it in Swedish", () => {
    render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <a href="#card">
          <CardRowFront front={{}} back={{ en: "Afghanistan", sv: "Afghanistan (sv)" }} imageUrl={FLAG} />
        </a>
      </I18nProvider>,
    );
    expect(
      screen.getByRole("link", { name: "Bild till: Afghanistan (sv)" }),
    ).toBeInTheDocument();
  });
});

describe("CardRowBack", () => {
  it("keeps the picture decorative beside the back's text", () => {
    const { container } = render(
      <CardRowBack back={{ "": "Afghanistan" }} imageUrl={FLAG} imageDescription={{ en: "A map" }} />,
    );
    expect(container).toHaveTextContent("Afghanistan");
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
    expect(container.querySelector("img")).not.toHaveAttribute("lang");
  });

  it("names a picture-only back by its description, marked with its language", () => {
    render(<CardRowBack back={{}} imageUrl={FLAG} imageDescription={{ sv: "En karta" }} />);
    expect(screen.getByRole("img", { name: "En karta" })).toHaveAttribute("lang", "sv");
  });

  it("names a picture-only back by its side when the card gives no description", () => {
    render(<CardRowBack back={{}} imageUrl={FLAG} />);
    expect(screen.getByRole("img", { name: "Picture on the back of the card" })).not.toHaveAttribute("lang");
  });
});
