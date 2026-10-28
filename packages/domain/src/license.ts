// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { AppError } from "./appError";

/**
 * Short names of the licenses decks commonly carry, by the host (less
 * any `www.`) and path of their URL, matched whole: the host is the one
 * the URL parser reads, so a URL elsewhere whose path or user name merely
 * reads `creativecommons.org/…` is not given a license's name. GNU's
 * translated pages (`fdl-1.3.de.html`) count too.
 */
const LICENSE_NAMES: [pattern: RegExp, label: string][] = [
  [/^creativecommons\.org\/publicdomain\/zero\/1\.0(?:\/.*)?$/, "CC0 1.0"],
  [/^creativecommons\.org\/publicdomain\/mark\/1\.0(?:\/.*)?$/, "Public Domain Mark 1.0"],
  [/^creativecommons\.org\/licenses\/([a-z-]+)\/(\d\.\d)(?:\/.*)?$/, "CC $1 $2"],
  [/^gnu\.org\/licenses\/fdl-1\.3(?:\.[a-z]{2}(?:-[a-z]{2})?)?(?:\.html)?$/, "GNU FDL 1.3"],
  [
    /^gnu\.org\/licenses\/old-licenses\/gpl-2\.0(?:\.[a-z]{2}(?:-[a-z]{2})?)?(?:\.html)?$/,
    "GNU GPL 2.0",
  ],
];
/**
 * The licenses a deck or a catalog can be given (dcterms:license), by
 * their URL: the Creative Commons ones, then the others the library's
 * decks carry. One another app wrote is kept as it is, but never chosen
 * (withProvenance, describedCatalog).
 */
export const KNOWN_LICENSES: readonly string[] = [
  "https://creativecommons.org/publicdomain/zero/1.0/",
  "https://creativecommons.org/publicdomain/mark/1.0/",
  "https://creativecommons.org/licenses/by/4.0/",
  "https://creativecommons.org/licenses/by-sa/4.0/",
  "https://creativecommons.org/licenses/by-nc/4.0/",
  "https://creativecommons.org/licenses/by-nc-sa/4.0/",
  "https://creativecommons.org/licenses/by-nd/4.0/",
  "https://creativecommons.org/licenses/by-nc-nd/4.0/",
  "https://creativecommons.org/licenses/by-sa/3.0/",
  "https://creativecommons.org/licenses/by-sa/2.5/",
  "https://www.gnu.org/licenses/fdl-1.3.html",
  "https://www.gnu.org/licenses/old-licenses/gpl-2.0.html",
];

/**
 * The license an edit gives: none, one of KNOWN_LICENSES, or the one
 * it had (`current`), whatever it is; anything else is refused
 * (licenseUnknown).
 */
export function chosenLicense(
  license: string | undefined,
  current: string | undefined,
): string | undefined {
  if (license === undefined || license === current || KNOWN_LICENSES.includes(license))
    return license;
  throw new AppError("licenseUnknown", { url: license });
}

/**
 * A readable name for a license URL on creativecommons.org or gnu.org —
 * "CC0 1.0", "CC BY-SA 4.0" — or the URL itself when it is not one of
 * the well-known ones, so the address it opens is the one shown.
 */
export function licenseLabel(url: string): string {
  if (!URL.canParse(url)) return url;
  const parsed = new URL(url);
  if (!/^https?:$/.test(parsed.protocol) || parsed.username !== "" || parsed.password !== "")
    return url;
  const place = `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname}`;
  for (const [pattern, label] of LICENSE_NAMES) {
    const match = place.match(pattern);
    if (match !== null) {
      return label.replace("$1", (match[1] ?? "").toUpperCase()).replace("$2", match[2] ?? "");
    }
  }
  return url;
}
