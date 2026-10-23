// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import "@testing-library/jest-dom/vitest";
import { LOCALES } from "@solid-memo/domain/locale";
import { loadLocale } from "../ui/i18n";

// Every language's messages, fetched as the page fetches the one it speaks
// before it renders (apps/web/src/main.tsx), so a test speaks any of them.
await Promise.all(LOCALES.map(loadLocale));

// happy-dom has no HTMLElement.translate. Browsers reflect it as the
// translate="yes"/"no" attribute, which Preact sets as a property
// (`translate={false}` on code from data), so the tests see the same.
Object.defineProperty(HTMLElement.prototype, "translate", {
  configurable: true,
  get(this: HTMLElement) {
    return this.getAttribute("translate") !== "no";
  },
  set(this: HTMLElement, value: boolean) {
    this.setAttribute("translate", value ? "yes" : "no");
  },
});
