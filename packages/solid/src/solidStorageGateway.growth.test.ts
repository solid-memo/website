// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * The storages a profile names are found in time that grows with the
 * documents it names as more of the profile, not their square, against a
 * pod in memory: a WebID document that names an extended profile of many
 * triples. Eight times as many must take less than four times as long as
 * an eighth of them done eight times over (testing.md); what puts the
 * documents in place is not timed (growthAfterSetup). What is found, and
 * what is not read, is solidStorageGateway.profile.test.ts's.
 */
import { describe, expect, it } from "vitest";
import { growthAfterSetup } from "@solid-memo/domain/testing/growth";
import { profilePod, WEBID } from "./testing/profilePod";

describe("discoverStorages", () => {
  it("reads a large extended profile in time that grows with it, not its square", async () => {
    const ratio = await growthAfterSetup(
      (count) => async () => {
        const gateway = await profilePod(count);
        return () => gateway.discoverStorages(WEBID);
      },
      1000,
      8,
      4,
    );
    expect(ratio).toBeLessThan(4);
  }, 120_000);
});
