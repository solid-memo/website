// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { AppError } from "@solid-memo/domain/appError";
import { describe, expect, it, vi } from "vitest";
import type { AnswerLog, GuestPod, ReleaseDraftRepository } from "./ports";
import {
  GUEST_INSTANCE_URL,
  GUEST_ORIGIN,
  GUEST_SESSION,
  GUEST_WEBID,
  guestDeckStamp,
} from "@solid-memo/domain/guest";
import { createUseCases } from "./useCases";
import { courseDraft } from "@solid-memo/domain/testing/releaseDraft";
import { draftSummaryOf, draftUrlOf } from "@solid-memo/domain/release/draftLayout";
import { rebaseDraft } from "@solid-memo/domain/release/releaseToDraft";
import type { ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { DECK_FORMAT_VERSION, type Card, type Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import type { FsrsState, ReviewState } from "@solid-memo/domain/review";
import type { Answer } from "@solid-memo/domain/answer";
import type { WebIdDocument } from "@solid-memo/domain/webIdDocument";
import {
  session,
  document,
  storage,
  catalog,
  sm2s,
  instance,
  deck,
  card,
  makeDeps,
} from "./testing/fakePorts";

describe("session", () => {
  it("restoreSession delegates to the session gateway", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await expect(useCases.restoreSession()).resolves.toEqual({
      session,
      origin: "login",
    });
    expect(deps.sessionGateway.restore).toHaveBeenCalledOnce();
  });
  it("loginWithWebId trims the WebID before delegating", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await useCases.loginWithWebId("  https://alice.example/profile/card#me ");
    expect(deps.sessionGateway.login).toHaveBeenCalledWith("https://alice.example/profile/card#me");
  });
  it("loginWithWebId rejects an invalid WebID without contacting the gateway", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await expect(useCases.loginWithWebId("http://alice.example/profile/card#me")).rejects.toThrow(
      "A WebID must start with https://.",
    );
    expect(deps.sessionGateway.login).not.toHaveBeenCalled();
  });
  it("loginWithProvider starts login at the chosen issuer", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await useCases.loginWithProvider("https://login.inrupt.com");
    expect(deps.sessionGateway.loginWithIssuer).toHaveBeenCalledWith("https://login.inrupt.com");
    expect(deps.sessionGateway.login).not.toHaveBeenCalled();
  });
  it("loginWithProvider rejects an issuer that is not an https URL", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await expect(useCases.loginWithProvider("http://idp.example")).rejects.toThrow(
      "An identity provider must be an https:// URL.",
    );
    expect(deps.sessionGateway.loginWithIssuer).not.toHaveBeenCalled();
  });
  it("discoverAccount combines the first storage with the profile's issuer", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await expect(useCases.discoverAccount(session)).resolves.toEqual({
      webId: session.webId,
      name: undefined,
      podUrl: storage.url,
      oidcIssuer: "https://issuer.example",
    });
    expect(deps.storageGateway.discoverStorages).toHaveBeenCalledWith(session.webId);
    expect(deps.sessionGateway.discoverOidcIssuer).toHaveBeenCalledWith(session.webId);
  });
  it("discoverAccount takes the name from the profile's foaf:name", async () => {
    const deps = makeDeps();
    vi.mocked(deps.webIdDocumentRepository.fetchWebIdDocument).mockResolvedValue({
      url: document.url,
      subjects: [
        {
          url: session.webId,
          properties: [
            {
              predicate: "http://xmlns.com/foaf/0.1/name",
              values: [{ type: "langString", value: "Alice", language: "en" }],
            },
          ],
        },
      ],
    });
    const useCases = createUseCases(deps);
    const account = await useCases.discoverAccount(session);
    expect(account.name).toBe("Alice");
    expect(deps.webIdDocumentRepository.fetchWebIdDocument).toHaveBeenCalledWith(session.webId);
  });
  it("discoverAccount tolerates an unreadable profile document", async () => {
    const deps = makeDeps();
    vi.mocked(deps.webIdDocumentRepository.fetchWebIdDocument).mockRejectedValue(
      new Error("profile unreachable"),
    );
    const useCases = createUseCases(deps);
    const account = await useCases.discoverAccount(session);
    expect(account.name).toBeUndefined();
    expect(account.podUrl).toBe(storage.url);
  });
  it("discoverAccount leaves the Pod out when no storage is advertised", async () => {
    const deps = makeDeps();
    vi.mocked(deps.storageGateway.discoverStorages).mockResolvedValue([]);
    const useCases = createUseCases(deps);
    const account = await useCases.discoverAccount(session);
    expect(account.podUrl).toBeUndefined();
  });
  it("discoverAccount tolerates a failed issuer lookup", async () => {
    const deps = makeDeps();
    vi.mocked(deps.sessionGateway.discoverOidcIssuer).mockRejectedValue(new Error("no issuer"));
    const useCases = createUseCases(deps);
    await expect(useCases.discoverAccount(session)).resolves.toEqual({
      webId: session.webId,
      name: undefined,
      podUrl: storage.url,
      oidcIssuer: undefined,
    });
  });
  it("discoverAccount fails when storage discovery fails", async () => {
    const deps = makeDeps();
    vi.mocked(deps.storageGateway.discoverStorages).mockRejectedValue(
      new Error("profile unreachable"),
    );
    const useCases = createUseCases(deps);
    await expect(useCases.discoverAccount(session)).rejects.toThrow("profile unreachable");
  });
  it("logout delegates to the session gateway", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await useCases.logout();
    expect(deps.sessionGateway.logout).toHaveBeenCalledOnce();
  });
  it("onSessionExpired delegates to the session gateway", () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    const listener = () => undefined;
    const unsubscribe = useCases.onSessionExpired(listener);
    expect(deps.sessionGateway.onSessionExpired).toHaveBeenCalledWith(listener);
    expect(typeof unsubscribe).toBe("function");
  });
  it("viewWebIdDocument fetches the document for the session's WebID", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await expect(useCases.viewWebIdDocument(session)).resolves.toEqual(document);
    expect(deps.webIdDocumentRepository.fetchWebIdDocument).toHaveBeenCalledWith(session.webId);
  });
});

describe("guests", () => {
  const guestInstance: Instance = { url: GUEST_INSTANCE_URL, name: "My study" };
  const TARGET = "https://alice.example/solid-memo/main/";

  function guestDeps({ started = true }: { started?: boolean } = {}) {
    const deps = makeDeps();
    let exists = started;
    const guestPod: GuestPod = {
      exists: vi.fn(async () => exists),
      start: vi.fn(async () => {
        exists = true;
      }),
      discard: vi.fn(async () => {
        exists = false;
      }),
    };
    vi.mocked(deps.instanceRepository.listInstances).mockImplementation(async (webId) =>
      webId === GUEST_WEBID ? (exists ? [guestInstance] : []) : [instance],
    );
    vi.mocked(deps.instanceRepository.attachInstance).mockResolvedValue({
      url: TARGET,
      name: "My study",
    });
    vi.mocked(deps.instanceCopier.listResources).mockResolvedValue([
      `${GUEST_INSTANCE_URL}catalog.ttl`,
      `${GUEST_INSTANCE_URL}digest.ttl`,
      `${GUEST_INSTANCE_URL}history/`,
      `${GUEST_INSTANCE_URL}history/2026-10.ttl`,
    ]);
    vi.mocked(deps.deckRepository.listCards).mockResolvedValue([]);
    return { deps: { ...deps, guestPod }, guestPod };
  }

  it("restoreSession gives a guest's session when no one logged in and a guest studied here", async () => {
    const { deps } = guestDeps();
    vi.mocked(deps.sessionGateway.restore).mockResolvedValue(null);
    expect(await createUseCases(deps).restoreSession()).toEqual({
      session: GUEST_SESSION,
      origin: "restored",
    });
    vi.mocked(deps.guestPod.exists).mockResolvedValue(false);
    expect(await createUseCases(deps).restoreSession()).toBeNull();
  });

  it("restoreSession prefers a login to a guest's study", async () => {
    const { deps } = guestDeps();
    expect(await createUseCases(deps).restoreSession()).toEqual({ session, origin: "login" });
  });

  it("startGuest starts the guest's pod and makes their instance, published by the guest", async () => {
    const { deps, guestPod } = guestDeps({ started: false });
    vi.mocked(deps.instanceRepository.listInstances).mockResolvedValue([]);
    vi.mocked(deps.instanceRepository.createInstance).mockResolvedValue(guestInstance);
    vi.mocked(deps.webIdDocumentRepository.fetchWebIdDocument).mockRejectedValue(
      new Error("no name"),
    );
    expect(await createUseCases(deps).startGuest(" My study ")).toEqual(GUEST_SESSION);
    expect(guestPod.start).toHaveBeenCalledOnce();
    expect(deps.instanceRepository.createInstance).toHaveBeenCalledWith({
      webId: GUEST_WEBID,
      containerUrl: GUEST_INSTANCE_URL,
      name: "My study",
      registrationTarget: "private",
    });
    expect(deps.deckRepository.saveCatalog).toHaveBeenCalledWith(GUEST_INSTANCE_URL, {
      title: "My study",
      description: "Flashcard decks of the Solid Memo instance My study.",
      publisher: { webId: GUEST_WEBID, name: GUEST_WEBID },
    });
  });

  it("startGuest keeps the instance a guest already has", async () => {
    const { deps } = guestDeps();
    await createUseCases(deps).startGuest("My study");
    expect(deps.instanceRepository.createInstance).not.toHaveBeenCalled();
  });

  it("discoverAccount asks no identity provider about a guest", async () => {
    const { deps } = guestDeps();
    const account = await createUseCases(deps).discoverAccount(GUEST_SESSION);
    expect(account.oidcIssuer).toBeUndefined();
    expect(deps.sessionGateway.discoverOidcIssuer).not.toHaveBeenCalled();
  });

  it("discardGuest deletes the guest's pod", async () => {
    const { deps, guestPod } = guestDeps();
    await createUseCases(deps).discardGuest();
    expect(guestPod.discard).toHaveBeenCalledOnce();
  });

  it("findGuestStudy lists the guest's instances with their decks counted; null when no guest studied here", async () => {
    const { deps } = guestDeps();
    expect(await createUseCases(deps).findGuestStudy()).toEqual({
      instances: [{ instance: guestInstance, deckCount: 1 }],
    });
    expect(deps.deckRepository.listDecks).toHaveBeenCalledWith(GUEST_INSTANCE_URL);
    vi.mocked(deps.guestPod.exists).mockResolvedValue(false);
    expect(await createUseCases(deps).findGuestStudy()).toBeNull();
  });

  it("transferGuestStudy copies the study into the user's pod as theirs, checks and registers it, then deletes the guest's", async () => {
    const { deps, guestPod } = guestDeps();
    vi.mocked(deps.webIdDocumentRepository.fetchWebIdDocument).mockResolvedValue({
      url: document.url,
      subjects: [
        {
          url: session.webId,
          properties: [
            {
              predicate: "http://xmlns.com/foaf/0.1/name",
              values: [{ type: "literal", value: "Alice" }],
            },
          ],
        },
      ],
    } as WebIdDocument);
    const hold = vi.fn(() => vi.fn());
    const progress: string[] = [];
    const outcome = await createUseCases({ ...deps, writeFence: { hold } }).transferGuestStudy(
      session,
      guestInstance,
      { containerUrl: ` ${TARGET.slice(0, -1)} `, registrationTarget: "private" },
      (p) =>
        progress.push(
          `${p.step} ${p.done}/${p.total}${p.part === undefined ? "" : ` (${p.part.done} of ${p.part.total})`}`,
        ),
    );
    expect(outcome).toEqual({
      ok: true,
      instance: { url: TARGET, name: "My study" },
      tidied: true,
    });
    const move = {
      from: GUEST_INSTANCE_URL,
      to: TARGET,
      renames: { [GUEST_WEBID]: session.webId },
    };
    expect(hold).toHaveBeenCalledWith(GUEST_INSTANCE_URL);
    expect(deps.instanceCopier.ensureAbsent).toHaveBeenCalledWith(TARGET);
    expect(deps.instanceCopier.createContainer).toHaveBeenCalledWith(TARGET);
    // The digest stays behind; access control is the user's pod's own.
    expect(vi.mocked(deps.instanceCopier.copyResource).mock.calls).toEqual([
      [`${GUEST_INSTANCE_URL}catalog.ttl`, `${TARGET}catalog.ttl`, move],
      [`${GUEST_INSTANCE_URL}history/`, `${TARGET}history/`, move],
      [`${GUEST_INSTANCE_URL}history/2026-10.ttl`, `${TARGET}history/2026-10.ttl`, move],
    ]);
    expect(deps.deckRepository.saveCatalog).toHaveBeenCalledExactlyOnceWith(TARGET, {
      ...catalog,
      publisher: { webId: session.webId, name: "Alice" },
    });
    expect(vi.mocked(deps.instanceCopier.mentions).mock.calls).toEqual([
      [`${TARGET}catalog.ttl`, GUEST_ORIGIN],
      [`${TARGET}history/2026-10.ttl`, GUEST_ORIGIN],
    ]);
    expect(deps.shapeValidator.validateDocument).toHaveBeenCalledWith(`${TARGET}meta.ttl`, "pod");
    expect(deps.instanceRepository.attachInstance).toHaveBeenCalledWith({
      webId: session.webId,
      instanceUrl: TARGET,
      registrationTarget: "private",
    });
    expect(deps.instanceRepository.registerDataClasses).toHaveBeenCalledWith({
      webId: session.webId,
      instanceUrl: TARGET,
      title: "My study",
    });
    expect(deps.instanceRepository.deleteInstance).toHaveBeenCalledWith({
      webId: GUEST_WEBID,
      instance: guestInstance,
    });
    expect(guestPod.discard).not.toHaveBeenCalled();
    expect(deps.updateJournal.begin).toHaveBeenCalledWith(GUEST_INSTANCE_URL, TARGET);
    expect(deps.updateJournal.end).toHaveBeenCalledWith(GUEST_INSTANCE_URL);
    expect(deps.updateJournal.run).toHaveBeenCalledWith(GUEST_INSTANCE_URL);
    expect(deps.updateJournal.run.mock.results[0]!.value).toHaveBeenCalledOnce();
    expect(deps.instanceCopier.deleteRecursively).not.toHaveBeenCalled();
    expect(progress).toEqual([
      "stage 0/7 (0 of 3)",
      "stage 0/7 (1 of 3)",
      "stage 0/7 (2 of 3)",
      "copy 1/7 (0 of 3)",
      "copy 1/7 (1 of 3)",
      "copy 1/7 (2 of 3)",
      "adopt 2/7 (0 of 3)",
      "adopt 2/7 (1 of 3)",
      "adopt 2/7 (2 of 3)",
      "validate 3/7",
      "validate 3/7 (0 of 6)",
      "validate 3/7 (1 of 6)",
      "validate 3/7 (2 of 6)",
      "validate 3/7 (3 of 6)",
      "validate 3/7 (4 of 6)",
      "validate 3/7 (5 of 6)",
      "verify 4/7 (0 of 4)",
      "verify 4/7 (1 of 4)",
      "verify 4/7 (2 of 4)",
      "verify 4/7 (3 of 4)",
      "register 5/7",
      "tidy 6/7",
      "tidy 7/7",
    ]);
  });

  it("a move cut off by a closed tab left a partial copy: offered for removal while it is there", async () => {
    const { deps } = guestDeps();
    const useCases = createUseCases(deps);
    await expect(useCases.findInterruptedGuestMove(guestInstance)).resolves.toBeNull();
    vi.mocked(deps.updateJournal.staging).mockReturnValue(TARGET);
    vi.mocked(deps.instanceCopier.ensureAbsent).mockRejectedValueOnce(new Error("exists"));
    await expect(useCases.findInterruptedGuestMove(guestInstance)).resolves.toBe(TARGET);
    expect(deps.updateJournal.staging).toHaveBeenCalledWith(GUEST_INSTANCE_URL);
    expect(deps.updateJournal.end).not.toHaveBeenCalled();
    // Gone meanwhile: forgotten.
    await expect(useCases.findInterruptedGuestMove(guestInstance)).resolves.toBeNull();
    expect(deps.updateJournal.end).toHaveBeenCalledWith(GUEST_INSTANCE_URL);
    // Removed whole, as nothing names it.
    await useCases.removeInterruptedGuestMove(guestInstance);
    expect(deps.instanceCopier.deleteRecursively).toHaveBeenCalledWith(TARGET);
    vi.mocked(deps.instanceCopier.deleteRecursively).mockClear();
    vi.mocked(deps.updateJournal.staging).mockReturnValue(null);
    await useCases.removeInterruptedGuestMove(guestInstance);
    expect(deps.instanceCopier.deleteRecursively).not.toHaveBeenCalled();
  });

  it("a note an earlier version's update left on an instance in a Pod is not a move: nothing offered, nothing removed", async () => {
    const { deps } = guestDeps();
    const useCases = createUseCases(deps);
    vi.mocked(deps.updateJournal.staging).mockReturnValue(TARGET);
    await expect(useCases.findInterruptedGuestMove(instance)).resolves.toBeNull();
    await useCases.removeInterruptedGuestMove(instance);
    expect(deps.updateJournal.staging).not.toHaveBeenCalled();
    expect(deps.updateJournal.end).not.toHaveBeenCalled();
    expect(deps.instanceCopier.ensureAbsent).not.toHaveBeenCalled();
    expect(deps.instanceCopier.deleteRecursively).not.toHaveBeenCalled();
  });

  it("holds read-only, while it runs, the guest's instance and the copy a move another page runs", () => {
    const holds: { url: string; release: ReturnType<typeof vi.fn> }[] = [];
    const writeFence = {
      hold: vi.fn((url: string) => {
        const release = vi.fn();
        holds.push({ url, release });
        return release;
      }),
    };
    const { deps } = guestDeps();
    createUseCases({ ...deps, writeFence });
    const changed = vi.mocked(deps.updateJournal.watch).mock.calls[0]![0];
    const held = () =>
      holds.filter(({ release }) => release.mock.calls.length === 0).map(({ url }) => url);
    changed(GUEST_INSTANCE_URL, TARGET);
    expect(held()).toEqual([GUEST_INSTANCE_URL, TARGET]);
    // Told again, it holds the copy named now, the old hold let go.
    changed(GUEST_INSTANCE_URL, TARGET);
    expect(held()).toEqual([GUEST_INSTANCE_URL, TARGET]);
    expect(holds).toHaveLength(4);
    // Released when it stops running; one never seen releases nothing.
    changed(GUEST_INSTANCE_URL, null);
    changed(GUEST_INSTANCE_URL, null);
    expect(held()).toEqual([]);
    expect(holds.every(({ release }) => release.mock.calls.length === 1)).toBe(true);
  });

  it("takes no move another page runs for an interrupted one, nor removes its copy", async () => {
    const { deps } = guestDeps();
    const useCases = createUseCases(deps);
    const changed = vi.mocked(deps.updateJournal.watch).mock.calls[0]![0];
    changed(GUEST_INSTANCE_URL, TARGET);
    vi.mocked(deps.updateJournal.staging).mockReturnValue(TARGET);
    await expect(useCases.findInterruptedGuestMove(guestInstance)).resolves.toBeNull();
    await expect(useCases.removeInterruptedGuestMove(guestInstance)).rejects.toMatchObject({
      code: "guestStudyBeingMoved",
    });
    expect(deps.instanceCopier.ensureAbsent).not.toHaveBeenCalled();
    expect(deps.instanceCopier.deleteRecursively).not.toHaveBeenCalled();
    expect(deps.updateJournal.end).not.toHaveBeenCalled();
  });

  it("transferGuestStudy refuses before it copies anything when the study could not be registered", async () => {
    const { deps } = guestDeps();
    vi.mocked(deps.storageGateway.discoverStorages).mockResolvedValue([]);
    const outcome = await createUseCases(deps).transferGuestStudy(session, guestInstance, {
      containerUrl: TARGET,
      registrationTarget: "public",
    });
    expect(outcome).toMatchObject({
      ok: false,
      error: expect.objectContaining({ code: "typeIndexNoStorage" }),
      cleanedUp: true,
    });
    expect(deps.instanceCopier.createContainer).not.toHaveBeenCalled();
    expect(deps.instanceRepository.attachInstance).not.toHaveBeenCalled();
  });

  it("transferGuestStudy registers in an index already there with no storage to make one in", async () => {
    const { deps } = guestDeps();
    vi.mocked(deps.storageGateway.discoverStorages).mockResolvedValue([]);
    const outcome = await createUseCases(deps).transferGuestStudy(session, guestInstance, {
      containerUrl: TARGET,
      registrationTarget: "private",
    });
    expect(outcome).toMatchObject({ ok: true });
  });

  it("transferGuestStudy moves the study to the target as a request sends its address", async () => {
    const { deps } = guestDeps();
    const typed = TARGET.replace("https://", "HTTPS://").replace(/\/$/, "");
    await createUseCases(deps).transferGuestStudy(session, guestInstance, {
      containerUrl: ` ${typed} `,
      registrationTarget: "public",
    });
    expect(deps.instanceCopier.ensureAbsent).toHaveBeenCalledWith(TARGET);
  });

  it("transferGuestStudy deletes the whole guest pod with its last instance", async () => {
    const { deps, guestPod } = guestDeps();
    vi.mocked(deps.instanceRepository.deleteInstance).mockImplementation(async () => {
      vi.mocked(deps.instanceRepository.listInstances).mockResolvedValue([]);
      return { keptFolder: null, keptReleases: false, keptDocuments: [] };
    });
    await createUseCases(deps).transferGuestStudy(session, guestInstance, {
      containerUrl: TARGET,
      registrationTarget: "public",
    });
    expect(guestPod.discard).toHaveBeenCalledOnce();
  });

  it("transferGuestStudy, and the rest of the app, run with the system's clock and fresh ids", async () => {
    const { now: _n, newId: _i, ...deps } = guestDeps().deps;
    const useCases = createUseCases(deps);
    await expect(
      useCases.transferGuestStudy(session, guestInstance, {
        containerUrl: TARGET,
        registrationTarget: "private",
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(useCases.findInterruptedGuestMove(guestInstance)).resolves.toBeNull();
    expect(useCases.newDeckGroup(instance.url, { en: "Group" }).url).toMatch(
      /#group-[0-9a-f-]{36}$/,
    );
    await expect(useCases.refreshStudyDigest(instance.url, deck)).resolves.toBeUndefined();
  });

  it("transferGuestStudy keeps a catalog-less study as it is, and adds answers still on their way first", async () => {
    const { deps } = guestDeps();
    vi.mocked(deps.deckRepository.readCatalog).mockResolvedValue(null);
    const answerLog: AnswerLog = {
      append: vi.fn(async () => undefined),
      appendAll: vi.fn(async () => undefined),
      months: vi.fn(async () => []),
      readMonth: vi.fn(async () => []),
      readMonthSince: vi.fn(),
      removeDay: vi.fn(async () => undefined),
      removeAnswer: vi.fn(async () => undefined),
    };
    vi.mocked(answerLog.append).mockRejectedValueOnce(new Error("offline"));
    const useCases = createUseCases({ ...deps, answerLog });
    const guestDeck = { ...deck, url: `${GUEST_INSTANCE_URL}catalog.ttl#deck-1` };
    await useCases.recordReview(
      GUEST_INSTANCE_URL,
      guestDeck,
      { card, direction: "front-to-back" },
      4,
      new Date("2026-10-03T10:00:00.000Z"),
    );
    await vi.waitFor(() => expect(answerLog.append).toHaveBeenCalledOnce());
    await useCases.transferGuestStudy(session, guestInstance, {
      containerUrl: TARGET,
      registrationTarget: "private",
    });
    expect(answerLog.append).toHaveBeenCalledTimes(2);
    expect(vi.mocked(answerLog.append).mock.invocationCallOrder[1]).toBeLessThan(
      vi.mocked(deps.instanceCopier.listResources).mock.invocationCallOrder[0]!,
    );
    expect(deps.deckRepository.saveCatalog).not.toHaveBeenCalled();
  });

  it("transferGuestStudy tidies the guest's study away even when its data could not be registered", async () => {
    const { deps } = guestDeps();
    vi.mocked(deps.instanceRepository.registerDataClasses).mockRejectedValue(new Error("offline"));
    expect(
      await createUseCases(deps).transferGuestStudy(session, guestInstance, {
        containerUrl: TARGET,
        registrationTarget: "private",
      }),
    ).toEqual({ ok: true, instance: { url: TARGET, name: "My study" }, tidied: true });
    expect(deps.instanceRepository.deleteInstance).toHaveBeenCalledWith({
      webId: GUEST_WEBID,
      instance: guestInstance,
    });
  });

  it("transferGuestStudy says the study moved even when the guest's could not be tidied away", async () => {
    const { deps } = guestDeps();
    vi.mocked(deps.instanceRepository.deleteInstance).mockRejectedValue(new Error("offline"));
    expect(
      await createUseCases(deps).transferGuestStudy(session, guestInstance, {
        containerUrl: TARGET,
        registrationTarget: "private",
      }),
    ).toEqual({ ok: true, instance: { url: TARGET, name: "My study" }, tidied: false });
  });

  it("transferGuestStudy moves only from the guest's pod into a user's", async () => {
    const { deps } = guestDeps();
    const useCases = createUseCases(deps);
    const target = { containerUrl: TARGET, registrationTarget: "private" as const };
    const refusal =
      "A guest's study moves from the guest's pod into the pod of a user who logged in.";
    await expect(useCases.transferGuestStudy(GUEST_SESSION, guestInstance, target)).rejects.toThrow(
      refusal,
    );
    await expect(useCases.transferGuestStudy(session, instance, target)).rejects.toThrow(refusal);
    await expect(
      useCases.transferGuestStudy(session, guestInstance, {
        ...target,
        containerUrl: `${GUEST_ORIGIN}x/`,
      }),
    ).rejects.toThrow(refusal);
  });

  it.each([
    [
      "stage",
      (deps: ReturnType<typeof makeDeps>) =>
        vi.mocked(deps.instanceCopier.ensureAbsent).mockRejectedValueOnce(new Error("boom")),
      false,
    ],
    [
      "copy",
      (deps: ReturnType<typeof makeDeps>) =>
        vi.mocked(deps.instanceCopier.copyResource).mockRejectedValueOnce(new Error("boom")),
      true,
    ],
    [
      "adopt",
      (deps: ReturnType<typeof makeDeps>) =>
        vi.mocked(deps.deckRepository.saveCatalog).mockRejectedValueOnce(new Error("boom")),
      true,
    ],
    [
      "register",
      (deps: ReturnType<typeof makeDeps>) =>
        vi.mocked(deps.instanceRepository.attachInstance).mockRejectedValueOnce(new Error("boom")),
      true,
    ],
  ] as const)(
    "transferGuestStudy failing at %s leaves the guest's study as it was and removes the copy",
    async (step, fail, copied) => {
      const { deps } = guestDeps();
      fail(deps);
      const outcome = await createUseCases(deps).transferGuestStudy(session, guestInstance, {
        containerUrl: TARGET,
        registrationTarget: "private",
      });
      expect(outcome).toEqual({ ok: false, step, error: new Error("boom"), cleanedUp: true });
      expect(deps.instanceCopier.deleteRecursively).toHaveBeenCalledTimes(copied ? 1 : 0);
      if (copied) expect(deps.instanceCopier.deleteRecursively).toHaveBeenCalledWith(TARGET);
      expect(deps.instanceRepository.deleteInstance).not.toHaveBeenCalled();
    },
  );

  it("transferGuestStudy, at a target already taken, keeps the note of the interrupted move whose copy is there", async () => {
    const { deps } = guestDeps();
    vi.mocked(deps.instanceCopier.ensureAbsent).mockRejectedValueOnce(new Error("taken"));
    const outcome = await createUseCases(deps).transferGuestStudy(session, guestInstance, {
      containerUrl: TARGET,
      registrationTarget: "private",
    });
    expect(outcome).toMatchObject({ ok: false, step: "stage", cleanedUp: true });
    expect(deps.updateJournal.begin).not.toHaveBeenCalled();
    expect(deps.updateJournal.end).not.toHaveBeenCalled();
    expect(deps.instanceCopier.deleteRecursively).not.toHaveBeenCalled();
  });

  it("transferGuestStudy refuses a copy that still names the guest's pod, or does not conform", async () => {
    const { deps } = guestDeps();
    vi.mocked(deps.instanceCopier.mentions).mockImplementation(async (url) =>
      url.endsWith("2026-10.ttl"),
    );
    expect(
      await createUseCases(deps).transferGuestStudy(session, guestInstance, {
        containerUrl: TARGET,
        registrationTarget: "private",
      }),
    ).toEqual({
      ok: false,
      step: "adopt",
      error: new AppError("guestUrlsLeft", { url: `${TARGET}history/2026-10.ttl` }),
      cleanedUp: true,
    });
    vi.mocked(deps.instanceCopier.mentions).mockResolvedValue(false);
    const violation = {
      message: { en: "x" },
      severity: "violation" as const,
      constraint: "MinCount",
    };
    vi.mocked(deps.deckRepository.listDecks).mockResolvedValue([]);
    vi.mocked(deps.shapeValidator.validateDocument).mockImplementation(async (url) =>
      url.endsWith("meta.ttl")
        ? {
            url,
            status: "checked" as const,
            subjects: [
              {
                url: `${url}#it`,
                status: "checked" as const,
                shape: "instance" as const,
                version: 2,
                violations: [violation],
              },
            ],
          }
        : { url, status: "missing" as const, subjects: [] },
    );
    expect(
      await createUseCases(deps).transferGuestStudy(session, guestInstance, {
        containerUrl: TARGET,
        registrationTarget: "private",
      }),
    ).toMatchObject({
      ok: false,
      step: "validate",
      error: new AppError("movedCopyInvalid", { count: 1 }),
    });
  });

  it("transferGuestStudy refuses to register when the guest's study changed while it was copied", async () => {
    const { deps } = guestDeps();
    vi.mocked(deps.instanceCopier.isUnchanged).mockResolvedValueOnce(false);
    expect(
      await createUseCases(deps).transferGuestStudy(session, guestInstance, {
        containerUrl: TARGET,
        registrationTarget: "private",
      }),
    ).toMatchObject({
      ok: false,
      step: "verify",
      error: new AppError("resourceChangedDuringCopy", {
        url: `${GUEST_INSTANCE_URL}catalog.ttl`,
      }),
    });
    expect(deps.instanceRepository.attachInstance).not.toHaveBeenCalled();
    // A resource that appeared meanwhile is a change too.
    const more = guestDeps();
    const listed = await more.deps.instanceCopier.listResources(GUEST_INSTANCE_URL);
    vi.mocked(more.deps.instanceCopier.listResources)
      .mockResolvedValueOnce(listed)
      .mockResolvedValueOnce([...listed, `${GUEST_INSTANCE_URL}new.ttl`]);
    expect(
      await createUseCases(more.deps).transferGuestStudy(session, guestInstance, {
        containerUrl: TARGET,
        registrationTarget: "private",
      }),
    ).toMatchObject({
      ok: false,
      step: "verify",
      error: new AppError("instanceChangedDuringCopy"),
    });
  });

  describe("adding the study to an instance", () => {
    const RELEASE = "https://solid-memo.com/decks/solid-fundamentals/v1.ttl";
    const guestDeckOf = (id: string, extra: Partial<Deck> = {}): Deck => ({
      ...deck,
      id,
      url: `${GUEST_INSTANCE_URL}catalog.ttl#${id}`,
      title: { en: id },
      cardsDocumentUrl: `${GUEST_INSTANCE_URL}decks/${id}.ttl`,
      reviewsDocumentUrl: `${GUEST_INSTANCE_URL}reviews/${id}.ttl`,
      ...extra,
    });
    const course = guestDeckOf("deck-g1", {
      sourceUrl: RELEASE,
      completedChapters: [`${RELEASE}#ch-1`],
    });
    const own = guestDeckOf("deck-g2");
    const guestCard: Card = {
      ...card,
      url: `${course.cardsDocumentUrl}#q-1`,
      id: "q-1",
      distractors: [{ id: "q-1-d1", text: { en: "No" } }],
    };
    const guestState: ReviewState = {
      cardId: "q-1",
      direction: "front-to-back",
      easeFactor: 2.5,
      intervalDays: 1,
      repetitions: 1,
      due: "2026-10-02",
      firstReviewedAt: "2026-10-01T10:00:00.000Z",
      lastReviewedAt: "2026-10-01T10:00:00.000Z",
      formatVersion: 2,
    };
    const guestFsrs: FsrsState = {
      cardId: "q-1",
      direction: "front-to-back",
      stability: 2.3,
      difficulty: 2.1,
      due: "2026-10-03",
      firstReviewedAt: guestState.firstReviewedAt,
      lastReviewedAt: guestState.lastReviewedAt,
      formatVersion: 1,
    };
    const answerTo = (of: Deck, id: string, extra: Partial<Answer> = {}): Answer => ({
      id,
      deckUrl: of.url,
      cardUrl: `${of.cardsDocumentUrl}#q-1`,
      direction: "front-to-back",
      grade: 4,
      answeredAt: "2026-10-01T10:00:00.000Z",
      studyDay: "2026-10-01",
      nextIntervalDays: 1,
      ...extra,
    });
    const added = (id: string, from: Deck): Deck => ({
      ...from,
      id,
      url: `${TARGET}catalog.ttl#${id}`,
      cardsDocumentUrl: `${TARGET}decks/${id}.ttl`,
      reviewsDocumentUrl: `${TARGET}reviews/${id}.ttl`,
      formatVersion: DECK_FORMAT_VERSION,
    });
    const target: Instance = { url: TARGET, name: "Main" };
    const targetDeck: Deck = { ...deck, url: `${TARGET}catalog.ttl#deck-t`, sourceUrl: RELEASE };
    const GROUP = { url: `${GUEST_INSTANCE_URL}catalog.ttl#group-g`, title: { en: "Solid" } };
    const RESOURCES = [
      `${GUEST_INSTANCE_URL}catalog.ttl`,
      `${GUEST_INSTANCE_URL}decks/`,
      `${GUEST_INSTANCE_URL}decks/deck-g1.ttl`,
      `${GUEST_INSTANCE_URL}digest.ttl`,
      `${GUEST_INSTANCE_URL}history/`,
      `${GUEST_INSTANCE_URL}history/2026-10.ttl`,
      `${GUEST_INSTANCE_URL}reviews/deck-g1.ttl`,
    ];

    function mergeDeps() {
      const { deps, guestPod } = guestDeps();
      const answers = [
        answerTo(course, "answer-1", {
          mode: "multiple-choice",
          chosenDistractor: `${course.cardsDocumentUrl}#q-1-d1`,
        }),
        answerTo(own, "answer-2"),
        // A deck the guest removed: its answers have no deck to go with.
        answerTo(guestDeckOf("deck-gone"), "answer-3"),
      ];
      const answerLog: AnswerLog = {
        append: vi.fn(async () => undefined),
        appendAll: vi.fn(async () => undefined),
        months: vi.fn(async (url: string) => (url === GUEST_INSTANCE_URL ? ["2026-10"] : [])),
        readMonth: vi.fn(async () => answers),
        readMonthSince: vi.fn(),
        removeDay: vi.fn(async () => undefined),
        removeAnswer: vi.fn(async () => undefined),
      };
      vi.mocked(deps.deckRepository.listDecks).mockImplementation(async (url) =>
        url === GUEST_INSTANCE_URL ? [course, own] : [targetDeck],
      );
      vi.mocked(deps.deckRepository.readDeckTree).mockResolvedValue({
        readOnly: false,
        children: [
          { kind: "group", group: GROUP, children: [{ kind: "deck", deck: course }] },
          { kind: "deck", deck: own },
        ],
      });
      vi.mocked(deps.deckRepository.listCards).mockImplementation(async (of) =>
        of.url === course.url ? [guestCard] : [],
      );
      vi.mocked(deps.reviewStateRepository.listReviewStates).mockImplementation(async (of) =>
        of.url === course.url ? { sm2: [guestState], fsrs: [guestFsrs] } : sm2s([]),
      );
      vi.mocked(deps.instanceCopier.listResources).mockResolvedValue(RESOURCES);
      vi.mocked(deps.deckRepository.readDeck).mockResolvedValue(null);
      let id = 0;
      const journal = new Map<string, string>();
      const updateJournal = {
        begin: vi.fn((key: string, value: string) => void journal.set(key, value)),
        end: vi.fn((key: string) => void journal.delete(key)),
        staging: vi.fn((key: string) => journal.get(key) ?? null),
        run: vi.fn(() => () => undefined),
        watch: vi.fn(),
      };
      return {
        deps: { ...deps, answerLog, updateJournal, newId: () => `n${++id}` },
        guestPod,
        answers,
        journal,
      };
    }

    type MergeDeps = ReturnType<typeof mergeDeps>["deps"];
    /** A guest's deck's stamp as read with mergeDeps: the course's documents listed, the other deck's not. */
    const stampOf = (of: Deck) =>
      guestDeckStamp(of, (url) => (of.url === course.url ? `version of ${url}` : ""));
    /** The guest's arrangement around the decks it was added as, as a group's note stamps it. */
    const arrangementOf = (first: Deck, second: Deck) =>
      JSON.stringify([
        { kind: "group", group: GROUP, children: [{ kind: "deck", url: first.url }] },
        { kind: "deck", url: second.url },
      ]);

    it("planGuestMerge lists the guest's decks with the instance's from the same release, and counts the guest's drafts", async () => {
      const { deps } = mergeDeps();
      expect(await createUseCases(deps).planGuestMerge(guestInstance, target)).toEqual({
        decks: [
          { deck: course, sameRelease: [targetDeck] },
          { deck: own, sameRelease: [] },
        ],
        drafts: 0,
      });
      const list = vi.fn(async (url: string) => (url === guestInstance.url ? [{}, {}] : [{}]));
      const releaseDraftRepository = { list } as unknown as ReleaseDraftRepository;
      expect(
        await createUseCases({ ...deps, releaseDraftRepository }).planGuestMerge(
          guestInstance,
          target,
        ),
      ).toMatchObject({ drafts: 2 });
    });

    it("mergeGuestStudy adds each deck whole — documents, entry, answers — groups them as the guest did, then deletes the guest's", async () => {
      const { deps, answers, journal } = mergeDeps();
      const hold = vi.fn(() => vi.fn());
      const progress: string[] = [];
      const outcome = await createUseCases({ ...deps, writeFence: { hold } }).mergeGuestStudy(
        session,
        guestInstance,
        { ...target, url: TARGET.slice(0, -1) },
        {},
        (p) =>
          progress.push(
            `${p.step} ${p.done}/${p.total}${p.part === undefined ? "" : ` (${p.part.done} of ${p.part.total})`}`,
          ),
      );
      const first = added("deck-n1", course);
      const second = added("deck-n2", own);
      expect(outcome).toEqual({
        ok: true,
        instance: { ...target, url: TARGET.slice(0, -1) },
        added: [first, second],
        tidied: true,
      });
      expect(hold).toHaveBeenCalledWith(GUEST_INSTANCE_URL);
      // The guest's study, checked whole before anything is written.
      expect(deps.shapeValidator.validateDocument).toHaveBeenCalledWith(
        `${GUEST_INSTANCE_URL}history/2026-10.ttl`,
        "pod",
      );
      const { url: _url, formatVersion: _version, ...content } = guestCard;
      expect(deps.deckRepository.applyCardChanges).toHaveBeenCalledExactlyOnceWith(
        first,
        { save: [content], remove: [] },
        { whole: true },
      );
      // The guest's FSRS-6 states come along with SM-2's.
      expect(deps.reviewStateRepository.createReviewStates).toHaveBeenCalledExactlyOnceWith(first, {
        sm2: [guestState],
        fsrs: [guestFsrs],
      });
      expect(vi.mocked(deps.deckRepository.addDeck).mock.calls).toEqual([[first], [second]]);
      // Documents before the entry that names them.
      expect(
        vi.mocked(deps.deckRepository.applyCardChanges).mock.invocationCallOrder[0],
      ).toBeLessThan(
        vi.mocked(deps.reviewStateRepository.createReviewStates).mock.invocationCallOrder[0]!,
      );
      expect(
        vi.mocked(deps.reviewStateRepository.createReviewStates).mock.invocationCallOrder[0],
      ).toBeLessThan(vi.mocked(deps.deckRepository.addDeck).mock.invocationCallOrder[0]!);
      expect(vi.mocked(deps.answerLog.appendAll).mock.calls).toEqual([
        [
          TARGET,
          [
            {
              ...answers[0],
              id: "answer-1-deck-n1",
              deckUrl: first.url,
              cardUrl: `${first.cardsDocumentUrl}#q-1`,
              chosenDistractor: `${first.cardsDocumentUrl}#q-1-d1`,
            },
          ],
        ],
        [
          TARGET,
          [
            {
              ...answers[1],
              id: "answer-2-deck-n2",
              deckUrl: second.url,
              cardUrl: `${second.cardsDocumentUrl}#q-1`,
            },
          ],
        ],
      ]);
      expect(deps.deckRepository.editDeckTree).toHaveBeenCalledExactlyOnceWith(TARGET, {
        kind: "graft",
        nodes: [
          {
            kind: "group",
            group: { url: `${TARGET}catalog.ttl#group-n3`, title: GROUP.title },
            children: [{ kind: "deck", url: first.url }],
          },
          { kind: "deck", url: second.url },
        ],
      });
      // The target's preferences stay; the guest's are not read, nor anything registered.
      expect(deps.preferencesRepository.savePreferences).not.toHaveBeenCalled();
      expect(deps.instanceRepository.registerDataClasses).not.toHaveBeenCalled();
      expect(deps.instanceRepository.deleteInstance).toHaveBeenCalledWith({
        webId: GUEST_WEBID,
        instance: guestInstance,
      });
      // Each deck's note kept while the guest's study was here, then forgotten.
      expect(deps.updateJournal.begin).toHaveBeenCalledWith(
        `${course.url} added to ${TARGET}`,
        JSON.stringify({ url: first.url, stamp: stampOf(course) }),
      );
      expect(deps.updateJournal.begin).toHaveBeenCalledWith(
        `${own.url} added to ${TARGET}`,
        JSON.stringify({ url: second.url, stamp: stampOf(own) }),
      );
      expect(deps.updateJournal.begin).toHaveBeenCalledWith(
        `${GROUP.url} added to ${TARGET}`,
        JSON.stringify({
          url: `${TARGET}catalog.ttl#group-n3`,
          stamp: arrangementOf(first, second),
        }),
      );
      expect(journal.size).toBe(0);
      expect(progress).toEqual([
        "read 0/6 (0 of 2)",
        "read 0/6 (1 of 2)",
        "decks 1/6 (0 of 2)",
        "decks 1/6 (1 of 2)",
        "arrange 2/6",
        "drafts 3/6 (0 of 0)",
        "verify 4/6 (0 of 5)",
        "verify 4/6 (1 of 5)",
        "verify 4/6 (2 of 5)",
        "verify 4/6 (3 of 5)",
        "verify 4/6 (4 of 5)",
        "tidy 5/6",
        "tidy 6/6",
      ]);
    });

    it("mergeGuestStudy leaves out the decks skipped, with their answers and places, and makes no groups when the guest made none", async () => {
      const { deps, guestPod } = mergeDeps();
      vi.mocked(deps.deckRepository.readDeckTree).mockResolvedValue({
        readOnly: false,
        children: [],
      });
      vi.mocked(deps.instanceRepository.deleteInstance).mockImplementation(async () => {
        vi.mocked(deps.instanceRepository.listInstances).mockResolvedValue([]);
        return { keptFolder: null, keptReleases: false, keptDocuments: [] };
      });
      const outcome = await createUseCases(deps).mergeGuestStudy(session, guestInstance, target, {
        skip: [course.url],
      });
      expect(outcome).toMatchObject({ ok: true, added: [added("deck-n1", own)] });
      expect(deps.deckRepository.applyCardChanges).not.toHaveBeenCalled();
      expect(deps.reviewStateRepository.createReviewStates).not.toHaveBeenCalled();
      expect(deps.answerLog.appendAll).toHaveBeenCalledExactlyOnceWith(TARGET, [
        expect.objectContaining({
          id: "answer-2-deck-n1",
          deckUrl: `${TARGET}catalog.ttl#deck-n1`,
        }),
      ]);
      expect(deps.deckRepository.editDeckTree).not.toHaveBeenCalled();
      expect(guestPod.discard).toHaveBeenCalledOnce();
    });

    describe("a guest's drafts", () => {
      const GUEST_DRAFT = draftUrlOf(GUEST_INSTANCE_URL, "solid", 1);
      const guestDraft = rebaseDraft(courseDraft(), GUEST_DRAFT);
      const DRAFT_DOCUMENTS = [
        GUEST_DRAFT,
        `${GUEST_INSTANCE_URL}drafts/solid/v1/chapter-ch-a.ttl`,
      ];
      const stamp = DRAFT_DOCUMENTS.map((url) => `${url} version of ${url}`).join("\n");
      const copyNamed = (name: string) => draftUrlOf(TARGET, name, 1);

      /** mergeDeps with the guest's draft, its documents listed, and the instance's drafts `targetDrafts`. */
      function draftDeps(targetDrafts: string[]) {
        const merge = mergeDeps();
        vi.mocked(merge.deps.instanceCopier.listResources).mockResolvedValue([
          ...RESOURCES,
          `${GUEST_INSTANCE_URL}drafts/`,
          ...DRAFT_DOCUMENTS,
        ]);
        const summaryOf = (url: string) => draftSummaryOf(rebaseDraft(guestDraft, url))!;
        const releaseDraftRepository = {
          list: vi.fn(async (url: string) =>
            url === GUEST_INSTANCE_URL ? [summaryOf(GUEST_DRAFT)] : targetDrafts.map(summaryOf),
          ),
          documents: vi.fn(async (url: string) =>
            url === GUEST_INSTANCE_URL ? DRAFT_DOCUMENTS : [],
          ),
          read: vi.fn(async () => ({ draft: guestDraft, version: "v1" })),
          create: vi.fn(async (_instance: string, draft: ReleaseDraft) => draftSummaryOf(draft)!),
        } as unknown as ReleaseDraftRepository & { create: ReturnType<typeof vi.fn> };
        return {
          ...merge,
          deps: { ...merge.deps, releaseDraftRepository },
          releaseDraftRepository,
        };
      }

      it("copies each into the instance, under the next free name, never over one of its drafts", async () => {
        const { deps, releaseDraftRepository, journal } = draftDeps([copyNamed("solid")]);
        const progress: string[] = [];
        const outcome = await createUseCases(deps).mergeGuestStudy(
          session,
          guestInstance,
          target,
          {},
          (p) =>
            progress.push(
              `${p.step} ${p.done}/${p.total}${p.part === undefined ? "" : ` (${p.part.done} of ${p.part.total})`}`,
            ),
        );
        expect(outcome).toMatchObject({ ok: true, tidied: true });
        expect(releaseDraftRepository.read).toHaveBeenCalledWith(GUEST_DRAFT);
        expect(releaseDraftRepository.create).toHaveBeenCalledExactlyOnceWith(
          TARGET,
          rebaseDraft(guestDraft, copyNamed("solid-2")),
        );
        expect(progress).toContain("drafts 3/6 (0 of 1)");
        // Its note kept while the guest's study was here, then forgotten.
        expect(deps.updateJournal.begin).toHaveBeenCalledWith(
          `${GUEST_DRAFT} added to ${TARGET}`,
          JSON.stringify({ url: copyNamed("solid-2"), stamp }),
        );
        expect(journal.size).toBe(0);
        // Copied before the guest's study goes.
        expect(releaseDraftRepository.create.mock.invocationCallOrder[0]).toBeLessThan(
          vi.mocked(deps.instanceRepository.deleteInstance).mock.invocationCallOrder[0]!,
        );
      });

      it("copies one copied from this device before only when the guest changed it since, or the instance no longer has the copy", async () => {
        const unchanged = draftDeps([copyNamed("solid"), copyNamed("solid-2")]);
        unchanged.journal.set(
          `${GUEST_DRAFT} added to ${TARGET}`,
          JSON.stringify({ url: copyNamed("solid-2"), stamp }),
        );
        expect(
          await createUseCases(unchanged.deps).mergeGuestStudy(session, guestInstance, target),
        ).toMatchObject({ ok: true });
        expect(unchanged.releaseDraftRepository.create).not.toHaveBeenCalled();

        const changed = draftDeps([copyNamed("solid"), copyNamed("solid-2")]);
        changed.journal.set(
          `${GUEST_DRAFT} added to ${TARGET}`,
          JSON.stringify({ url: copyNamed("solid-2"), stamp: "older versions" }),
        );
        await createUseCases(changed.deps).mergeGuestStudy(session, guestInstance, target);
        expect(changed.releaseDraftRepository.create).toHaveBeenCalledExactlyOnceWith(
          TARGET,
          rebaseDraft(guestDraft, copyNamed("solid-3")),
        );

        const gone = draftDeps([copyNamed("solid")]);
        gone.journal.set(
          `${GUEST_DRAFT} added to ${TARGET}`,
          JSON.stringify({ url: copyNamed("solid-2"), stamp }),
        );
        await createUseCases(gone.deps).mergeGuestStudy(session, guestInstance, target);
        expect(gone.releaseDraftRepository.create).toHaveBeenCalledOnce();
      });

      it("keeps the guest's study, and the decks added, when a draft cannot be copied", async () => {
        const { deps, releaseDraftRepository } = draftDeps([]);
        releaseDraftRepository.create.mockRejectedValueOnce(
          new AppError("changedElsewhere", { url: `${TARGET}catalog.ttl` }),
        );
        const outcome = await createUseCases(deps).mergeGuestStudy(session, guestInstance, target);
        expect(outcome).toMatchObject({
          ok: false,
          step: "drafts",
          error: { code: "changedElsewhere" },
          added: [added("deck-n1", course), added("deck-n2", own)],
          copied: [],
        });
        expect(deps.instanceRepository.deleteInstance).not.toHaveBeenCalled();
      });

      it("says which drafts are in the instance when it fails after copying them, those copied before among them", async () => {
        const fresh = draftDeps([]);
        const listed = [...RESOURCES, `${GUEST_INSTANCE_URL}drafts/`, ...DRAFT_DOCUMENTS];
        vi.mocked(fresh.deps.instanceCopier.listResources)
          .mockResolvedValueOnce(listed)
          .mockResolvedValueOnce([...listed, `${GUEST_INSTANCE_URL}new.ttl`]);
        const outcome = await createUseCases(fresh.deps).mergeGuestStudy(
          session,
          guestInstance,
          target,
        );
        expect(outcome).toMatchObject({
          ok: false,
          step: "verify",
          error: { code: "guestStudyChanged" },
          copied: [{ url: copyNamed("solid"), name: "solid" }],
        });
        expect(fresh.deps.instanceRepository.deleteInstance).not.toHaveBeenCalled();

        const before = draftDeps([copyNamed("solid")]);
        before.journal.set(
          `${GUEST_DRAFT} added to ${TARGET}`,
          JSON.stringify({ url: copyNamed("solid"), stamp }),
        );
        vi.mocked(before.deps.instanceCopier.listResources)
          .mockResolvedValueOnce(listed)
          .mockResolvedValueOnce([]);
        const again = await createUseCases(before.deps).mergeGuestStudy(
          session,
          guestInstance,
          target,
        );
        expect(again).toMatchObject({
          ok: false,
          step: "verify",
          copied: [{ url: copyNamed("solid"), name: "solid" }],
        });
        expect(before.releaseDraftRepository.create).not.toHaveBeenCalled();
      });
    });

    it("mergeGuestStudy adds a deck it added from this device before, unchanged since, only its answers again", async () => {
      const { deps, journal } = mergeDeps();
      const before = added("deck-earlier", course);
      vi.mocked(deps.deckRepository.listDecks).mockImplementation(async (url) =>
        url === GUEST_INSTANCE_URL ? [course, own] : [targetDeck, before],
      );
      journal.set(
        `${course.url} added to ${TARGET}`,
        JSON.stringify({ url: before.url, stamp: stampOf(course) }),
      );
      journal.set(
        `${GROUP.url} added to ${TARGET}`,
        JSON.stringify({
          url: `${TARGET}catalog.ttl#group-earlier`,
          stamp: arrangementOf(before, added("deck-n1", own)),
        }),
      );
      // A note of a deck the instance no longer has is no reason to leave one out.
      journal.set(
        `${own.url} added to ${TARGET}`,
        JSON.stringify({ url: `${TARGET}catalog.ttl#deck-removed`, stamp: stampOf(own) }),
      );
      const outcome = await createUseCases(deps).mergeGuestStudy(session, guestInstance, target);
      expect(outcome).toMatchObject({ ok: true, added: [before, added("deck-n1", own)] });
      expect(vi.mocked(deps.deckRepository.addDeck).mock.calls).toEqual([[added("deck-n1", own)]]);
      // The same entries as before: adding them again changes nothing.
      expect(deps.answerLog.appendAll).toHaveBeenCalledWith(TARGET, [
        expect.objectContaining({ id: "answer-1-deck-earlier", deckUrl: before.url }),
      ]);
      expect(vi.mocked(deps.updateJournal.begin).mock.calls.map(([key]) => key)).toEqual([
        `${own.url} added to ${TARGET}`,
        `${GROUP.url} added to ${TARGET}`,
      ]);
      // The group an earlier run made is made under the same URL: a graft already made changes nothing.
      expect(deps.deckRepository.editDeckTree).toHaveBeenCalledWith(TARGET, {
        kind: "graft",
        nodes: [
          {
            kind: "group",
            group: { url: `${TARGET}catalog.ttl#group-earlier`, title: GROUP.title },
            children: [{ kind: "deck", url: before.url }],
          },
          { kind: "deck", url: `${TARGET}catalog.ttl#deck-n1` },
        ],
      });
    });

    it("mergeGuestStudy adds again, as a deck of its own, a deck the guest changed since it was added", async () => {
      const { deps, journal } = mergeDeps();
      const before = added("deck-earlier", course);
      vi.mocked(deps.deckRepository.listDecks).mockImplementation(async (url) =>
        url === GUEST_INSTANCE_URL ? [course] : [before],
      );
      journal.set(
        `${course.url} added to ${TARGET}`,
        JSON.stringify({ url: before.url, stamp: "older versions" }),
      );
      expect(
        await createUseCases(deps).mergeGuestStudy(session, guestInstance, target),
      ).toMatchObject({
        ok: true,
        added: [added("deck-n1", course)],
      });
      // Its answers are entries of their own, beside those of the deck added before: no entry names two decks.
      expect(deps.answerLog.appendAll).toHaveBeenCalledWith(TARGET, [
        expect.objectContaining({
          id: "answer-1-deck-n1",
          deckUrl: `${TARGET}catalog.ttl#deck-n1`,
        }),
      ]);
    });

    it("mergeGuestStudy adds again a deck whose entry alone the guest changed since, and makes groups arranged otherwise anew", async () => {
      const { deps, journal } = mergeDeps();
      const before = added("deck-earlier", course);
      const renamed = { ...course, title: { en: "Renamed" }, newCardsPerDay: 5 };
      vi.mocked(deps.deckRepository.listDecks).mockImplementation(async (url) =>
        url === GUEST_INSTANCE_URL ? [renamed, own] : [targetDeck, before],
      );
      journal.set(
        `${course.url} added to ${TARGET}`,
        JSON.stringify({ url: before.url, stamp: stampOf(course) }),
      );
      journal.set(
        `${GROUP.url} added to ${TARGET}`,
        JSON.stringify({
          url: `${TARGET}catalog.ttl#group-earlier`,
          stamp: arrangementOf(before, added("deck-n1", own)),
        }),
      );
      const outcome = await createUseCases(deps).mergeGuestStudy(session, guestInstance, target);
      const again = added("deck-n1", renamed);
      expect(outcome).toMatchObject({ ok: true, added: [again, added("deck-n2", own)] });
      expect(deps.deckRepository.addDeck).toHaveBeenCalledWith(again);
      expect(deps.deckRepository.editDeckTree).toHaveBeenCalledWith(TARGET, {
        kind: "graft",
        nodes: [
          {
            kind: "group",
            group: { url: `${TARGET}catalog.ttl#group-n3`, title: GROUP.title },
            children: [{ kind: "deck", url: again.url }],
          },
          { kind: "deck", url: `${TARGET}catalog.ttl#deck-n2` },
        ],
      });
    });

    it("mergeGuestStudy refuses, before writing anything, to make groups in an arrangement a newer version wrote", async () => {
      const { deps } = mergeDeps();
      const guestTree = await deps.deckRepository.readDeckTree(GUEST_INSTANCE_URL);
      vi.mocked(deps.deckRepository.readDeckTree).mockImplementation(async (url) =>
        url === TARGET ? { readOnly: true, children: [] } : guestTree,
      );
      expect(
        await createUseCases(deps).mergeGuestStudy(session, guestInstance, target),
      ).toMatchObject({
        ok: false,
        step: "read",
        error: new AppError("deckTreeTooNew"),
        added: [],
      });
      expect(deps.deckRepository.applyCardChanges).not.toHaveBeenCalled();
      expect(deps.deckRepository.addDeck).not.toHaveBeenCalled();
      // A guest who made no group has nothing to arrange there.
      vi.mocked(deps.deckRepository.readDeckTree).mockImplementation(async (url) =>
        url === TARGET ? { readOnly: true, children: [] } : { readOnly: false, children: [] },
      );
      expect(
        await createUseCases(deps).mergeGuestStudy(session, guestInstance, target),
      ).toMatchObject({ ok: true });
    });

    it("mergeGuestStudy adds only from the guest's pod to an instance of a user who logged in", async () => {
      const { deps } = mergeDeps();
      const useCases = createUseCases(deps);
      const refusal =
        "A guest's study is added from the guest's pod to an instance of a user who logged in.";
      await expect(useCases.mergeGuestStudy(GUEST_SESSION, guestInstance, target)).rejects.toThrow(
        refusal,
      );
      await expect(useCases.mergeGuestStudy(session, instance, target)).rejects.toThrow(refusal);
      await expect(useCases.mergeGuestStudy(session, guestInstance, guestInstance)).rejects.toThrow(
        refusal,
      );
    });

    it("mergeGuestStudy adds nothing from a guest's study that does not conform, or that a newer version wrote", async () => {
      const { deps } = mergeDeps();
      const violation = {
        message: { en: "x" },
        severity: "violation" as const,
        constraint: "MinCount",
      };
      vi.mocked(deps.shapeValidator.validateDocument).mockImplementation(async (url) => ({
        url,
        status: "checked" as const,
        subjects: url.endsWith("catalog.ttl")
          ? [
              {
                url: `${url}#x`,
                status: "checked" as const,
                shape: "deck" as const,
                version: 6,
                violations: [violation],
              },
            ]
          : [],
      }));
      expect(await createUseCases(deps).mergeGuestStudy(session, guestInstance, target)).toEqual({
        ok: false,
        instance: target,
        step: "read",
        error: new AppError("guestStudyInvalid", { count: 1 }),
        added: [],
        copied: [],
      });
      vi.mocked(deps.shapeValidator.validateDocument).mockImplementation(async (url) => ({
        url,
        status: "checked" as const,
        subjects: [
          {
            url: `${url}#x`,
            status: "newer" as const,
            shape: "card" as const,
            version: 9,
            latest: 5,
          },
        ],
      }));
      expect(
        await createUseCases(deps).mergeGuestStudy(session, guestInstance, target),
      ).toMatchObject({
        ok: false,
        step: "read",
        error: new AppError("guestStudyTooNew"),
      });
      expect(deps.deckRepository.addDeck).not.toHaveBeenCalled();
      expect(deps.instanceRepository.deleteInstance).not.toHaveBeenCalled();
    });

    it("mergeGuestStudy writes nothing of a deck that would still name the guest's pod", async () => {
      const { deps } = mergeDeps();
      vi.mocked(deps.deckRepository.listCards).mockResolvedValue([
        { ...guestCard, frontImageUrl: `${GUEST_ORIGIN}picture.png` },
      ]);
      expect(
        await createUseCases(deps).mergeGuestStudy(session, guestInstance, target),
      ).toMatchObject({
        ok: false,
        step: "decks",
        error: new AppError("guestUrlsLeft", { url: `${TARGET}catalog.ttl#deck-n1` }),
        added: [],
      });
      expect(deps.deckRepository.applyCardChanges).not.toHaveBeenCalled();
    });

    it("mergeGuestStudy stops at a deck it cannot add, keeping the decks added whole and the guest's study, deleting the deck's documents", async () => {
      const { deps, journal } = mergeDeps();
      vi.mocked(deps.deckRepository.listDecks).mockImplementation(async (url) =>
        url === GUEST_INSTANCE_URL ? [own, course] : [targetDeck],
      );
      vi.mocked(deps.deckRepository.addDeck)
        .mockResolvedValueOnce(added("deck-n1", own))
        .mockRejectedValueOnce(new Error("offline"));
      vi.mocked(deps.deckRepository.deleteDocument).mockRejectedValueOnce(
        new Error("still offline"),
      );
      const outcome = await createUseCases(deps).mergeGuestStudy(session, guestInstance, target);
      expect(outcome).toEqual({
        ok: false,
        instance: target,
        step: "decks",
        error: new Error("offline"),
        added: [added("deck-n1", own)],
        copied: [],
      });
      // The entry was not written after all: the documents nothing names go.
      expect(deps.deckRepository.readDeck).toHaveBeenCalledWith(`${TARGET}catalog.ttl#deck-n2`);
      expect(vi.mocked(deps.deckRepository.deleteDocument).mock.calls).toEqual([
        [
          expect.objectContaining({ url: `${TARGET}catalog.ttl#deck-n2` }),
          `${TARGET}decks/deck-n2.ttl`,
        ],
        [
          expect.objectContaining({ url: `${TARGET}catalog.ttl#deck-n2` }),
          `${TARGET}reviews/deck-n2.ttl`,
        ],
      ]);
      expect(deps.instanceRepository.deleteInstance).not.toHaveBeenCalled();
      expect(journal.size).toBe(1);
      expect(deps.deckRepository.editDeckTree).not.toHaveBeenCalled();
    });

    it("mergeGuestStudy deletes only what it wrote of a deck it could not add, and counts a deck whose entry was written though its answer was lost", async () => {
      const { deps } = mergeDeps();
      vi.mocked(deps.reviewStateRepository.createReviewStates).mockRejectedValueOnce(
        new AppError("createdElsewhere", { url: "x" }),
      );
      expect(
        await createUseCases(deps).mergeGuestStudy(session, guestInstance, target),
      ).toMatchObject({ ok: false, step: "decks", added: [], copied: [] });
      expect(deps.deckRepository.readDeck).not.toHaveBeenCalled();
      // The cards document it wrote goes; the reviews document someone else created stays.
      expect(vi.mocked(deps.deckRepository.deleteDocument).mock.calls).toEqual([
        [
          expect.objectContaining({ url: `${TARGET}catalog.ttl#deck-n1` }),
          `${TARGET}decks/deck-n1.ttl`,
        ],
      ]);

      const lost = mergeDeps();
      const there = added("deck-n1", course);
      vi.mocked(lost.deps.deckRepository.addDeck).mockRejectedValueOnce(
        new Error("connection reset"),
      );
      vi.mocked(lost.deps.deckRepository.readDeck).mockResolvedValueOnce(there);
      expect(
        await createUseCases(lost.deps).mergeGuestStudy(session, guestInstance, target),
      ).toMatchObject({
        ok: true,
        added: [there, added("deck-n2", own)],
      });
      expect(lost.deps.deckRepository.deleteDocument).not.toHaveBeenCalled();

      const unknown = mergeDeps();
      vi.mocked(unknown.deps.deckRepository.applyCardChanges).mockRejectedValueOnce(
        new Error("connection reset"),
      );
      vi.mocked(unknown.deps.deckRepository.readDeck).mockRejectedValueOnce(new Error("offline"));
      expect(
        await createUseCases(unknown.deps).mergeGuestStudy(session, guestInstance, target),
      ).toMatchObject({ ok: false, step: "decks" });
      // A write whose answer was lost may have been made: its document goes, as nothing names it.
      expect(vi.mocked(unknown.deps.deckRepository.deleteDocument).mock.calls).toEqual([
        [
          expect.objectContaining({ url: `${TARGET}catalog.ttl#deck-n1` }),
          `${TARGET}decks/deck-n1.ttl`,
        ],
      ]);
    });

    it.each([
      [
        "decks",
        (deps: MergeDeps) =>
          vi.mocked(deps.answerLog.appendAll).mockRejectedValueOnce(new Error("boom")),
        1,
      ],
      [
        "arrange",
        (deps: MergeDeps) =>
          vi.mocked(deps.deckRepository.editDeckTree).mockRejectedValueOnce(new Error("boom")),
        2,
      ],
    ] as const)(
      "mergeGuestStudy failing at %s keeps the decks added and the guest's study",
      async (step, fail, count) => {
        const { deps } = mergeDeps();
        fail(deps);
        const outcome = await createUseCases(deps).mergeGuestStudy(session, guestInstance, target);
        expect(outcome).toMatchObject({
          ok: false,
          step,
          error: new Error("boom"),
          added: [added("deck-n1", course), added("deck-n2", own)].slice(0, count),
        });
        expect(deps.instanceRepository.deleteInstance).not.toHaveBeenCalled();
      },
    );

    it("mergeGuestStudy keeps the guest's study when it changed while it was being added", async () => {
      const { deps } = mergeDeps();
      vi.mocked(deps.instanceCopier.listResources)
        .mockResolvedValueOnce(RESOURCES)
        .mockResolvedValueOnce([...RESOURCES, `${GUEST_INSTANCE_URL}new.ttl`]);
      expect(
        await createUseCases(deps).mergeGuestStudy(session, guestInstance, target),
      ).toMatchObject({
        ok: false,
        step: "verify",
        error: new AppError("guestStudyChanged"),
      });
      const changed = mergeDeps();
      let reads = 0;
      vi.mocked(changed.deps.instanceCopier.versionOf).mockImplementation(async (url) =>
        url.endsWith("2026-10.ttl") && ++reads > 1 ? "newer" : `version of ${url}`,
      );
      expect(
        await createUseCases(changed.deps).mergeGuestStudy(session, guestInstance, target),
      ).toMatchObject({
        ok: false,
        step: "verify",
        error: new AppError("guestStudyChanged", {
          url: `${GUEST_INSTANCE_URL}history/2026-10.ttl`,
        }),
      });
      expect(changed.deps.instanceRepository.deleteInstance).not.toHaveBeenCalled();
    });

    it("mergeGuestStudy says the study was added even when the guest's could not be deleted, and keeps its notes", async () => {
      const { deps, journal } = mergeDeps();
      vi.mocked(deps.instanceRepository.deleteInstance).mockRejectedValue(new Error("offline"));
      expect(
        await createUseCases(deps).mergeGuestStudy(session, guestInstance, target),
      ).toMatchObject({ ok: true, tidied: false });
      expect([...journal.keys()]).toEqual([
        `${course.url} added to ${TARGET}`,
        `${own.url} added to ${TARGET}`,
        `${GROUP.url} added to ${TARGET}`,
      ]);
    });

    it("mergeGuestStudy adds answers still on their way to the guest's log first", async () => {
      const { deps } = mergeDeps();
      vi.mocked(deps.answerLog.append).mockRejectedValueOnce(new Error("offline"));
      const useCases = createUseCases(deps);
      await useCases.recordReview(
        GUEST_INSTANCE_URL,
        own,
        { card, direction: "front-to-back" },
        4,
        new Date("2026-10-03T10:00:00.000Z"),
      );
      await vi.waitFor(() => expect(deps.answerLog.append).toHaveBeenCalledOnce());
      await useCases.mergeGuestStudy(session, guestInstance, target);
      expect(deps.answerLog.append).toHaveBeenCalledTimes(2);
      expect(vi.mocked(deps.answerLog.append).mock.invocationCallOrder[1]).toBeLessThan(
        vi.mocked(deps.instanceCopier.listResources).mock.invocationCallOrder[0]!,
      );
    });
  });

  it("transferGuestStudy names the copy it could not remove", async () => {
    const { deps } = guestDeps();
    vi.mocked(deps.instanceCopier.copyResource).mockRejectedValueOnce("offline");
    vi.mocked(deps.instanceCopier.deleteRecursively).mockRejectedValueOnce(
      new Error("still offline"),
    );
    expect(
      await createUseCases(deps).transferGuestStudy(session, guestInstance, {
        containerUrl: TARGET,
        registrationTarget: "private",
      }),
    ).toEqual({
      ok: false,
      step: "copy",
      error: "offline",
      cleanedUp: false,
      leftoverUrl: TARGET,
    });
    expect(deps.updateJournal.end).not.toHaveBeenCalled();
  });
});
