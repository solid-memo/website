import { describe, expect, it } from "vitest";
import { DEFAULT_REPO_URL, siteConfig } from "./config";

describe("siteConfig", () => {
  describe("VITE_REPO_URL", () => {
    it("is Solid Memo's own repository when unset or blank", () => {
      expect(siteConfig({}).repoUrl).toBe("https://github.com/solid-memo/website");
      expect(siteConfig({ VITE_REPO_URL: "  " }).repoUrl).toBe(DEFAULT_REPO_URL);
    });

    it("is the repository given, without a trailing slash", () => {
      expect(siteConfig({ VITE_REPO_URL: " https://codeberg.org/someone/memo/ " }).repoUrl).toBe(
        "https://codeberg.org/someone/memo",
      );
    });

    it("refuses anything but an http(s) URL, naming the variable", () => {
      expect(() => siteConfig({ VITE_REPO_URL: "javascript:alert(1)" })).toThrow(
        'VITE_REPO_URL must be an http(s) URL; it is "javascript:alert(1)" (docs/configuration.md).',
      );
      expect(() => siteConfig({ VITE_REPO_URL: "github.com/someone/memo" })).toThrow("VITE_REPO_URL");
      expect(() => siteConfig({ VITE_REPO_URL: "https://me:secret@git.example/memo" })).toThrow("VITE_REPO_URL");
    });
  });
});
