import type { TestProject } from "vitest/node";
import { checkContract } from "./contract";
import {
  serversNamed,
  startServer,
  stopOnExit,
  type SolidServer,
  type StartedServer,
} from "./servers";

export type { SolidServer };

declare module "vitest" {
  export interface ProvidedContext {
    /** The Solid servers the tests run against, each the whole suite. */
    solidServers: SolidServer[];
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
    return;
  }
  stopOnExit();
  const results = await Promise.allSettled(
    serversNamed(process.env.SOLID_SERVERS).map(startServer),
  );
  const started = results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  const stopAll = () => Promise.all(started.map(({ stop }) => stop()));
  const failed = results.flatMap((result) =>
    result.status === "rejected" ? [result.reason as Error] : [],
  );
  if (failed.length > 0) {
    await stopAll();
    throw new Error(failed.map((error) => error.message).join("\n\n"));
  }
  project.provide(
    "solidServers",
    started.map(({ server }: StartedServer) => server),
  );
  return async () => void (await stopAll());
}
