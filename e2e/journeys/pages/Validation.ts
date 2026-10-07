import { expect, type Locator } from "@playwright/test";
import { Screen } from "./Screen.ts";

/**
 * "Validation of <instance>", a developer tool (developer mode on): the
 * instance's documents checked against Solid Memo's shapes, the result
 * said in one status line. The app validates once a session and keeps
 * the result (its "Validate again" reads afresh), so a journey opens it
 * once its pod is as it should be checked.
 */
export class Validation extends Screen {
  private get againButton(): Locator {
    return this.page.getByRole("main").getByRole("button", { name: this.t("validation.validateAgain"), exact: true });
  }

  /** The status line once it holds a result: some count of documents conforming, or violations. */
  private get result(): Locator {
    const status = this.page.getByRole("status");
    return status
      .filter({ hasText: this.tp("validation.allConform", { count: 1 }) })
      .or(status.filter({ hasText: this.tp("validation.allConform") }))
      .or(status.filter({ hasText: this.tp("validation.violationsIn") }));
  }

  /** Opens "Validate this instance" from the developer tools and waits for its result. */
  async open(): Promise<void> {
    await this.intent("Open Validate this instance", async () => {
      await this.app.chrome.developerTools.getByRole("link", { name: this.t("workspace.validateInstance") }).click();
      await this.app.chrome.expectBreadcrumbHere("breadcrumbs.validation");
      await expect(this.againButton).toBeEnabled({ timeout: 60_000 });
      await expect(this.result).toBeVisible();
    });
  }

  /**
   * Every document conforms: returns how many there are ("The 1 document
   * conforms.", "All {count} documents conform."); fails with the summary
   * and every violation listed when any does not.
   */
  async expectAllConform(): Promise<number> {
    return this.intent("Check that every document conforms", async () => {
      const summary = (await this.result.innerText()).trim();
      if (summary === this.t("validation.allConform", { count: 1 })) return 1;
      const count = this.tp("validation.allConform").exec(summary)?.groups?.count;
      if (count !== undefined) {
        expect(summary).toBe(this.t("validation.allConform", { count: Number(count) }));
        return Number(count);
      }
      const rows = await this.page.getByRole("main").getByRole("row").allInnerTexts();
      throw new Error(`The instance does not conform: ${summary}\n${rows.join("\n")}`);
    });
  }
}
