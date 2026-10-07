import { expect } from "@playwright/test";
import { Screen } from "./Screen.ts";

/** "New Solid Memo instance": where a first login lands, the pod's storage already chosen. */
export class InstanceCreator extends Screen {
  async create(name: string): Promise<void> {
    await this.intent(`Create the instance ${name}`, async () => {
      await expect(this.page.getByRole("heading", { name: this.t("instanceCreator.heading") })).toBeVisible({ timeout: 30_000 });
      await this.page.getByRole("textbox", { name: this.t("instanceCreator.name") }).fill(name);
      await this.page.getByRole("button", { name: this.t("instanceCreator.create") }).click();
      await this.app.chrome.expectBreadcrumbHere("breadcrumbs.decks");
    });
  }
}
