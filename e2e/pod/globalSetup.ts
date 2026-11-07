// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { TestProject } from "vitest/node";
import { checkContract } from "./contract";
import {
  serversNamed,
  startServer,
  startSignedIn,
  stopOnExit,
  type SolidServer,
  type StartedServer,
} from "./servers";
import type { SignedInServer } from "./signedIn";

export type { SolidServer };

declare module "vitest" {
  export interface ProvidedContext {
    /** The Solid servers the tests run against, each the whole suite. */
    solidServers: SolidServer[];
    /** Their instances that aren't open, each the signed-in suite; none for a server that has none, or SOLID_SERVER_URL. */
    signedInServers: SignedInServer[];
  }
}

/**
 * The Solid servers for the end-to-end tests: the one SOLID_SERVER_URL
 * names (it must let anyone read and write; SOLID_SERVER_NAME names it in
 * the tests), else those SOLID_SERVERS names ("css-7,nss-5", or "all";
 * the blocking ones when unset), started here in Docker on free ports and
 * stopped after (or as the process exits, on Ctrl-C).
 */
export default async function setup(project: TestProject) {
  const given = process.env.SOLID_SERVER_URL;
  if (given !== undefined && given !== "") {
    const url = given.endsWith("/") ? given : `${given}/`;
    await checkContract(url);
    project.provide("solidServers", [
      { id: "external", tier: "advisory", name: process.env.SOLID_SERVER_NAME || given, url },
    ]);
    project.provide("signedInServers", []);
    return;
  }
  stopOnExit();
  const results = await Promise.allSettled(
    serversNamed(process.env.SOLID_SERVERS).map(async (id) => {
      const open = await startServer(id);
      try {
        return { open, signedIn: await startSignedIn(id) };
      } catch (error) {
        await open.stop();
        throw error;
      }
    }),
  );
  const started = results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  const stopAll = () =>
    Promise.all(started.flatMap(({ open, signedIn }) => [open.stop(), signedIn?.stop()]));
  const failed = results.flatMap((result) =>
    result.status === "rejected" ? [result.reason as Error] : [],
  );
  if (failed.length > 0) {
    await stopAll();
    throw new Error(failed.map((error) => error.message).join("\n\n"));
  }
  project.provide(
    "solidServers",
    started.map(({ open }: { open: StartedServer }) => open.server),
  );
  project.provide(
    "signedInServers",
    started.flatMap(({ signedIn }) => (signedIn === null ? [] : [signedIn.server])),
  );
  return async () => void (await stopAll());
}
