// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * The credential gate answers as many reads as there are instances
 * registered, each on a server of its own, in time that grows with them,
 * not their square, as the Connected screen's choice reads at login.
 * Eight times as many must take less than four times as long as an
 * eighth of them done eight times over (testing.md); what makes the gate
 * is not timed (growthAfterSetup).
 */
import { expect, it } from "vitest";
import { growthAfterSetup } from "@solid-memo/domain/testing/growth";
import { createOwnPodGate } from "./ownPodGate";

const answer = async () => new Response("");

it("reads each of many instances on servers of their own in time that grows with them, not their square", async () => {
  const ratio = await growthAfterSetup(
    (count) => async () => {
      const instances = Array.from(
        { length: count },
        (_, at) => `https://i${at}.example/solid-memo/a/`,
      );
      const gate = createOwnPodGate({
        fetch: answer,
        instanceFetch: answer,
        publicFetch: answer,
        webId: () => "https://alice.example/profile/card#me",
        ownFolders: async () => ({ storages: ["https://alice.example/"], instances }),
        revision: () => 0,
      });
      return () => Promise.all(instances.map((url) => gate(`${url}preferences.ttl`)));
    },
    300,
    8,
  );
  expect(ratio).toBeLessThan(4);
}, 120_000);
