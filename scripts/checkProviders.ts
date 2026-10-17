// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * `npm run check:providers`: every Pod provider onboarding suggests
 * (POD_PROVIDERS) still logs people in. Its issuer answers its
 * /.well-known/openid-configuration with JSON whose `issuer` is the
 * entry's `oidcIssuer`, exactly, as the login compares them, and its
 * sign-up page, if it has one, still answers. It needs the network, so
 * the Links workflow runs it weekly, not as a gate (docs/testing.md#pod-providers);
 * a failure is an entry to fix, or to remove.
 */
import { POD_PROVIDERS, type PodProvider } from "../packages/domain/src/podProvider.ts";

/** How often a request that failed or answered 5xx is tried, in all. */
const ATTEMPTS = 3;
const TIMEOUT_MS = 30_000;

/** The issuer's discovery document, as OpenID Connect Discovery places it. */
export function configurationUrl(issuer: string): string {
  return `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`;
}

/** A GET, tried again while it fails or the server answers 5xx; the last error is thrown. */
async function get(fetch: typeof globalThis.fetch, url: string): Promise<Response> {
  let failure: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { accept: "application/json, text/html;q=0.9, */*;q=0.8" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.status < 500 || attempt === ATTEMPTS) return response;
    } catch (error) {
      failure = error;
    }
  }
  throw failure;
}

const NOT_JSON = Symbol("not JSON");

/** The `issuer` a discovery document names, whatever its type. */
function issuerOf(text: string): unknown {
  try {
    return (JSON.parse(text) as { issuer?: unknown } | null)?.issuer;
  } catch {
    return NOT_JSON;
  }
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** What is wrong with one provider; none when it logs people in as the entry says. */
export async function providerProblems(
  provider: PodProvider,
  fetch: typeof globalThis.fetch,
): Promise<string[]> {
  const problems: string[] = [];
  const url = configurationUrl(provider.oidcIssuer);
  try {
    const response = await get(fetch, url);
    if (!response.ok) {
      problems.push(`${provider.name}: ${url} answers ${response.status}.`);
    } else {
      const issuer = issuerOf(await response.text());
      if (issuer === NOT_JSON) problems.push(`${provider.name}: ${url} does not answer JSON.`);
      else if (issuer !== provider.oidcIssuer)
        problems.push(
          `${provider.name}: its issuer is ${JSON.stringify(issuer ?? null)}, not ${JSON.stringify(provider.oidcIssuer)}.`,
        );
    }
  } catch (error) {
    problems.push(`${provider.name}: ${url} does not answer (${reason(error)}).`);
  }
  if (provider.signUpUrl !== undefined) {
    try {
      const response = await get(fetch, provider.signUpUrl);
      if (!response.ok)
        problems.push(
          `${provider.name}: its sign-up page ${provider.signUpUrl} answers ${response.status}.`,
        );
    } catch (error) {
      problems.push(
        `${provider.name}: its sign-up page ${provider.signUpUrl} does not answer (${reason(error)}).`,
      );
    }
  }
  return problems;
}

export type ProvidersIo = {
  providers: readonly PodProvider[];
  fetch: typeof globalThis.fetch;
  log(message: string): void;
};

/** Exit code: 0 when every provider answers as its entry says. */
export async function main(io: ProvidersIo): Promise<number> {
  const problems = (
    await Promise.all(io.providers.map((provider) => providerProblems(provider, io.fetch)))
  ).flat();
  for (const problem of problems) io.log(problem);
  if (problems.length > 0) return 1;
  io.log(`All ${io.providers.length} Pod providers answer with the issuer onboarding names.`);
  return 0;
}

/** The script entry: `node -e "import('./scripts/checkProviders.ts').then((m) => m.run(process))"`. */
export async function run(process: {
  exitCode?: number | string | null | undefined;
}): Promise<void> {
  process.exitCode = await main({
    providers: POD_PROVIDERS,
    fetch: globalThis.fetch,
    log: (message) => console.log(message),
  });
}
