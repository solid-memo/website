// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { resolveConfig } from "vite";
import { expect, it } from "vitest";
import { CLIENT_ID_FILE } from "@solid-memo/site/clientId";
import { SITE_ENV } from "../apps/web/src/config.ts";

const ROOT = join(import.meta.dirname, "..");
const WEB = join(ROOT, "apps/web");

/**
 * What those who run their own copy rely on, part of the app's public
 * API (docs/releasing.md#the-public-api): the settings a build reads
 * (docs/configuration.md), the commands that build and serve it, the
 * folder the site is built into, and its relative asset URLs, which let
 * any static host serve it from any folder (docs/deployment.md), and the
 * address of the Client ID Document it writes on the domain in CNAME,
 * which identity providers know the site by (docs/authentication.md). A line
 * that goes, a setting renamed or removed, a command gone or another
 * output folder, is a breaking change, which `npm run check:breaking`
 * holds to a commit that says so.
 */
it("keeps api/self-hosting.txt to what a self-hosted copy relies on", async () => {
  const { scripts } = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  const build = await resolveConfig(
    { root: WEB, configFile: join(WEB, "vite.config.ts"), logLevel: "silent" },
    "build",
  );
  const lines = [
    ...SITE_ENV.map((name) => `${name}: a setting the build reads`),
    ...(scripts.build === undefined ? [] : ["npm run build: builds the site"]),
    ...(scripts.start === undefined ? [] : ["npm start: builds the site and serves it"]),
    `build: the site is built into ${relative(ROOT, resolve(build.root, build.build.outDir))}/`,
    ...(build.base === "./" ? ["build: asset URLs are relative, so any folder can serve it"] : []),
    ...(build.plugins.some((plugin) => plugin.name === "solid-memo:client-id")
      ? [`build: with a domain in CNAME, the Client ID Document is at /${CLIENT_ID_FILE}`]
      : []),
  ];
  await expect(`${lines.sort().join("\n")}\n`).toMatchFileSnapshot("../api/self-hosting.txt");
});
