// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { AppError } from "./appError";
import { chosenLicense, KNOWN_LICENSES, licenseLabel } from "./license";

describe("licenseLabel", () => {
  it.each([
    ["https://creativecommons.org/publicdomain/zero/1.0/", "CC0 1.0"],
    ["http://creativecommons.org/publicdomain/zero/1.0/legalcode", "CC0 1.0"],
    ["https://creativecommons.org/publicdomain/mark/1.0/", "Public Domain Mark 1.0"],
    ["https://creativecommons.org/licenses/by/4.0/", "CC BY 4.0"],
    ["https://creativecommons.org/licenses/by-nc-sa/3.0/", "CC BY-NC-SA 3.0"],
    ["https://www.gnu.org/licenses/fdl-1.3.html", "GNU FDL 1.3"],
    ["https://www.gnu.org/licenses/old-licenses/gpl-2.0.html", "GNU GPL 2.0"],
    ["HTTPS://www.creativecommons.org/licenses/by/4.0#x", "CC BY 4.0"],
    ["https://creativecommons.org/licenses/by-sa/4.0/?ref=deck", "CC BY-SA 4.0"],
    ["https://gnu.org/licenses/fdl-1.3.de.html#license-text", "GNU FDL 1.3"],
    ["https://www.gnu.org/licenses/old-licenses/gpl-2.0.zh-cn.html", "GNU GPL 2.0"],
  ])("names %s", (url, label) => {
    expect(licenseLabel(url)).toBe(label);
  });

  it.each([
    "https://example.org/my-terms",
    "https://attacker.example/creativecommons.org/licenses/by/4.0/",
    "https://attacker.example/?creativecommons.org/publicdomain/zero/1.0/",
    "https://creativecommons.org.attacker.example/licenses/by/4.0/",
    "https://creativecommons.org@attacker.example/licenses/by/4.0/",
    "https://www.gnu.org.attacker.example/licenses/fdl-1.3.html",
    "https://attacker.example/www.gnu.org/licenses/old-licenses/gpl-2.0.html",
    "https://creativecommons.org/licenses/by/4.01/",
    "https://creativecommons.org%2Eattacker.example/licenses/by/4.0/",
    "ftp://creativecommons.org/licenses/by/4.0/",
    "not a URL",
  ])("falls back to the URL for anything else: %s", (url) => {
    expect(licenseLabel(url)).toBe(url);
  });
});

describe("KNOWN_LICENSES", () => {
  it("names each license it offers, each once", () => {
    for (const url of KNOWN_LICENSES) expect(licenseLabel(url)).not.toBe(url);
    expect(new Set(KNOWN_LICENSES.map(licenseLabel)).size).toBe(KNOWN_LICENSES.length);
  });
});

describe("chosenLicense", () => {
  const CC0 = KNOWN_LICENSES[0]!;
  const OWN = "https://example.org/my-terms";

  it("gives none, a known license, or the one there was", () => {
    expect(chosenLicense(undefined, OWN)).toBeUndefined();
    expect(chosenLicense(CC0, undefined)).toBe(CC0);
    expect(chosenLicense(OWN, OWN)).toBe(OWN);
  });

  it("refuses any other", () => {
    expect(() => chosenLicense(OWN, CC0)).toThrow(new AppError("licenseUnknown", { url: OWN }));
  });
});
