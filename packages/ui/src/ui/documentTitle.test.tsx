import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/preact";
import type { ComponentChildren } from "preact";
import { I18nProvider } from "./i18n";
import { useDocumentTitle } from "./documentTitle";

describe("useDocumentTitle", () => {
  it("names the page before the app", () => {
    renderHook(() => useDocumentTitle(["Study", "Kanji N5"]));
    expect(document.title).toBe("Study – Kanji N5 – Solid Memo");
  });

  it("leaves out parts still loading, and is the app's name alone without any", () => {
    renderHook(() => useDocumentTitle(["", "Decks"]));
    expect(document.title).toBe("Decks – Solid Memo");
    renderHook(() => useDocumentTitle([]));
    expect(document.title).toBe("Solid Memo");
  });

  it("shortens a long part", () => {
    renderHook(() => useDocumentTitle(["x".repeat(100)]));
    expect(document.title).toBe(`${"x".repeat(59)}… – Solid Memo`);
  });

  it("leaves the title alone when given null", () => {
    document.title = "Set elsewhere";
    renderHook(() => useDocumentTitle(null));
    expect(document.title).toBe("Set elsewhere");
  });

  it("follows the user's language", () => {
    const wrapper = ({ children }: { children: ComponentChildren }) => (
      <I18nProvider locale="sv" onChoose={() => undefined}>
        {children}
      </I18nProvider>
    );
    renderHook(() => useDocumentTitle(["Kortlekar"]), { wrapper });
    expect(document.title).toBe("Kortlekar – Solid Memo");
  });
});
