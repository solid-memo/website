// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/preact";
import type { LangText } from "@solid-memo/domain/langText";
import { CardLanguage, CourseLanguage, useCardText } from "./cardLanguage";
import { createI18n } from "./i18n";
import { CardText, CourseText, ReaderText } from "./ReaderText";

const HOUSE: LangText = { en: "house", sv: "hus", ko: "집" };

function Shown({ text }: { text: LangText }) {
  const { cardText, cardLang } = useCardText();
  return <p lang={cardLang(text)}>{cardText(text)}</p>;
}

describe("useCardText", () => {
  it("shows card text in the deck's card language first, marked with it", () => {
    render(
      <CardLanguage language="sv">
        <Shown text={HOUSE} />
      </CardLanguage>,
    );
    expect(screen.getByText("hus")).toHaveAttribute("lang", "sv");
  });

  it("falls back to the usual order for a card without text in it", () => {
    render(
      <CardLanguage language="sv">
        <Shown text={{ en: "house", ko: "집" }} />
      </CardLanguage>,
    );
    expect(screen.getByText("house")).not.toHaveAttribute("lang");
  });

  it("is the reader's order outside a CardLanguage, or with no language", () => {
    render(<Shown text={HOUSE} />);
    render(
      <CardLanguage language={undefined}>
        <CardText text={HOUSE} />
      </CardLanguage>,
    );
    expect(screen.getAllByText("house")).toHaveLength(2);
  });

  it("leaves a deck's title to the reader's order beside its cards", () => {
    render(
      <CardLanguage language="ko">
        <h2>
          <ReaderText text={{ en: "Words", ko: "단어" }} />
        </h2>
        <p>
          <CardText text={HOUSE} breaks />
        </p>
      </CardLanguage>,
    );
    expect(screen.getByRole("heading")).toHaveTextContent("Words");
    expect(screen.getByText("집")).toHaveAttribute("lang", "ko");
  });
});

describe("CourseLanguage", () => {
  it("shows a course's own text and its cards in its course language first", () => {
    render(
      <CourseLanguage language="ko">
        <h2>
          <CourseText text={{ en: "Words", ko: "단어" }} />
        </h2>
        <p>
          <CardText text={HOUSE} />
        </p>
      </CourseLanguage>,
    );
    expect(screen.getByText("단어")).toHaveAttribute("lang", "ko");
    expect(screen.getByText("집")).toHaveAttribute("lang", "ko");
  });

  it("leaves a course's text to the reader's order under a plain deck's CardLanguage", () => {
    render(
      <CardLanguage language="ko">
        <h2>
          <CourseText text={{ en: "Words", ko: "단어" }} />
        </h2>
      </CardLanguage>,
    );
    expect(screen.getByRole("heading")).toHaveTextContent("Words");
  });
});

describe("cardReader", () => {
  it("ranks the deck's card language ahead of the app's, and is readerText without one", () => {
    const i18n = createI18n("sv");
    expect(i18n.cardReader("ko").cardText(HOUSE)).toBe("집");
    expect(i18n.cardReader("ko").cardLang(HOUSE)).toBe("ko");
    expect(i18n.cardReader("fr").cardText(HOUSE)).toBe("hus");
    expect(i18n.cardReader("fr").cardLang(HOUSE)).toBeUndefined();
    expect(i18n.cardReader(undefined).cardText(HOUSE)).toBe(i18n.readerText(HOUSE));
    expect(i18n.cardReader(undefined).cardLang({ en: "house" })).toBe("en");
  });
});
