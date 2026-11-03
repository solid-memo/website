// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, test, type CDPSession, type Page, type TestInfo } from "@playwright/test";
import type { Diagnostics } from "../fixtures.ts";
import {
  clippedBoxes,
  CONTRAST_RULES,
  REFLOW,
  type Scheme,
  tourSchemes,
  unexcused,
  type Violation,
  violationLines,
  WCAG_TAGS,
} from "../harness/accessibility.ts";
import { type ScreenName, TOUR_ONLY, type Tour, unchecked } from "../harness/screens.ts";
import { text, textPattern, type Locale } from "../harness/strings.ts";
import { CardCreator } from "./CardCreator.ts";
import { CardEditor } from "./CardEditor.ts";
import { Chapter } from "./Chapter.ts";
import { ChapterReview } from "./ChapterReview.ts";
import { Chrome } from "./Chrome.ts";
import { Course } from "./Course.ts";
import { CourseQuestion } from "./CourseQuestion.ts";
import { CssLogin } from "./CssLogin.ts";
import { DeckBrowser } from "./DeckBrowser.ts";
import { DeckCreator } from "./DeckCreator.ts";
import { DeckDetail } from "./DeckDetail.ts";
import { DeckGroups } from "./DeckGroups.ts";
import { DeckList } from "./DeckList.ts";
import { DeckPreferences } from "./DeckPreferences.ts";
import { DraftEditor } from "./DraftEditor.ts";
import { GuestOffer } from "./GuestOffer.ts";
import { ImportUrl } from "./ImportUrl.ts";
import { InstanceCreator } from "./InstanceCreator.ts";
import { InstancePicker } from "./InstancePicker.ts";
import { Library } from "./Library.ts";
import { LibraryDeck } from "./LibraryDeck.ts";
import { LibraryPreview } from "./LibraryPreview.ts";
import { Onboarding } from "./Onboarding.ts";
import { PaletteEditor } from "./PaletteEditor.ts";
import { Preferences } from "./Preferences.ts";
import { SomethingWentWrong } from "./SomethingWentWrong.ts";
import { Statistics } from "./Statistics.ts";
import { Study } from "./Study.ts";
import { Studio } from "./Studio.ts";
import { Trial } from "./Trial.ts";
import { Validation } from "./Validation.ts";

/** axe, as a script the page runs (axe-core's own build), loaded into a page once each document. */
const AXE = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

/**
 * Solid Memo as a journey sees it: one page object per screen, the
 * language the app shows (the page objects find text in it), and the
 * journey's own steps.
 */
export class App {
  /** The language the app shows; Chrome.switchLanguage changes it. */
  locale: Locale = "en";
  private readonly expectedDialogs: RegExp[] = [];
  private devtools: CDPSession | undefined;
  /** The theme tour the journey is, and the screens it has checked. */
  private touring: { tour: Tour; checked: Set<string> } | undefined;

  readonly chrome = new Chrome(this);
  readonly onboarding = new Onboarding(this);
  readonly cssLogin = new CssLogin(this);
  readonly guestOffer = new GuestOffer(this);
  readonly instanceCreator = new InstanceCreator(this);
  readonly instancePicker = new InstancePicker(this);
  readonly decks = new DeckList(this);
  readonly groups = new DeckGroups(this);
  readonly deckCreator = new DeckCreator(this);
  readonly deckDetail = new DeckDetail(this);
  readonly deckPreferences = new DeckPreferences(this);
  readonly deckBrowser = new DeckBrowser(this);
  readonly cardCreator = new CardCreator(this);
  readonly cardEditor = new CardEditor(this);
  readonly study = new Study(this);
  readonly preferences = new Preferences(this);
  readonly paletteEditor = new PaletteEditor(this);
  readonly statistics = new Statistics(this);
  readonly validation = new Validation(this);
  readonly library = new Library(this);
  readonly libraryDeck = new LibraryDeck(this);
  readonly libraryPreview = new LibraryPreview(this);
  readonly importUrl = new ImportUrl(this);
  readonly studio = new Studio(this);
  readonly draftEditor = new DraftEditor(this);
  readonly trial = new Trial(this);
  readonly course = new Course(this);
  readonly chapter = new Chapter(this);
  readonly chapterReview = new ChapterReview(this);
  readonly question = new CourseQuestion(this);
  readonly crash = new SomethingWentWrong(this);

  constructor(
    readonly page: Page,
    private readonly testInfo: TestInfo,
    private readonly diagnostics: Diagnostics,
  ) {
    page.on("dialog", (dialog) => {
      const at = this.expectedDialogs.findIndex((pattern) => pattern.test(dialog.message()));
      // The page may be gone by the time it is answered: then there is nothing to answer.
      if (at === -1) {
        diagnostics.unexpectedDialogs.push(dialog.message());
        dialog.dismiss().catch(() => {});
      } else {
        this.expectedDialogs.splice(at, 1);
        dialog.accept().catch(() => {});
      }
    });
  }

  t(key: string, vars?: Record<string, string | number>): string {
    return text(this.locale, key, vars);
  }

  tp(key: string, vars?: Record<string, string | number>): RegExp {
    return textPattern(this.locale, key, vars);
  }

  /**
   * Accepts the next dialog (window.confirm) whose message matches; any
   * other fails the journey, and so does the step if it never comes.
   */
  expectDialog(message: RegExp): void {
    this.expectedDialogs.push(message);
  }

  /**
   * Puts the browser in another time zone, which the app's study day is
   * of: the local time moves on (or back) while the clock, which the
   * Solid server checks each request's proof of possession against
   * (within two minutes), stays right. Only in a journey that has turned
   * the config's zone off (`test.use({ timezoneId: "" })`): Chromium takes
   * one override at a time. The zone is in the report and diagnostics.json.
   */
  async setTimeZone(zone: string): Promise<void> {
    await test.step(`Move to the time zone ${zone}`, async () => {
      this.devtools ??= await this.page.context().newCDPSession(this.page);
      await this.devtools.send("Emulation.setTimezoneOverride", { timezoneId: zone });
      this.diagnostics.timezone = zone;
      this.testInfo.annotations.push({ type: "time zone", description: zone });
    });
  }

  /**
   * One step of a journey, as the journey's spec names it ("03 · Set new
   * cards per day to 1"): a group in the report and the trace, with a
   * screenshot of where it left the app, and that screen checked for
   * accessibility, in a step of its own, "Accessibility", so the report
   * says how long the check took apart from the step's own work. A
   * project whose metadata says `accessibility: false` leaves the check
   * out (playwright.config.ts).
   *
   * `screen` names the screen the step leaves the app on, which a theme
   * tour checks in every palette and theme (harness/screens.ts); a step
   * that only sets the journey up, such as logging in when the journey
   * is about something else, says `accessibility: false` instead, and
   * goes unchecked, as other journeys check its screen. `in`
   * names the projects the step runs in; elsewhere it is skipped, and
   * the report says so. It is for a step that tests the app's logic, the
   * same in every engine, in a journey the other engines run for what
   * differs between them (docs/testing.md#browsers).
   */
  async step(
    title: string,
    body: () => Promise<void>,
    options: ({ screen: ScreenName } | { accessibility: false }) & { in?: readonly string[] },
  ): Promise<void> {
    const { in: projects } = options;
    if (projects !== undefined && !projects.includes(this.testInfo.project.name)) {
      await test.step
        .skip(title, async () => {});
      return;
    }
    await test.step(title, async () => {
      await body();
      const unmet = this.expectedDialogs.splice(0).map(String);
      expect(unmet, "dialogs this step expected that never came").toEqual([]);
      await this.testInfo.attach(`${title}.png`, {
        body: await this.page.screenshot(),
        contentType: "image/png",
      });
      if ("screen" in options && this.testInfo.project.metadata.accessibility !== false) {
        const { screen } = options;
        await test.step("Accessibility", () => this.checkAccessibility(title, screen));
      }
    });
  }

  /**
   * A theme tour (journeys/tour-*.journey.ts): its steps check their
   * screens in the other palettes and themes instead (tourSchemes), and
   * the tour fails if it ends with a screen of its own unchecked.
   */
  async tour(tour: Tour, body: () => Promise<void>): Promise<void> {
    this.touring = { tour, checked: new Set() };
    await body();
    expect(
      unchecked(tour, this.touring.checked),
      `screens the ${tour} tour has not checked`,
    ).toEqual([]);
  }

  /**
   * Takes another device (newDevice) along on this app's theme tour,
   * begun: its steps check their screens in the tour's schemes, and the
   * screens it checks count as the tour's.
   */
  tourWith(device: App): void {
    device.touring = this.touring;
  }

  /**
   * Checks the screen a step left the app on with axe: in a journey, as
   * it shows it (a palette of the user's own taken off), then that it
   * reflows at 320px at the largest text size, in Chromium alone; in a
   * theme tour, in each of the tour's schemes (harness/accessibility.ts),
   * and a state no journey reaches in Standard light and its reflow too.
   * A violation fails the journey once it ends, as a soft expect, and
   * what was found is attached. A screen of the Solid server's own (its
   * login) is not the app's to check.
   */
  private async checkAccessibility(title: string, screen: ScreenName): Promise<void> {
    const app = new URL(String(this.testInfo.project.use.baseURL)).origin;
    if (new URL(this.page.url()).origin !== app) return;
    const chromium = this.testInfo.project.name === "chromium";
    if (this.touring === undefined) {
      const [found] = await this.axe([undefined]);
      await this.report(found!, `${title} · accessibility.json`, `on ${screen}`);
      if (chromium) await this.checkReflow(title);
      return;
    }
    this.touring.checked.add(screen);
    // A state no journey reaches gets what a journey would check it for too.
    const unseen = TOUR_ONLY.includes(screen);
    const schemes = tourSchemes(chromium, unseen);
    const found = await this.axe(schemes);
    for (const [at, { palette, theme }] of schemes.entries()) {
      await this.report(
        found[at]!,
        `${title} · accessibility, ${palette}, ${theme}.json`,
        `on ${screen}, in ${palette}, ${theme}`,
      );
    }
    if (unseen && chromium) await this.checkReflow(title);
  }

  /** Attaches the violations left once the known exceptions are out, and fails the journey on them, softly. */
  private async report(violations: Violation[], name: string, where: string): Promise<void> {
    const left = unexcused(violations);
    if (left.length === 0) return;
    await this.testInfo.attach(name, {
      body: JSON.stringify(left, null, 2),
      contentType: "application/json",
    });
    expect.soft(violationLines(left), `accessibility violations ${where} (${name})`).toEqual([]);
  }

  /**
   * What axe finds on the screen in each of the schemes, one after
   * another, in one call into the page; with no scheme, as it is shown
   * but for a palette of the user's own, with all of WCAG_TAGS: only the
   * palette editor measures such a palette (docs/accessibility.md). axe is loaded into the document the first
   * time it is checked, and the root's attributes are put back after,
   * whatever happens. The stylesheet's colors follow the root's
   * data-palette and data-theme alone (docs/theme.md), once a palette of
   * the user's own, which the root's style paints, is taken off.
   */
  private async axe(schemes: readonly (Scheme | undefined)[]): Promise<Violation[][]> {
    if (!(await this.page.evaluate(() => "axe" in window))) await this.page.evaluate(AXE);
    return this.page.evaluate(
      async ({ schemes, tags, rules }) => {
        type Axe = {
          run: (
            context: Document,
            options: {
              runOnly: { type: "tag" | "rule"; values: string[] };
              resultTypes: string[];
            },
          ) => Promise<{ violations: Violation[] }>;
        };
        const { axe } = window as unknown as { axe: Axe };
        const html = document.documentElement;
        const names = ["data-palette", "data-theme", "style"];
        const shown = names.map((name) => [name, html.getAttribute(name)] as const);
        const set = (name: string, value: string | null) => {
          if (value === null) html.removeAttribute(name);
          else html.setAttribute(name, value);
        };
        try {
          const found: Violation[][] = [];
          for (const scheme of schemes) {
            if (scheme !== undefined) {
              set("data-palette", scheme.palette === "standard" ? null : scheme.palette);
              set("data-theme", scheme.theme);
            }
            set("style", null);
            const { violations } = await axe.run(document, {
              runOnly:
                scheme === undefined || scheme.full
                  ? { type: "tag", values: tags }
                  : { type: "rule", values: rules },
              resultTypes: ["violations"],
            });
            found.push(violations);
          }
          return found;
        } finally {
          for (const [name, value] of shown) set(name, value);
        }
      },
      { schemes, tags: WCAG_TAGS, rules: CONTRAST_RULES },
    );
  }

  /** The root's attributes the stylesheet's colors and text size follow, and its style, where a palette of the user's own is painted. */
  private async rootAttributes(): Promise<Record<string, string | null>> {
    return this.page
      .locator("html")
      .evaluate((html) =>
        Object.fromEntries(
          ["data-palette", "data-theme", "data-text-size", "style"].map((name) => [
            name,
            html.getAttribute(name),
          ]),
        ),
      );
  }

  /** Sets the root's attributes, and takes away those that are null. */
  private async setRootAttributes(attributes: Record<string, string | null>): Promise<void> {
    await this.page.locator("html").evaluate((html, set) => {
      for (const [name, value] of Object.entries(set)) {
        if (value === null) html.removeAttribute(name);
        else html.setAttribute(name, value);
      }
    }, attributes);
  }

  /**
   * At the largest text size and 320px wide (WCAG 1.4.4, 1.4.10), the page
   * scrolls only up and down, and no text kept on one line is cut short
   * without its title, which axe does not check. Its palette and theme
   * stay as they are, which the layout doesn't follow. The page's own
   * text size and width are put back after.
   */
  private async checkReflow(title: string): Promise<void> {
    const viewport = this.page.viewportSize();
    if (viewport === null) return;
    const shown = await this.rootAttributes();
    await this.setRootAttributes({ "data-text-size": REFLOW.textSize });
    await this.page.setViewportSize({ width: REFLOW.width, height: viewport.height });
    try {
      const { wide, pageWidth, boxes } = await this.page.evaluate(async () => {
        // A frame for the layout to follow the new width and size.
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const selectorOf = (element: Element) =>
          [element.tagName.toLowerCase(), ...[...element.classList].map((name) => `.${name}`)].join(
            "",
          );
        const oneLine = [...document.body.querySelectorAll<HTMLElement>("*")].filter((element) => {
          const style = getComputedStyle(element);
          return (
            style.whiteSpace === "nowrap" &&
            (style.overflowX === "hidden" || style.overflowX === "clip") &&
            element.getClientRects().length > 0
          );
        });
        const width = document.documentElement.clientWidth;
        const past = (element: Element | null) =>
          element !== null && element.getBoundingClientRect().right > width + 1;
        // What reaches past the page's edge while what it is in does not: where to look first.
        const wide = [...document.body.querySelectorAll("*")]
          .filter((element) => past(element) && !past(element.parentElement))
          .slice(0, 5)
          .map((element) => {
            const where = element.closest("[id], [class]");
            const words = (element.textContent ?? "").trim().slice(0, 40);
            return `${selectorOf(element)}${where === element || where === null ? "" : ` in ${selectorOf(where)}`}${words === "" ? "" : ` ("${words}")`}`;
          });
        return {
          wide,
          pageWidth: document.documentElement.scrollWidth - width,
          boxes: oneLine.map((element) => ({
            selector: selectorOf(element),
            scrollWidth: element.scrollWidth,
            clientWidth: element.clientWidth,
            title: element.title,
          })),
        };
      });
      const problems = [
        ...(pageWidth > 0
          ? [`the page scrolls ${pageWidth}px sideways, past its edge: ${wide.join(", ")}`]
          : []),
        ...clippedBoxes(boxes).map((selector) => `${selector} is cut short, with no title`),
      ];
      if (problems.length > 0) {
        await this.testInfo.attach(`${title} · reflow.png`, {
          body: await this.page.screenshot(),
          contentType: "image/png",
        });
      }
      expect
        .soft(problems, `reflow at ${REFLOW.width}px, text size ${REFLOW.textSize}`)
        .toEqual([]);
    } finally {
      await this.page.setViewportSize(viewport);
      await this.setRootAttributes(shown);
    }
  }
}
