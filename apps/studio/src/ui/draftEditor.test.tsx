import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DraftEdit } from "@solid-memo/application/releaseDrafts";
import type { UseCases } from "@solid-memo/application/useCases";
import { AppError } from "@solid-memo/domain/appError";
import { applyDraftChanges, type DraftChange, type ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { makeUseCasesFake } from "@solid-memo/ui/test/useCasesFake";
import { DEBOUNCE_MS, draftKey, draftScope, useDraftEditor, type DraftEditor } from "./draftEditor";
import { courseDraft, DRAFT_URL } from "../test/fixtures";

let editor: DraftEditor;
let other: DraftEditor;

function Probe({ useCases }: { useCases: UseCases }) {
  editor = useDraftEditor(useCases, DRAFT_URL);
  return <p>{editor.draft === undefined ? "reading" : "read"}</p>;
}

/** Another screen's editor of the same draft. */
function OtherProbe({ useCases }: { useCases: UseCases }) {
  other = useDraftEditor(useCases, DRAFT_URL);
  return null;
}

/** A promise settled when the test says. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

/** The edit as the use case makes it: the changes on the draft given. */
const made = (draft: ReleaseDraft, changes: readonly DraftChange[]): DraftEdit => ({ ok: true, draft: applyDraftChanges(draft, changes) as ReleaseDraft });

const rename = (en: string): DraftChange => ({ kind: "editChapter", id: "ch-apps", text: { title: { en } } });

async function renderEditor(overrides: Partial<UseCases> = {}, { twice = false } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const useCases = makeUseCasesFake({ getReleaseDraft: vi.fn(async () => courseDraft()), ...overrides });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <Probe useCases={useCases} />
      {twice && <OtherProbe useCases={useCases} />}
    </QueryClientProvider>,
  );
  await waitFor(() => expect(editor.draft).toBeDefined());
  return { useCases, queryClient, view };
}

const chapterTitle = (id: string) => editor.draft!.chapters.find((node) => node.id === id)!.data.title;

afterEach(() => vi.useRealTimers());

describe("useDraftEditor", () => {
  it("makes a change at once, writes it, and keeps the draft as the write left it", async () => {
    const written = { ...courseDraft(), root: { ...courseDraft().root, title: { en: "As written" } } };
    const write = deferred<DraftEdit>();
    const { useCases } = await renderEditor({ editReleaseDraft: vi.fn(() => write.promise) });
    let refusal: unknown;
    act(() => {
      refusal = editor.edit([rename("Applications")]);
    });
    expect(refusal).toBeNull();
    await waitFor(() => expect(chapterTitle("ch-apps")).toEqual({ en: "Applications" }));
    expect(editor.saving).toBe(true);
    await waitFor(() => expect(useCases.editReleaseDraft).toHaveBeenCalledWith(DRAFT_URL, [rename("Applications")]));
    await act(async () => write.resolve({ ok: true, draft: written }));
    await waitFor(() => expect(editor.saving).toBe(false));
    expect(editor.draft!.root.title).toEqual({ en: "As written" });
    expect(editor.failure).toBeNull();
    expect(editor.readOnly).toBeNull();
  });

  it("writes typing once its document has been still a moment, the changes of that time together", async () => {
    const { useCases } = await renderEditor({ editReleaseDraft: vi.fn(async (_url, changes) => made(courseDraft(), changes)) });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    act(() => {
      editor.edit([rename("A")], { debounce: true });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 100);
    });
    act(() => {
      editor.edit([rename("Ap")], { debounce: true });
    });
    expect(editor.saving).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 100);
    });
    expect(useCases.editReleaseDraft).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(useCases.editReleaseDraft).toHaveBeenCalledTimes(1);
    expect(useCases.editReleaseDraft).toHaveBeenCalledWith(DRAFT_URL, [rename("A"), rename("Ap")]);
  });

  it("writes what waits before a change that is not typing, and when the screen goes", async () => {
    const { useCases, view } = await renderEditor({ editReleaseDraft: vi.fn(async (_url, changes) => made(courseDraft(), changes)) });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    act(() => {
      editor.edit([rename("Typed")], { debounce: true });
    });
    act(() => {
      editor.edit([{ kind: "moveChapter", id: "ch-apps", to: 0 }]);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(vi.mocked(useCases.editReleaseDraft).mock.calls.map(([, changes]) => changes)).toEqual([[rename("Typed")], [{ kind: "moveChapter", id: "ch-apps", to: 0 }]]);
    act(() => {
      editor.edit([rename("Left")], { debounce: true });
    });
    view.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(useCases.editReleaseDraft).toHaveBeenLastCalledWith(DRAFT_URL, [rename("Left")]);
  });

  it("writes typing at once when it changes several documents", async () => {
    const { useCases } = await renderEditor({ editReleaseDraft: vi.fn(async (_url, changes) => made(courseDraft(), changes)) });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    act(() => {
      editor.edit([rename("One"), { kind: "editChapter", id: "ch-pods", text: { title: { en: "Two" } } }], { debounce: true });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(useCases.editReleaseDraft).toHaveBeenCalledTimes(1);
  });

  it("refuses a change the draft refuses, and makes nothing of one that changes nothing", async () => {
    const { useCases } = await renderEditor();
    let refusal: unknown;
    act(() => {
      refusal = editor.edit([{ kind: "addChapter", id: "ch-pods" }]);
    });
    expect(refusal).toEqual({ refused: "idTaken", id: "ch-pods" });
    expect(editor.failure).toEqual({ refusal: { refused: "idTaken", id: "ch-pods" } });
    act(() => {
      refusal = editor.edit([rename("Apps")]);
    });
    expect(refusal).toBeNull();
    expect(editor.failure).toBeNull();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(useCases.editReleaseDraft).not.toHaveBeenCalled();
    expect(editor.saving).toBe(false);
  });

  it("says why a write was refused or failed, and reads the draft afresh", async () => {
    const edit = vi
      .fn<UseCases["editReleaseDraft"]>()
      .mockResolvedValueOnce({ ok: false, refusal: { refused: "missing", id: "ch-apps" } })
      .mockRejectedValueOnce(new AppError("draftGone"));
    const { useCases } = await renderEditor({ editReleaseDraft: edit });
    act(() => {
      editor.edit([rename("Gone")]);
    });
    await waitFor(() => expect(editor.failure).toEqual({ refusal: { refused: "missing", id: "ch-apps" } }));
    await waitFor(() => expect(chapterTitle("ch-apps")).toEqual({ en: "Apps" }));
    expect(useCases.getReleaseDraft).toHaveBeenCalledTimes(2);
    act(() => {
      editor.edit([rename("Again")]);
    });
    await waitFor(() => expect(editor.failure).toEqual({ error: new AppError("draftGone") }));
    await waitFor(() => expect(useCases.getReleaseDraft).toHaveBeenCalledTimes(3));
  });

  it("queues the writes of a draft, whatever their documents and screens, and takes the draft of the last", async () => {
    const first = deferred<DraftEdit>();
    const second = deferred<DraftEdit>();
    const edit = vi.fn<UseCases["editReleaseDraft"]>().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await renderEditor({ editReleaseDraft: edit }, { twice: true });
    const pods: DraftChange = { kind: "editChapter", id: "ch-pods", text: { title: { en: "Stores" } } };
    act(() => {
      editor.edit([rename("Applications")]);
    });
    act(() => {
      other.edit([pods]);
    });
    await act(async () => {
      await Promise.resolve();
    });
    // Another document, another screen: it still waits for the first, and reads the draft after it.
    expect(edit).toHaveBeenCalledTimes(1);
    // The first's draft, read before the second was written, would undo it: it is not taken.
    await act(async () => first.resolve(made(courseDraft(), [rename("Applications")])));
    await waitFor(() => expect(edit).toHaveBeenCalledTimes(2));
    expect(chapterTitle("ch-pods")).toEqual({ en: "Stores" });
    await act(async () => second.resolve(made(courseDraft(), [rename("Applications"), pods])));
    await waitFor(() => expect(editor.saving).toBe(false));
    expect(chapterTitle("ch-apps")).toEqual({ en: "Applications" });
    expect(chapterTitle("ch-pods")).toEqual({ en: "Stores" });
    expect(other.draft).toBe(editor.draft);
  });

  it("reads the draft afresh after a failed write only once the writes after it are done", async () => {
    const first = deferred<DraftEdit>();
    const second = deferred<DraftEdit>();
    const edit = vi.fn<UseCases["editReleaseDraft"]>().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { useCases } = await renderEditor({ editReleaseDraft: edit });
    act(() => {
      editor.edit([rename("One")]);
    });
    act(() => {
      editor.edit([rename("Two")]);
    });
    await act(async () => first.reject(new AppError("draftGone")));
    await waitFor(() => expect(editor.failure).toEqual({ error: new AppError("draftGone") }));
    expect(useCases.getReleaseDraft).toHaveBeenCalledTimes(1);
    await act(async () => second.resolve(made(courseDraft(), [rename("Two")])));
    await waitFor(() => expect(editor.saving).toBe(false));
    expect(useCases.getReleaseDraft).toHaveBeenCalledTimes(1);
    expect(chapterTitle("ch-apps")).toEqual({ en: "Two" });
  });

  it("queues the writes of a document, and leaves the draft as made while another write is on its way", async () => {
    const first = deferred<DraftEdit>();
    const second = deferred<DraftEdit>();
    const edit = vi.fn<UseCases["editReleaseDraft"]>().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { queryClient } = await renderEditor({ editReleaseDraft: edit });
    act(() => {
      editor.edit([rename("One")]);
    });
    act(() => {
      editor.edit([rename("Two")]);
    });
    await act(async () => {
      await Promise.resolve();
    });
    // The second waits in the document's queue.
    expect(edit).toHaveBeenCalledTimes(1);
    expect(queryClient.getMutationCache().getAll()[0]!.options.scope).toEqual({ id: draftScope(DRAFT_URL) });
    await act(async () => first.resolve({ ok: true, draft: courseDraft() }));
    await waitFor(() => expect(edit).toHaveBeenCalledTimes(2));
    // The first's draft would undo the second: it is not taken.
    expect(chapterTitle("ch-apps")).toEqual({ en: "Two" });
    await act(async () => second.resolve(made(courseDraft(), [rename("Two")])));
    await waitFor(() => expect(editor.saving).toBe(false));
    expect(queryClient.getQueryData<ReleaseDraft>(draftKey(DRAFT_URL))!.chapters.find((node) => node.id === "ch-apps")!.data.title).toEqual({ en: "Two" });
  });

  it("holds a draft released, and one the instance's data check holds", async () => {
    const released = { ...courseDraft(), root: { ...courseDraft().root, releasedAs: "https://pod.example/releases/solid/v1.ttl" } };
    await renderEditor({ getReleaseDraft: vi.fn(async () => released) });
    expect(editor.readOnly).toBe("released");
  });

  it("holds the draft while the instance is checked", async () => {
    await renderEditor({ checkInstance: vi.fn(() => deferred<never>().promise) });
    expect(editor.readOnly).toBe("checking");
  });
});
