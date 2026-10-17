// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * Whether a page error Playwright reports is a message WebKit logged
 * rather than an error thrown in the page. WebKit logs a fetch cut off on
 * its way to another origin (the page left mid-request, or CORS refused
 * it) as an error in the page's script, and Playwright reports such a log
 * as a page error, though the app's code caught the fetch's rejection.
 * Chromium and Firefox log the same to the console, so it goes there.
 */
export function loggedByWebKit(stack: string): boolean {
  const [first = ""] = stack.split("\n");
  return /^Fetch API cannot load \S+ due to access control checks\.$/.test(first);
}
