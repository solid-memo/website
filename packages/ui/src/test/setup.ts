// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/preact";
import { LOCALES } from "@solid-memo/domain/locale";
import { loadLocale } from "../ui/i18n";

// Every language's messages, fetched as the page fetches the one it speaks
// before it renders (apps/web/src/main.tsx), so a test speaks any of them.
await Promise.all(LOCALES.map(loadLocale));

// A findBy query or waitFor waits 10 s, not Testing Library's 1 s, for
// what it waits for, as a test may take 60 s, not vitest's 5
// (vitest.shared.ts): CI takes some tests fifty times as long as a
// laptop does, and a screen that reads its data in a few steps, about
// 0.1 s on a laptop, ran out of the 1 s there. A query that never
// matches still fails, later.
configure({ asyncUtilTimeout: 10_000 });

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
