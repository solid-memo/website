import { expect, type Locator } from "@playwright/test";
import { Screen } from "./Screen.ts";

/** A tile's key under statistics.* in the i18n files: what it counts. */
export type StatisticsTile = "answers" | "studyDays" | "cards" | "currentStreak" | "longestStreak" | "young" | "mature";

/** How many prompts are new, young and mature: a bidirectional deck counts each card twice. */
export interface Maturity {
  new: number;
  young: number;
  mature: number;
}

/** What the statistics should say; left out, a tile, a chart or the table is not checked. */
export interface ExpectedStatistics {
  answers?: number;
  studyDays?: number;
  cards?: number;
  /** In days: shown as "1 day", "2 days". */
  currentStreak?: number;
  longestStreak?: number;
  /** Reviews remembered, young and mature apart; null for "No reviews yet". */
  young?: { recalled: number; reviews: number } | null;
  mature?: { recalled: number; reviews: number } | null;
  /** Every row of "By deck", in any order; `lastStudied` "today" is today's study day. */
  decks?: { name: string; answers: number; lastStudied?: "today" }[];
  /** The instance's prompts taken together, under "Where your cards stand", with the forecast beside them. */
  maturity?: Maturity;
  /** Every deck under "Maturity by deck", in any order. */
  maturityByDeck?: ({ name: string } & Maturity)[];
}

/**
 * "Statistics": the instance's answers in tiles, a calendar, charts of
 * progress and a table by deck; then where the cards stand, read apart.
 */
export class Statistics extends Screen {
  private get main(): Locator {
    return this.page.getByRole("main");
  }

  private get byDeck(): Locator {
    return this.main.getByRole("table").filter({ has: this.page.getByRole("columnheader", { name: this.t("statistics.lastStudied") }) });
  }

  /** A headline tile, named by its label. */
  tile(key: StatisticsTile): Locator {
    return this.main.getByRole("group", { name: this.t(`statistics.${key}`), exact: true });
  }

  /** Opens Statistics from the instance's links and waits for them to be read. */
  async open(): Promise<void> {
    await this.intent("Open Statistics", async () => {
      await this.app.chrome.openStatistics();
      await expect(this.page.getByRole("heading", { name: this.t("statistics.heading"), exact: true, level: 2 })).toBeVisible();
      await expect(this.main.getByText(this.t("statistics.empty"), { exact: true }).or(this.tile("answers"))).toBeVisible();
    });
  }

  /** The value a tile shows ("4", "1 day", "75 %", "–"). */
  async value(key: StatisticsTile): Promise<string> {
    return (await this.tile(key).getByRole("strong").innerText()).trim();
  }

  /** No answers yet: the statistics say so, and show no tiles. */
  async expectEmpty(): Promise<void> {
    await this.intent("Check that there are no statistics yet", async () => {
      await expect(this.main.getByText(this.t("statistics.empty"), { exact: true })).toBeVisible();
      await expect(this.tile("answers")).toHaveCount(0);
    });
  }

  async expectStatistics(expected: ExpectedStatistics): Promise<void> {
    await this.intent("Check the statistics", async () => {
      const counts = { answers: expected.answers, studyDays: expected.studyDays, cards: expected.cards } as const;
      for (const [key, count] of Object.entries(counts)) {
        if (count !== undefined) await this.expectValue(key as StatisticsTile, String(count));
      }
      if (expected.answers !== undefined) await this.expectIntroduced();
      const streaks = { currentStreak: expected.currentStreak, longestStreak: expected.longestStreak } as const;
      for (const [key, days] of Object.entries(streaks)) {
        if (days !== undefined) await this.expectValue(key as StatisticsTile, this.t("statistics.dayCount", { count: days }));
      }
      for (const key of ["young", "mature"] as const) {
        const recall = expected[key];
        if (recall !== undefined) await this.expectRecall(key, recall);
      }
      if (expected.decks !== undefined) await this.expectByDeck(expected.decks);
      if (expected.maturity !== undefined) await this.expectMaturity(expected.maturity);
      if (expected.maturityByDeck !== undefined) await this.expectMaturityByDeck(expected.maturityByDeck);
    });
  }

  /** A chart, named by its caption. */
  private figure(caption: string): Locator {
    return this.main.getByRole("figure", { name: caption, exact: true });
  }

  /** What a maturity bar's picture says of its counts: "0 new, 4 young and 0 mature." */
  private maturityLabel(maturity: Maturity): string {
    return this.t("statistics.maturityLabel", {
      new: this.t("statistics.maturityNew", { count: maturity.new }),
      young: this.t("statistics.maturityYoung", { count: maturity.young }),
      mature: this.t("statistics.maturityMature", { count: maturity.mature }),
    });
  }

  /** The chart of cards introduced over time, which comes with answers. */
  private async expectIntroduced(): Promise<void> {
    await expect(this.main.getByRole("img", { name: this.t("statistics.introducedLabel"), exact: true })).toBeVisible();
  }

  /**
   * The overall maturity bar and the forecast of the next 30 days, which
   * show before any answer too.
   */
  private async expectMaturity(maturity: Maturity): Promise<void> {
    const bar = this.figure(this.t("statistics.maturity")).getByRole("img");
    await expect(bar, this.t("statistics.maturity")).toHaveAccessibleName(this.maturityLabel(maturity));
    await expect(this.main.getByRole("img", { name: this.t("statistics.forecastLabel", { count: 30 }), exact: true })).toBeVisible();
  }

  private async expectMaturityByDeck(decks: ({ name: string } & Maturity)[]): Promise<void> {
    const list = this.main.getByRole("list").filter({ has: this.page.getByRole("figure") });
    await expect(list.getByRole("listitem"), this.t("statistics.maturityByDeck")).toHaveCount(decks.length);
    for (const deck of decks) {
      const bar = list.getByRole("figure", { name: deck.name, exact: true }).getByRole("img");
      await expect(bar, `${this.t("statistics.maturityByDeck")}: ${deck.name}`).toHaveAccessibleName(this.maturityLabel(deck));
    }
  }

  private async expectValue(key: StatisticsTile, value: string): Promise<void> {
    await expect(this.tile(key).getByRole("strong"), this.t(`statistics.${key}`)).toHaveText(value);
  }

  private async expectRecall(key: "young" | "mature", recall: { recalled: number; reviews: number } | null): Promise<void> {
    if (recall === null) {
      await this.expectValue(key, "–");
      await expect(this.tile(key)).toContainText(this.t("statistics.noReviews"));
      return;
    }
    const percent = new Intl.NumberFormat(this.app.locale, { style: "percent" }).format(recall.recalled / recall.reviews);
    await this.expectValue(key, percent);
    await expect(this.tile(key)).toContainText(this.t("statistics.ofReviews", { count: recall.reviews }));
  }

  private async expectByDeck(decks: { name: string; answers: number; lastStudied?: "today" }[]): Promise<void> {
    // Data rows only: the header row has column headers, not cells.
    await expect(this.byDeck.getByRole("row").filter({ has: this.page.getByRole("cell") })).toHaveCount(decks.length);
    const today = await this.today();
    for (const deck of decks) {
      const row = this.byDeck.getByRole("row").filter({ has: this.page.getByRole("cell", { name: deck.name, exact: true }) });
      const cells = [deck.name, String(deck.answers), ...(deck.lastStudied === "today" ? [today] : [/.+/])];
      await expect(row.getByRole("cell"), `By deck: ${deck.name}`).toHaveText(cells);
    }
  }

  /** Today's study day as the table shows dates: in the browser's time zone, written as the app writes dates. */
  private async today(): Promise<string> {
    return this.page.evaluate((locale) => {
      const now = new Date();
      const day = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
      return new Date(day).toLocaleDateString(locale, { dateStyle: "long", timeZone: "UTC" });
    }, this.app.locale);
  }
}
