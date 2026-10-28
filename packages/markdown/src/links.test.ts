// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { liveLink, writtenHost } from "./links";

describe("liveLink", () => {
  it("follows an absolute https URL, giving its host as the parser has it", () => {
    expect(liveLink("https://example.org/a?b#c")).toEqual({
      href: "https://example.org/a?b#c",
      host: "example.org",
    });
    expect(liveLink("HTTPS://Bücher.example:8443")).toEqual({
      href: "https://xn--bcher-kva.example:8443/",
      host: "xn--bcher-kva.example:8443",
    });
  });

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "http://example.org",
    "mailto:a@example.org",
    "/relative",
    "#/decks",
    "",
    "https://user@example.org",
    "https://user:secret@example.org",
    "https://:secret@example.org",
  ])("shows %j as text", (url) => {
    expect(liveLink(url)).toBeNull();
  });
});

describe("writtenHost", () => {
  it("gives the host as written, as the URL parser has it", () => {
    expect(writtenHost("HTTPS://Example.ORG:8443/a?b#c")).toBe("example.org:8443");
    expect(writtenHost("https://Bücher.example/")).toBe("xn--bcher-kva.example");
    expect(writtenHost("https://b\u0430nk.example/")).toBe("xn--bnk-6cd.example");
    expect(writtenHost("https://Bu\u0308cher.example/")).toBe("xn--bcher-kva.example");
    expect(writtenHost("https://xn--bcher-kva.example/")).toBe("xn--bcher-kva.example");
    expect(writtenHost("https://my_site.example/")).toBe("my_site.example");
  });

  it.each([
    "https://bank.example%2Eevil.com/",
    "https://bank.example@evil.com/",
    "https://bank.example\u3002evil.com/",
    "https://bank.example\uFF0Eevil.com/",
    "https://bank.example\uFF61evil.com/",
    "https://\uFF42ank.example/",
    "https://[::1]/",
    "https://0x7f.1/",
    "https://3232235777/",
    "https://example.org:443/",
    "https://bank\uFE0F.example/",
    "https://example.org:99999/",
    "bank.example",
  ])("gives none for %j, which the parser does not take as written", (url) => {
    expect(writtenHost(url)).toBeNull();
  });

  // Engines differ on a punycode label that decodes to nothing: some refuse
  // the address, some keep the label as written. Either way, no other host.
  it("gives a label that decodes to nothing only as the parser keeps it", () => {
    const url = "https://xn--a.example/";
    expect(writtenHost(url)).toBe(URL.canParse(url) ? new URL(url).host : null);
  });
});
