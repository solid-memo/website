// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { AppError } from "@solid-memo/domain/appError";
import { isGuestUrl } from "@solid-memo/domain/guest";
import { draftPlaceOf } from "@solid-memo/domain/release/draftLayout";
import type { MarkdownCheck } from "@solid-memo/domain/release/markdownFields";
import { checkProblems, libraryReleaseUrl } from "@solid-memo/domain/release/releaseCheck";
import { releaseFileName } from "@solid-memo/domain/release/releasePlace";
import { catalogUrlOf, isDocumentIn } from "@solid-memo/domain/instanceLayout";
import type {
  DeckLibrary,
  FileExchange,
  ReleaseDraftRepository,
  ReleasePublisher,
  ShapeValidator,
  StorageGateway,
} from "./ports";
import type { ReleaseDraftUseCases } from "./releaseDrafts";

/**
 * Releasing a draft (docs/studio.md, Publishing a release): published
 * in the creator's pod, one Turtle document readable by everyone, or
 * saved as a file, to send to the library. A release is frozen: it is
 * written once, never over another, and the draft it was made of is
 * then no longer changed.
 */

/** A release the instance published: where, and whether someone with no login can read it. */
export interface PublishedRelease {
  url: string;
  public: boolean;
}

/** A release saved as a file: the file's name, and the address the release states as its own. */
export interface SavedRelease {
  name: string;
  url: string;
}

export interface ReleasePublishingUseCases {
  /**
   * Publish the draft at `targetUrl` in the pod: checked first, as a
   * release in a pod is (its rules, Markdown and shapes, the shapes as
   * the release it is at `targetUrl`; an error stops it,
   * releaseHasErrors), made one Turtle document there (assemble),
   * written only where nothing is (releaseTaken), made readable by
   * everyone and linked from the catalog; then the draft is marked
   * released (`sm:releasedAs`), and no longer changed. The draft is
   * read once, and checked, made a release and marked released as it was
   * then: changed elsewhere since, it is changedElsewhere, before the
   * release is written or after, the draft then left unmarked. A
   * publishing cut short after the release is written is finished by
   * publishing again at the same address, the draft unchanged: the
   * release there is this one (ReleasePublisher.publish), unless another
   * of the instance's drafts names it as its release (releaseTaken). A release the
   * pod would not make public is published all the same, readable by its
   * owner alone (`public` false), until makeReleasePublic. A draft
   * released already is draftReleased; a guest's, guestCannotPublish.
   */
  publishRelease(
    draftUrl: string,
    targetUrl: string,
    markdownCheck: MarkdownCheck,
  ): Promise<PublishedRelease>;
  /**
   * Make a release the instance published readable by everyone, again;
   * publicAccessRefused when the pod will not, when it is not one the
   * instance's catalog lists, and when it is neither in the instance nor
   * in a storage of the user's (those of `webId`) that the instance is
   * in: an instance attached from someone else's pod may list a release
   * of the user's own that was kept from everyone.
   */
  makeReleasePublic(instanceUrl: string, url: string, webId: string): Promise<void>;
  /** Whether someone with no login can read the release at `url`. */
  isReleasePublic(url: string): Promise<boolean>;
  /**
   * Save the draft as a release file (`<name>-v<N>.ttl`), stating
   * `targetUrl` as its address, the library's by default: where the
   * library would publish it (libraryReleaseUrl), to send as a pull
   * request to `decks/`. Nothing is checked or written in the pod.
   */
  downloadRelease(draftUrl: string, targetUrl?: string): Promise<SavedRelease>;
  /** The releases the instance published, as its catalog links them, each with whether it is public. */
  listPublishedReleases(instanceUrl: string): Promise<PublishedRelease[]>;
}

export function createReleasePublishingUseCases({
  drafts,
  releaseDraftRepository,
  releasePublisher,
  shapeValidator,
  deckLibrary,
  fileExchange,
  storageGateway,
  now,
}: {
  drafts: Pick<ReleaseDraftUseCases, "readReleaseDraft" | "checkReleaseDraft">;
  releaseDraftRepository: ReleaseDraftRepository;
  releasePublisher: ReleasePublisher;
  shapeValidator: Pick<ShapeValidator, "validateRelease">;
  deckLibrary: DeckLibrary;
  fileExchange: FileExchange;
  storageGateway: Pick<StorageGateway, "discoverStorages">;
  now: () => Date;
}): ReleasePublishingUseCases {
  /**
   * Whether the release at `url` is the instance's to make public: in
   * the instance, or in one of the user's storages the instance is in
   * too, each as a request sends the address. None, when they cannot be
   * found.
   */
  async function isInInstancePod(instanceUrl: string, url: string, webId: string) {
    if (isDocumentIn(url, instanceUrl)) return true;
    const storages = await storageGateway.discoverStorages(webId).catch(() => []);
    return storages.some(
      (storage) =>
        isDocumentIn(url, storage.url) && isDocumentIn(catalogUrlOf(instanceUrl), storage.url),
    );
  }

  return {
    async publishRelease(draftUrl, targetUrl, markdownCheck) {
      if (isGuestUrl(draftUrl)) throw new AppError("guestCannotPublish");
      // Read once: what is checked is what is published, and what is marked released.
      const { draft, version } = await drafts.readReleaseDraft(draftUrl);
      if (draft.root.releasedAs !== undefined)
        throw new AppError("draftReleased", { url: draft.root.releasedAs });
      // The shapes of the release where it is published: what it states there is what is checked (GHSA-p2pr-x6fw-hrfx).
      const [check, shapes] = await Promise.all([
        drafts.checkReleaseDraft(draft, markdownCheck, "pod"),
        shapeValidator.validateRelease(draft, targetUrl),
      ]);
      const errors = [...checkProblems(check), ...shapes].filter(
        (one) => one.severity === "error",
      ).length;
      if (errors > 0) throw new AppError("releaseHasErrors", { count: errors });
      // A draft names the instance it is in.
      const { instanceUrl } = draftPlaceOf(draftUrl)!;
      // Another draft's release is that draft's, though this one would state the same: never finished as this one's.
      if (
        (await releaseDraftRepository.list(instanceUrl)).some((one) => one.releasedAs === targetUrl)
      )
        throw new AppError("releaseTaken", { url: targetUrl });
      const turtle = await releaseDraftRepository.assemble(
        draftUrl,
        targetUrl,
        now().toISOString(),
        version,
      );
      const { public: shared } = await releasePublisher.publish(instanceUrl, turtle, targetUrl);
      await releaseDraftRepository.applyChanges(
        draft,
        { ...draft, root: { ...draft.root, releasedAs: targetUrl } },
        version,
      );
      return { url: targetUrl, public: shared };
    },

    async makeReleasePublic(instanceUrl, url, webId) {
      if (!(await isInInstancePod(instanceUrl, url, webId)))
        throw new AppError("publicAccessRefused", { url });
      return releasePublisher.makePublic(instanceUrl, url);
    },

    isReleasePublic(url) {
      return releasePublisher.isPublic(url);
    },

    async downloadRelease(draftUrl, targetUrl) {
      const { name, version } = draftPlaceOf(draftUrl)!;
      const url =
        targetUrl ?? libraryReleaseUrl((await deckLibrary.readLibraryIndex()).url, name, version);
      const turtle = await releaseDraftRepository.assemble(draftUrl, url, now().toISOString());
      const file = releaseFileName(name, version);
      fileExchange.save(file, "text/turtle", turtle);
      return { name: file, url };
    },

    async listPublishedReleases(instanceUrl) {
      const urls = await releasePublisher.listPublished(instanceUrl);
      return Promise.all(
        urls.map(async (url) => ({ url, public: await releasePublisher.isPublic(url) })),
      );
    },
  };
}
