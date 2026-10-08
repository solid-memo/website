import { describe, expect, it } from "vitest";
import { liveLink } from "./links";

describe("liveLink", () => {
  it("follows an absolute https URL, giving its host as the parser has it", () => {
    expect(liveLink("https://example.org/a?b#c")).toEqual({ href: "https://example.org/a?b#c", host: "example.org" });
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
