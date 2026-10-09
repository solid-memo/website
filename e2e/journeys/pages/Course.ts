import { expect, type Locator } from "@playwright/test";
import { Screen } from "./Screen.ts";

/**
 * A course as the learner has it: its title, how many chapters are done,
 * "Start the course" (or "Continue") and its chapters, under its deck in
 * the breadcrumbs.
 */
export class Course extends Screen {
  heading(title: string): Locator {
    return this.page.getByRole("heading", { name: title, exact: true, level: 2 });
  }

  async expectShown(title: string): Promise<void> {
    await expect(this.heading(title)).toBeVisible();
    await this.app.chrome.expectBreadcrumbHere("breadcrumbs.course");
  }
}
