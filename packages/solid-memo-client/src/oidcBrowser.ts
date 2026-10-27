// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * Sends the browser to `url`, the identity provider's authorization
 * endpoint: the page unloads. Its own module so that tests can stand in
 * for the navigation the test browser cannot make.
 */
export function navigate(url: string): void {
  window.location.assign(url);
}
