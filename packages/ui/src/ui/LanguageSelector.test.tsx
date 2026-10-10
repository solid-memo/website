import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { I18nProvider } from "./i18n";
import { LanguageSelector } from "./LanguageSelector";

describe("LanguageSelector", () => {
  it("names each language in itself and chooses the one spoken", () => {
    render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <LanguageSelector />
      </I18nProvider>,
    );
    const list = screen.getByRole("combobox", { name: "Språk" });
    expect(list).toHaveValue("sv");
    expect(screen.getAllByRole("option").map((option) => [option.textContent, option.getAttribute("lang")])).toEqual([
      ["Deutsch", "de"],
      ["English", "en"],
      ["Español", "es"],
      ["Français", "fr"],
      ["Svenska", "sv"],
      ["한국어", "ko"],
    ]);
    expect(screen.getByRole("option", { name: "Svenska" })).toHaveProperty("selected", true);
  });

  it("chooses a language", () => {
    const onChoose = vi.fn();
    render(
      <I18nProvider locale="en" onChoose={onChoose}>
        <LanguageSelector />
      </I18nProvider>,
    );
    const list = screen.getByRole("combobox", { name: "Language" });
    fireEvent.input(list, { target: { value: "sv" } });
    expect(onChoose).toHaveBeenCalledWith("sv");
    fireEvent.input(list, { target: { value: "ko" } });
    expect(onChoose).toHaveBeenCalledWith("ko");
  });
});
