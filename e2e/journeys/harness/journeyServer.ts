// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { join } from "node:path";

/**
 * The Solid servers the journeys run against, which JOURNEY_SERVER
 * names (docs/testing.md#user-journeys): the Community Solid Server 7
 * they gate on, first, and the advisory ones with Linked Web Storage.
 */
const SERVERS = {
  "css-7": {
    name: "Community Solid Server 7",
    compose: "css/compose.yml",
    lws: false,
  },
  // Their signed-in instances, which the pod tests sign in to: the fork's own configurations, behind TLS.
  "css-lws": {
    name: "Community Solid Server 8 with Linked Web Storage",
    compose: "../pod/servers/css-lws/signed-in.yml",
    lws: true,
  },
  "css-lws-only": {
    name: "Community Solid Server 8 with Linked Web Storage alone",
    compose: "../pod/servers/css-lws-only/signed-in.yml",
    lws: true,
  },
} as const;

export type JourneyServerId = keyof typeof SERVERS;

export interface JourneyServer {
  id: JourneyServerId;
  name: string;
  /** Its compose file, under `root` (e2e/journeys). */
  compose: string;
  /** Whether it speaks Linked Web Storage: its image is built by e2e/pod, and its token signer is woken first. */
  lws: boolean;
}

/** The server `given` names (JOURNEY_SERVER), Community Solid Server 7 when it names none. */
export function journeyServer(given: string | undefined, root: string): JourneyServer {
  const id = given === undefined || given === "" ? "css-7" : given;
  if (!Object.hasOwn(SERVERS, id))
    throw new Error(
      `JOURNEY_SERVER="${id}" names no server the journeys run against: leave it unset, or set it to ${Object.keys(
        SERVERS,
      )
        .map((one) => `"${one}"`)
        .join(", ")}.`,
    );
  const server = SERVERS[id as JourneyServerId];
  return { id: id as JourneyServerId, ...server, compose: join(root, server.compose) };
}
