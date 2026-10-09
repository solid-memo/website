import { describe, expect, it, vi, type MockInstance } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { GuestMergeOutcome, GuestMergeProgress, GuestTransferProgress } from "@solid-memo/domain/guest";
import type { Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import type { Session } from "@solid-memo/domain/session";
import { AppError } from "@solid-memo/domain/appError";
import { alertTexts, unexpectedText } from "../test/liveRegions";
import { makeUseCasesFake } from "../test/useCasesFake";
import { I18nProvider } from "./i18n";
import { GuestStudyOffer } from "./GuestStudyOffer";

const session: Session = { webId: "https://alice.example/profile/card#me" };
const guestInstance = { url: "https://guest.solid-memo.invalid/solid-memo/", name: "My study" };

/** The last rendered offer's cache, watched for what it reads again. */
let invalidations: MockInstance<QueryClient["invalidateQueries"]>;

function renderOffer(overrides: Partial<UseCases> = {}) {
  const useCases = makeUseCasesFake({
    findGuestStudy: vi.fn(async () => ({ instances: [{ instance: guestInstance, deckCount: 1 }] })),
    listStorages: vi.fn(async () => [{ url: "https://alice.example/", source: "profile" as const }]),
    ...overrides,
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  invalidations = vi.spyOn(queryClient, "invalidateQueries");
  render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider locale="en" onChoose={() => undefined}>
        <GuestStudyOffer useCases={useCases} session={session} />
      </I18nProvider>
    </QueryClientProvider>,
  );
  return useCases;
}

async function openForm() {
  fireEvent.click(await screen.findByRole("button", { name: "Move it into my Pod" }));
  return screen.findByRole("region", { name: "Move your study into your Pod" });
}

describe("GuestStudyOffer", () => {
  it("offers nothing when no guest studied in this browser, or the guest has no instance", async () => {
    const useCases = renderOffer({ findGuestStudy: vi.fn(async () => null) });
    await waitFor(() => expect(useCases.findGuestStudy).toHaveBeenCalled());
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("names the study and its decks, and can be put off", async () => {
    renderOffer();
    expect(await screen.findByText(/My study has 1 deck\. Move it into your Pod/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("region", { name: "Your study as a guest" })).toBeNull();
  });

  it("discards the study only once the user confirms it", async () => {
    const useCases = renderOffer();
    fireEvent.click(await screen.findByRole("button", { name: "Discard it" }));
    expect(screen.getByText(/This cannot be undone/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(useCases.discardGuest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Discard it" }));
    vi.mocked(useCases.findGuestStudy).mockResolvedValue(null);
    fireEvent.click(screen.getByRole("button", { name: "Delete it" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Your study as a guest" })).toBeNull());
    expect(useCases.discardGuest).toHaveBeenCalledOnce();
  });

  it("moves the focus with each stage, all but the offer as the page loads, and back to the offer", async () => {
    renderOffer();
    const offer = await screen.findByRole("region", { name: "Your study as a guest" });
    expect(offer).not.toHaveFocus();
    expect(offer).toHaveAccessibleDescription(/My study has 1 deck/);

    fireEvent.click(screen.getByRole("button", { name: "Discard it" }));
    const question = screen.getByRole("region", { name: "Your study as a guest" });
    expect(question).toHaveFocus();
    expect(question).toHaveAccessibleDescription("Delete everything you studied as a guest? This cannot be undone.");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("region", { name: "Your study as a guest" })).toHaveFocus();

    expect(await openForm()).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("region", { name: "Your study as a guest" })).toHaveFocus();
  });

  it("keeps the pressed button focused while the study is discarded, and ignores the buttons meanwhile", async () => {
    const useCases = renderOffer({ discardGuest: vi.fn(() => new Promise<void>(() => {})) });
    fireEvent.click(await screen.findByRole("button", { name: "Discard it" }));
    const deleteIt = screen.getByRole("button", { name: "Delete it" });
    deleteIt.focus();
    fireEvent.click(deleteIt);
    await waitFor(() => expect(deleteIt).toHaveAttribute("aria-disabled", "true"));
    expect(deleteIt).toHaveFocus();
    fireEvent.click(deleteIt);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(useCases.discardGuest).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveAttribute("aria-disabled", "true");
  });

  it("keeps the form's buttons focusable while the move starts, and ignores them meanwhile", async () => {
    const transferGuestStudy = vi.fn(() => new Promise<never>(() => {}));
    renderOffer({ transferGuestStudy });
    await openForm();
    await waitFor(() => expect(screen.getByLabelText("Location in your Pod")).toHaveValue("https://alice.example/solid-memo/main/"));
    const start = screen.getByRole("button", { name: "Move it" });
    start.focus();
    fireEvent.click(start);
    await waitFor(() => expect(start).toHaveAttribute("aria-disabled", "true"));
    expect(start).toHaveFocus();
    fireEvent.submit(start.closest("form")!);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(transferGuestStudy).toHaveBeenCalledOnce();
    expect(screen.getByRole("region", { name: "Move your study into your Pod" })).toBeInTheDocument();
  });

  it("says why the study could not be discarded, and forgets it on cancel", async () => {
    const useCases = renderOffer({
      discardGuest: vi.fn(async () => {
        throw new Error("storage blocked");
      }),
    });
    fireEvent.click(await screen.findByRole("button", { name: "Discard it" }));
    expect(alertTexts()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Delete it" }));
    await waitFor(() => expect(alertTexts()).toEqual([unexpectedText("storage blocked")]));
    expect(useCases.discardGuest).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard it" }));
    expect(alertTexts()).toEqual([]);
  });

  it("says why a move that threw could not start, with no steps left on screen, and forgets it on going back", async () => {
    let report!: (progress: GuestTransferProgress) => void;
    let fail!: (error: unknown) => void;
    renderOffer({
      transferGuestStudy: vi.fn(
        (_session: Session, _instance: unknown, _target: unknown, onProgress?: (p: GuestTransferProgress) => void) =>
          new Promise<never>((_resolve, reject) => {
            report = onProgress!;
            fail = reject;
          }),
      ),
    });
    await openForm();
    await waitFor(() => expect(screen.getByLabelText("Location in your Pod")).toHaveValue("https://alice.example/solid-memo/main/"));
    fireEvent.click(screen.getByRole("button", { name: "Move it" }));
    await waitFor(() => expect(report).toBeDefined());
    report({ step: "copy", done: 1, total: 7 });
    // The steps take the place of the form, and its focus.
    expect(await screen.findByRole("region", { name: "Moving your study" })).toHaveFocus();
    fail(new Error("pod unreachable"));
    await waitFor(() => expect(alertTexts()).toEqual([unexpectedText("pod unreachable")]));
    // The form comes back with the error holding the focus, so it is heard.
    expect(screen.getByRole("alert")).toHaveFocus();
    expect(screen.queryByRole("region", { name: "Moving your study" })).toBeNull();
    expect(screen.getByRole("button", { name: "Move it" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(await screen.findByRole("button", { name: "Move it into my Pod" }));
    expect(alertTexts()).toEqual([]);
  });

  it("moves the study where the user's first instance would go, showing each step, then opens it", async () => {
    let report!: (progress: GuestTransferProgress) => void;
    let finish!: () => void;
    const transferGuestStudy = vi.fn(
      (_session: Session, _instance: unknown, _target: unknown, onProgress?: (p: GuestTransferProgress) => void) =>
        new Promise<Awaited<ReturnType<UseCases["transferGuestStudy"]>>>((resolve) => {
          report = onProgress!;
          finish = () => resolve({ ok: true, instance: { url: "https://alice.example/solid-memo/main/", name: "My study" }, tidied: true });
        }),
    );
    const useCases = renderOffer({ transferGuestStudy });
    await openForm();
    const announced = screen.getByRole("status");
    expect(announced.textContent).toBe("");
    const location = await screen.findByLabelText("Location in your Pod");
    await waitFor(() => expect(location).toHaveValue("https://alice.example/solid-memo/main/"));
    fireEvent.click(screen.getByLabelText("Public type index"));
    fireEvent.click(screen.getByRole("button", { name: "Move it" }));
    await waitFor(() =>
      expect(transferGuestStudy).toHaveBeenCalledWith(
        session,
        guestInstance,
        { containerUrl: "https://alice.example/solid-memo/main/", registrationTarget: "public" },
        expect.any(Function),
      ),
    );
    report({ step: "copy", done: 1, total: 7, part: { done: 1, total: 4 } });
    expect(await screen.findByText("Copying your study…")).toBeInTheDocument();
    expect(screen.getByText("1 of 4")).toBeInTheDocument();
    report({ step: "register", done: 5, total: 7 });
    expect(await screen.findByText("Registering it in your Pod…")).toBeInTheDocument();
    vi.mocked(useCases.findGuestStudy).mockResolvedValue(null);
    finish();
    // Said by a status line mounted all along, which a screen reader hears; the Close button is not in it.
    await waitFor(() => expect(announced).toHaveTextContent("Your study is in your Pod now."));
    // Not focused: an element with nothing to read, and the instance the move opens takes the focus.
    expect(screen.getByText("Your study is in your Pod now.", { ignore: "[role=status]" }).parentElement).not.toHaveFocus();
    expect(within(announced).queryByRole("button")).toBeNull();
    expect(screen.getByText("Your study is in your Pod now.", { ignore: "[role=status]" })).toHaveAttribute("aria-hidden", "true");
    await waitFor(() => expect(window.location.hash).toContain(encodeURIComponent("https://alice.example/solid-memo/main/")));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByText("Your study is in your Pod now.")).toBeNull());
    expect(announced.textContent).toBe("");
  });

  it("says when the study moved but stayed in this browser too", async () => {
    renderOffer({
      transferGuestStudy: vi.fn(async () => ({
        ok: true as const,
        instance: { url: "https://alice.example/solid-memo/main/", name: "My study" },
        tidied: false,
      })),
    });
    await openForm();
    await waitFor(() => expect(screen.getByLabelText("Location in your Pod")).toHaveValue("https://alice.example/solid-memo/main/"));
    fireEvent.click(screen.getByRole("button", { name: "Move it" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/It could not be removed from this browser/));
  });

  it("lets the user pick the storage and the folder of a new instance", async () => {
    const useCases = renderOffer({
      listStorages: vi.fn(async () => [
        { url: "https://alice.example/", source: "profile" as const },
        { url: "https://backup.example/", source: "profile" as const },
      ]),
    });
    await openForm();
    const location = await screen.findByLabelText("Location in your Pod");
    await waitFor(() => expect(location).toHaveValue("https://alice.example/solid-memo/main/"));
    fireEvent.click(screen.getByLabelText("https://backup.example/"));
    expect(location).toHaveValue("https://backup.example/solid-memo/main/");
    fireEvent.input(location, { target: { value: "https://backup.example/study/" } });
    fireEvent.click(screen.getByRole("button", { name: "Move it" }));
    await waitFor(() =>
      expect(useCases.transferGuestStudy).toHaveBeenCalledWith(
        session,
        guestInstance,
        { containerUrl: "https://backup.example/study/", registrationTarget: "private" },
        expect.any(Function),
      ),
    );
  });

  it("looks for the user's instances first, and can go back meanwhile", async () => {
    renderOffer({ listInstances: vi.fn(() => new Promise<never>(() => {})) });
    await openForm();
    expect(screen.getByText("Looking for your instances…")).toBeInTheDocument();
    expect(screen.queryByLabelText("Location in your Pod")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("region", { name: "Your study as a guest" })).toHaveFocus();
  });

  it("offers a new instance when the user's instances cannot be listed", async () => {
    renderOffer({
      listInstances: vi.fn(async () => {
        throw new Error("no type index");
      }),
    });
    await openForm();
    await waitFor(() => expect(screen.getByLabelText("Location in your Pod")).toHaveValue("https://alice.example/solid-memo/main/"));
  });

  it("asks where to keep the study when the profile names no storage, and goes back on request", async () => {
    renderOffer({ listStorages: vi.fn(async () => []) });
    await openForm();
    expect(await screen.findByText(/Your profile names no Pod storage/)).toBeInTheDocument();
    expect(screen.getByLabelText("Location in your Pod")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("button", { name: "Move it into my Pod" })).toBeInTheDocument();
  });

  it("says where the move failed, that the study is still here, and what became of the copy", async () => {
    const transferGuestStudy = vi
      .fn<UseCases["transferGuestStudy"]>()
      .mockResolvedValueOnce({ ok: false, step: "copy", error: new AppError("alreadyExists", { url: "https://alice.example/solid-memo/main/" }), cleanedUp: true })
      .mockResolvedValueOnce({ ok: false, step: "validate", error: "offline", cleanedUp: false, leftoverUrl: "https://alice.example/solid-memo/main/" });
    renderOffer({ transferGuestStudy });
    await openForm();
    await waitFor(() => expect(screen.getByLabelText("Location in your Pod")).toHaveValue("https://alice.example/solid-memo/main/"));
    fireEvent.click(screen.getByRole("button", { name: "Move it" }));
    const failed = await screen.findByRole("region", { name: "Moving failed" });
    // It takes the focus, read out with why as its description.
    expect(failed).toHaveFocus();
    expect(failed).toHaveAccessibleDescription(/Moving your study failed while copying your study/);
    // Heard through the focus alone: the status line does not say it again.
    expect(screen.getByRole("status").textContent).toBe("");
    expect(failed).toHaveAccessibleDescription(/Something is already kept at that place in your Pod\. Choose another place\./);
    // The address is under the failure's technical details.
    expect(failed).toHaveTextContent("Moving your study failed while copying your study:");
    expect(within(failed).getByText("Technical details").closest("details")).toHaveTextContent(
      "url: https://alice.example/solid-memo/main/",
    );
    expect(failed).toHaveTextContent("Your study is still in this browser. The partial copy was removed from your Pod.");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(await screen.findByRole("button", { name: "Move it" }));
    expect(await screen.findByRole("region", { name: "Moving failed" })).toHaveTextContent(
      "The partial copy could not be removed from your Pod; it is at https://alice.example/solid-memo/main/.",
    );
  });

  describe("adding the study to an instance the user has", () => {
    const main: Instance = { url: "https://alice.example/solid-memo/main/", name: "Main" };
    const work: Instance = { url: "https://alice.example/solid-memo/work/", name: "Work" };
    const guestDeck = (id: string, title: string, extra: Partial<Deck> = {}): Deck => ({
      id,
      url: `${guestInstance.url}catalog.ttl#${id}`,
      title: { en: title },
      cardsDocumentUrl: `${guestInstance.url}decks/${id}.ttl`,
      reviewsDocumentUrl: `${guestInstance.url}reviews/${id}.ttl`,
      createdAt: "2026-10-01T10:00:00.000Z",
      formatVersion: 6,
      direction: "front-to-back",
      authors: [],
      ...extra,
    });
    const capitals = guestDeck("deck-1", "Capitals");
    const course = guestDeck("deck-2", "Solid fundamentals", { sourceUrl: "https://solid-memo.com/decks/solid-fundamentals/v1.ttl" });
    const addedAs = (from: Deck, instance: Instance): Deck => ({ ...from, url: `${instance.url}catalog.ttl#${from.id}-new` });

    function renderMerge(overrides: Partial<UseCases> = {}) {
      return renderOffer({
        listInstances: vi.fn(async () => [main]),
        planGuestMerge: vi.fn(async (_guest, target) => ({
          decks: [
            { deck: capitals, sameRelease: [] },
            { deck: course, sameRelease: target.url === main.url ? [addedAs(course, main)] : [] },
          ],
        })),
        ...overrides,
      });
    }

    it("adds the guest's decks to the user's instance, showing each step, then opens it", async () => {
      let report!: (progress: GuestMergeProgress) => void;
      let finish!: () => void;
      const mergeGuestStudy = vi.fn(
        (_session: Session, _guest: Instance, target: Instance, _options?: unknown, onProgress?: (p: GuestMergeProgress) => void) =>
          new Promise<GuestMergeOutcome>((resolve) => {
            report = onProgress!;
            finish = () => resolve({ ok: true, instance: target, added: [addedAs(capitals, target)], tidied: true });
          }),
      );
      const useCases = renderMerge({ mergeGuestStudy });
      expect(await openForm()).toHaveFocus();
      expect(await screen.findByText("Your decks are added to Main.")).toBeInTheDocument();
      expect(screen.getByText(/The instance keeps its own preferences: the ones you set as a guest are not carried over\./)).toBeInTheDocument();
      expect(screen.queryByRole("group", { name: "Add it to" })).toBeNull();
      const decks = await screen.findByRole("group", { name: "Decks to add" });
      expect(within(decks).getByRole("checkbox", { name: "Capitals" })).toBeChecked();
      expect(within(decks).getByRole("checkbox", { name: "Capitals" })).not.toHaveAccessibleDescription();
      // A deck the instance has from the same release is added beside it, not merged, and says so.
      expect(within(decks).getByRole("checkbox", { name: "Solid fundamentals" })).toHaveAccessibleDescription(
        "Main already has this deck from the same library release. It is added beside it as a deck of its own, with its own progress, not merged into it: untick it to leave it out.",
      );
      expect(screen.getByText(/A deck you leave out is not kept/)).toBeInTheDocument();
      const announced = screen.getByRole("status");
      fireEvent.click(screen.getByRole("button", { name: "Add to Main" }));
      await waitFor(() => expect(mergeGuestStudy).toHaveBeenCalledWith(session, guestInstance, main, { skip: [] }, expect.any(Function)));
      expect(useCases.planGuestMerge).toHaveBeenCalledWith(guestInstance, main);
      report({ step: "decks", done: 1, total: 5, part: { done: 1, total: 2 } });
      expect(await screen.findByRole("region", { name: "Adding your study" })).toHaveFocus();
      expect(await screen.findByText("Adding your decks…")).toBeInTheDocument();
      expect(screen.getByText("1 of 2")).toBeInTheDocument();
      expect(screen.getByText("Keep this page open until your study is added.")).toBeInTheDocument();
      vi.mocked(useCases.findGuestStudy).mockResolvedValue(null);
      finish();
      await waitFor(() => expect(announced).toHaveTextContent("Your study is in Main now."));
      expect(screen.getByText("Your study is in Main now.", { ignore: "[role=status]" })).toHaveAttribute("aria-hidden", "true");
      await waitFor(() => expect(window.location.hash).toContain(encodeURIComponent(main.url)));
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      await waitFor(() => expect(announced.textContent).toBe(""));
    });

    it("lets the user choose the instance and leave decks out, but not every one", async () => {
      const useCases = renderMerge({ listInstances: vi.fn(async () => [main, work]) });
      await openForm();
      const instances = await screen.findByRole("group", { name: "Add it to" });
      expect(within(instances).getByRole("radio", { name: "Main" })).toBeChecked();
      fireEvent.click(within(instances).getByRole("radio", { name: "Work" }));
      await waitFor(() => expect(useCases.planGuestMerge).toHaveBeenCalledWith(guestInstance, work));
      const decks = await screen.findByRole("group", { name: "Decks to add" });
      await waitFor(() => expect(within(decks).getByRole("checkbox", { name: "Solid fundamentals" })).not.toHaveAccessibleDescription());
      fireEvent.click(within(decks).getByRole("checkbox", { name: "Capitals" }));
      fireEvent.click(within(decks).getByRole("checkbox", { name: "Solid fundamentals" }));
      fireEvent.click(screen.getByRole("button", { name: "Add to Work" }));
      await waitFor(() => expect(alertTexts()).toEqual(["Choose at least one deck to add, or discard your study instead."]));
      expect(useCases.mergeGuestStudy).not.toHaveBeenCalled();
      fireEvent.click(within(decks).getByRole("checkbox", { name: "Solid fundamentals" }));
      expect(alertTexts()).toEqual([]);
      fireEvent.click(screen.getByRole("button", { name: "Add to Work" }));
      await waitFor(() =>
        expect(useCases.mergeGuestStudy).toHaveBeenCalledWith(session, guestInstance, work, { skip: [capitals.url] }, expect.any(Function)),
      );
    });

    it("adds a study with no decks, saying so, and starts nothing before the decks are read", async () => {
      let read!: () => void;
      const useCases = renderMerge({
        planGuestMerge: vi.fn(() => new Promise<{ decks: [] }>((resolve) => (read = () => resolve({ decks: [] })))),
      });
      await openForm();
      expect(await screen.findByText("Reading your study…")).toBeInTheDocument();
      await waitFor(() => expect(useCases.planGuestMerge).toHaveBeenCalled());
      fireEvent.click(screen.getByRole("button", { name: "Add to Main" }));
      expect(useCases.mergeGuestStudy).not.toHaveBeenCalled();
      read();
      expect(await screen.findByText("Your study has no decks to add.")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Add to Main" }));
      await waitFor(() => expect(useCases.mergeGuestStudy).toHaveBeenCalledWith(session, guestInstance, main, { skip: [] }, expect.any(Function)));
    });

    it("says why the study could not be read", async () => {
      renderMerge({
        planGuestMerge: vi.fn(async () => {
          throw new Error("storage blocked");
        }),
      });
      await openForm();
      await waitFor(() => expect(alertTexts()).toEqual([unexpectedText("storage blocked")]));
    });

    it("ignores the form while the study is being added, and says why one that threw could not start", async () => {
      let fail!: (error: unknown) => void;
      const mergeGuestStudy = vi.fn(() => new Promise<never>((_resolve, reject) => (fail = reject)));
      renderMerge({ mergeGuestStudy });
      await openForm();
      await screen.findByRole("group", { name: "Decks to add" });
      const start = screen.getByRole("button", { name: "Add to Main" });
      fireEvent.click(start);
      await waitFor(() => expect(start).toHaveAttribute("aria-disabled", "true"));
      expect(screen.getByRole("checkbox", { name: "Capitals" })).toBeDisabled();
      fireEvent.submit(start.closest("form")!);
      fireEvent.click(screen.getByRole("button", { name: "Back" }));
      expect(mergeGuestStudy).toHaveBeenCalledOnce();
      fail(new Error("pod unreachable"));
      await waitFor(() => expect(alertTexts()).toEqual([unexpectedText("pod unreachable")]));
      fireEvent.click(screen.getByRole("button", { name: "Back" }));
      fireEvent.click(await screen.findByRole("button", { name: "Move it into my Pod" }));
      expect(alertTexts()).toEqual([]);
    });

    it("says when the study was added but stayed in this browser too", async () => {
      renderMerge({
        mergeGuestStudy: vi.fn(async (_session, _guest, target) => ({ ok: true as const, instance: target, added: [], tidied: false })),
      });
      await openForm();
      await screen.findByRole("group", { name: "Decks to add" });
      fireEvent.click(screen.getByRole("button", { name: "Add to Main" }));
      await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Your study is in Main now. It could not be removed from this browser"));
    });

    it("says where adding failed, which decks are in the instance, whole, and that the study is still here", async () => {
      const mergeGuestStudy = vi
        .fn<UseCases["mergeGuestStudy"]>()
        .mockResolvedValueOnce({ ok: false, instance: main, step: "decks", error: new AppError("guestStudyChanged"), added: [addedAs(capitals, main)] })
        .mockResolvedValueOnce({ ok: false, instance: main, step: "read", error: "offline", added: [] });
      window.location.hash = "#/statistics";
      renderMerge({ mergeGuestStudy });
      await openForm();
      await screen.findByRole("group", { name: "Decks to add" });
      fireEvent.click(screen.getByRole("button", { name: "Add to Main" }));
      const failed = await screen.findByRole("region", { name: "Adding failed" });
      expect(failed).toHaveFocus();
      // The instance has a deck more: what is on screen of it is read again, without leaving it.
      expect(invalidations).toHaveBeenCalledWith();
      expect(window.location.hash).toBe("#/statistics");
      expect(failed).toHaveAccessibleDescription(/^Adding your study failed while adding your decks: Your study in this browser changed/);
      expect(screen.getByRole("status").textContent).toBe("");
      expect(failed).toHaveTextContent("This deck is in Main now, whole:");
      expect(within(failed).getByRole("listitem")).toHaveTextContent("Capitals");
      expect(failed).toHaveTextContent("Your study is still in this browser. Trying again adds what is not in Main yet.");
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      fireEvent.click(await screen.findByRole("button", { name: "Add to Main" }));
      invalidations.mockClear();
      const again = await screen.findByRole("region", { name: "Adding failed" });
      expect(again).toHaveTextContent("Adding your study failed while reading and checking your study:");
      expect(invalidations).not.toHaveBeenCalledWith();
      expect(again).toHaveTextContent("Nothing was added to Main.");
      expect(within(again).queryByRole("list")).toBeNull();
    });
  });
});
