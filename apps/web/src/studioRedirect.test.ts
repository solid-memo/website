// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * The Studio's old address, /studio/ (public/studio/index.html): a page
 * that sends its hash on to the Studio's routes in the site's page
 * (docs/studio.md), under a Content Security Policy that lets only that
 * script run.
 */

const html = readFileSync(resolve(import.meta.dirname, "../public/studio/index.html"), "utf8");
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(([, code]) => code!);

/** Where the page sends a visitor who came with `hash`. */
function redirect(hash: string): string {
  let target: string | undefined;
  new Function("location", scripts[0]!)({ hash, replace: (url: string) => (target = url) });
  return target!;
}

describe("the Studio's old address", () => {
  it("sends each Studio route on to the same route in the site's page", () => {
    expect(redirect("#/?instance=a")).toBe("../#/studio/?instance=a");
    expect(redirect("#/cards?deck=d")).toBe("../#/studio/cards?deck=d");
    expect(redirect("#/")).toBe("../#/studio/");
  });

  it("sends a visit with no route to the Studio's default one", () => {
    expect(redirect("")).toBe("../#/studio");
    expect(redirect("#top")).toBe("../#/studio");
  });

  it("lets its one script run by its hash, and nothing else", () => {
    const meta = /<meta http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(html)!;
    expect(html.indexOf("Content-Security-Policy")).toBeLessThan(html.indexOf("<script"));
    const policy = new Map(meta[1]!.split(";").map((part) => {
      const [name, ...values] = part.trim().split(/\s+/);
      return [name!, values];
    }));
    expect(scripts).toHaveLength(1);
    expect(policy.get("script-src")).toEqual([`'sha256-${createHash("sha256").update(scripts[0]!).digest("base64")}'`]);
    expect(policy.get("object-src")).toEqual(["'none'"]);
    expect(policy.get("base-uri")).toEqual(["'none'"]);
    expect(policy.get("form-action")).toEqual(["'none'"]);
  });

  it("links to the Studio for a browser that runs no script", () => {
    expect(html).toContain('<a href="../#/studio">');
  });
});
