import { describe, expect, it, vi } from "vitest";
import { AppError } from "@solid-memo/domain/appError";
import { GUEST_INSTANCE_URL } from "@solid-memo/domain/guest";
import { draftUrlOf } from "@solid-memo/domain/release/draftLayout";
import { problem } from "@solid-memo/domain/release/problems";
import type { ReleaseCheck } from "@solid-memo/domain/release/releaseCheck";
import type { ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { courseDraft, DRAFT, NOW } from "@solid-memo/domain/testing/releaseDraft";
import type { DeckLibrary, FileExchange, ReleaseDraftRepository, ReleasePublisher } from "./ports";
import { createReleasePublishingUseCases } from "./releasePublishing";

const INSTANCE = "https://pod.example/solid-memo/main/";
const TARGET = `${INSTANCE}releases/solid/v2.ttl`;
const INDEX = "https://site.example/decks/index.ttl";
const TURTLE = "@base <x> .";
const markdownCheck = { problems: () => [], chunks: () => ({ chunks: 1, empty: 0 }) };

const clean: ReleaseCheck = { rules: [], library: [], drops: [], markdown: [], shapes: [] };

function setUp({ stored = courseDraft() as ReleaseDraft, check = clean, shared = true } = {}) {
  const drafts = {
    readReleaseDraft: vi.fn(async () => ({ draft: stored, version: "v1" })),
    checkReleaseDraft: vi.fn(async () => check),
  };
  const repository = {
    read: vi.fn(async () => ({ draft: stored, version: "v1" })),
    list: vi.fn(async () => [{ url: DRAFT, releasedAs: undefined }]),
    applyChanges: vi.fn(async () => undefined),
    assemble: vi.fn(async () => TURTLE),
  } as unknown as ReleaseDraftRepository & Record<"read" | "list" | "applyChanges" | "assemble", ReturnType<typeof vi.fn>>;
  const publisher = {
    publish: vi.fn(async () => ({ public: shared })),
    makePublic: vi.fn(async () => undefined),
    isPublic: vi.fn(async (url: string) => url === TARGET),
    listPublished: vi.fn(async () => [TARGET, `${INSTANCE}releases/old/v1.ttl`]),
  } satisfies ReleasePublisher;
  const deckLibrary = { readLibraryIndex: vi.fn(async () => ({ url: INDEX, publisher: null, releases: [] })) } as unknown as DeckLibrary;
  const fileExchange = { save: vi.fn<FileExchange["save"]>(), open: vi.fn<FileExchange["open"]>() };
  const useCases = createReleasePublishingUseCases({
    drafts,
    releaseDraftRepository: repository,
    releasePublisher: publisher,
    deckLibrary,
    fileExchange,
    now: () => new Date(NOW),
  });
  return { drafts, repository, publisher, fileExchange, useCases };
}

describe("publishRelease", () => {
  it("checks the draft as a pod's release, publishes it at the target, and marks the draft released", async () => {
    const { drafts, repository, publisher, useCases } = setUp();
    await expect(useCases.publishRelease(DRAFT, TARGET, markdownCheck)).resolves.toEqual({ url: TARGET, public: true });
    expect(drafts.checkReleaseDraft).toHaveBeenCalledWith(courseDraft(), markdownCheck, "pod", { shapes: true });
    expect(repository.assemble).toHaveBeenCalledWith(DRAFT, TARGET, NOW, "v1");
    expect(publisher.publish).toHaveBeenCalledWith(INSTANCE, TURTLE, TARGET);
    const [before, after, version] = repository.applyChanges.mock.calls[0]!;
    expect(after).toEqual({ ...before, root: { ...before.root, releasedAs: TARGET } });
    expect(version).toBe("v1");
  });

  it("says a release the pod would not make public is published all the same", async () => {
    const { repository, useCases } = setUp({ shared: false });
    await expect(useCases.publishRelease(DRAFT, TARGET, markdownCheck)).resolves.toEqual({ url: TARGET, public: false });
    expect(repository.applyChanges).toHaveBeenCalledTimes(1);
  });

  it("publishes nothing while the check finds an error; a warning does not stop it", async () => {
    const error = problem(DRAFT, { code: "unshaped", params: {} });
    const warning = problem(DRAFT, { code: "unshaped", params: {} }, { severity: "warning" });
    const stopped = setUp({ check: { ...clean, rules: [error], shapes: [error, warning] } });
    await expect(stopped.useCases.publishRelease(DRAFT, TARGET, markdownCheck)).rejects.toMatchObject({ code: "releaseHasErrors", vars: { count: 2 } });
    expect(stopped.repository.assemble).not.toHaveBeenCalled();
    const warned = setUp({ check: { ...clean, markdown: [warning] } });
    await expect(warned.useCases.publishRelease(DRAFT, TARGET, markdownCheck)).resolves.toMatchObject({ public: true });
  });

  it("refuses a draft released already, and a guest's", async () => {
    const released = { ...courseDraft(), root: { ...courseDraft().root, releasedAs: TARGET } };
    const { useCases, drafts } = setUp({ stored: released });
    await expect(useCases.publishRelease(DRAFT, TARGET, markdownCheck)).rejects.toMatchObject({ code: "draftReleased", vars: { url: TARGET } });
    await expect(useCases.publishRelease(draftUrlOf(GUEST_INSTANCE_URL, "solid", 1), TARGET, markdownCheck)).rejects.toMatchObject({
      code: "guestCannotPublish",
    });
    expect(drafts.readReleaseDraft).toHaveBeenCalledTimes(1);
  });

  it("leaves the draft as it is when the release is not written: its place is taken", async () => {
    const { useCases, publisher, repository } = setUp();
    publisher.publish.mockRejectedValueOnce(new AppError("releaseTaken", { url: TARGET }));
    await expect(useCases.publishRelease(DRAFT, TARGET, markdownCheck)).rejects.toMatchObject({ code: "releaseTaken" });
    expect(repository.applyChanges).not.toHaveBeenCalled();
  });

  it("never takes another draft's release for this one's, though it would state the same", async () => {
    const { useCases, repository, publisher } = setUp();
    repository.list.mockResolvedValueOnce([{ url: draftUrlOf(INSTANCE, "solid", 1), releasedAs: TARGET }]);
    await expect(useCases.publishRelease(DRAFT, TARGET, markdownCheck)).rejects.toMatchObject({ code: "releaseTaken", vars: { url: TARGET } });
    expect(repository.list).toHaveBeenCalledWith(INSTANCE);
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it("publishes and marks released the draft as it was checked, or says it changed elsewhere", async () => {
    const { useCases, repository, publisher } = setUp();
    const raced = new AppError("changedElsewhere", { url: DRAFT });
    repository.assemble.mockRejectedValueOnce(raced);
    await expect(useCases.publishRelease(DRAFT, TARGET, markdownCheck)).rejects.toBe(raced);
    expect(publisher.publish).not.toHaveBeenCalled();
    repository.applyChanges.mockRejectedValueOnce(raced);
    await expect(useCases.publishRelease(DRAFT, TARGET, markdownCheck)).rejects.toBe(raced);
    // Marked once, at the version checked: never on a draft read since.
    expect(repository.applyChanges).toHaveBeenCalledTimes(1);
    expect(repository.applyChanges.mock.calls[0]![2]).toBe("v1");
    expect(repository.read).not.toHaveBeenCalled();
  });

  it("finishes a publishing cut short after the release is written when it is published again", async () => {
    const { useCases, repository, publisher } = setUp();
    // Its link from the catalogue failed: the draft is left as it is.
    publisher.publish.mockRejectedValueOnce(new AppError("noCatalogToUpdate"));
    await expect(useCases.publishRelease(DRAFT, TARGET, markdownCheck)).rejects.toMatchObject({ code: "noCatalogToUpdate" });
    expect(repository.applyChanges).not.toHaveBeenCalled();
    // Its draft was not marked.
    repository.applyChanges.mockRejectedValueOnce(new Error("offline"));
    await expect(useCases.publishRelease(DRAFT, TARGET, markdownCheck)).rejects.toThrow("offline");
    // Published again at the same address: the publisher finds the release its own, and the draft is marked.
    await expect(useCases.publishRelease(DRAFT, TARGET, markdownCheck)).resolves.toEqual({ url: TARGET, public: true });
    expect(publisher.publish).toHaveBeenCalledTimes(3);
    for (let call = 1; call <= 3; call++) expect(publisher.publish).toHaveBeenNthCalledWith(call, INSTANCE, TURTLE, TARGET);
    expect(repository.applyChanges).toHaveBeenCalledTimes(2);
  });
});

describe("makeReleasePublic, isReleasePublic and listPublishedReleases", () => {
  it("are the publisher's, each release listed with whether it is public", async () => {
    const { useCases, publisher } = setUp();
    await useCases.makeReleasePublic(TARGET);
    expect(publisher.makePublic).toHaveBeenCalledWith(TARGET);
    await expect(useCases.isReleasePublic(TARGET)).resolves.toBe(true);
    await expect(useCases.listPublishedReleases(INSTANCE)).resolves.toEqual([
      { url: TARGET, public: true },
      { url: `${INSTANCE}releases/old/v1.ttl`, public: false },
    ]);
    expect(publisher.listPublished).toHaveBeenCalledWith(INSTANCE);
  });
});

describe("downloadRelease", () => {
  it("saves the draft as a release file, at the library's address unless told another", async () => {
    const { useCases, repository, fileExchange } = setUp();
    await expect(useCases.downloadRelease(DRAFT)).resolves.toEqual({ name: "solid-v2.ttl", url: "https://site.example/decks/solid/v2.ttl" });
    expect(repository.assemble).toHaveBeenCalledWith(DRAFT, "https://site.example/decks/solid/v2.ttl", NOW);
    expect(fileExchange.save).toHaveBeenCalledWith("solid-v2.ttl", "text/turtle", TURTLE);
    await expect(useCases.downloadRelease(DRAFT, TARGET)).resolves.toEqual({ name: "solid-v2.ttl", url: TARGET });
  });
});
