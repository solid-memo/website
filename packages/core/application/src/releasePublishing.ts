// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { AppError } from "@solid-memo/domain/appError";
import { isGuestUrl } from "@solid-memo/domain/guest";
import { draftPlaceOf } from "@solid-memo/domain/release/draftLayout";
import type { MarkdownCheck } from "@solid-memo/domain/release/markdownFields";
import { checkProblems, libraryReleaseUrl } from "@solid-memo/domain/release/releaseCheck";
import { releaseFileName } from "@solid-memo/domain/release/releasePlace";
import type { ShapeValidator } from "./ports/checks";
import type { FileExchange } from "./ports/device";
import type { DeckLibrary, ReleaseDraftRepository, ReleasePublisher } from "./ports/library";
import type { ReadScope } from "./readScope";
import { followedAsNoOne, type ReleaseDraftUseCases } from "./releaseDrafts";
import { mapAtOnce } from "./atOnce";

/**
 * Releasing a draft (docs/studio.md, Publishing a release): published
 * in the creator's pod, one Turtle document readable by everyone, or
 * saved as a file, to send to the library. A release is frozen: it is
 * written once, never over another, and the draft it was made of is
 * then no longer changed.
 */

/**
 * A release the instance published: where, and whether someone with no
 * login can read it; null when it is not asked, the release being on
 * another origin than the instance (listPublishedReleases).
 */
export interface PublishedRelease {
  url: string;
  public: boolean | null;
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
   * release is written or after, the draft then left unmarked. A draft
   * a newer app wrote, its root as well, is refused as it is read
   * (writtenByNewerApp): it could not be marked released. A
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
   * instance's catalog lists, and when it is not the instance's
   * (ReadScope.isInstances): neither in the instance nor in a storage of
   * the signed-in user's that the instance is in. An instance attached from someone else's pod may list a release
   * of the user's own that was kept from everyone.
   */
  makeReleasePublic(instanceUrl: string, url: string): Promise<void>;
  /** Whether someone with no login can read the release at `url`. */
  isReleasePublic(url: string): Promise<boolean>;
  /**
   * Save the draft as a release file (`<name>-v<N>.ttl`), stating
   * `targetUrl` as its address, the library's by default: where the
   * library would publish it (libraryReleaseUrl), to send as a pull
   * request to `decks/`. Nothing is checked or written in the pod.
   */
  downloadRelease(draftUrl: string, targetUrl?: string): Promise<SavedRelease>;
  /**
   * The releases the instance published, as its catalog links them, each
   * with whether it is public, asked a few at a time. Only of one on the
   * instance's origin: the catalog is data anyone may have written, and
   * a release elsewhere is not the instance's to make public
   * (makeReleasePublic) either.
   */
  listPublishedReleases(instanceUrl: string): Promise<PublishedRelease[]>;
}

export function createReleasePublishingUseCases({
  drafts,
  releaseDraftRepository,
  releasePublisher,
  shapeValidator,
  deckLibrary,
  fileExchange,
  readScope,
  now,
}: {
  drafts: Pick<ReleaseDraftUseCases, "readReleaseDraft" | "checkReleaseDraft">;
  releaseDraftRepository: ReleaseDraftRepository;
  releasePublisher: ReleasePublisher;
  shapeValidator: Pick<ShapeValidator, "validateRelease">;
  deckLibrary: DeckLibrary;
  fileExchange: FileExchange;
  /** Whose a release is: one a draft follows is read as the user, and one is made public, only when it is the instance's. */
  readScope: Pick<ReadScope, "isInstances">;
  now: () => Date;
}): ReleasePublishingUseCases {
  /** Read the release the draft at `draftUrl` follows as the user only when it is the instance's (followedAsNoOne). */
  const followedAsUser = (draftUrl: string) => async (prev: string) =>
    !(await followedAsNoOne(readScope, draftUrl, prev));

  return {
    async publishRelease(draftUrl, targetUrl, markdownCheck) {
      if (isGuestUrl(draftUrl)) throw new AppError("guestCannotPublish");
      // Read once: what is checked is what is published (assembled from
      // this read, not read again), and what is marked released.
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
        { followedAsUser: followedAsUser(draftUrl) },
      );
      const { public: shared } = await releasePublisher.publish(instanceUrl, turtle, targetUrl);
      await releaseDraftRepository.applyChanges(
        draft,
        { ...draft, root: { ...draft.root, releasedAs: targetUrl } },
        version,
      );
      return { url: targetUrl, public: shared };
    },

    async makeReleasePublic(instanceUrl, url) {
      if (!(await readScope.isInstances(instanceUrl, url)))
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
      const turtle = await releaseDraftRepository.assemble(
        draftUrl,
        url,
        now().toISOString(),
        undefined,
        { followedAsUser: followedAsUser(draftUrl) },
      );
      const file = releaseFileName(name, version);
      fileExchange.save(file, "text/turtle", turtle);
      return { name: file, url };
    },

    async listPublishedReleases(instanceUrl) {
      const urls = await releasePublisher.listPublished(instanceUrl);
      const origin = new URL(instanceUrl).origin;
      return mapAtOnce(urls, async (url) => ({
        url,
        public: new URL(url).origin === origin ? await releasePublisher.isPublic(url) : null,
      }));
    },
  };
}
