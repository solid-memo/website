// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, type Locator } from "@playwright/test";
import type { Theme } from "./Chrome.ts";
import { Screen } from "./Screen.ts";

/** The roles a palette of one's own sets that a journey changes (paletteEditor.role.<key> in the i18n files). */
export type PaletteRole = "text" | "textMuted" | "bg";

/**
 * The palette editor (docs/theme.md, Palettes of one's own), opened from
 * the Colors group of the study preferences: a name, the palette it is
 * based on, a color field for each role in each theme, and a table of
 * the contrast of each pair. A save goes back to the preferences, the
 * app shown in the palette saved; one with too little contrast is saved
 * only after "Use anyway".
 */
export class PaletteEditor extends Screen {
  private get form(): Locator {
    return this.page.getByRole("main");
  }

  private themeGroup(theme: Theme): Locator {
    return this.form.getByRole("group", { name: this.t(`paletteEditor.${theme}`), exact: true });
  }

  /** Opens the editor of a new palette from the study preferences, open already. */
  async openNew(): Promise<void> {
    await this.intent("Design a palette", async () => {
      await this.form.getByRole("link", { name: this.t("preferences.palette.design") }).click();
      await expect(
        this.page.getByRole("heading", { name: this.t("paletteEditor.headingNew") }),
      ).toBeVisible();
    });
  }

  async name(name: string): Promise<void> {
    await this.intent(`Name the palette ${name}`, () =>
      this.form.getByLabel(this.t("paletteEditor.name"), { exact: true }).fill(name),
    );
  }

  /** Sets a role's color in a theme, the field's own value as a color picker gives it. */
  async setColor(theme: Theme, role: PaletteRole, color: string): Promise<void> {
    await this.intent(`Set the ${theme} theme's ${role} to ${color}`, async () => {
      const field = this.themeGroup(theme).getByLabel(this.t(`paletteEditor.role.${role}`), {
        exact: true,
      });
      await field.fill(color);
      await expect(field).toHaveValue(color);
    });
  }

  /** Expects the status to name pairs with less contrast than they need, and the table to mark them. */
  async expectTooLittleContrast(theme: Theme): Promise<void> {
    await this.intent(
      `Check that some pairs of the ${theme} theme have too little contrast`,
      async () => {
        // The screen's own status, beside the workspace's announcements.
        await expect(
          this.form
            .getByRole("status")
            .filter({ hasText: this.tp("paletteEditor.status.low.other") }),
        ).toBeVisible();
        const table = this.form.getByRole("region", {
          name: this.t(`paletteEditor.contrast.${theme}`),
        });
        await expect(table.getByText(this.t("paletteEditor.contrast.low")).first()).toBeVisible();
      },
    );
  }

  /** Saves: asked first, as the contrast is too little, then "Use anyway". */
  async saveAnyway(): Promise<void> {
    await this.intent("Save the palette, and use it anyway", async () => {
      await this.form.getByRole("button", { name: this.t("paletteEditor.save") }).click();
      const warning = this.form.getByRole("alert");
      await expect(warning).toContainText(this.t("errors.paletteContrastLow"));
      await warning.getByRole("button", { name: this.t("paletteEditor.useAnyway") }).click();
      await expect(
        this.page.getByRole("heading", { name: this.t("preferences.heading") }),
      ).toBeVisible();
    });
  }
}
