// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { DeckCardLanguageForm } from "./DeckCardLanguageForm";
import { I18nProvider } from "./i18n";

function renderForm(props: Partial<Parameters<typeof DeckCardLanguageForm>[0]> = {}) {
  const onSave = vi.fn();
  const view = render(
    <DeckCardLanguageForm
      value={undefined}
      languages={["en", "sv"]}
      busy={false}
      onSave={onSave}
      {...props}
    />,
  );
  return { ...view, onSave };
}

const select = () => screen.getByRole("combobox", { name: "Card language" });
const options = () =>
  Array.from(select().querySelectorAll("option")).map((option) => [
    option.value,
    option.textContent,
  ]);

describe("DeckCardLanguageForm", () => {
  it("offers the app's language first, chosen by default, then the cards' languages", () => {
    renderForm();
    expect(select()).toHaveValue("");
    expect(select()).toHaveAccessibleDescription(
      "The language this deck's cards are shown in first, wherever they appear. A card without text in it is shown as usual. The deck's name and description are not affected.",
    );
    expect(options()).toEqual([
      ["", "The app's language"],
      ["en", "English (en)"],
      ["sv", "Swedish — svenska (sv)"],
    ]);
  });

  it("saves the language chosen, and null for the app's", () => {
    const { onSave } = renderForm({ value: "sv" });
    expect(select()).toHaveValue("sv");
    fireEvent.click(screen.getByRole("button", { name: "Save card language" }));
    expect(onSave).toHaveBeenLastCalledWith("sv");
    fireEvent.input(select(), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save card language" }));
    expect(onSave).toHaveBeenLastCalledWith(null);
    fireEvent.input(select(), { target: { value: "en" } });
    fireEvent.submit(select().closest("form")!);
    expect(onSave).toHaveBeenLastCalledWith("en");
  });

  it("keeps the deck's choice listed when its cards no longer state it", () => {
    renderForm({ value: "ko" });
    expect(select()).toHaveValue("ko");
    expect(options().map(([value]) => value)).toEqual(["", "en", "sv", "ko"]);
  });

  it("offers the default and the choice only while the cards are read, and says when they state none", () => {
    const { unmount } = renderForm({ value: "sv", languages: undefined });
    expect(options().map(([value]) => value)).toEqual(["", "sv"]);
    unmount();
    renderForm({ languages: [] });
    expect(options().map(([value]) => value)).toEqual([""]);
    expect(select()).toHaveAccessibleDescription("This deck's cards state no language to choose.");
  });

  it("saves nothing while busy, the select disabled and Save keeping the focus", () => {
    const { onSave } = renderForm({ busy: true });
    expect(select()).toBeDisabled();
    const save = screen.getByRole("button", { name: "Save card language" });
    expect(save).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(save);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("names a course's choice its course language, in words of its own", () => {
    const { onSave, unmount } = renderForm({ course: true, value: "sv" });
    const course = screen.getByRole("combobox", { name: "Course language" });
    expect(course).toHaveValue("sv");
    expect(course).toHaveAccessibleDescription(
      "The language this course is shown in first: its title and description, its chapters and their theory, and the cards of its questions. Text not in it is shown as usual.",
    );
    expect(screen.getByRole("option", { name: "The app's language" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save course language" }));
    expect(onSave).toHaveBeenLastCalledWith("sv");
    unmount();
    renderForm({ course: true, languages: [] });
    expect(screen.getByRole("combobox", { name: "Course language" })).toHaveAccessibleDescription(
      "This course states no language to choose.",
    );
  });

  it("speaks Swedish", () => {
    render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <DeckCardLanguageForm value={undefined} languages={["sv"]} busy={false} onSave={vi.fn()} />
      </I18nProvider>,
    );
    expect(screen.getByRole("combobox", { name: "Kortens språk" })).toHaveDisplayValue(
      "Appens språk",
    );
    expect(screen.getByRole("button", { name: "Spara kortens språk" })).toBeInTheDocument();
  });

  it("speaks Swedish for a course", () => {
    render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <DeckCardLanguageForm
          value={undefined}
          languages={["sv"]}
          course
          busy={false}
          onSave={vi.fn()}
        />
      </I18nProvider>,
    );
    expect(screen.getByRole("combobox", { name: "Kursens språk" })).toHaveDisplayValue(
      "Appens språk",
    );
    expect(screen.getByRole("button", { name: "Spara kursens språk" })).toBeInTheDocument();
  });
});
