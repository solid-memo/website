/*
 * The site's settings: what a build is given in VITE_ variables (Vite
 * reads them from the environment and from apps/web/.env files), read
 * and checked here, each falling back to this deployment's own value
 * when unset (docs/configuration.md). src/main.tsx reads them for the
 * page; vite.config.ts reads them too, so a build with a wrong value
 * fails instead of shipping a page that cannot start.
 *
 * Node loads this file for vite.config.ts as it is, so it imports no
 * module of another package that imports further without a file
 * extension (domain's webId.ts does): it checks URLs itself.
 */

/** `value` as a URL when it is an absolute one of `protocols`, without a user name or password. */
function urlOf(value: string, protocols: string[]): URL | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  return protocols.includes(url.protocol) && url.username === "" && url.password === "" ? url : null;
}

/** The VITE_ variables the site reads, as Vite gives them: unset, or a string. */
export interface SiteEnv {
  readonly VITE_REPO_URL?: string;
}

/** The site's settings, read from its SiteEnv. */
export interface SiteConfig {
  /** The repository the footer links to: its source code, its commits and its issue forms. */
  repoUrl: string;
}

/** Where Solid Memo's own code is. */
export const DEFAULT_REPO_URL = "https://github.com/solid-memo/website";

/** A setting's value, trimmed; undefined when it is unset or blank. */
function given(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** A setting that cannot be used, named, with what it should be. */
function invalid(name: string, value: string, expected: string): Error {
  return new Error(`${name} must be ${expected}; it is ${JSON.stringify(value)} (docs/configuration.md).`);
}

/** VITE_REPO_URL: an http(s) URL, without the trailing slash the footer's links add their paths to. */
function repoUrlFrom(value: string | undefined): string {
  const url = given(value);
  if (url === undefined) return DEFAULT_REPO_URL;
  if (urlOf(url, ["https:", "http:"]) === null) throw invalid("VITE_REPO_URL", url, "an http(s) URL");
  return url.replace(/\/+$/, "");
}

/** The site's settings from `env`; throws, naming the variable, on a value that cannot be used. */
export function siteConfig(env: SiteEnv): SiteConfig {
  return {
    repoUrl: repoUrlFrom(env.VITE_REPO_URL),
  };
}
