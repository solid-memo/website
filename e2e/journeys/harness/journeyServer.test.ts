// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { journeyServer } from "./journeyServer.ts";

describe("journeyServer", () => {
  it("is Community Solid Server 7 when JOURNEY_SERVER names none", () => {
    for (const given of [undefined, ""])
      expect(journeyServer(given, "/e2e/journeys")).toEqual({
        id: "css-7",
        name: "Community Solid Server 7",
        compose: "/e2e/journeys/css/compose.yml",
        lws: false,
      });
  });

  it("runs a Linked Web Storage server's signed-in instance, which e2e/pod builds", () => {
    expect(journeyServer("css-lws-only", "/e2e/journeys")).toEqual({
      id: "css-lws-only",
      name: "Community Solid Server 8 with Linked Web Storage alone",
      compose: "/e2e/pod/servers/css-lws-only/signed-in.yml",
      lws: true,
    });
    expect(journeyServer("css-lws", "/e2e/journeys").compose).toBe(
      "/e2e/pod/servers/css-lws/signed-in.yml",
    );
  });

  it("refuses a server it does not know, naming those it does", () => {
    expect(() => journeyServer("nss", "/e2e/journeys")).toThrow(
      'JOURNEY_SERVER="nss" names no server the journeys run against: leave it unset, or set it to "css-7", "css-lws", "css-lws-only".',
    );
    expect(() => journeyServer("toString", "/e2e/journeys")).toThrow("names no server");
  });
});
