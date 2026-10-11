import { POD_PROVIDERS, type PodProvider } from "@solid-memo/domain/podProvider";

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
  readonly VITE_APP_NAME?: string;
  readonly VITE_REPO_URL?: string;
  readonly VITE_POD_PROVIDERS?: string;
  readonly VITE_LIBRARY_INDEX_URL?: string;
}

/** The site's settings, read from its SiteEnv. */
export interface SiteConfig {
  /**
   * What the site calls itself: the landing page's heading, the
   * masthead's wordmark, the end of every tab's title, the name the
   * login gives the identity provider, and the page's title and link
   * preview.
   */
  appName: string;
  /** The repository the footer links to: its source code, its commits and its issue forms. */
  repoUrl: string;
  /** The Pod providers suggested at login and for creating a Pod. */
  podProviders: readonly PodProvider[];
  /** The deck library's index; undefined for the site's own, decks/index.ttl (docs/deck-library.md). */
  libraryIndexUrl: string | undefined;
}

/** What Solid Memo calls itself. */
export const DEFAULT_APP_NAME = "Solid Memo";

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

/** VITE_APP_NAME: any text on one line. */
function appNameFrom(value: string | undefined): string {
  const name = given(value);
  if (name === undefined) return DEFAULT_APP_NAME;
  // A line break or another control character would break the page's title.
  if (/\p{Cc}/u.test(name)) throw invalid("VITE_APP_NAME", name, "text on one line");
  return name;
}

/** VITE_REPO_URL: an http(s) URL, without the trailing slash the footer's links add their paths to. */
function repoUrlFrom(value: string | undefined): string {
  const url = given(value);
  if (url === undefined) return DEFAULT_REPO_URL;
  if (urlOf(url, ["https:", "http:"]) === null) throw invalid("VITE_REPO_URL", url, "an http(s) URL");
  return url.replace(/\/+$/, "");
}

/** VITE_LIBRARY_INDEX_URL: an http(s) URL; undefined when unset. */
function libraryIndexUrlFrom(value: string | undefined): string | undefined {
  const url = given(value);
  if (url !== undefined && urlOf(url, ["https:", "http:"]) === null) {
    throw invalid("VITE_LIBRARY_INDEX_URL", url, "an http(s) URL");
  }
  return url;
}

const PROVIDER_KEYS =new Set(["id", "name", "oidcIssuer", "signUpUrl"]);

/** Expected of VITE_POD_PROVIDERS, for its error. */
const PROVIDERS_EXPECTED =
  'a JSON array of at least one provider, each {"id", "name", "oidcIssuer", "signUpUrl"?}, with a unique id, a name, an https issuer and an https sign-up page if any';

/**
 * VITE_POD_PROVIDERS: a JSON array of providers, held to what
 * POD_PROVIDERS keeps to (packages/domain/src/podProvider.test.ts):
 * unique ids, https issuers and sign-up pages. An unknown key is refused,
 * so a misspelled one is not silently dropped.
 */
function podProvidersFrom(value: string | undefined): readonly PodProvider[] {
  const raw = given(value);
  if (raw === undefined) return POD_PROVIDERS;
  const refuse = () => invalid("VITE_POD_PROVIDERS", raw, PROVIDERS_EXPECTED);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw refuse();
  }
  if (!Array.isArray(parsed) || parsed.length === 0) throw refuse();
  const isText = (field: unknown): field is string => typeof field === "string" && field.trim() !== "";
  const isHttps = (field: unknown): field is string => isText(field) && urlOf(field, ["https:"]) !== null;
  const providers = parsed.map((entry: unknown): PodProvider => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) throw refuse();
    const fields = entry as Record<string, unknown>;
    const { id, name, oidcIssuer, signUpUrl } = fields;
    if (Object.keys(fields).some((key) => !PROVIDER_KEYS.has(key))) throw refuse();
    if (!isText(id) || !isText(name) || !isHttps(oidcIssuer)) throw refuse();
    if (signUpUrl === undefined) return { id, name, oidcIssuer };
    if (!isHttps(signUpUrl)) throw refuse();
    return { id, name, oidcIssuer, signUpUrl };
  });
  if (new Set(providers.map((provider) => provider.id)).size !== providers.length) throw refuse();
  return providers;
}

/** The site's settings from `env`; throws, naming the variable, on a value that cannot be used. */
export function siteConfig(env: SiteEnv): SiteConfig {
  return {
    appName: appNameFrom(env.VITE_APP_NAME),
    repoUrl: repoUrlFrom(env.VITE_REPO_URL),
    podProviders: podProvidersFrom(env.VITE_POD_PROVIDERS),
    libraryIndexUrl: libraryIndexUrlFrom(env.VITE_LIBRARY_INDEX_URL),
  };
}

/** `text` as HTML text or an attribute's value. */
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/**
 * index.html with the site's name in place of its placeholders:
 * `%APP_NAME%` in its text and attributes, `%APP_NAME_JSON%` as a JSON
 * string in its JSON-LD (whose `<` is escaped too, so it cannot end the
 * script). vite.config.ts applies it to the page as it is built.
 */
export function siteHtml(html: string, config: Pick<SiteConfig, "appName">): string {
  const json = JSON.stringify(config.appName).replace(/</g, "\\u003c");
  return html.replaceAll("%APP_NAME_JSON%", json).replaceAll("%APP_NAME%", escapeHtml(config.appName));
}
