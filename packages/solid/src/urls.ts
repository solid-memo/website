// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

export { ensureTrailingSlash } from "@solid-memo/domain/instanceLayout";

/** Last path segment of a URL, e.g. "japanese" for ".../solid-memo/japanese/". */
export function lastPathSegment(url: string): string {
  const segments = new URL(url).pathname.split("/").filter((s) => s.length > 0);
  const last = segments[segments.length - 1];
  return last === undefined ? url : decodeURIComponent(last);
}
