// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { test, type Page } from "@playwright/test";
import type { App } from "./App.ts";

/**
 * What every page object shares: the page, the app's text in the language
 * it shows (`t`, `tp`), and `intent`, which makes each of a page object's
 * methods one step in the report and the trace, named for what the user
 * does; boxed, so a failure points at the journey's line, not in here.
 */
export abstract class Screen {
  constructor(protected readonly app: App) {}

  protected get page(): Page {
    return this.app.page;
  }

  protected t(key: string, vars?: Record<string, string | number>): string {
    return this.app.t(key, vars);
  }

  protected tp(key: string, vars?: Record<string, string | number>): RegExp {
    return this.app.tp(key, vars);
  }

  /** A share as the app writes it ("50 %", "100%"), of a count above 0. */
  protected percent(part: number, whole: number): string {
    return new Intl.NumberFormat(this.app.locale, { style: "percent" }).format(part / whole);
  }

  protected intent<T>(title: string, body: () => Promise<T>): Promise<T> {
    return test.step(title, body, { box: true });
  }
}
