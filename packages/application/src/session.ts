// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { profileNameOf, type SolidAccount } from "@solid-memo/domain/account";
import { rebaseIri } from "@solid-memo/domain/instanceUpdate";
import { DECK_FORMAT_VERSION, type Deck } from "@solid-memo/domain/deck";
import type { Instance, RegistrationTarget } from "@solid-memo/domain/instance";
import {
  deckGroupUrlOf,
  digestUrlOf,
  ensureTrailingSlash,
  instanceAddressOf,
} from "@solid-memo/domain/instanceLayout";
import type { EstablishedSession, Session } from "@solid-memo/domain/session";
import { isSecureUrl, validateWebId } from "@solid-memo/domain/webId";
import {
  decodeGuestMergeNote,
  encodeGuestMergeNote,
  guestDeckStamp,
  GUEST_INSTANCE_URL,
  GUEST_MERGE_STEPS,
  GUEST_ORIGIN,
  GUEST_SESSION,
  GUEST_TRANSFER_STEPS,
  GUEST_WEBID,
  graftOfGuestTree,
  guestMergeKey,
  guestMergePlan,
  isGuestUrl,
  mentionsGuest,
  mergedAnswer,
  mergedDeck,
  type GuestMergeOutcome,
  type GuestMergePlan,
  type GuestMergeProgress,
  type GuestMergeStep,
  type GuestStudy,
  type GuestTransferOutcome,
  type GuestTransferProgress,
  type GuestTransferStep,
} from "@solid-memo/domain/guest";
import type { WebIdDocument } from "@solid-memo/domain/webIdDocument";
import type {
  DeckRepository,
  InstanceRepository,
  ReviewStateRepository,
  SessionGateway,
  StorageGateway,
  WebIdDocumentRepository,
  AnswerLog,
  InstanceCopier,
  ContainerMove,
  GuestPod,
  UpdateJournal,
  WriteFence,
  ReleaseDraftRepository,
} from "./ports";
import type { ReleaseDraftUseCases } from "./releaseDrafts";
import { draftContainerOf, type ReleaseDraftSummary } from "@solid-memo/domain/release/draftLayout";
import { AppError } from "@solid-memo/domain/appError";
import type { InstanceCheckUseCases } from "./instanceChecks";
import { catalogOf, type InstanceUseCases } from "./instances";
import { unsent } from "./writes";
import { stepReporter } from "./progress";
import type { AnswerStore } from "./answerStore";

export interface SessionUseCases {
  /** The session of a login or an earlier one; else a guest's, when a guest studied on this device; else null. */
  restoreSession(): Promise<EstablishedSession | null>;
  /** Rejects, without any network request, unless the WebID is an https URL. */
  loginWithWebId(webId: string): Promise<void>;
  /** Log in at a chosen identity provider; rejects unless it is an https URL. */
  loginWithProvider(oidcIssuer: string): Promise<void>;
  logout(): Promise<void>;
  /** Subscribe to session expiry; returns an unsubscribe function. */
  onSessionExpired(listener: () => void): () => void;
  /**
   * The account behind a session: its Pod, discovered through the WebID
   * profile's storage link, its identity provider and its foaf:name.
   */
  discoverAccount(session: Session): Promise<SolidAccount>;
  viewWebIdDocument(session: Session): Promise<WebIdDocument>;
  /**
   * Study as a guest, without logging in (docs/guest-mode.md): in a pod on
   * this device, with an instance named `instanceName` made in it when it
   * has none. The guest's session.
   */
  startGuest(instanceName: string): Promise<Session>;
  /** Delete everything the guest studied on this device. */
  discardGuest(): Promise<void>;
  /** What a guest studied on this device; null when no guest did. */
  findGuestStudy(): Promise<GuestStudy | null>;
  /**
   * Keep a guest's study in the pod the user logged in to (domain/guest.ts):
   * the guest's instance is copied into `containerUrl`, made the user's,
   * checked, and registered in their type index; then deleted from the
   * device. A failure before the registration deletes the copy and leaves
   * the guest's study as it was.
   */
  transferGuestStudy(
    session: Session,
    guestInstance: Instance,
    target: { containerUrl: string; registrationTarget: RegistrationTarget },
    onProgress?: (progress: GuestTransferProgress) => void,
  ): Promise<GuestTransferOutcome>;
  /**
   * What adding the guest's study to `target`, an instance the user has,
   * would add (domain/guest.ts GuestMergePlan): the guest's decks, each
   * with the target's decks from the same library release, and how many
   * drafts the guest wrote, which are copied too. Reads only.
   */
  planGuestMerge(guestInstance: Instance, target: Instance): Promise<GuestMergePlan>;
  /**
   * Keep a guest's study in an instance the user has (docs/guest-mode.md
   * "Adding to an instance"): the guest's study is read and checked, then
   * each of its decks (but those in `skip`, by URL) is added to `target`
   * as a new deck — its cards and review states, then its catalog entry,
   * then its answers — the guest's deck groups made around them, each of
   * the guest's drafts copied (copyReleaseDraft: under its name, or the
   * next one free, never over a draft the instance has), and,
   * once the guest's study is found unchanged since it was read, it is
   * deleted from the device. The target's preferences stay; the guest's
   * are not carried over. A failure leaves every deck added whole, and
   * the guest's study as it was; run again, a deck or draft already
   * added from this device, and unchanged since, is not added twice.
   */
  mergeGuestStudy(
    session: Session,
    guestInstance: Instance,
    target: Instance,
    options?: { skip?: readonly string[] },
    onProgress?: (progress: GuestMergeProgress) => void,
  ): Promise<GuestMergeOutcome>;
  /**
   * The partial copy of the guest's instance that a move into a new
   * folder (transferGuestStudy), cut off half-way by a closed tab, left
   * behind, as this browser noted it; null when there is none (any more).
   */
  findInterruptedGuestMove(instance: Instance): Promise<string | null>;
  /** Delete the partial copy an interrupted move left behind, and forget it. */
  removeInterruptedGuestMove(instance: Instance): Promise<void>;
}

/**
 * Holds in this page what a guest's move another page runs copies, and
 * the copy, for as long as it runs (not as long as its journal entry,
 * which a failed move leaves). Two apps on one origin (the web app and
 * the Studio) thus never write to what the other is moving. Tells
 * whether a move of the URL runs elsewhere.
 */
function fenceMovesElsewhere(
  journal: UpdateJournal,
  fence: WriteFence,
): (sourceUrl: string) => boolean {
  const held = new Map<string, () => void>();
  journal.watch((sourceUrl, staging) => {
    held.get(sourceUrl)?.();
    held.delete(sourceUrl);
    if (staging === null) return;
    const releases = [sourceUrl, staging].map((url) => fence.hold(url));
    held.set(sourceUrl, () => {
      for (const release of releases) release();
    });
  });
  return (sourceUrl) => held.has(sourceUrl);
}

/**
 * Who studies (docs/authentication.md, docs/guest-mode.md): a login and
 * its session, the account behind it, and a guest, who studies without
 * logging in, in a pod on this device, and whose study is moved into a
 * user's pod or added to an instance they have.
 */
export function createSessionUseCases({
  sessionGateway,
  storageGateway,
  webIdDocumentRepository,
  guestPod,
  instanceRepository,
  deckRepository,
  reviewStateRepository,
  instanceCopier,
  updateJournal,
  writeFence,
  releaseDraftRepository,
  answerLog,
  answerStore,
  instances,
  checks,
  drafts,
  newId,
}: {
  sessionGateway: SessionGateway;
  storageGateway: StorageGateway;
  webIdDocumentRepository: WebIdDocumentRepository;
  guestPod: GuestPod;
  instanceRepository: InstanceRepository;
  deckRepository: DeckRepository;
  reviewStateRepository: ReviewStateRepository;
  instanceCopier: InstanceCopier;
  updateJournal: UpdateJournal;
  writeFence: WriteFence;
  releaseDraftRepository: ReleaseDraftRepository;
  answerLog: AnswerLog;
  answerStore: Pick<AnswerStore, "flush" | "appendAll">;
  instances: Pick<InstanceUseCases, "createInstance">;
  checks: Pick<InstanceCheckUseCases, "validateInstance">;
  drafts: Pick<ReleaseDraftUseCases, "copyReleaseDraft">;
  newId: () => string;
}): SessionUseCases {
  const runsElsewhere = fenceMovesElsewhere(updateJournal, writeFence);
  /**
   * Copy each resource (below `move.from`) to its place below `move.to`,
   * one by one; the version each was copied at, by resource.
   */
  async function copyResources(
    resources: readonly string[],
    move: ContainerMove,
    onCopied: () => void,
  ): Promise<Map<string, string>> {
    const versions = new Map<string, string>();
    for (const resource of resources) {
      const copy = rebaseIri(resource, move.from, move.to);
      versions.set(resource, await instanceCopier.copyResource(resource, copy, move));
      onCopied();
    }
    return versions;
  }
  /**
   * Throw unless the study can be registered where the user chose: in a
   * type index of theirs already there, or one that can be made in a
   * storage their WebID leads to, never beside the study (typeIndex.ts),
   * so a move that could not end is refused before anything is copied.
   */
  async function ensureRegistrable(webId: string, target: RegistrationTarget): Promise<void> {
    const options = await instanceRepository.getRegistrationOptions(webId);
    const exists = target === "private" ? options.privateIndexExists : options.publicIndexExists;
    if (!exists && (await storageGateway.discoverStorages(webId)).length === 0) {
      throw new AppError("typeIndexNoStorage", { webId });
    }
  }
  /**
   * Throw unless the container still lists the same resources (`listed`
   * lists them as they were listed), each at the version it was copied at.
   */
  async function ensureUnchanged(
    listed: () => Promise<string[]>,
    resources: readonly string[],
    versions: ReadonlyMap<string, string>,
    onChecked: () => void,
  ): Promise<void> {
    if ((await listed()).join("\n") !== resources.join("\n")) {
      throw new AppError("instanceChangedDuringCopy");
    }
    onChecked();
    for (const resource of resources) {
      if (!(await instanceCopier.isUnchanged(resource, versions.get(resource)!))) {
        throw new AppError("resourceChangedDuringCopy", { url: resource });
      }
      onChecked();
    }
  }
  /**
   * Delete a copy that failed half-way, when one was made; whether nothing
   * is left of it. Whole: the copy's container was free when this app
   * created it, and nothing names it yet, so all it holds is this app's
   * copies, the originals left where they were. The journal's note goes
   * with it, but only one this run wrote (`begun`): a run that failed
   * before, at a target already taken, leaves the note of an earlier,
   * interrupted move, whose copy is still to remove.
   */
  async function removeCopy(
    source: string,
    target: string,
    { begun, created }: { begun: boolean; created: boolean },
  ): Promise<boolean> {
    let cleanedUp = !created;
    if (created) {
      cleanedUp = await instanceCopier.deleteRecursively(target).then(
        () => true,
        () => false,
      );
    }
    if (cleanedUp && begun) updateJournal.end(source);
    return cleanedUp;
  }
  /** The guest's instance, and the whole guest pod once it has no instance left. */
  async function removeGuestInstance(instance: Instance): Promise<void> {
    await instanceRepository.deleteInstance({ webId: GUEST_WEBID, instance });
    if ((await instanceRepository.listInstances(GUEST_WEBID)).length === 0)
      await guestPod.discard();
  }
  /**
   * Add a guest's deck to the instance as a new deck, whole: its cards
   * document, then its reviews document (each created only where nothing
   * is), then its catalog entry, the write that makes it a deck of the
   * instance. A failure before the entry deletes the documents it wrote
   * (and one whose write may have been made, its answer lost), which
   * nothing names, never one the pod refused to create; unless the entry
   * was written after all, its answer lost on the way: then the deck is
   * there, whole.
   */
  async function addGuestDeck(guest: Deck, instanceUrl: string): Promise<Deck> {
    const deck = mergedDeck(guest, instanceUrl, `deck-${newId()}`, DECK_FORMAT_VERSION);
    const [cards, states] = await Promise.all([
      deckRepository.listCards(guest),
      reviewStateRepository.listReviewStates(guest),
    ]);
    // A card is written by its fragment id, in this app's format, at the time it was made.
    const content = cards.map(({ url: _url, formatVersion: _formatVersion, ...card }) => card);
    if (mentionsGuest([deck, content, states]))
      throw new AppError("guestUrlsLeft", { url: deck.url });
    const written: string[] = [];
    const create = async (url: string, write: () => Promise<void>) => {
      try {
        await write();
      } catch (error) {
        if (!unsent(error)) written.push(url);
        throw error;
      }
      written.push(url);
    };
    try {
      // One PUT of the whole document: a PATCH of much text can be cut short (docs/testing.md).
      if (content.length > 0) {
        await create(deck.cardsDocumentUrl, () =>
          deckRepository.applyCardChanges(deck, { save: content, remove: [] }, { whole: true }),
        );
      }
      if (states.sm2.length + states.fsrs.length > 0) {
        await create(deck.reviewsDocumentUrl, () =>
          reviewStateRepository.createReviewStates(deck, states),
        );
      }
      return await deckRepository.addDeck(deck);
    } catch (error) {
      const entry = unsent(error)
        ? null
        : await deckRepository.readDeck(deck.url).catch(() => null);
      if (entry !== null) return entry;
      for (const url of written)
        await deckRepository.deleteDocument(deck, url).catch(() => undefined);
      throw error;
    }
  }
  /** Throw unless the guest's study conforms, none of it written by a newer version of this app. */
  async function ensureGuestStudyReadable(source: string): Promise<void> {
    const report = await checks.validateInstance(source);
    if (!report.conforms) throw new AppError("guestStudyInvalid", { count: report.violationCount });
    if (
      report.documents.some((document) =>
        document.subjects.some((subject) => subject.status === "newer"),
      )
    ) {
      throw new AppError("guestStudyTooNew");
    }
  }
  /**
   * The copy of a guest's deck or draft that a run from this device made
   * before (its journal note under `key`), when the note's stamp is `stamp`
   * and the copy is still among `existing`; otherwise a new copy, noted.
   */
  async function journaledGuestCopy<T extends { url: string }>(
    key: string,
    stamp: string,
    existing: readonly T[],
    copy: () => Promise<T>,
  ): Promise<T> {
    const note = decodeGuestMergeNote(updateJournal.staging(key));
    const before =
      note?.stamp === stamp ? existing.find((candidate) => candidate.url === note.url) : undefined;
    if (before !== undefined) return before;
    const made = await copy();
    updateJournal.begin(key, encodeGuestMergeNote({ url: made.url, stamp }));
    return made;
  }
  /**
   * Throw unless the guest's study still lists the same documents (`listed`
   * lists them as they were listed), each at the version it was read at.
   */
  async function ensureGuestStudyUnchanged(
    listed: () => Promise<string[]>,
    resources: readonly string[],
    versions: ReadonlyMap<string, string | null>,
    onChecked: () => void,
  ): Promise<void> {
    if ((await listed()).join("\n") !== resources.join("\n"))
      throw new AppError("guestStudyChanged");
    onChecked();
    for (const [url, version] of versions) {
      if ((await instanceCopier.versionOf(url)) !== version)
        throw new AppError("guestStudyChanged", { url });
      onChecked();
    }
  }

  return {
    async restoreSession() {
      const established = await sessionGateway.restore();
      if (established !== null) return established;
      return (await guestPod.exists()) ? { session: GUEST_SESSION, origin: "restored" } : null;
    },
    async loginWithWebId(webId) {
      const validation = validateWebId(webId);
      if (!validation.ok) {
        throw validation.error;
      }
      return sessionGateway.login(validation.webId);
    },
    async loginWithProvider(oidcIssuer) {
      if (!isSecureUrl(oidcIssuer)) {
        throw new AppError("providerNotHttps");
      }
      return sessionGateway.loginWithIssuer(oidcIssuer);
    },
    logout() {
      return sessionGateway.logout();
    },
    onSessionExpired(listener) {
      return sessionGateway.onSessionExpired(listener);
    },
    async discoverAccount(session) {
      const [storages, oidcIssuer, name] = await Promise.all([
        storageGateway.discoverStorages(session.webId),
        // A guest logs in nowhere; their WebID is not on the network to be asked.
        session.guest === true
          ? undefined
          : sessionGateway.discoverOidcIssuer(session.webId).catch(() => undefined),
        webIdDocumentRepository
          .fetchWebIdDocument(session.webId)
          .then((document) => profileNameOf(document, session.webId))
          .catch(() => undefined),
      ]);
      return { webId: session.webId, name, podUrl: storages[0]?.url, oidcIssuer };
    },
    viewWebIdDocument(session) {
      return webIdDocumentRepository.fetchWebIdDocument(session.webId);
    },
    async startGuest(instanceName) {
      await guestPod.start();
      if ((await instanceRepository.listInstances(GUEST_WEBID)).length === 0) {
        await instances.createInstance(GUEST_SESSION, {
          containerUrl: GUEST_INSTANCE_URL,
          name: instanceName,
          registrationTarget: "private",
        });
      }
      return GUEST_SESSION;
    },
    discardGuest() {
      return guestPod.discard();
    },
    async findGuestStudy() {
      if (!(await guestPod.exists())) return null;
      const instances = await instanceRepository.listInstances(GUEST_WEBID);
      return {
        instances: await Promise.all(
          instances.map(async (instance) => ({
            instance,
            deckCount: (await deckRepository.listDecks(instance.url)).length,
          })),
        ),
      };
    },
    async transferGuestStudy(
      session,
      guestInstance,
      { containerUrl, registrationTarget },
      onProgress = () => undefined,
    ) {
      const source = ensureTrailingSlash(guestInstance.url);
      // As a request would send it, as a created instance's address is.
      const target = instanceAddressOf(containerUrl.trim());
      if (session.guest === true || !isGuestUrl(source) || isGuestUrl(target)) {
        throw new Error(
          "A guest's study moves from the guest's pod into the pod of a user who logged in.",
        );
      }
      const move = { from: source, to: target, renames: { [GUEST_WEBID]: session.webId } };
      const progress = stepReporter<GuestTransferStep>(
        "stage",
        GUEST_TRANSFER_STEPS.length,
        onProgress,
      );
      // The digest is what this device learned of the guest's pod's versions: the user's pod starts its own.
      const digest = digestUrlOf(source);
      const listed = async () =>
        (await instanceCopier.listResources(source)).filter((url) => url !== digest);
      // Answers still on their way to the guest's log go there first, to move with it.
      await answerStore.flush();
      let begun = false;
      let created = false;
      let instance: Instance;
      const release = writeFence.hold(source);
      const stopRunning = updateJournal.run(source);
      try {
        // Listing the guest's instance, making sure the target is free, creating it.
        progress.start(3);
        await ensureRegistrable(session.webId, registrationTarget);
        const resources = await listed();
        progress.stepped();
        await instanceCopier.ensureAbsent(target);
        progress.stepped();
        updateJournal.begin(source, target);
        begun = true;
        await instanceCopier.createContainer(target);
        created = true;
        progress.finished("copy", resources.length);
        const versions = await copyResources(resources, move, () => progress.stepped());
        // The catalog's publisher, named as the user's profile names them; then nothing may name the guest's pod.
        const documents = resources
          .filter((url) => !url.endsWith("/"))
          .map((url) => rebaseIri(url, source, target));
        progress.finished("adopt", documents.length + 1);
        const catalog = await deckRepository.readCatalog(target);
        if (catalog !== null) {
          await deckRepository.saveCatalog(target, {
            ...catalog,
            publisher: (await catalogOf(webIdDocumentRepository, session, catalog.title)).publisher,
          });
        }
        progress.stepped();
        for (const url of documents) {
          if (await instanceCopier.mentions(url, GUEST_ORIGIN))
            throw new AppError("guestUrlsLeft", { url });
          progress.stepped();
        }
        progress.finished("validate");
        const report = await checks.validateInstance(target, (count, of) =>
          progress.partly(count, of),
        );
        if (!report.conforms) {
          throw new AppError("movedCopyInvalid", { count: report.violationCount });
        }
        // Listing the guest's instance again, then each of its resources.
        progress.finished("verify", resources.length + 1);
        await ensureUnchanged(listed, resources, versions, () => progress.stepped());
        progress.finished("register");
        instance = await instanceRepository.attachInstance({
          webId: session.webId,
          instanceUrl: target,
          registrationTarget,
        });
      } catch (error) {
        const cleanedUp = await removeCopy(source, target, { begun, created });
        return {
          ok: false,
          step: progress.step(),
          error,
          cleanedUp,
          ...(cleanedUp ? {} : { leftoverUrl: target }),
        };
      } finally {
        stopRunning();
        release();
      }
      // The study is the user's now: what follows only tidies.
      progress.finished("tidy");
      updateJournal.end(source);
      const tidied = await (async () => {
        // The registrations of each class of its data let other apps find it; the instance works without, and Preferences adds them later.
        await instanceRepository
          .registerDataClasses({ webId: session.webId, instanceUrl: target, title: instance.name })
          .catch(() => undefined);
        await removeGuestInstance(guestInstance);
      })().then(
        () => true,
        () => false,
      );
      progress.finished();
      return { ok: true, instance, tidied };
    },
    async planGuestMerge(guestInstance, target) {
      const [guestDecks, targetDecks, drafts] = await Promise.all([
        deckRepository.listDecks(guestInstance.url),
        deckRepository.listDecks(target.url),
        releaseDraftRepository.list(guestInstance.url),
      ]);
      return guestMergePlan(guestDecks, targetDecks, drafts.length);
    },
    async mergeGuestStudy(
      session,
      guestInstance,
      target,
      { skip = [] } = {},
      onProgress = () => undefined,
    ) {
      const source = ensureTrailingSlash(guestInstance.url);
      const targetUrl = ensureTrailingSlash(target.url);
      if (session.guest === true || !isGuestUrl(source) || isGuestUrl(targetUrl)) {
        throw new Error(
          "A guest's study is added from the guest's pod to an instance of a user who logged in.",
        );
      }
      const progress = stepReporter<GuestMergeStep>("read", GUEST_MERGE_STEPS.length, onProgress);
      // The digest is what this device learned of the guest's pod's versions: it is not the guest's study.
      const digest = digestUrlOf(source);
      const listed = async () =>
        (await instanceCopier.listResources(source)).filter((url) => url !== digest);
      const versionsOf = async (resources: readonly string[]) =>
        new Map(
          await Promise.all(
            resources
              .filter((url) => !url.endsWith("/"))
              .map(async (url) => [url, await instanceCopier.versionOf(url)] as const),
          ),
        );
      // Answers still on their way to the guest's log go there first, to be added with it.
      await answerStore.flush();
      const added: Deck[] = [];
      const copied: ReleaseDraftSummary[] = [];
      const notes: string[] = [];
      const release = writeFence.hold(source);
      try {
        // What the guest's study holds, at what version, before any of it is read; then all of it, checked.
        progress.start(2);
        const resources = await listed();
        const versions = await versionsOf(resources);
        await ensureGuestStudyReadable(source);
        progress.stepped();
        const [decks, tree, months, targetDecks, targetTree, guestDrafts, targetDrafts] =
          await Promise.all([
            deckRepository.listDecks(source),
            deckRepository.readDeckTree(source),
            answerLog.months(source),
            deckRepository.listDecks(targetUrl),
            deckRepository.readDeckTree(targetUrl),
            releaseDraftRepository.list(source),
            releaseDraftRepository.list(targetUrl),
          ]);
        // Groups to make in an arrangement a newer version wrote could not be: refused before anything is written.
        if (targetTree.readOnly && tree.children.some((node) => node.kind === "group"))
          throw new AppError("deckTreeTooNew");
        const answers = (
          await Promise.all(months.map((month) => answerLog.readMonth(source, month)))
        ).flat();
        const chosen = decks.filter((deck) => !skip.includes(deck.url));

        // Each deck whole, one after another: its documents, its entry, then its answers.
        progress.finished("decks", chosen.length);
        const into = new Map<string, Deck>();
        for (const deck of chosen) {
          const key = guestMergeKey(deck.url, targetUrl);
          const stamp = guestDeckStamp(deck, (url) => versions.get(url) ?? "");
          // Added from this device before, its entry and documents unchanged since: there it is.
          const merged = await journaledGuestCopy(key, stamp, targetDecks, () =>
            addGuestDeck(deck, targetUrl),
          );
          notes.push(key);
          into.set(deck.url, merged);
          added.push(merged);
          await answerStore.appendAll(
            targetUrl,
            answers
              .filter((answer) => answer.deckUrl === deck.url)
              .map((answer) => mergedAnswer(answer, merged)),
          );
          progress.stepped();
        }

        // The guest's groups, new, around the decks added; each under the URL an earlier run gave it, if that run arranged the same.
        progress.finished("arrange");
        const arrangement = JSON.stringify(graftOfGuestTree(tree, into, (group) => group.url));
        const nodes = graftOfGuestTree(tree, into, (group) => {
          const key = guestMergeKey(group.url, targetUrl);
          const note = decodeGuestMergeNote(updateJournal.staging(key));
          const url = note?.stamp === arrangement ? note.url : deckGroupUrlOf(targetUrl, newId());
          updateJournal.begin(key, encodeGuestMergeNote({ url, stamp: arrangement }));
          notes.push(key);
          return url;
        });
        if (nodes.length > 0)
          await deckRepository.editDeckTree(targetUrl, { kind: "graft", nodes });

        // Each draft copied whole, under its name or the next free one; again only when its documents changed since.
        progress.finished("drafts", guestDrafts.length);
        for (const draft of guestDrafts) {
          const key = guestMergeKey(draft.url, targetUrl);
          const container = draftContainerOf(draft.url);
          const stamp = [...versions]
            .filter(([url]) => url.startsWith(container))
            .map(([url, version]) => `${url} ${version}`)
            .join("\n");
          // Copied from this device before, its documents unchanged since, and the copy still there: there it is.
          const copy = await journaledGuestCopy(key, stamp, targetDrafts, () =>
            drafts.copyReleaseDraft(draft.url, targetUrl),
          );
          notes.push(key);
          copied.push(copy);
          progress.stepped();
        }

        // Listing the guest's study again, then each of its documents: what was added is what it holds.
        progress.finished("verify", versions.size + 1);
        await ensureGuestStudyUnchanged(listed, resources, versions, () => progress.stepped());
      } catch (error) {
        return { ok: false, instance: target, step: progress.step(), error, added, copied };
      } finally {
        release();
      }
      // The study is in the instance now: what follows only tidies.
      progress.finished("tidy");
      const tidied = await removeGuestInstance(guestInstance).then(
        () => true,
        () => false,
      );
      // The notes would keep a deck from being added twice, while the guest's study is still here.
      if (tidied) for (const key of notes) updateJournal.end(key);
      progress.finished();
      return { ok: true, instance: target, added, tidied };
    },
    async findInterruptedGuestMove(instance) {
      const source = ensureTrailingSlash(instance.url);
      // Only a guest's study moves; a note on another instance is an earlier version's, and its folder is left alone.
      if (!isGuestUrl(source)) return null;
      const staging = updateJournal.staging(source);
      // A move another page runs is not interrupted, however long it takes.
      if (staging === null || runsElsewhere(source)) return null;
      const gone = await instanceCopier.ensureAbsent(staging).then(
        () => true,
        () => false,
      );
      if (gone) updateJournal.end(source);
      return gone ? null : staging;
    },
    async removeInterruptedGuestMove(instance) {
      const source = ensureTrailingSlash(instance.url);
      if (!isGuestUrl(source)) return;
      // The copy of a move another page runs is that move's to remove.
      if (runsElsewhere(source)) throw new AppError("guestStudyBeingMoved", { container: source });
      const staging = updateJournal.staging(source);
      // Made whole by that move, at a URL it found free, and named nowhere: deleted whole.
      if (staging !== null) await instanceCopier.deleteRecursively(staging);
      updateJournal.end(source);
    },
  };
}
