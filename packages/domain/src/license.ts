import { AppError } from "./appError";

/** Short names of the licences decks commonly carry, by their URL. */
const LICENSE_NAMES: [pattern: RegExp, label: string][] = [
  [/creativecommons\.org\/publicdomain\/zero\/1\.0/, "CC0 1.0"],
  [/creativecommons\.org\/publicdomain\/mark\/1\.0/, "Public Domain Mark 1.0"],
  [/creativecommons\.org\/licenses\/([a-z-]+)\/(\d\.\d)/, "CC $1 $2"],
  [/gnu\.org\/licenses\/fdl-1\.3/, "GNU FDL 1.3"],
  [/gnu\.org\/licenses\/old-licenses\/gpl-2\.0/, "GNU GPL 2.0"],
];

/**
 * The licences a deck or a catalogue can be given (dcterms:license), by
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
 * The licence an edit gives: none, one of KNOWN_LICENSES, or the one
 * it had (`current`), whatever it is; anything else is refused
 * (licenseUnknown).
 */
export function chosenLicense(license: string | undefined, current: string | undefined): string | undefined {
  if (license === undefined || license === current || KNOWN_LICENSES.includes(license)) return license;
  throw new AppError("licenseUnknown", { url: license });
}

/**
 * A readable name for a licence URL — "CC0 1.0", "CC BY-SA 4.0" — or
 * the URL itself when it is not one of the well-known ones.
 */
export function licenseLabel(url: string): string {
  for (const [pattern, label] of LICENSE_NAMES) {
    const match = url.match(pattern);
    if (match !== null) {
      return label
        .replace("$1", (match[1] ?? "").toUpperCase())
        .replace("$2", match[2] ?? "");
    }
  }
  return url;
}
