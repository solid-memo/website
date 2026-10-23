// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { profileNameOf } from "@solid-memo/domain/account";
import {
  defaultCatalogDescription,
  describedCatalog,
  renamedCatalog,
  type Catalog,
  type CatalogAbout,
} from "@solid-memo/domain/catalog";
import {
  UPDATE_STEPS,
  type UpdateDocument,
  type UpdateFailure,
  type UpdateOutcome,
  type UpdateProgress,
  type UpdateStep,
} from "@solid-memo/domain/instanceUpdate";
import {
  instanceName,
  type DataClassRegistrations,
  type Instance,
  type InstanceDeletion,
  type RegistrationOptions,
  type RegistrationTarget,
} from "@solid-memo/domain/instance";
import { planMigration, type MigrationPlan } from "@solid-memo/domain/migration";
import {
  catalogUrlOf,
  ensureTrailingSlash,
  metaUrlOf,
  preferencesUrlOf,
} from "@solid-memo/domain/instanceLayout";
import { NEW_INSTANCE_PREFERENCES } from "@solid-memo/domain/preferences";
import type { Session } from "@solid-memo/domain/session";
import type { Storage } from "@solid-memo/domain/storage";
import type {
  DeckRepository,
  InstanceRepository,
  PreferencesRepository,
  ReviewStateRepository,
  StorageGateway,
  WebIdDocumentRepository,
} from "./ports";
import { AppError } from "@solid-memo/domain/appError";
import { again } from "./writes";
import { stepReporter } from "./progress";
import type { PreferenceStore } from "./preferenceStore";
import type { DigestStore } from "./digestStore";

export interface InstanceUseCases {
  listStorages(session: Session): Promise<Storage[]>;
  addManualStorage(url: string): Promise<Storage>;
  listInstances(session: Session): Promise<Instance[]>;
  getRegistrationOptions(session: Session): Promise<RegistrationOptions>;
  /**
   * Make an instance: its meta document and registrations, its catalog,
   * and its preferences, new ones (NEW_INSTANCE_PREFERENCES) with the
   * theme, the palette and the text size this device shows, so it
   * studies by FSRS-6.
   */
  createInstance(
    session: Session,
    args: {
      containerUrl: string;
      name: string;
      registrationTarget: RegistrationTarget;
    },
  ): Promise<Instance>;
  attachInstanceByUrl(
    session: Session,
    instanceUrl: string,
    registrationTarget: RegistrationTarget,
  ): Promise<Instance>;
  /**
   * Permanently delete an instance: all its decks and cards, and every
   * other document Solid Memo wrote there, then its registrations. Its
   * folder goes too unless it holds what another app put there, or the
   * releases published from it, which are kept, and the result says so.
   */
  deleteInstance(session: Session, instance: Instance): Promise<InstanceDeletion>;
  /**
   * The registrations of the instance's data, one per class, that belong
   * in the user's type indexes, and whether each is there
   * (docs/data-model.md "Discovery chain"): what lets other apps find
   * each kind of it. Reads only.
   */
  dataClassRegistrations(session: Session, instance: Instance): Promise<DataClassRegistrations>;
  /**
   * Add the registrations dataClassRegistrations finds missing, titled
   * with the instance's name. Only on the user's say (or with a new
   * instance, a format update, a guest's study kept as a new instance;
   * adding one to an instance registers nothing): never on opening an
   * instance, where it would add back what the user, or another app,
   * removed.
   */
  registerDataClasses(session: Session, instance: Instance): Promise<void>;
  /**
   * Give an instance a new name (instanceName: trimmed, not empty)
   * everywhere it is kept: its meta document, its catalog's title (and
   * the description, while it is the one the old name gave), and its
   * registrations in the type indexes, the instance's and the
   * catalog's, which name it in the instance list. Each write is made
   * of its document as it is then, and made again from a fresh read
   * when it changed meanwhile, three times in all. The instance as
   * renamed.
   */
  renameInstance(session: Session, instance: Instance, name: string): Promise<Instance>;
  /** The instance's catalog; null when it has none (an instance not updated yet). */
  readCatalog(instanceUrl: string): Promise<Catalog | null>;
  /**
   * Replace the catalog's description and license (describedCatalog),
   * of the catalog as it is now, again from a fresh read when it
   * changed meanwhile, three times in all. Throws noCatalogToUpdate when
   * the instance has no catalog. The catalog as written.
   */
  describeCatalog(instanceUrl: string, about: CatalogAbout): Promise<Catalog>;
  /**
   * What bringing the instance's cards up to this app's format would
   * touch — reads every deck's cards, writes nothing. Empty when there is
   * nothing to migrate.
   */
  planMigration(instanceUrl: string): Promise<MigrationPlan>;
  /**
   * Bring the instance up to this app's formats (docs/migrations.md "The
   * pod migration"), each document on its own, where it is: the documents
   * planMigration finds outdated, read again, one after another, each in
   * ONE write made only if it is still as it was read, its outdated
   * subjects brought up to date from that very read. Only ever run after
   * the user has agreed to the plan. A document that cannot be updated
   * now (changed elsewhere since it was read, refused, unreachable) is
   * left as it is — as it was, or updated when the answer to its write
   * was lost — and named with why; the others go on. Nothing is put back:
   * every document is readable, updated or not, and running it again
   * updates what is still outdated. Once nothing failed, the
   * registrations of the instance's data that are missing are added
   * (registerDataClasses); a failure there leaves the update done. Throws
   * when what is outdated cannot be read: nothing was written.
   */
  updateInstance(
    session: Session,
    instance: Instance,
    onProgress?: (progress: UpdateProgress) => void,
  ): Promise<UpdateOutcome>;
}

/** A document the format update writes, and the writes that bring it up to date, each saying whether it wrote anything. */
interface UpdateItem {
  document: UpdateDocument;
  writes: (() => Promise<boolean>)[];
}

/**
 * A new catalog for an instance: published by the session's owner,
 * named as their profile names them (the WebID when it does not say).
 */
export async function catalogOf(
  webIdDocumentRepository: WebIdDocumentRepository,
  session: Session,
  title: string,
): Promise<Catalog> {
  const name = await webIdDocumentRepository
    .fetchWebIdDocument(session.webId)
    .then((document) => profileNameOf(document, session.webId))
    .catch(() => undefined);
  return {
    title,
    description: defaultCatalogDescription(title),
    publisher: { webId: session.webId, name: name ?? session.webId },
  };
}

/**
 * A user's instances (docs/data-model.md): found in their storages and
 * type indexes, made, attached, named, described and deleted, their data
 * registered for other apps to find, and brought up to this app's
 * formats (docs/migrations.md).
 */
export function createInstanceUseCases({
  storageGateway,
  instanceRepository,
  deckRepository,
  preferencesRepository,
  reviewStateRepository,
  webIdDocumentRepository,
  preferenceStore,
  digestStore,
}: {
  storageGateway: StorageGateway;
  instanceRepository: InstanceRepository;
  deckRepository: DeckRepository;
  preferencesRepository: PreferencesRepository;
  reviewStateRepository: ReviewStateRepository;
  webIdDocumentRepository: WebIdDocumentRepository;
  preferenceStore: Pick<PreferenceStore, "withDeviceAppearance">;
  digestStore: Pick<DigestStore, "of">;
}): InstanceUseCases {
  /**
   * What bringing the instance up to this app's formats would touch: its
   * meta document, preferences and catalog, and every deck's cards and
   * review states. A document still at a version with nothing outdated in
   * it, as the instance's digest says, is not read again. Reads only: the
   * digest's format notes are written by the deck list (getStudyCounts).
   */
  async function planOf(instanceUrl: string): Promise<MigrationPlan> {
    const [instance, preferences, catalog, decks, digest] = await Promise.all([
      instanceRepository.readMeta(instanceUrl),
      preferencesRepository.getPreferences(instanceUrl),
      deckRepository.readCatalog(instanceUrl),
      deckRepository.listDecks(instanceUrl),
      digestStore.of(instanceUrl),
    ]);
    const latestVersion = (url: string) => {
      const receipt = digest.receipts[url];
      return receipt?.latestFormat === true ? receipt.version : undefined;
    };
    const entries = await Promise.all(
      decks.map(async (deck) => {
        const [cards, reviews] = await Promise.all([
          deckRepository.readCardsSince(deck, latestVersion(deck.cardsDocumentUrl)),
          reviewStateRepository.readReviewStatesSince(deck, latestVersion(deck.reviewsDocumentUrl)),
        ]);
        return {
          deck,
          cards: cards.unchanged ? [] : cards.value,
          reviews: reviews.unchanged ? [] : reviews.value.sm2,
        };
      }),
    );
    return planMigration({ instance, preferences, catalog, entries });
  }
  /**
   * The documents the format update brings up to this app's formats, as
   * planOf finds them now, in the order it writes them: the meta document,
   * the preferences, each deck's cards and review states, and last the
   * catalog document (its outdated deck entries, and its catalog when it
   * has none). No order between documents matters to what they say: each
   * subject is brought up to date on its own, and a catalog lists decks
   * of its own document. A document two decks share (another app may point
   * two decks at one) is one item, written for each deck in turn. Each
   * write reads the document afresh, brings its outdated subjects up to
   * date from that very read and writes them in place, only if it is still
   * as read (If-Match); whether it wrote anything (a document brought up
   * to date meanwhile is not written).
   */
  async function updateWork(session: Session, instanceUrl: string): Promise<UpdateItem[]> {
    const plan = await planOf(instanceUrl);
    const work: UpdateItem[] = [];
    const add = (document: UpdateDocument, write: () => Promise<boolean>) => {
      const item = work.find((candidate) => candidate.document.url === document.url);
      if (item === undefined) work.push({ document, writes: [write] });
      else item.writes.push(write);
    };
    if (plan.instanceOutdated) {
      add({ url: metaUrlOf(instanceUrl), holds: "instance" }, () =>
        instanceRepository.upgradeMeta(instanceUrl),
      );
    }
    if (plan.preferencesOutdated) {
      add({ url: preferencesUrlOf(instanceUrl), holds: "preferences" }, () =>
        preferencesRepository.upgradePreferences(instanceUrl),
      );
    }
    for (const { deck, cardCount, reviewCount } of plan.decks) {
      if (cardCount > 0) {
        add({ url: deck.cardsDocumentUrl, holds: "cards", deck: deck.title }, () =>
          deckRepository.upgradeCards(deck),
        );
      }
      if (reviewCount > 0) {
        add({ url: deck.reviewsDocumentUrl, holds: "reviews", deck: deck.title }, () =>
          reviewStateRepository.upgradeReviewStates(deck),
        );
      }
    }
    if (plan.catalogMissing || plan.deckCount > 0) {
      add({ url: catalogUrlOf(instanceUrl), holds: "catalog" }, async () => {
        // A catalog for an instance that has none, named as its record names it, published by the signed-in user.
        const made = plan.catalogMissing
          ? await catalogOf(
              webIdDocumentRepository,
              session,
              (await instanceRepository.readMeta(instanceUrl))?.name ?? instanceUrl,
            )
          : null;
        return deckRepository.upgradeDecks(instanceUrl, made);
      });
    }
    return work;
  }
  async function createInstance(
    session: Session,
    {
      containerUrl,
      name,
      registrationTarget,
    }: { containerUrl: string; name: string; registrationTarget: RegistrationTarget },
  ): Promise<Instance> {
    const instance = await instanceRepository.createInstance({
      webId: session.webId,
      containerUrl: containerUrl.trim(),
      name: name.trim(),
      registrationTarget,
    });
    await deckRepository.saveCatalog(
      instance.url,
      await catalogOf(webIdDocumentRepository, session, instance.name),
    );
    // Stated, so FSRS-6 is this instance's own choice, not a default: one with none stored studies by SM-2.
    await preferencesRepository.savePreferences(
      instance.url,
      preferenceStore.withDeviceAppearance(NEW_INSTANCE_PREFERENCES),
    );
    return instance;
  }
  return {
    listStorages(session) {
      return storageGateway.discoverStorages(session.webId);
    },
    addManualStorage(url) {
      return storageGateway.probeStorage(url.trim());
    },
    listInstances(session) {
      return instanceRepository.listInstances(session.webId);
    },
    getRegistrationOptions(session) {
      return instanceRepository.getRegistrationOptions(session.webId);
    },
    createInstance,
    attachInstanceByUrl(session, instanceUrl, registrationTarget) {
      return instanceRepository.attachInstance({
        webId: session.webId,
        instanceUrl: instanceUrl.trim(),
        registrationTarget,
      });
    },
    deleteInstance(session, instance) {
      return instanceRepository.deleteInstance({
        webId: session.webId,
        instance,
      });
    },
    dataClassRegistrations(session, instance) {
      return instanceRepository.readDataClassRegistrations({
        webId: session.webId,
        instanceUrl: instance.url,
      });
    },
    registerDataClasses(session, instance) {
      return instanceRepository.registerDataClasses({
        webId: session.webId,
        instanceUrl: instance.url,
        title: instance.name,
      });
    },
    async renameInstance(session, instance, typed) {
      const name = instanceName(typed);
      await again(async () => {
        const meta = await instanceRepository.readMeta(instance.url);
        if (meta === null) throw new AppError("noMetaToUpdate", { url: instance.url });
        if (meta.name !== name) await instanceRepository.saveMeta(instance.url, { ...meta, name });
      });
      await again(async () => {
        const catalog = await deckRepository.readCatalog(instance.url);
        if (catalog !== null && catalog.title !== name)
          await deckRepository.saveCatalog(instance.url, renamedCatalog(catalog, name));
      });
      await instanceRepository.renameRegistrations({
        webId: session.webId,
        instanceUrl: instance.url,
        title: name,
      });
      return { ...instance, name };
    },
    readCatalog(instanceUrl) {
      return deckRepository.readCatalog(instanceUrl);
    },
    describeCatalog(instanceUrl, about) {
      return again(async () => {
        const catalog = await deckRepository.readCatalog(instanceUrl);
        if (catalog === null) throw new AppError("noCatalogToUpdate", { url: instanceUrl });
        const described = describedCatalog(catalog, about);
        await deckRepository.saveCatalog(instanceUrl, described);
        return described;
      });
    },
    planMigration: (instanceUrl) => planOf(instanceUrl),
    async updateInstance(session, instance, onProgress = () => undefined) {
      const instanceUrl = ensureTrailingSlash(instance.url);
      const progress = stepReporter<UpdateStep>("read", UPDATE_STEPS.length, onProgress);
      progress.start();
      // Read afresh: part of what the user agreed to may have been updated meanwhile, elsewhere.
      const work = await updateWork(session, instanceUrl);
      progress.finished("write", work.length > 0 ? work.length : undefined);
      const updated: UpdateDocument[] = [];
      const failed: UpdateFailure[] = [];
      for (const { document, writes } of work) {
        // Each document on its own: one that cannot be updated now is left as it is, and the others go on.
        try {
          let wrote = false;
          for (const write of writes) if (await write()) wrote = true;
          if (wrote) updated.push(document);
        } catch (error) {
          failed.push({ ...document, error });
        }
        progress.stepped();
      }
      progress.finished("register");
      // Other apps find each kind of the instance's data by its class; the instance works without, and Preferences adds them later.
      if (failed.length === 0) {
        await instanceRepository
          .registerDataClasses({ webId: session.webId, instanceUrl, title: instance.name })
          .catch(() => undefined);
      }
      progress.finished();
      return { updated, failed };
    },
  };
}
