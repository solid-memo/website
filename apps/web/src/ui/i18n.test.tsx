import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/preact";
import { AppError, ERROR_TEMPLATES } from "@solid-memo/domain/appError";
import { createI18n, I18nProvider, useI18n, type MessageKey } from "./i18n";
import en from "../i18n/en.json";
import sv from "../i18n/sv.json";
import ko from "../i18n/ko.json";

/** Every message's key, and its placeholders, in a message file. */
function shape(messages: object, prefix = ""): Record<string, string[]> {
  const found: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(messages)) {
    const path = `${prefix}${key}`;
    if (typeof value === "string") {
      found[path] = [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    } else if (typeof value.other === "string") {
      found[path] = [
        ...new Set(
          Object.values(value as Record<string, string>).flatMap((form) =>
            [...form.matchAll(/\{(\w+)\}/g)].map((m) => m[1]),
          ),
        ),
      ].sort();
    } else {
      Object.assign(found, shape(value, `${path}.`));
    }
  }
  return found;
}

describe("the message files", () => {
  it.each([
    ["sv", sv],
    ["ko", ko],
  ])("say the same things in %s as in English, with the same placeholders", (_locale, messages) => {
    expect(shape(messages)).toEqual(shape(en));
  });
});

/** Every message key the app's source asks for (keys are literals by rule). */
function keysUsed(dir: string): Set<string> {
  const used = new Set<string>();
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue;
    const source = readFileSync(join(entry.parentPath, entry.name), "utf8");
    for (const match of source.matchAll(/\btx?\(\s*"([^"]+)"/g)) used.add(match[1]);
  }
  return used;
}

describe("the source", () => {
  it("asks only for messages English has", () => {
    const known = new Set(Object.keys(shape(en)));
    const missing = [...keysUsed(join(import.meta.dirname, ".."))].filter((key) => !known.has(key));
    expect(missing).toEqual([]);
  });
});

describe("createI18n", () => {
  it("fills placeholders", () => {
    expect(createI18n("en").t("footer.version", { version: "abc" })).toBe("Version abc");
    expect(createI18n("en").t("footer.version")).toBe("Version {version}");
  });

  it("picks a plural form by count", () => {
    expect(createI18n("en").t("common.cardCount", { count: 1 })).toBe("1 card");
    expect(createI18n("en").t("common.cardCount", { count: 3 })).toBe("3 cards");
    expect(createI18n("sv").t("common.cardCount", { count: 3 })).toBe("3 kort");
    expect(createI18n("ko").t("common.cardCount", { count: 1 })).toBe("카드 1장");
    expect(createI18n("en").t("common.cardCount")).toBe("{count} cards");
  });

  it("speaks Swedish when asked", () => {
    expect(createI18n("sv").t("language.label")).toBe("Språk");
  });

  it("speaks Korean when asked", () => {
    expect(createI18n("ko").t("language.label")).toBe("언어");
  });

  it("names a missing message by its key", () => {
    expect(createI18n("sv").t("no.such.message" as MessageKey)).toBe("no.such.message");
    expect(createI18n("en").t("common" as MessageKey)).toBe("common");
    expect(createI18n("en").t("common.cardCount.one.deeper" as MessageKey)).toBe("common.cardCount.one.deeper");
  });

  it("fills placeholders with markup", () => {
    render(
      <p data-testid="p">
        {createI18n("en").tx("footer.createdBy", { author: <a href="#a">antwika</a> })}
        {createI18n("en").tx("footer.version", {})}
      </p>,
    );
    expect(screen.getByTestId("p")).toHaveTextContent("Created by antwikaVersion {version}");
    expect(screen.getByRole("link", { name: "antwika" })).toBeInTheDocument();
  });

  it("shows deck text in the spoken language first", () => {
    const text = { en: "Capitals", sv: "Huvudstäder" };
    expect(createI18n("sv").readerText(text)).toBe("Huvudstäder");
    expect(createI18n("en").readerText(text)).toBe("Capitals");
  });

  it("marks deck text in another language than the page's with that language", () => {
    const sv = createI18n("sv");
    expect(sv.readerLang({ en: "Capitals" })).toBe("en");
    expect(sv.readerLang({ en: "Capitals", sv: "Huvudstäder" })).toBeUndefined();
    expect(sv.readerLang({ "": "en bil" })).toBeUndefined();
    expect(createI18n("en").readerLang({ "en-gb": "Colours" })).toBeUndefined();
    expect(createI18n("en").readerLang({ ja: "水" })).toBe("ja");
    expect(sv.partLang(undefined)).toBeUndefined();
    expect(sv.partLang("de")).toBe("de");
  });

  it("marks text in no language with none, for the page's voice to speak it", () => {
    expect(createI18n("sv").partLang("zxx")).toBeUndefined();
    expect(createI18n("sv").readerLang({ zxx: "404" })).toBeUndefined();
  });

  it("names a language in the page's language, in itself, and by its code", () => {
    const en = createI18n("en");
    expect(en.languageLabel("sv")).toBe("Swedish — svenska (sv)");
    expect(en.languageLabel("pt-br")).toBe("Brazilian Portuguese — português (Brasil) (pt-BR)");
    expect(en.languageLabel("en")).toBe("English (en)");
    expect(en.languageParts("ja")).toEqual({ name: "Japanese", autonym: "日本語", code: "ja" });
    expect(createI18n("sv").languageLabel("sv")).toBe("svenska (sv)");
    expect(createI18n("sv").languageLabel("en")).toBe("engelska — English (en)");
    expect(en.languageLabel("ko")).toBe("Korean — 한국어 (ko)");
    expect(createI18n("ko").languageLabel("ko")).toBe("한국어 (ko)");
  });

  it("names a language Intl has no words in by its name only, and one it cannot name as its code", () => {
    const en = createI18n("en");
    expect(en.languageLabel("tlh")).toBe("Klingon (tlh)");
    expect(en.languageParts("qaa")).toEqual({ name: "qaa" });
    expect(en.languageLabel("qaa")).toBe("qaa");
    expect(en.languageLabel("not a tag")).toBe("not a tag");
  });

  it("names no language as such, not by its code", () => {
    expect(createI18n("en").languageLabel("zxx")).toBe("No language (codes, numbers, symbols)");
    expect(createI18n("sv").languageParts("zxx")).toEqual({ name: "Inget språk (koder, siffror, symboler)" });
  });

  it("does not mark a Swedish name saved the same in English as English", () => {
    const named = { en: "Huvudstäder", sv: "Huvudstäder" };
    expect(createI18n("sv").readerLang(named)).toBeUndefined();
    expect(createI18n("sv").readerText(named)).toBe("Huvudstäder");
  });

  it("writes out a day in the spoken language", () => {
    expect(createI18n("en").formatDate("2026-09-22T00:00:00.000Z")).toBe("September 22, 2026");
    expect(createI18n("sv").formatDate("2026-09-22T00:00:00.000Z")).toBe("22 september 2026");
    expect(createI18n("ko").formatDate("2026-09-22T00:00:00.000Z")).toBe("2026년 9월 22일");
  });

  it("names every study direction", () => {
    const sv = createI18n("sv");
    expect(sv.directionLabel("front-to-back")).toBe("Framsida → baksida");
    expect(sv.directionLabel("back-to-front")).toBe("Baksida → framsida");
    expect(sv.directionLabel("bidirectional")).toBe("Åt båda hållen");
  });
});

function Spoken() {
  const { locale, chooseLocale } = useI18n();
  return (
    <button type="button" onClick={() => chooseLocale("sv")}>
      {locale}
    </button>
  );
}

describe("errorText", () => {
  it("says an app error in the spoken language, its values filled in", () => {
    const gone = new AppError("deckGone", { deck: "Capitals" });
    expect(createI18n("en").errorText(gone)).toBe(
      "The deck “Capitals” no longer exists. Perhaps it was removed in another tab or app.",
    );
    expect(createI18n("sv").errorText(gone)).toBe(
      "Kortleken ”Capitals” finns inte längre. Kanske togs den bort i en annan flik eller app.",
    );
    const invalid = new AppError("movedCopyInvalid", { count: 1 });
    expect(createI18n("sv").errorText(invalid, { detail: false })).toContain("(1 problem)");
    expect(createI18n("sv").errorText(invalid)).toBe(
      "Kopian i din Pod har inte det format Solid Memo förväntar sig (1 problem), så dina studier lämnas som de var. Försök igen senare.",
    );
  });

  it("names a deck in the reader's language, marked when that is not the page's", () => {
    const gone = new AppError("deckGone", { deck: { en: "Capitals", sv: "Huvudstäder" } });
    render(<p data-testid="sv">{createI18n("sv").errorText(gone)}</p>);
    expect(screen.getByTestId("sv")).toHaveTextContent("Kortleken ”Huvudstäder” finns inte längre.");
    expect(screen.getByTestId("sv").querySelector("[lang]")).toBeNull();

    const english = new AppError("cardsDocumentGone", { deck: { en: "Capitals" }, url: "https://pod.example/d.ttl" });
    render(<p data-testid="english">{createI18n("sv").errorText(english)}</p>);
    expect(screen.getByText("Capitals")).toHaveAttribute("lang", "en");
    expect(screen.getByTestId("english")).toHaveTextContent("”Capitals”");
  });

  it("shows any other error as its own message, with what to do, and no error as none", () => {
    const { errorText } = createI18n("en");
    render(<p data-testid="en">{errorText(new Error("broken"))}</p>);
    expect(screen.getByTestId("en")).toHaveTextContent(
      "Something went wrong. Try again, or reload the page. Details: broken",
    );
    expect(screen.getByText("broken")).not.toHaveAttribute("lang");
    render(<p data-testid="others">{errorText("plain")}{errorText(42)}</p>);
    expect(screen.getByTestId("others")).toHaveTextContent("Details: plain");
    expect(screen.getByTestId("others")).toHaveTextContent("Details: 42");
    expect(errorText(null)).toBeNull();
    expect(errorText(undefined)).toBeNull();
  });

  it("says an untranslated error is in English, marked as English, on another language's page", () => {
    render(<p data-testid="p">{createI18n("sv").errorText(new Error("broken"))}</p>);
    expect(screen.getByTestId("p")).toHaveTextContent(
      "Något gick fel. Försök igen, eller läs in sidan på nytt. Detaljer (på engelska): broken",
    );
    expect(screen.getByText("broken")).toHaveAttribute("lang", "en");
  });

  it("folds an app error's technical detail away under the plain sentence, marked as English", () => {
    const refused = new AppError("storageInaccessible", { url: "https://pod.example/", status: 403 });
    render(<div data-testid="sv">{createI18n("sv").errorText(refused)}</div>);
    expect(screen.getByTestId("sv")).toHaveTextContent(
      "Solid Memo kommer inte åt den lagringen. Kontrollera adressen och att du är inloggad med kontot som äger den.",
    );
    expect(screen.getByText("Tekniska detaljer").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText(/status: 403/)).toHaveAttribute("lang", "en");

    render(<div data-testid="en">{createI18n("en").errorText(refused)}</div>);
    expect(screen.getByText(/url: https:\/\/pod.example\//, { selector: "[data-testid=en] code" })).not.toHaveAttribute("lang");
    expect(createI18n("en").errorText(refused, { detail: false })).toBe(
      "Solid Memo cannot open that storage. Check the address, and that you are logged in with the account that owns it.",
    );
  });

  it("says a request that never got through is a network failure", () => {
    const { errorText } = createI18n("sv");
    expect(errorText(new TypeError("Failed to fetch"))).toBe(
      "Kunde inte nå din Pod. Kontrollera anslutningen och försök igen.",
    );
    render(<p data-testid="type">{createI18n("en").errorText(new TypeError("x is undefined"))}</p>);
    expect(screen.getByTestId("type")).toHaveTextContent("Details: x is undefined");
  });

  it("has every error's English exactly as the domain writes it", () => {
    expect(en.errors).toEqual(ERROR_TEMPLATES);
  });
});

describe("violationText", () => {
  const shaped = { message: { en: "A picture is an IRI.", sv: "En bild är en IRI." }, severity: "violation" as const, constraint: "NodeKind" };
  const builtIn = { message: { en: "Less than 1 values" }, builtIn: true as const, severity: "violation" as const, constraint: "MinCount" };

  it("says a shape's message in the spoken language", () => {
    expect(createI18n("sv").violationText(shaped)).toBe("En bild är en IRI.");
    expect(createI18n("en").violationText(shaped)).toBe("A picture is an IRI.");
  });

  it("says the validator's own English by its constraint in another language, and keeps it in English", () => {
    expect(createI18n("sv").violationText(builtIn)).toBe("Ett värde saknas.");
    expect(createI18n("en").violationText(builtIn)).toBe("Less than 1 values");
    expect(createI18n("sv").violationText({ ...builtIn, constraint: "Sparql" })).toBe("Less than 1 values");
    expect(createI18n("sv").violationText({ ...shaped, message: { en: "Only English." } })).toBe("Only English.");
  });

  it("marks a message left in another language with that language", () => {
    const sv = createI18n("sv");
    expect(sv.violationLang(shaped)).toBeUndefined();
    expect(sv.violationLang(builtIn)).toBeUndefined();
    expect(sv.violationLang({ ...builtIn, constraint: "Sparql" })).toBe("en");
    expect(createI18n("en").violationLang({ ...shaped, message: { sv: "Bara svenska." } })).toBe("sv");
    expect(createI18n("en").violationLang(builtIn)).toBeUndefined();
  });

  it("names a severity", () => {
    expect(createI18n("sv").severityLabel("warning")).toBe("varning");
    expect(createI18n("en").severityLabel("violation")).toBe("violation");
  });
});

describe("useI18n", () => {
  it("speaks English outside a provider", () => {
    render(<Spoken />);
    screen.getByRole("button").click();
    expect(screen.getByRole("button")).toHaveTextContent("en");
  });

  it("speaks the provider's language", () => {
    render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <Spoken />
      </I18nProvider>,
    );
    expect(screen.getByRole("button")).toHaveTextContent("sv");
  });
});
