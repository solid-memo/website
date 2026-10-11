// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { POD_PROVIDERS } from "@solid-memo/domain/podProvider";
import { DEFAULT_APP_NAME, DEFAULT_REPO_URL, siteConfig, siteHtml } from "./config";

describe("siteConfig", () => {
  it("is Solid Memo's own settings when nothing is set", () => {
    expect(siteConfig({})).toEqual({
      appName: "Solid Memo",
      repoUrl: "https://github.com/solid-memo/website",
      podProviders: POD_PROVIDERS,
      libraryIndexUrl: undefined,
    });
  });

  describe("VITE_LIBRARY_INDEX_URL", () => {
    it("is the site's own library when blank", () => {
      expect(siteConfig({ VITE_LIBRARY_INDEX_URL: " " }).libraryIndexUrl).toBeUndefined();
    });

    it("is the index given", () => {
      expect(
        siteConfig({ VITE_LIBRARY_INDEX_URL: "https://example.org/decks/index.ttl" })
          .libraryIndexUrl,
      ).toBe("https://example.org/decks/index.ttl");
    });

    it("refuses anything but an http(s) URL, naming the variable", () => {
      expect(() => siteConfig({ VITE_LIBRARY_INDEX_URL: "decks/index.ttl" })).toThrow(
        'VITE_LIBRARY_INDEX_URL must be an http(s) URL; it is "decks/index.ttl" (docs/configuration.md).',
      );
    });
  });

  describe("VITE_APP_NAME", () => {
    it("is Solid Memo when blank", () => {
      expect(siteConfig({ VITE_APP_NAME: " " }).appName).toBe(DEFAULT_APP_NAME);
    });

    it("is the name given, trimmed", () => {
      expect(siteConfig({ VITE_APP_NAME: " Flashcards at Example School " }).appName).toBe(
        "Flashcards at Example School",
      );
    });

    it("refuses a name on more than one line, naming the variable", () => {
      expect(() => siteConfig({ VITE_APP_NAME: "Flash\ncards" })).toThrow(
        'VITE_APP_NAME must be text on one line; it is "Flash\\ncards" (docs/configuration.md).',
      );
    });
  });

  describe("VITE_REPO_URL", () => {
    it("is Solid Memo's own repository when blank", () => {
      expect(siteConfig({ VITE_REPO_URL: "  " }).repoUrl).toBe(DEFAULT_REPO_URL);
    });

    it("is the repository given, without a trailing slash", () => {
      expect(siteConfig({ VITE_REPO_URL: " https://codeberg.org/someone/memo/ " }).repoUrl).toBe(
        "https://codeberg.org/someone/memo",
      );
    });

    it("refuses anything but an http(s) URL without credentials, naming the variable", () => {
      expect(() => siteConfig({ VITE_REPO_URL: "javascript:alert(1)" })).toThrow(
        'VITE_REPO_URL must be an http(s) URL; it is "javascript:alert(1)" (docs/configuration.md).',
      );
      expect(() => siteConfig({ VITE_REPO_URL: "github.com/someone/memo" })).toThrow(
        "VITE_REPO_URL",
      );
      expect(() => siteConfig({ VITE_REPO_URL: "https://me:secret@git.example/memo" })).toThrow(
        "VITE_REPO_URL",
      );
    });
  });

  describe("VITE_POD_PROVIDERS", () => {
    const school = {
      id: "school",
      name: "Example School Pods",
      oidcIssuer: "https://pods.school.example/",
    };

    it("is the providers Solid Memo suggests when blank", () => {
      expect(siteConfig({ VITE_POD_PROVIDERS: "" }).podProviders).toBe(POD_PROVIDERS);
    });

    it("is the providers given, with a sign-up page or without", () => {
      const withSignUp = {
        id: "other",
        name: "Other",
        oidcIssuer: "https://login.other.example",
        signUpUrl: "https://other.example/join",
      };
      expect(
        siteConfig({ VITE_POD_PROVIDERS: JSON.stringify([school, withSignUp]) }).podProviders,
      ).toEqual([school, withSignUp]);
    });

    it.each([
      ["text that is not JSON", "school"],
      ["an object, not an array", JSON.stringify(school)],
      ["no provider at all", "[]"],
      ["a provider that is not an object", JSON.stringify(["school"])],
      ["a provider that is null", "[null]"],
      ["a provider that is an array", "[[]]"],
      ["a provider without an id", JSON.stringify([{ ...school, id: undefined }])],
      ["a provider with a blank name", JSON.stringify([{ ...school, name: " " }])],
      [
        "an issuer over http",
        JSON.stringify([{ ...school, oidcIssuer: "http://pods.school.example/" }]),
      ],
      [
        "an issuer that is not a URL",
        JSON.stringify([{ ...school, oidcIssuer: "pods.school.example" }]),
      ],
      ["an issuer that is not text", JSON.stringify([{ ...school, oidcIssuer: 1 }])],
      [
        "a sign-up page over http",
        JSON.stringify([{ ...school, signUpUrl: "http://school.example/join" }]),
      ],
      [
        "a misspelled key",
        JSON.stringify([{ ...school, signupUrl: "https://school.example/join" }]),
      ],
      ["two providers with one id", JSON.stringify([school, { ...school, name: "Again" }])],
    ])("refuses %s, naming the variable", (_, value) => {
      expect(() => siteConfig({ VITE_POD_PROVIDERS: value })).toThrow(
        /^VITE_POD_PROVIDERS must be a JSON array/,
      );
    });
  });
});

describe("siteHtml", () => {
  const repoUrl = DEFAULT_REPO_URL;

  it("puts the name in the page's text and attributes, and as a string in its JSON-LD", () => {
    const html =
      '<title>%APP_NAME% - flashcards</title><meta content="%APP_NAME%" /><script type="application/ld+json">{"name": %APP_NAME_JSON%}</script>';
    expect(siteHtml(html, { appName: "Solid Memo", repoUrl })).toBe(
      '<title>Solid Memo - flashcards</title><meta content="Solid Memo" /><script type="application/ld+json">{"name": "Solid Memo"}</script>',
    );
  });

  it("keeps a name's markup characters text, and out of the JSON-LD's script", () => {
    const html = '<title>%APP_NAME%</title><meta content="%APP_NAME%" />{"name": %APP_NAME_JSON%}';
    expect(siteHtml(html, { appName: `"Tom" & <Jerry's>`, repoUrl })).toBe(
      '<title>&#34;Tom&#34; &#38; &#60;Jerry&#39;s&#62;</title><meta content="&#34;Tom&#34; &#38; &#60;Jerry&#39;s&#62;" />{"name": "\\"Tom\\" & \\u003cJerry\'s>"}',
    );
  });

  it.each([
    ["Memo $& Co", "Memo $&#38; Co"],
    ["Memo $' Co", "Memo $&#39; Co"],
    ["Memo $$ Co", "Memo $$ Co"],
    ["Memo $` Co", "Memo $` Co"],
  ])("puts %s in as it is, not as a replacement pattern", (appName, inText) => {
    const html = '<title>%APP_NAME%</title>{"name": %APP_NAME_JSON%}';
    expect(siteHtml(html, { appName, repoUrl })).toBe(
      `<title>${inText}</title>{"name": ${JSON.stringify(appName)}}`,
    );
  });

  it("puts the repository in the page's links, and as a string in its JSON-LD", () => {
    const html =
      '<a href="%REPO_URL%">source</a>{"sameAs": [%REPO_URL_JSON%], "codeRepository": %REPO_URL_JSON%}';
    expect(siteHtml(html, { appName: "Memo", repoUrl: "https://codeberg.org/example/memo" })).toBe(
      '<a href="https://codeberg.org/example/memo">source</a>{"sameAs": ["https://codeberg.org/example/memo"], "codeRepository": "https://codeberg.org/example/memo"}',
    );
  });

  it("keeps a repository's markup characters text, and out of the JSON-LD's script", () => {
    const html = '<a href="%REPO_URL%">source</a>{"codeRepository": %REPO_URL_JSON%}';
    expect(siteHtml(html, { appName: "Memo", repoUrl: 'https://example.org/a"b<c>$&' })).toBe(
      '<a href="https://example.org/a&#34;b&#60;c&#62;$&#38;">source</a>{"codeRepository": "https://example.org/a\\"b\\u003cc>$&"}',
    );
  });

  it("leaves a placeholder in one value as text, not filled in by the other", () => {
    expect(siteHtml("%APP_NAME% %REPO_URL%", { appName: "%REPO_URL%", repoUrl })).toBe(
      `%REPO_URL% ${repoUrl}`,
    );
  });
});
