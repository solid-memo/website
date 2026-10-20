// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * The user journeys' report's old address, /journeys/
 * (public/journeys/index.html): a page that sends its hash on to the
 * report's own site (docs/deployment.md#the-journeys-report), under a
 * Content Security Policy that lets only that script run.
 */

const REPORT = "https://journeys.solid-memo.com/";

const html = readFileSync(resolve(import.meta.dirname, "../public/journeys/index.html"), "utf8");
const page = new DOMParser().parseFromString(html, "text/html");
const scripts = [...page.scripts].map((script) => script.text);

/** Where the page sends a visitor who came with `hash`. */
function redirect(hash: string): string {
  let target: string | undefined;
  new Function("location", scripts[0]!)({ hash, replace: (url: string) => (target = url) });
  return target!;
}

describe("the journeys' report's old address", () => {
  it("sends a link into the report on to the same place in the report's site", () => {
    expect(redirect("#?testId=a1b2")).toBe(`${REPORT}#?testId=a1b2`);
    expect(redirect("#?q=s:failed")).toBe(`${REPORT}#?q=s:failed`);
  });

  it("sends a visit with no hash to the report's start", () => {
    expect(redirect("")).toBe(REPORT);
  });

  it("lets its one script run by its hash, and nothing else", () => {
    const meta = page.querySelector('meta[http-equiv="Content-Security-Policy"]')!;
    expect(
      meta.compareDocumentPosition(page.scripts[0]!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const policy = new Map(
      meta
        .getAttribute("content")!
        .split(";")
        .map((part) => {
          const [name, ...values] = part.trim().split(/\s+/);
          return [name!, values];
        }),
    );
    expect(scripts).toHaveLength(1);
    expect(policy.get("script-src")).toEqual([
      `'sha256-${createHash("sha256").update(scripts[0]!).digest("base64")}'`,
    ]);
    expect(policy.get("object-src")).toEqual(["'none'"]);
    expect(policy.get("base-uri")).toEqual(["'none'"]);
    expect(policy.get("form-action")).toEqual(["'none'"]);
  });

  it("links to the report for a browser that runs no script", () => {
    expect(html).toContain(`<a href="${REPORT}">`);
  });
});
