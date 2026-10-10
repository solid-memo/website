import { expect, test, type Page, type TestInfo } from "@playwright/test";
import type { Diagnostics } from "../fixtures.ts";
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
import { DraftEditor } from "./DraftEditor.ts";
import { ImportUrl } from "./ImportUrl.ts";
import { InstanceCreator } from "./InstanceCreator.ts";
import { Library } from "./Library.ts";
import { LibraryDeck } from "./LibraryDeck.ts";
import { LibraryPreview } from "./LibraryPreview.ts";
import { Onboarding } from "./Onboarding.ts";
import { Preferences } from "./Preferences.ts";
import { Statistics } from "./Statistics.ts";
import { Study } from "./Study.ts";
import { Studio } from "./Studio.ts";
import { Trial } from "./Trial.ts";
import { Validation } from "./Validation.ts";

/**
 * Solid Memo as a journey sees it: one page object per screen, the
 * language the app shows (the page objects find text in it), and the
 * journey's own steps.
 */
export class App {
  /** The language the app shows; Chrome.switchLanguage changes it. */
  locale: Locale = "en";
  private readonly expectedDialogs: RegExp[] = [];

  readonly chrome = new Chrome(this);
  readonly onboarding = new Onboarding(this);
  readonly cssLogin = new CssLogin(this);
  readonly instanceCreator = new InstanceCreator(this);
  readonly decks = new DeckList(this);
  readonly groups = new DeckGroups(this);
  readonly deckCreator = new DeckCreator(this);
  readonly deckDetail = new DeckDetail(this);
  readonly deckBrowser = new DeckBrowser(this);
  readonly cardCreator = new CardCreator(this);
  readonly cardEditor = new CardEditor(this);
  readonly study = new Study(this);
  readonly preferences = new Preferences(this);
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

  constructor(
    readonly page: Page,
    private readonly testInfo: TestInfo,
    diagnostics: Diagnostics,
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
   * One step of a journey, as the journey's spec names it ("03 · Set new
   * cards per day to 1"): a group in the report and the trace, with a
   * screenshot of where it left the app.
   */
  async step(title: string, body: () => Promise<void>): Promise<void> {
    await test.step(title, async () => {
      await body();
      const unmet = this.expectedDialogs.splice(0).map(String);
      expect(unmet, "dialogs this step expected that never came").toEqual([]);
      await this.testInfo.attach(`${title}.png`, { body: await this.page.screenshot(), contentType: "image/png" });
    });
  }
}
