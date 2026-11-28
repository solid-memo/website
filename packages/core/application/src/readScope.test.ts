// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { GUEST_INSTANCE_URL, GUEST_ORIGIN } from "@solid-memo/domain/guest";
import type { Storage } from "@solid-memo/domain/storage";
import { createReadScope } from "./readScope";

const ALICE = "https://alice.example/profile/card#me";
const BOB = "https://bob.example/profile/card#me";
// The instance is in Alice's storage; her other storage holds no instance.
const INSTANCE = "https://alice.example/memo/";
const OWN = "https://alice.example/notes/cards.ttl";
const OTHER_STORAGE = "https://other.example/cards.ttl";
const ELSEWHERE = "https://carol.example/cards.ttl";

function scoped() {
  let signedIn: string | undefined = ALICE;
  const discoverStorages = vi.fn(
    async (_webId: string): Promise<Storage[]> => [
      { url: "https://alice.example/", source: "profile" },
      { url: "https://other.example/", source: "profile" },
    ],
  );
  const scope = createReadScope({ storageGateway: { discoverStorages }, webId: () => signedIn });
  return {
    scope,
    discoverStorages,
    signIn: (next: string | undefined) => {
      signedIn = next;
    },
  };
}

describe("createReadScope", () => {
  it("takes a document in the instance, or in a storage of the user's that holds the instance too, as the instance's", async () => {
    const { scope } = scoped();
    await expect(scope.isInstances(INSTANCE, `${INSTANCE}decks/cards.ttl`)).resolves.toBe(true);
    await expect(scope.isInstances(INSTANCE, OWN)).resolves.toBe(true);
    // The user's, but in a storage without the instance: an instance attached elsewhere names it.
    await expect(scope.isInstances(INSTANCE, OTHER_STORAGE)).resolves.toBe(false);
    await expect(scope.isInstances(INSTANCE, ELSEWHERE)).resolves.toBe(false);
  });

  it("takes only the instance's own folder while no one is signed in, finding no storages", async () => {
    const { scope, discoverStorages, signIn } = scoped();
    signIn(undefined);
    await expect(scope.isInstances(INSTANCE, `${INSTANCE}decks/cards.ttl`)).resolves.toBe(true);
    await expect(scope.isInstances(INSTANCE, OWN)).resolves.toBe(false);
    expect(discoverStorages).not.toHaveBeenCalled();
  });

  it("takes any document in the guest's pod as the guest instance's, whoever is signed in", async () => {
    const { scope, discoverStorages, signIn } = scoped();
    signIn(undefined);
    await expect(
      scope.isInstances(GUEST_INSTANCE_URL, `${GUEST_ORIGIN}other/cards.ttl`),
    ).resolves.toBe(true);
    await expect(scope.isInstances(GUEST_INSTANCE_URL, OWN)).resolves.toBe(false);
    expect(discoverStorages).not.toHaveBeenCalled();
  });

  it("finds each user's storages once, and asks again after a search failed", async () => {
    const { scope, discoverStorages, signIn } = scoped();
    await scope.isInstances(INSTANCE, OWN);
    await scope.isInstances(INSTANCE, OTHER_STORAGE);
    expect(discoverStorages).toHaveBeenCalledOnce();
    // Whoever is signed in at each call.
    signIn(BOB);
    await expect(scope.isInstances(INSTANCE, OWN)).resolves.toBe(true);
    expect(discoverStorages).toHaveBeenLastCalledWith(BOB);
    discoverStorages.mockRejectedValueOnce(new Error("offline"));
    signIn("https://dave.example/profile/card#me");
    // Not found: only the instance's folder counts, and the next call asks again.
    await expect(scope.isInstances(INSTANCE, OWN)).resolves.toBe(false);
    await expect(scope.isInstances(INSTANCE, OWN)).resolves.toBe(true);
    expect(discoverStorages).toHaveBeenCalledTimes(4);
  });

  it("says which of a deck's documents are read as no one", async () => {
    const { scope } = scoped();
    await expect(
      scope.asNoOneOf(INSTANCE, { cardsDocumentUrl: OWN, reviewsDocumentUrl: ELSEWHERE }),
    ).resolves.toEqual({ cards: false, reviews: true });
  });
});
