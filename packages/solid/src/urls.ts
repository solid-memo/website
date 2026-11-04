// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

export { ensureTrailingSlash } from "@solid-memo/domain/instanceLayout";

/**
 * Last path segment of a URL, e.g. "japanese" for ".../solid-memo/japanese/",
 * with its percent-encoding undone. A segment whose escapes do not decode
 * (a lone `%`, `%ZZ`, or bytes that are not UTF-8 such as `%E9`) is
 * returned as written: an address a pod holds may carry any of them.
 */
export function lastPathSegment(url: string): string {
  const segments = new URL(url).pathname.split("/").filter((s) => s.length > 0);
  const last = segments[segments.length - 1];
  if (last === undefined) return url;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}
