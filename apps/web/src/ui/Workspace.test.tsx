import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Workspace } from "./Workspace";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Card, Deck } from "@solid-memo/domain/deck";
import type { LangText } from "@solid-memo/domain/langText";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import type { Instance } from "@solid-memo/domain/instance";
import type { Session } from "@solid-memo/domain/session";
import type { Storage } from "@solid-memo/domain/storage";
import { makeUseCasesFake } from "../test/useCasesFake";
import { routeToHash, statisticsHref } from "./router";
import { CARDS_PER_PAGE } from "./BrowserScreen";
import { firstRelease } from "@solid-memo/domain/testing/libraryDeck";
import { librarySeriesUrlOf } from "@solid-memo/domain/libraryLayout";
import { CH1, CH2, courseDeck, courseLibraryDeck, makeCourse } from "../test/course";

const session: Session = { webId: "https://alice.example/profile/card#me" };
const storageA: Storage = { url: "https://pod.example/", source: "profile" };
const storageB: Storage = { url: "https://backup.example/", source: "profile" };
const instanceA: Instance = {
  url: "https://pod.example/solid-memo/a/",
  name: "Deck set A",
};
const instanceB: Instance = {
  url: "https://pod.example/solid-memo/b/",
  name: "Deck set B",
};

function makeUseCases(overrides: Partial<UseCases> = {}): UseCases {
  return makeUseCasesFake({
    listStorages: vi.fn(async () => [storageA, storageB]),
    addManualStorage: vi.fn(async () => storageA),
    createInstance: vi.fn(async () => instanceA),
    attachInstanceByUrl: vi.fn(async () => instanceB),
    ...overrides,
  });
}

function renderWorkspace(useCases: UseCases) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Workspace useCases={useCases} session={session} />
    </QueryClientProvider>,
  );
}

describe("Workspace", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", window.location.pathname);
  });

  describe("the instance check", () => {
    const deck: Deck = {
      id: "deck-1",
      url: `${instanceA.url}catalog.ttl#deck-1`,
      title: { en: "Kanji N5" },
      cardsDocumentUrl: `${instanceA.url}decks/deck-1.ttl`,
      reviewsDocumentUrl: `${instanceA.url}reviews/deck-1.ttl`,
      direction: "front-to-back" as const,
      createdAt: "2026-09-21T10:00:00.000Z",
      formatVersion: 3,
      authors: [],
    };
    const invalid = {
      instanceUrl: instanceA.url,
      violationCount: 1,
      conforms: false,
      documents: [
        {
          url: `${instanceA.url}catalog.ttl`,
          status: "checked" as const,
          subjects: [
            {
              url: deck.url,
              status: "checked" as const,
              shape: "deck" as const,
              version: 3,
              violations: [
                { path: "http://purl.org/dc/terms/description", message: { en: "Less than 1 values" }, severity: "violation" as const, constraint: "MinCount" },
              ],
            },
          ],
        },
      ],
    };
    const withPolicy = (invalidDataPolicy: "block-instance" | "block-subject" | "warn-only") =>
      vi.fn(async () => ({ ...DEFAULT_PREFERENCES, invalidDataPolicy }));

    it("waits for the check, then blocks an instance with invalid data until it is repaired", async () => {
      const pending: ((report: typeof invalid) => void)[] = [];
      const useCases = makeUseCases({
        listInstances: vi.fn(async () => [instanceA]),
        listDecks: vi.fn(async () => [deck]),
        getPreferences: withPolicy("block-instance"),
        validateInstance: vi.fn(() => new Promise<typeof invalid>((r) => pending.push(r))),
        planRepair: vi.fn(() => ({
          repairs: [{ kind: "describe-deck" as const, documentUrl: `${instanceA.url}catalog.ttl`, subjectUrl: deck.url, version: 3 }],
          unrepairable: [],
        })),
      });
      renderWorkspace(useCases);
      expect(await screen.findByText("Checking this instance's data…")).toBeInTheDocument();
      await waitFor(() => {
        expect(pending.length).toBeGreaterThan(0);
      });
      pending.forEach((resolve) => resolve(invalid));
      const notice = await screen.findByRole("region", { name: "Data check" });
      expect(notice).toHaveTextContent("Solid Memo will not use this instance until it is repaired.");
      expect(screen.queryByText("Kanji N5")).toBeNull();
      const checks = vi.mocked(useCases.validateInstance).mock.calls.length;
      fireEvent.click(within(notice).getByRole("button", { name: "Repair 1 problem" }));
      await waitFor(() => {
        expect(useCases.applyRepairs).toHaveBeenCalledOnce();
      });
      await waitFor(() => {
        expect(vi.mocked(useCases.validateInstance).mock.calls.length).toBeGreaterThan(checks);
      });
      pending.forEach((resolve) => resolve(invalid));
    });

    it("keeps the preferences reachable while an instance is blocked", async () => {
      window.history.replaceState(null, "", routeToHash({ screen: "preferences", instanceUrl: instanceA.url }));
      renderWorkspace(
        makeUseCases({
          listInstances: vi.fn(async () => [instanceA]),
          getPreferences: withPolicy("block-instance"),
          validateInstance: vi.fn(async () => invalid),
        }),
      );
      expect(await screen.findByRole("heading", { name: "Study preferences" })).toBeInTheDocument();
      expect(screen.getByRole("region", { name: "Data check" })).toBeInTheDocument();
    });

    it("sets aside the decks with invalid data, keeping the rest", async () => {
      const other = { ...deck, id: "deck-2", url: `${instanceA.url}catalog.ttl#deck-2`, title: { en: "Capitals" }, cardsDocumentUrl: `${instanceA.url}decks/deck-2.ttl`, reviewsDocumentUrl: `${instanceA.url}reviews/deck-2.ttl` };
      renderWorkspace(
        makeUseCases({
          listInstances: vi.fn(async () => [instanceA]),
          listDecks: vi.fn(async () => [deck, other]),
          getPreferences: withPolicy("block-subject"),
          validateInstance: vi.fn(async () => invalid),
        }),
      );
      const notice = await screen.findByRole("region", { name: "Data check" });
      await waitFor(() => {
        expect(notice).toHaveTextContent("Kanji N5 is set aside until repaired; the rest keeps working.");
      });
      expect(await screen.findByText("Set aside: its data needs repair")).toBeInTheDocument();
      expect(screen.getByText("Capitals")).toBeInTheDocument();
    });

    it("sets invalid data aside by default, when the preferences state no policy", async () => {
      renderWorkspace(
        makeUseCases({
          listInstances: vi.fn(async () => [instanceA]),
          listDecks: vi.fn(async () => [deck]),
          validateInstance: vi.fn(async () => invalid),
        }),
      );
      const notice = await screen.findByRole("region", { name: "Data check" });
      await waitFor(() => {
        expect(notice).toHaveTextContent("Kanji N5 is set aside until repaired; the rest keeps working.");
      });
      expect(await screen.findByText("Set aside: its data needs repair")).toBeInTheDocument();
    });

    it("waits for the check while the preferences are read, as a user who blocks the instance would", async () => {
      const answers: ((preferences: typeof DEFAULT_PREFERENCES) => void)[] = [];
      const pending: ((report: typeof invalid) => void)[] = [];
      renderWorkspace(
        makeUseCases({
          listInstances: vi.fn(async () => [instanceA]),
          listDecks: vi.fn(async () => [deck]),
          getPreferences: vi.fn(() => new Promise<typeof DEFAULT_PREFERENCES>((resolve) => answers.push(resolve))),
          validateInstance: vi.fn(() => new Promise<typeof invalid>((r) => pending.push(r))),
        }),
      );
      expect(await screen.findByText("Checking this instance's data…")).toBeInTheDocument();
      await waitFor(() => {
        expect(answers.length).toBeGreaterThan(0);
      });
      answers.forEach((answer) => answer(DEFAULT_PREFERENCES));
      expect(await screen.findByRole("heading", { name: "Decks" })).toBeInTheDocument();
      expect(screen.queryByText("Checking this instance's data…")).toBeNull();
      pending.forEach((resolve) => resolve(invalid));
    });

    it("blocks nothing over what another app wrote, whose problems the check reports as warnings", async () => {
      const foreign = {
        instanceUrl: instanceA.url,
        violationCount: 0,
        conforms: true,
        documents: [
          {
            url: `${instanceA.url}catalog.ttl`,
            status: "checked" as const,
            subjects: [
              {
                url: `${instanceA.url}catalog.ttl#theirs`,
                status: "profiled" as const,
                violations: [{ message: { en: "Less than 1 values" }, severity: "warning" as const, constraint: "MinCount", profile: "dcat-ap" as const }],
                foreign: true as const,
              },
            ],
          },
        ],
      };
      renderWorkspace(
        makeUseCases({
          listInstances: vi.fn(async () => [instanceA]),
          listDecks: vi.fn(async () => [deck]),
          getPreferences: withPolicy("block-instance"),
          validateInstance: vi.fn(async () => foreign),
        }),
      );
      expect(await screen.findByText("Kanji N5")).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Data check" })).toBeNull();
    });

    it("keeps the deck list from being rearranged while the catalogue or a deck group is set aside", async () => {
      const catalog = {
        ...invalid,
        documents: [
          {
            ...invalid.documents[0],
            subjects: [{ ...invalid.documents[0].subjects[0], url: `${instanceA.url}catalog.ttl#catalog`, shape: "catalog" as const, version: 1 }],
          },
        ],
      };
      renderWorkspace(
        makeUseCases({
          listInstances: vi.fn(async () => [instanceA]),
          listDecks: vi.fn(async () => [deck]),
          validateInstance: vi.fn(async () => catalog),
        }),
      );
      const notice = await screen.findByRole("region", { name: "Data check" });
      await waitFor(() => {
        expect(notice).toHaveTextContent(
          "The rest keeps working. The deck list cannot be rearranged until its arrangement is repaired.",
        );
      });
      expect(
        await screen.findByText("The arrangement of these decks has invalid data, so they cannot be rearranged until it is repaired."),
      ).toBeInTheDocument();
      expect(screen.getByText("Kanji N5")).toBeInTheDocument();
      expect(screen.queryByText("Set aside: its data needs repair")).toBeNull();
    });

    it("says a set-aside deck is set aside when it is opened", async () => {
      window.history.replaceState(null, "", routeToHash({ screen: "browser", instanceUrl: instanceA.url, deckUrl: deck.url }));
      renderWorkspace(
        makeUseCases({
          listInstances: vi.fn(async () => [instanceA]),
          listDecks: vi.fn(async () => [deck]),
          getPreferences: withPolicy("block-subject"),
          validateInstance: vi.fn(async () => invalid),
        }),
      );
      expect(await screen.findByText(/This deck is set aside/)).toBeInTheDocument();
    });

    it("holds a deck's pages under the default policy until the check says whether the deck is set aside", async () => {
      window.history.replaceState(null, "", routeToHash({ screen: "browser", instanceUrl: instanceA.url, deckUrl: deck.url }));
      const pending: ((report: typeof invalid) => void)[] = [];
      renderWorkspace(
        makeUseCases({
          listInstances: vi.fn(async () => [instanceA]),
          listDecks: vi.fn(async () => [deck]),
          validateInstance: vi.fn(() => new Promise<typeof invalid>((r) => pending.push(r))),
        }),
      );
      await waitFor(() => {
        expect(pending.length).toBeGreaterThan(0);
      });
      expect(await screen.findByText("Checking this instance's data…")).toBeInTheDocument();
      pending.forEach((resolve) => resolve({ ...invalid, violationCount: 0, conforms: true, documents: [] }));
      await waitFor(() => {
        expect(screen.queryByText("Checking this instance's data…")).toBeNull();
      });
      expect(screen.queryByText(/This deck is set aside/)).toBeNull();
    });

    it("only warns under the warn-only policy, and says so when nothing is set aside", async () => {
      const policy = withPolicy("warn-only");
      renderWorkspace(
        makeUseCases({
          listInstances: vi.fn(async () => [instanceA]),
          listDecks: vi.fn(async () => [deck]),
          getPreferences: policy,
          validateInstance: vi.fn(async () => invalid),
        }),
      );
      expect(await screen.findByRole("region", { name: "Data check" })).toHaveTextContent("Solid Memo keeps working with it.");
      expect(await screen.findByText("Kanji N5")).toBeInTheDocument();
    });

    it("says the rest keeps working when invalid data belongs to no deck", async () => {
      const elsewhere = { ...invalid, documents: [{ ...invalid.documents[0], subjects: [{ ...invalid.documents[0].subjects[0], url: `${instanceA.url}catalog.ttl#catalog` }] }] };
      renderWorkspace(
        makeUseCases({
          listInstances: vi.fn(async () => [instanceA]),
          listDecks: vi.fn(async () => [deck]),
          getPreferences: withPolicy("block-subject"),
          validateInstance: vi.fn(async () => elsewhere),
        }),
      );
      const notice = await screen.findByRole("region", { name: "Data check" });
      await waitFor(() => {
        expect(notice).toHaveTextContent("The rest keeps working.");
      });
    });

    it("goes on, with a warning, when the check itself fails", async () => {
      renderWorkspace(
        makeUseCases({
          listInstances: vi.fn(async () => [instanceA]),
          listDecks: vi.fn(async () => [deck]),
          validateInstance: vi.fn(async () => {
            throw new Error("shapes offline");
          }),
        }),
      );
      expect((await screen.findByText("shapes offline")).closest(".warning")).toHaveTextContent(
        "Could not check this instance's data: Something went wrong. Try again, or reload the page. Details: shapes offline",
      );
      expect(await screen.findByText("Kanji N5")).toBeInTheDocument();
    });
  });

  it("shows a loading state while instances are being listed", () => {
    renderWorkspace(
      makeUseCases({
        listInstances: vi.fn(() => new Promise<Instance[]>(() => { })),
      }),
    );
    expect(
      screen.getByText("Loading your Solid Memo instances…"),
    ).toBeInTheDocument();
  });

  it("shows an error when listing instances fails", async () => {
    renderWorkspace(
      makeUseCases({
        listInstances: vi.fn(async () => {
          throw new Error("indexes unreachable");
        }),
      }),
    );
    expect(
      await screen.findByText("indexes unreachable"),
    ).toBeInTheDocument();
  });

  it("goes straight home with exactly one instance, showing it in the bar", async () => {
    renderWorkspace(makeUseCases({ listInstances: vi.fn(async () => [instanceA]) }));
    expect(
      await screen.findByRole("heading", { name: "Decks" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Deck set A")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open in your Pod (opens in a new tab)" })).toHaveAttribute("href", instanceA.url);
  });

  it("reads the home screen's decks once, for the list and its counts", async () => {
    const useCases = makeUseCases({ listInstances: vi.fn(async () => [instanceA]) });
    renderWorkspace(useCases);
    await screen.findByRole("heading", { name: "Decks" });
    await waitFor(() => {
      expect(useCases.listDeckTree).toHaveBeenCalledOnce();
    });
    expect(useCases.listDecks).toHaveBeenCalledOnce();
  });

  it("offers the instance picker with several instances, then opens one", async () => {
    renderWorkspace(
      makeUseCases({
        listInstances: vi.fn(async () => [instanceA, instanceB]),
      }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Deck set B" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Decks" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Deck set B")).toBeInTheDocument();
  });

  it("starts at the storage picker when no instances exist", async () => {
    renderWorkspace(makeUseCases());
    expect(
      await screen.findByRole("heading", { name: "Choose a storage" }),
    ).toBeInTheDocument();
  });

  it("shows a storage loading state", async () => {
    renderWorkspace(
      makeUseCases({
        listStorages: vi.fn(() => new Promise<Storage[]>(() => { })),
      }),
    );
    expect(
      await screen.findByText("Discovering storages…"),
    ).toBeInTheDocument();
  });

  it("shows an error when storage discovery fails", async () => {
    renderWorkspace(
      makeUseCases({
        listStorages: vi.fn(async () => {
          throw new Error("no storages");
        }),
      }),
    );
    expect(await screen.findByText("no storages")).toBeInTheDocument();
  });

  it("skips the storage picker when exactly one storage exists", async () => {
    renderWorkspace(makeUseCases({ listStorages: vi.fn(async () => [storageA]) }));
    expect(
      await screen.findByRole("heading", { name: "New Solid Memo instance" }),
    ).toBeInTheDocument();
  });

  it("selects a storage and creates an instance there", async () => {
    const useCases = makeUseCases({
      listInstances: vi
        .fn<() => Promise<Instance[]>>()
        .mockResolvedValueOnce([])
        .mockResolvedValue([instanceA]),
    });
    renderWorkspace(useCases);

    fireEvent.click(
      await screen.findByRole("button", { name: "https://pod.example/" }),
    );
    fireEvent.input(await screen.findByLabelText("Name"), {
      target: { value: "Deck set A" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Create instance" }).closest("form")!,
    );

    expect(
      await screen.findByRole("heading", { name: "Decks" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Deck set A")).toBeInTheDocument();
    expect(useCases.createInstance).toHaveBeenCalledWith(session, {
      containerUrl: "https://pod.example/solid-memo/main/",
      name: "Deck set A",
      registrationTarget: "private",
    });
  });

  it("adds a manual storage and continues to the creator", async () => {
    const useCases = makeUseCases();
    renderWorkspace(useCases);

    fireEvent.input(await screen.findByLabelText("Storage URL"), {
      target: { value: "https://pod.example/" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Use this storage" }).closest("form")!,
    );

    expect(
      await screen.findByRole("heading", { name: "New Solid Memo instance" }),
    ).toBeInTheDocument();
    expect(useCases.addManualStorage).toHaveBeenCalledWith(
      "https://pod.example/",
    );
  });

  it("shows a create error and stays on the creator", async () => {
    const useCases = makeUseCases({
      listStorages: vi.fn(async () => [storageA]),
      createInstance: vi.fn(async () => {
        throw new Error("registration refused");
      }),
    });
    renderWorkspace(useCases);

    fireEvent.input(await screen.findByLabelText("Name"), {
      target: { value: "X" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Create instance" }).closest("form")!,
    );
    expect(
      await screen.findByText("registration refused"),
    ).toBeInTheDocument();
  });

  it("navigates back from the creator to the instance picker", async () => {
    renderWorkspace(makeUseCases({ listStorages: vi.fn(async () => [storageA]) }));

    fireEvent.click(await screen.findByRole("link", { name: "Back" }));
    expect(
      await screen.findByRole("heading", {
        name: "Choose a Solid Memo instance",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No instances are registered yet."),
    ).toBeInTheDocument();
  });

  it("reaches the creator from the instance picker via the storage picker", async () => {
    renderWorkspace(
      makeUseCases({
        listInstances: vi.fn(async () => [instanceA, instanceB]),
      }),
    );

    fireEvent.click(
      await screen.findByRole("link", { name: "New instance…" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "https://pod.example/" }),
    );
    expect(
      await screen.findByRole("heading", { name: "New Solid Memo instance" }),
    ).toBeInTheDocument();
  });

  it("attaches an instance by URL and opens it", async () => {
    const useCases = makeUseCases({
      listInstances: vi.fn(async () => [instanceA, instanceB]),
    });
    renderWorkspace(useCases);

    fireEvent.input(
      await screen.findByLabelText("Instance container URL"),
      { target: { value: "https://pod.example/solid-memo/b/" } },
    );
    fireEvent.submit(
      screen.getByRole("button", { name: "Attach" }).closest("form")!,
    );

    await waitFor(() => {
      expect(useCases.attachInstanceByUrl).toHaveBeenCalledWith(
        session,
        "https://pod.example/solid-memo/b/",
        "private",
      );
    });
    expect(
      await screen.findByRole("heading", { name: "Decks" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Deck set B")).toBeInTheDocument();
  });

  it("deletes an instance from the Switch instance view", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    let deleted = false;
    const useCases = makeUseCases({
      listInstances: vi.fn(async () =>
        deleted ? [instanceA] : [instanceA, instanceB],
      ),
      deleteInstance: vi.fn(async () => {
        deleted = true;
        return { keptFolder: null };
      }),
    });
    renderWorkspace(useCases);

    fireEvent.click(
      await screen.findByRole("button", { name: "Delete instance Deck set B" }),
    );

    await waitFor(() => {
      expect(useCases.deleteInstance).toHaveBeenCalledWith(session, instanceB);
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Deck set B" }),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Deck set A" })).toBeInTheDocument();
  });

  it("says when deleting an instance kept its folder, which holds another app's files", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    let deleted = false;
    const useCases = makeUseCases({
      listInstances: vi.fn(async () => (deleted ? [instanceA] : [instanceA, instanceB])),
      deleteInstance: vi.fn(async () => {
        deleted = true;
        return { keptFolder: instanceB.url };
      }),
    });
    renderWorkspace(useCases);

    fireEvent.click(await screen.findByRole("button", { name: "Delete instance Deck set B" }));

    const notice = await screen.findByText(/Solid Memo deleted its own data and kept/);
    expect(notice).toHaveTextContent("another app put files there.");
    expect(within(notice).getByRole("link", { name: "the folder in your Pod (opens in a new tab)" })).toHaveAttribute(
      "href",
      instanceB.url,
    );
  });

  it("shows the error when deleting an instance fails", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const useCases = makeUseCases({
      listInstances: vi.fn(async () => [instanceA, instanceB]),
      deleteInstance: vi.fn(async () => {
        throw new Error("pod said no");
      }),
    });
    renderWorkspace(useCases);

    fireEvent.click(
      await screen.findByRole("button", { name: "Delete instance Deck set B" }),
    );

    expect(await screen.findByText("pod said no")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deck set B" })).toBeInTheDocument();
  });

  it("returns to the instance picker from home", async () => {
    renderWorkspace(makeUseCases({ listInstances: vi.fn(async () => [instanceA]) }));

    fireEvent.click(
      await screen.findByRole("link", { name: "Switch instance" }),
    );
    expect(
      await screen.findByRole("heading", {
        name: "Choose a Solid Memo instance",
      }),
    ).toBeInTheDocument();
  });

  it("opens the updated instance at its new address once a format update switched over", async () => {
    let instances = [instanceA];
    renderWorkspace(
      makeUseCases({
        listInstances: vi.fn(async () => instances),
        planMigration: vi.fn(async () => ({
          decks: [],
          deckCount: 0,
          cardCount: 0,
          reviewCount: 0,
          preferencesOutdated: true,
          instanceOutdated: false,
          catalogMissing: false,
        })),
        updateInstance: vi.fn(async () => {
          instances = [instanceB];
          return { ok: true as const, instanceUrl: instanceB.url, backupUrl: instanceA.url };
        }),
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Update preferences" }));
    fireEvent.click(screen.getByRole("button", { name: "Start the update" }));
    expect(await screen.findByText("Deck set B")).toBeInTheDocument();
  });

  it("opens the previous version once its backup is restored from the preferences", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    let instances = [instanceA];
    renderWorkspace(
      makeUseCases({
        listInstances: vi.fn(async () => instances),
        readBackup: vi.fn(async () => ({ url: instanceB.url })),
        restoreBackup: vi.fn(async () => {
          instances = [instanceB];
          return { instance: instanceB, keptFolder: null };
        }),
      }),
    );
    fireEvent.click(await screen.findByRole("link", { name: "Preferences" }));
    fireEvent.click(await screen.findByRole("button", { name: "Restore previous version" }));
    expect(await screen.findByRole("heading", { name: "Decks" })).toBeInTheDocument();
    expect(screen.getByText("Deck set B")).toBeInTheDocument();
    expect(screen.queryByText(/Solid Memo deleted its own data/)).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("says, on the restored instance, that the updated instance's folder was kept for another app's files", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    let instances = [instanceA];
    renderWorkspace(
      makeUseCases({
        listInstances: vi.fn(async () => instances),
        readBackup: vi.fn(async () => ({ url: instanceB.url })),
        restoreBackup: vi.fn(async () => {
          instances = [instanceB];
          return { instance: instanceB, keptFolder: instanceA.url };
        }),
      }),
    );
    fireEvent.click(await screen.findByRole("link", { name: "Preferences" }));
    fireEvent.click(await screen.findByRole("button", { name: "Restore previous version" }));
    expect(await screen.findByRole("heading", { name: "Decks" })).toBeInTheDocument();
    const notice = await screen.findByText(/Solid Memo deleted its own data and kept/);
    expect(within(notice).getByRole("link")).toHaveAttribute("href", instanceA.url);
    vi.unstubAllGlobals();
  });

  it("opens the preferences from home and navigates back", async () => {
    renderWorkspace(
      makeUseCases({ listInstances: vi.fn(async () => [instanceA]) }),
    );

    fireEvent.click(
      await screen.findByRole("link", { name: "Preferences" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Study preferences" }),
    ).toBeInTheDocument();

    const trail = within(screen.getByRole("navigation", { name: "Breadcrumb" }));
    fireEvent.click(trail.getByRole("link", { name: "Decks" }));
    expect(
      await screen.findByRole("heading", { name: "Decks" }),
    ).toBeInTheDocument();
  });

  it("opens the statistics from the instance bar", async () => {
    renderWorkspace(makeUseCases({ listInstances: vi.fn(async () => [instanceA]) }));
    fireEvent.click(await screen.findByRole("link", { name: "Statistics" }));
    expect(await screen.findByRole("heading", { name: "Statistics" })).toBeInTheDocument();
    expect(screen.getByText("No answers yet: the statistics begin with your next study session.")).toBeInTheDocument();
  });

  it("opens the statistics straight from their address, before any deck is loaded", async () => {
    window.history.replaceState(null, "", statisticsHref(instanceA.url));
    renderWorkspace(makeUseCases({ listInstances: vi.fn(async () => [instanceA]) }));
    expect(await screen.findByRole("heading", { name: "Statistics" })).toBeInTheDocument();
  });

  it("creates a deck in the deck creator and returns to the deck list", async () => {
    const deck: Deck = {
      id: "deck-1",
      url: `${instanceA.url}catalog.ttl#deck-1`,
      title: { en: "Kana" },
      cardsDocumentUrl: `${instanceA.url}decks/deck-1.ttl`,
      reviewsDocumentUrl: `${instanceA.url}reviews/deck-1.ttl`,
      direction: "front-to-back" as const,
      createdAt: "2026-09-21T10:00:00.000Z",
      formatVersion: 1,
      authors: [],
    };
    // None until it is added: the deck list and its arrangement each read them.
    let added = false;
    const listDecks = vi.fn(async (): Promise<Deck[]> => (added ? [deck] : []));
    renderWorkspace(
      makeUseCases({
        listInstances: vi.fn(async () => [instanceA]),
        listDecks,
        createDeck: vi.fn(async () => {
          added = true;
          return deck;
        }),
      }),
    );

    fireEvent.click(
      await screen.findByRole("link", { name: "Create deck" }),
    );
    expect(
      await screen.findByRole("heading", { name: "New deck" }),
    ).toBeInTheDocument();

    fireEvent.input(screen.getByLabelText("Name"), {
      target: { value: "Kana" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Language: not stated" }));
    fireEvent.click(screen.getByRole("radio", { name: "English (en)" }));
    fireEvent.submit(
      screen.getByRole("button", { name: "Create deck" }).closest("form")!,
    );

    expect(
      await screen.findByRole("heading", { name: "Decks" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: "Kana" }),
    ).toBeInTheDocument();
  });

  it("imports a library deck and returns to the deck list", async () => {
    const deck: Deck = {
      id: "deck-1",
      url: `${instanceA.url}catalog.ttl#deck-1`,
      title: { en: "Capitals" },
      cardsDocumentUrl: `${instanceA.url}decks/deck-1.ttl`,
      reviewsDocumentUrl: `${instanceA.url}reviews/deck-1.ttl`,
      direction: "front-to-back" as const,
      createdAt: "2026-09-21T10:00:00.000Z",
      formatVersion: 1,
      authors: [],
      sourceUrl: "https://solid-memo.com/decks/capitals/v1.ttl",
    };
    // None until it is added: the deck list and its arrangement each read them.
    let added = false;
    const listDecks = vi.fn(async (): Promise<Deck[]> => (added ? [deck] : []));
    renderWorkspace(
      makeUseCases({
        listInstances: vi.fn(async () => [instanceA]),
        listDecks,
        listLibraryDecks: vi.fn(async () => [
          {
            url: deck.sourceUrl!,
            ...firstRelease(deck.sourceUrl!),
            title: { en: "Capitals" },
            cardCount: 3,
            authors: [],
            direction: "front-to-back" as const,
            sources: [],
          },
        ]),
        importLibraryDeck: vi.fn(async () => {
          added = true;
          return deck;
        }),
      }),
    );

    fireEvent.click(await screen.findByRole("link", { name: "Deck library" }));
    expect(
      await screen.findByRole("heading", { name: "Deck library" }),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe(
      routeToHash({ screen: "library", instanceUrl: instanceA.url }),
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Capitals" }));
    fireEvent.submit(
      screen.getByRole("button", { name: "Import 1 deck" }).closest("form")!,
    );

    expect(
      await screen.findByRole("heading", { name: "Decks" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: "Capitals" }),
    ).toBeInTheDocument();
  });

  it("opens a library deck's page from the library and imports it there", async () => {
    const libraryUrl = "https://solid-memo.com/decks/capitals/v1.ttl";
    const deck: Deck = {
      id: "deck-1",
      url: `${instanceA.url}catalog.ttl#deck-1`,
      title: { en: "Capitals" },
      cardsDocumentUrl: `${instanceA.url}decks/deck-1.ttl`,
      reviewsDocumentUrl: `${instanceA.url}reviews/deck-1.ttl`,
      direction: "front-to-back" as const,
      createdAt: "2026-09-21T10:00:00.000Z",
      formatVersion: 1,
      authors: [],
      sourceUrl: libraryUrl,
    };
    // None until it is added: the deck list and its arrangement each read them.
    let added = false;
    const listDecks = vi.fn(async (): Promise<Deck[]> => (added ? [deck] : []));
    renderWorkspace(
      makeUseCases({
        listInstances: vi.fn(async () => [instanceA]),
        listDecks,
        listLibraryDecks: vi.fn(async () => [
          {
            url: libraryUrl,
            ...firstRelease(libraryUrl),
            title: { en: "Capitals" },
            cardCount: 3,
            authors: ["Anton Wiklund"],
            description: { en: "Every capital." },
            direction: "front-to-back" as const,
            sources: [],
          },
        ]),
        importLibraryDeck: vi.fn(async () => {
          added = true;
          return deck;
        }),
      }),
    );

    fireEvent.click(await screen.findByRole("link", { name: "Deck library" }));
    fireEvent.click(await screen.findByRole("link", { name: "Capitals" }));
    expect(
      await screen.findByRole("heading", { name: "Capitals" }),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe(
      routeToHash({
        screen: "libraryDeck",
        instanceUrl: instanceA.url,
        libraryDeckUrl: librarySeriesUrlOf(libraryUrl),
      }),
    );
    expect(screen.getByText("Every capital.")).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(
      within(nav).getByRole("link", { name: "Deck library" }),
    ).toHaveAttribute(
      "href",
      routeToHash({ screen: "library", instanceUrl: instanceA.url }),
    );
    expect(within(nav).getByRole("link", { name: "Capitals" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    fireEvent.click(screen.getByRole("button", { name: "Import this deck" }));
    expect(
      await screen.findByRole("heading", { name: "Decks" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: "Capitals" }),
    ).toBeInTheDocument();
  });

  it("browses a library deck's cards from its page and pages through them", async () => {
    const libraryUrl = "https://solid-memo.com/decks/capitals/v1.ttl";
    const cards = Array.from({ length: CARDS_PER_PAGE + 1 }, (_, i) => ({
      id: `card-${i + 1}`,
      front: { "": `Front ${i + 1}` },
      back: { "": `Back ${i + 1}` },
      formatVersion: 1,
    }));
    renderWorkspace(
      makeUseCases({
        listInstances: vi.fn(async () => [instanceA]),
        listLibraryDecks: vi.fn(async () => [
          { url: libraryUrl, ...firstRelease(libraryUrl), title: { en: "Capitals" }, cardCount: 11, authors: [], direction: "front-to-back" as const, sources: [] },
        ]),
        listLibraryCards: vi.fn(async () => cards),
      }),
    );

    fireEvent.click(await screen.findByRole("link", { name: "Deck library" }));
    fireEvent.click(await screen.findByRole("link", { name: "Capitals" }));
    fireEvent.click(await screen.findByRole("link", { name: "Browse cards" }));

    expect(
      await screen.findByRole("heading", { name: "Cards: Capitals" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Front 1")).toBeInTheDocument();
    const browse = {
      screen: "libraryBrowser",
      instanceUrl: instanceA.url,
      libraryDeckUrl: librarySeriesUrlOf(libraryUrl),
    } as const;
    expect(window.location.hash).toBe(routeToHash(browse));

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Front 11")).toBeInTheDocument();
    expect(window.location.hash).toBe(routeToHash({ ...browse, page: 2 }));

    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(nav).getByRole("link", { name: "Cards" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    fireEvent.click(within(nav).getByRole("link", { name: "Capitals" }));
    expect(
      await screen.findByRole("button", { name: "Import this deck" }),
    ).toBeInTheDocument();
  });

  it("previews a library deck from the library and goes back to it", async () => {
    const libraryUrl = "https://solid-memo.com/decks/capitals/v1.ttl";
    renderWorkspace(
      makeUseCases({
        listInstances: vi.fn(async () => [instanceA]),
        listLibraryDecks: vi.fn(async () => [
          { url: libraryUrl, ...firstRelease(libraryUrl), title: { en: "Capitals" }, cardCount: 1, authors: [], direction: "front-to-back" as const, sources: [] },
        ]),
        listLibraryCards: vi.fn(async () => [
          { id: "se", front: { "": "Sweden" }, back: { "": "Stockholm" }, formatVersion: 1 },
        ]),
      }),
    );

    fireEvent.click(await screen.findByRole("link", { name: "Deck library" }));
    fireEvent.click(await screen.findByRole("link", { name: "Preview Capitals" }));

    expect(
      await screen.findByRole("heading", { name: "Preview: Capitals" }),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe(
      routeToHash({
        screen: "libraryPreview",
        instanceUrl: instanceA.url,
        libraryDeckUrl: librarySeriesUrlOf(libraryUrl),
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Reveal" }));
    expect(screen.getByText("Stockholm")).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(nav).getByRole("link", { name: "Preview" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    fireEvent.click(screen.getByRole("button", { name: "Back to library" }));
    expect(
      await screen.findByRole("checkbox", { name: "Capitals" }),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe(
      routeToHash({ screen: "library", instanceUrl: instanceA.url }),
    );
  });

  it("opens a library card from the deck's card list and goes back to the list", async () => {
    const libraryUrl = "https://solid-memo.com/decks/capitals/v1.ttl";
    renderWorkspace(
      makeUseCases({
        listInstances: vi.fn(async () => [instanceA]),
        listLibraryDecks: vi.fn(async () => [
          { url: libraryUrl, ...firstRelease(libraryUrl), title: { en: "Capitals" }, cardCount: 1, authors: [], direction: "front-to-back" as const, sources: [] },
        ]),
        listLibraryCards: vi.fn(async () => [
          { id: "sweden", front: { "": "Sweden" }, back: { "": "Stockholm" }, formatVersion: 1 },
        ]),
      }),
    );

    fireEvent.click(await screen.findByRole("link", { name: "Deck library" }));
    fireEvent.click(await screen.findByRole("link", { name: "Capitals" }));
    fireEvent.click(await screen.findByRole("link", { name: "Browse cards" }));
    fireEvent.click(await screen.findByRole("link", { name: "Sweden" }));

    expect(await screen.findByRole("heading", { name: "Card" })).toBeInTheDocument();
    expect(screen.getByText("Stockholm")).toBeInTheDocument();
    expect(window.location.hash).toBe(
      routeToHash({
        screen: "libraryCard",
        instanceUrl: instanceA.url,
        libraryDeckUrl: librarySeriesUrlOf(libraryUrl),
        cardId: "sweden",
      }),
    );
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(nav).getByRole("link", { name: "Sweden" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(within(nav).getByRole("link", { name: "Cards" }));
    expect(await screen.findByRole("heading", { name: "Cards: Capitals" })).toBeInTheDocument();
  });

  it("falls back to the card list for a library card the deck does not have", async () => {
    const libraryUrl = "https://solid-memo.com/decks/capitals/v1.ttl";
    const libraryDeckUrl = librarySeriesUrlOf(libraryUrl);
    window.history.replaceState(
      null,
      "",
      routeToHash({ screen: "libraryCard", instanceUrl: instanceA.url, libraryDeckUrl, cardId: "atlantis" }),
    );
    renderWorkspace(
      makeUseCases({
        listInstances: vi.fn(async () => [instanceA]),
        listLibraryDecks: vi.fn(async () => [
          { url: libraryUrl, ...firstRelease(libraryUrl), title: { en: "Capitals" }, cardCount: 1, authors: [], direction: "front-to-back" as const, sources: [] },
        ]),
        listLibraryCards: vi.fn(async () => [
          { id: "sweden", front: { "": "Sweden" }, back: { "": "Stockholm" }, formatVersion: 1 },
        ]),
      }),
    );
    expect(await screen.findByRole("heading", { name: "Cards: Capitals" })).toBeInTheDocument();
    expect(window.location.hash).toBe(
      routeToHash({ screen: "libraryBrowser", instanceUrl: instanceA.url, libraryDeckUrl }),
    );
  });

  it("shows an error when a library card's deck cannot be read", async () => {
    const libraryUrl = "https://solid-memo.com/decks/capitals/v1.ttl";
    window.history.replaceState(
      null,
      "",
      routeToHash({
        screen: "libraryCard",
        instanceUrl: instanceA.url,
        libraryDeckUrl: librarySeriesUrlOf(libraryUrl),
        cardId: "sweden",
      }),
    );
    renderWorkspace(
      makeUseCases({
        listInstances: vi.fn(async () => [instanceA]),
        listLibraryDecks: vi.fn(async () => [
          { url: libraryUrl, ...firstRelease(libraryUrl), title: { en: "Capitals" }, cardCount: 1, authors: [], direction: "front-to-back" as const, sources: [] },
        ]),
        listLibraryCards: vi.fn(async () => {
          throw new Error("library offline");
        }),
      }),
    );
    expect((await screen.findByText("library offline")).closest(".error")).toBeInTheDocument();
  });

  it("opens a library deck's page from a link to one of its releases", async () => {
    const release = "https://solid-memo.com/decks/capitals/v1.ttl";
    window.history.replaceState(
      null,
      "",
      routeToHash({ screen: "libraryDeck", instanceUrl: instanceA.url, libraryDeckUrl: release }),
    );
    renderWorkspace(
      makeUseCases({
        listInstances: vi.fn(async () => [instanceA]),
        listLibraryDecks: vi.fn(async () => [
          {
            url: "https://solid-memo.com/decks/capitals/v2.ttl",
            ...firstRelease(release),
            releases: [
              { url: release, version: "1" },
              { url: "https://solid-memo.com/decks/capitals/v2.ttl", version: "2" },
            ],
            title: { en: "Capitals" },
            cardCount: 3,
            authors: [],
            direction: "front-to-back" as const,
            sources: [],
          },
        ]),
      }),
    );

    expect(await screen.findByRole("heading", { name: "Capitals" })).toBeInTheDocument();
  });

  it("falls back to the library from a deep link to a deck it does not have", async () => {
    window.history.replaceState(
      null,
      "",
      routeToHash({
        screen: "libraryDeck",
        instanceUrl: instanceA.url,
        libraryDeckUrl: "https://solid-memo.com/decks/nope/v1.ttl",
      }),
    );
    renderWorkspace(
      makeUseCases({
        listInstances: vi.fn(async () => [instanceA]),
        listLibraryDecks: vi.fn(async () => [
          {
            url: "https://solid-memo.com/decks/capitals/v1.ttl",
            ...firstRelease("https://solid-memo.com/decks/capitals/v1.ttl"),
            title: { en: "Capitals" },
            cardCount: 3,
            authors: [],
            direction: "front-to-back" as const,
            sources: [],
          },
        ]),
      }),
    );

    expect(
      await screen.findByRole("heading", { name: "Deck library" }),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe(
      routeToHash({ screen: "library", instanceUrl: instanceA.url }),
    );
  });

  it("shows the error when the library cannot be read for a deck's page", async () => {
    window.history.replaceState(
      null,
      "",
      routeToHash({
        screen: "libraryDeck",
        instanceUrl: instanceA.url,
        libraryDeckUrl: "https://solid-memo.com/decks/capitals/v1.ttl",
      }),
    );
    renderWorkspace(
      makeUseCases({
        listInstances: vi.fn(async () => [instanceA]),
        listLibraryDecks: vi.fn(async () => {
          throw new Error("library offline");
        }),
      }),
    );

    expect(screen.getByText("Loading your Solid Memo instances…")).toBeInTheDocument();
    expect((await screen.findByText("library offline")).closest(".error")).toBeInTheDocument();
  });

  it("opens a deck from home and navigates back", async () => {
    const deck: Deck = {
      id: "deck-1",
      url: `${instanceA.url}catalog.ttl#deck-1`,
      title: { en: "Kanji N5" },
      cardsDocumentUrl: `${instanceA.url}decks/deck-1.ttl`,
      reviewsDocumentUrl: `${instanceA.url}reviews/deck-1.ttl`,
      direction: "front-to-back" as const,
      createdAt: "2026-09-21T10:00:00.000Z",
      formatVersion: 1,
      authors: [],
    };
    renderWorkspace(
      makeUseCases({
        listInstances: vi.fn(async () => [instanceA]),
        listDecks: vi.fn(async () => [deck]),
      }),
    );

    fireEvent.click(await screen.findByRole("link", { name: "Kanji N5" }));
    expect(
      await screen.findByRole("heading", { name: "Kanji N5" }),
    ).toBeInTheDocument();

    const trail = within(screen.getByRole("navigation", { name: "Breadcrumb" }));
    fireEvent.click(trail.getByRole("link", { name: "Decks" }));
    expect(
      await screen.findByRole("heading", { name: "Decks" }),
    ).toBeInTheDocument();
  });

  it("reaches the card creator from the Browser only, and returns there", async () => {
    const deck: Deck = {
      id: "deck-1",
      url: `${instanceA.url}catalog.ttl#deck-1`,
      title: { en: "Kanji N5" },
      cardsDocumentUrl: `${instanceA.url}decks/deck-1.ttl`,
      reviewsDocumentUrl: `${instanceA.url}reviews/deck-1.ttl`,
      direction: "front-to-back" as const,
      createdAt: "2026-09-21T10:00:00.000Z",
      formatVersion: 1,
      authors: [],
    };
    renderWorkspace(
      makeUseCases({
        listInstances: vi.fn(async () => [instanceA]),
        listDecks: vi.fn(async () => [deck]),
      }),
    );

    fireEvent.click(await screen.findByRole("link", { name: "Kanji N5" }));
    const browserLink = await screen.findByRole("link", {
      name: "Browser",
    });
    expect(screen.queryByRole("link", { name: "Add card" })).toBeNull();

    fireEvent.click(browserLink);
    fireEvent.click(await screen.findByRole("link", { name: "Add card" }));
    expect(
      await screen.findByRole("heading", { name: "New card" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Back" }));
    expect(
      await screen.findByRole("heading", { name: "Browser: Kanji N5" }),
    ).toBeInTheDocument();
  });

  it("keeps the Browser page in the URL and restores it on Back from a card", async () => {
    const deck: Deck = {
      id: "deck-1",
      url: `${instanceA.url}catalog.ttl#deck-1`,
      title: { en: "Capitals" },
      cardsDocumentUrl: `${instanceA.url}decks/deck-1.ttl`,
      reviewsDocumentUrl: `${instanceA.url}reviews/deck-1.ttl`,
      direction: "front-to-back" as const,
      createdAt: "2026-09-21T10:00:00.000Z",
      formatVersion: 1,
      authors: [],
    };
    const cards: Card[] = Array.from({ length: CARDS_PER_PAGE + 1 }, (_, i) => ({
      id: `card-${i + 1}`,
      url: `${deck.cardsDocumentUrl}#card-${i + 1}`,
      front: { "": `Country ${i + 1}` },
      back: { "": `Capital ${i + 1}` },
      createdAt: "2026-09-21T10:00:00.000Z",
      formatVersion: 1,
    }));
    const useCases = makeUseCases({
      listInstances: vi.fn(async () => [instanceA]),
      listDecks: vi.fn(async () => [deck]),
      listCards: vi.fn(async () => cards),
    });
    renderWorkspace(useCases);

    fireEvent.click(await screen.findByRole("link", { name: "Capitals" }));
    fireEvent.click(await screen.findByRole("link", { name: "Browser" }));
    const browserHash = window.location.hash;
    const historyBefore = window.history.length;

    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    expect(await screen.findByText("Page 2 of 2")).toBeInTheDocument();
    expect(window.history.length).toBe(historyBefore);
    expect(window.location.hash).toBe(`${browserHash}&page=2`);

    fireEvent.click(
      screen.getByRole("link", { name: `Country ${CARDS_PER_PAGE + 1}` }),
    );
    expect(
      await screen.findByRole("heading", { name: "Card" }),
    ).toBeInTheDocument();

    window.history.back();
    expect(await screen.findByText("Page 2 of 2")).toBeInTheDocument();
  });

  it("keeps the Browser's language filter in the URL with its page, and restores both on Back from a card", async () => {
    const deck: Deck = {
      id: "deck-1",
      url: `${instanceA.url}catalog.ttl#deck-1`,
      title: { en: "Capitals" },
      cardsDocumentUrl: `${instanceA.url}decks/deck-1.ttl`,
      reviewsDocumentUrl: `${instanceA.url}reviews/deck-1.ttl`,
      direction: "front-to-back" as const,
      createdAt: "2026-09-21T10:00:00.000Z",
      formatVersion: 1,
      authors: [],
    };
    const cards: Card[] = Array.from({ length: CARDS_PER_PAGE + 2 }, (_, i): Card => ({
      id: `card-${i + 1}`,
      url: `${deck.cardsDocumentUrl}#card-${i + 1}`,
      // The first says its language; the others, two pages of them, do not.
      front: i === 0 ? { en: `Country ${i + 1}` } : { "": `Country ${i + 1}` },
      back: { "": `Capital ${i + 1}` },
      createdAt: "2026-09-21T10:00:00.000Z",
      formatVersion: 1,
    }));
    cards[0]!.back = { en: "Capital 1" };
    const useCases = makeUseCases({
      listInstances: vi.fn(async () => [instanceA]),
      listDecks: vi.fn(async () => [deck]),
      listCards: vi.fn(async () => cards),
    });
    renderWorkspace(useCases);

    fireEvent.click(await screen.findByRole("link", { name: "Capitals" }));
    fireEvent.click(await screen.findByRole("link", { name: "Browser" }));
    const browserHash = window.location.hash;
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    expect(await screen.findByText("Page 2 of 2")).toBeInTheDocument();

    // A change of filter starts at its first page.
    fireEvent.click(screen.getByRole("radio", { name: "No language stated" }));
    expect(await screen.findByText("Page 1 of 2")).toBeInTheDocument();
    expect(window.location.hash).toBe(`${browserHash}&languages=unstated`);
    expect(screen.queryByRole("link", { name: "Country 1" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Page 2 of 2")).toBeInTheDocument();
    expect(window.location.hash).toBe(`${browserHash}&languages=unstated&page=2`);

    fireEvent.click(screen.getByRole("link", { name: `Country ${CARDS_PER_PAGE + 2}` }));
    expect(await screen.findByRole("heading", { name: "Card" })).toBeInTheDocument();

    window.history.back();
    expect(await screen.findByText("Page 2 of 2")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "No language stated" })).toBeChecked();
    expect(screen.getByRole("link", { name: `Country ${CARDS_PER_PAGE + 2}` })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "All cards" }));
    expect(await screen.findByRole("link", { name: "Country 1" })).toBeInTheDocument();
    expect(window.location.hash).toBe(browserHash);
  });

  it("removes a deck from its preferences and lands on the deck list", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const deck: Deck = {
      id: "deck-1",
      url: `${instanceA.url}catalog.ttl#deck-1`,
      title: { en: "Kanji N5" },
      cardsDocumentUrl: `${instanceA.url}decks/deck-1.ttl`,
      reviewsDocumentUrl: `${instanceA.url}reviews/deck-1.ttl`,
      direction: "front-to-back" as const,
      createdAt: "2026-09-21T10:00:00.000Z",
      formatVersion: 1,
      authors: [],
    };
    let removed = false;
    const useCases = makeUseCases({
      listInstances: vi.fn(async () => [instanceA]),
      listDecks: vi.fn(async () => (removed ? [] : [deck])),
      removeDeck: vi.fn(async () => {
        removed = true;
      }),
    });
    renderWorkspace(useCases);

    fireEvent.click(await screen.findByRole("link", { name: "Kanji N5" }));
    fireEvent.click(await screen.findByRole("link", { name: "Deck preferences" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove deck" }));

    expect(await screen.findByText(/No decks yet/)).toBeInTheDocument();
    expect(useCases.removeDeck).toHaveBeenCalledWith(deck);
    expect(window.location.hash).toContain("#/decks");
  });

  it("shows a deck's new name after renaming it in its preferences", async () => {
    const deck: Deck = {
      id: "deck-1",
      url: `${instanceA.url}catalog.ttl#deck-1`,
      title: { en: "Kanji N5" },
      cardsDocumentUrl: `${instanceA.url}decks/deck-1.ttl`,
      reviewsDocumentUrl: `${instanceA.url}reviews/deck-1.ttl`,
      direction: "front-to-back" as const,
      createdAt: "2026-09-21T10:00:00.000Z",
      formatVersion: 1,
      authors: [],
    };
    let name = deck.title.en;
    renderWorkspace(
      makeUseCases({
        listInstances: vi.fn(async () => [instanceA]),
        listDecks: vi.fn(async () => [{ ...deck, title: { en: name } }]),
        renameDeck: vi.fn(async (renamed: Deck, title: LangText) => {
          name = title.en;
          return { ...renamed, title };
        }),
      }),
    );

    fireEvent.click(await screen.findByRole("link", { name: "Kanji N5" }));
    fireEvent.click(await screen.findByRole("link", { name: "Deck preferences" }));
    fireEvent.click(await screen.findByRole("button", { name: "Rename deck" }));
    fireEvent.input(screen.getByLabelText("Deck name"), {
      target: { value: "Kanji N4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));

    expect(
      await screen.findByRole("heading", { name: "Preferences: Kanji N4" }),
    ).toBeInTheDocument();
  });

  it("opens the Browser from the deck detail and navigates back", async () => {
    const deck: Deck = {
      id: "deck-1",
      url: `${instanceA.url}catalog.ttl#deck-1`,
      title: { en: "Kanji N5" },
      cardsDocumentUrl: `${instanceA.url}decks/deck-1.ttl`,
      reviewsDocumentUrl: `${instanceA.url}reviews/deck-1.ttl`,
      direction: "front-to-back" as const,
      createdAt: "2026-09-21T10:00:00.000Z",
      formatVersion: 1,
      authors: [],
    };
    renderWorkspace(
      makeUseCases({
        listInstances: vi.fn(async () => [instanceA]),
        listDecks: vi.fn(async () => [deck]),
      }),
    );

    fireEvent.click(await screen.findByRole("link", { name: "Kanji N5" }));
    fireEvent.click(await screen.findByRole("link", { name: "Browser" }));
    expect(
      await screen.findByRole("heading", { name: "Browser: Kanji N5" }),
    ).toBeInTheDocument();

    const trail = within(screen.getByRole("navigation", { name: "Breadcrumb" }));
    fireEvent.click(trail.getByRole("link", { name: "Kanji N5" }));
    expect(
      await screen.findByRole("heading", { name: "Kanji N5" }),
    ).toBeInTheDocument();
  });

  it("titles each screen and gives its heading focus after the user moves there", async () => {
    const deck: Deck = {
      id: "deck-1",
      url: `${instanceA.url}catalog.ttl#deck-1`,
      title: { en: "Kanji N5" },
      cardsDocumentUrl: `${instanceA.url}decks/deck-1.ttl`,
      reviewsDocumentUrl: `${instanceA.url}reviews/deck-1.ttl`,
      direction: "front-to-back" as const,
      createdAt: "2026-09-21T10:00:00.000Z",
      formatVersion: 1,
      authors: [],
    };
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    renderWorkspace(
      makeUseCases({
        listInstances: vi.fn(async () => [instanceA]),
        listDecks: vi.fn(async () => [deck]),
      }),
    );

    // Opening on the deck list is a redirect: nothing takes focus.
    const link = await screen.findByRole("link", { name: "Kanji N5" });
    await waitFor(() => expect(document.title).toBe("Decks – Solid Memo"));
    expect(screen.getByRole("heading", { name: /Decks/ })).not.toHaveFocus();

    fireEvent.click(link);
    const deckHeading = await screen.findByRole("heading", { name: "Kanji N5" });
    await waitFor(() => expect(deckHeading).toHaveFocus());
    expect(document.title).toBe("Kanji N5 – Decks – Solid Memo");

    fireEvent.click(screen.getByRole("link", { name: "Browser" }));
    const browserHeading = await screen.findByRole("heading", { name: "Browser: Kanji N5" });
    await waitFor(() => expect(browserHeading).toHaveFocus());
    await waitFor(() => expect(document.title).toBe("Browser – Kanji N5 – Solid Memo"));
    scrollTo.mockRestore();
  });

  it("opens the deck's preferences from the deck detail and returns there after saving", async () => {
    const deck: Deck = {
      id: "deck-1",
      url: `${instanceA.url}catalog.ttl#deck-1`,
      title: { en: "Kanji N5" },
      cardsDocumentUrl: `${instanceA.url}decks/deck-1.ttl`,
      reviewsDocumentUrl: `${instanceA.url}reviews/deck-1.ttl`,
      direction: "front-to-back" as const,
      createdAt: "2026-09-21T10:00:00.000Z",
      formatVersion: 3,
      authors: [],
    };
    const setDeckPace = vi.fn(async (d: Deck, pace: object) => ({ ...d, ...pace }));
    renderWorkspace(
      makeUseCases({
        listInstances: vi.fn(async () => [instanceA]),
        listDecks: vi.fn(async () => [deck]),
        setDeckPace,
      }),
    );

    fireEvent.click(await screen.findByRole("link", { name: "Kanji N5" }));
    fireEvent.click(await screen.findByRole("link", { name: "Deck preferences" }));
    expect(
      await screen.findByRole("heading", { name: "Preferences: Kanji N5" }),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe(
      routeToHash({ screen: "deckPreferences", instanceUrl: instanceA.url, deckUrl: deck.url }),
    );
    const trail = within(screen.getByRole("navigation", { name: "Breadcrumb" }));
    expect(trail.getByRole("link", { name: "Preferences" })).toHaveAttribute("aria-current", "page");

    fireEvent.input(screen.getByLabelText("New cards per day"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));
    expect(
      await screen.findByRole("heading", { name: "Kanji N5" }),
    ).toBeInTheDocument();
    expect(setDeckPace).toHaveBeenCalledWith(deck, { newCardsPerDay: 4 });
  });

  it("starts a study session from the deck detail and ends it on the deck list", async () => {
    const deck: Deck = {
      id: "deck-1",
      url: `${instanceA.url}catalog.ttl#deck-1`,
      title: { en: "Kanji N5" },
      cardsDocumentUrl: `${instanceA.url}decks/deck-1.ttl`,
      reviewsDocumentUrl: `${instanceA.url}reviews/deck-1.ttl`,
      direction: "front-to-back" as const,
      createdAt: "2026-09-21T10:00:00.000Z",
      formatVersion: 1,
      authors: [],
    };
    renderWorkspace(
      makeUseCases({
        listInstances: vi.fn(async () => [instanceA]),
        listDecks: vi.fn(async () => [deck]),
        getStudyQueue: vi.fn(async () => ({
          due: [
            {
              card: {
                id: "card-1",
                url: `${deck.cardsDocumentUrl}#card-1`,
                front: { "": "水" },
                back: { "": "water" },
                createdAt: "2026-09-21T10:00:00.000Z",
                formatVersion: 1,
              } satisfies Card,
              direction: "front-to-back" as const,
            },
          ],
          newPrompts: [],
          studiedToday: 0,
        })),
      }),
    );

    fireEvent.click(await screen.findByRole("link", { name: "Kanji N5" }));
    fireEvent.click(await screen.findByRole("button", { name: "Study" }));
    expect(
      await screen.findByRole("heading", { name: "Study: Kanji N5" }),
    ).toBeInTheDocument();

    fireEvent.click(
      await screen.findByRole("button", { name: "End session" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Decks" }),
    ).toBeInTheDocument();
  });

  const dueCard: Card = {
    id: "card-1",
    url: `${instanceA.url}decks/deck-1.ttl#card-1`,
    front: { "": "水" },
    back: { "": "water" },
    createdAt: "2026-09-21T10:00:00.000Z",
    formatVersion: 1,
  };

  it("starts a study session from the deck list when only new cards remain", async () => {
    renderWorkspace(
      makeUseCases({
        listInstances: vi.fn(async () => [instanceA]),
        listDecks: vi.fn(async () => [deck]),
        getStudyQueue: vi.fn(async () => ({
          due: [],
          newPrompts: [{ card: dueCard, direction: "front-to-back" as const }],
          studiedToday: 0,
        })),
      }),
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Study Kanji N5" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Study: Kanji N5" }),
    ).toBeInTheDocument();
    expect(window.location.hash).toContain("#/study");
  });

  it("starts a study session straight from the deck list", async () => {
    renderWorkspace(
      makeUseCases({
        listInstances: vi.fn(async () => [instanceA]),
        listDecks: vi.fn(async () => [deck]),
        getStudyQueue: vi.fn(async () => ({
          due: [{ card: dueCard, direction: "front-to-back" as const }],
          newPrompts: [],
          studiedToday: 0,
        })),
      }),
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Study Kanji N5" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Study: Kanji N5" }),
    ).toBeInTheDocument();
    expect(window.location.hash).toContain("#/study");
  });

  const deck: Deck = {
    id: "deck-1",
    url: `${instanceA.url}catalog.ttl#deck-1`,
    title: { en: "Kanji N5" },
    cardsDocumentUrl: `${instanceA.url}decks/deck-1.ttl`,
    reviewsDocumentUrl: `${instanceA.url}reviews/deck-1.ttl`,
    direction: "front-to-back" as const,
    createdAt: "2026-09-21T10:00:00.000Z",
    formatVersion: 1,
    authors: [],
  };

  it("keeps the URL in sync while navigating", async () => {
    renderWorkspace(
      makeUseCases({
        listInstances: vi.fn(async () => [instanceA]),
        listDecks: vi.fn(async () => [deck]),
      }),
    );

    await screen.findByRole("heading", { name: "Decks" });
    expect(window.location.hash).toBe(
      `#/decks?instance=${encodeURIComponent(instanceA.url)}`,
    );

    fireEvent.click(await screen.findByRole("link", { name: "Kanji N5" }));
    await screen.findByRole("heading", { name: "Kanji N5" });
    expect(window.location.hash).toBe(
      `#/deck?instance=${encodeURIComponent(
        instanceA.url,
      )}&deck=${encodeURIComponent(deck.url)}`,
    );
  });

  it("restores the view from a deep link", async () => {
    window.history.replaceState(
      null,
      "",
      `#/deck?instance=${encodeURIComponent(
        instanceA.url,
      )}&deck=${encodeURIComponent(deck.url)}`,
    );
    renderWorkspace(
      makeUseCases({
        listInstances: vi.fn(async () => [instanceA]),
        listDecks: vi.fn(async () => [deck]),
      }),
    );

    expect(
      await screen.findByRole("heading", { name: "Kanji N5" }),
    ).toBeInTheDocument();
  });

  it("follows Back/Forward (external hash changes)", async () => {
    renderWorkspace(
      makeUseCases({
        listInstances: vi.fn(async () => [instanceA]),
        listDecks: vi.fn(async () => [deck]),
      }),
    );

    fireEvent.click(await screen.findByRole("link", { name: "Kanji N5" }));
    await screen.findByRole("heading", { name: "Kanji N5" });

    window.history.replaceState(
      null,
      "",
      `#/decks?instance=${encodeURIComponent(instanceA.url)}`,
    );
    fireEvent(window, new Event("hashchange"));

    expect(
      await screen.findByRole("heading", { name: "Decks" }),
    ).toBeInTheDocument();
  });

  describe("card pages", () => {
    const card: Card = {
      id: "card-1",
      url: `${deck.cardsDocumentUrl}#card-1`,
      front: { "": "水" },
      back: { "": "water" },
      createdAt: "2026-09-21T10:00:00.000Z",
      formatVersion: 1,
    };

    function openBrowser(useCases: UseCases) {
      renderWorkspace(useCases);
      return (async () => {
        fireEvent.click(await screen.findByRole("link", { name: deck.title.en }));
        fireEvent.click(await screen.findByRole("link", { name: "Browser" }));
      })();
    }

    it("opens a card on its own page, with its own breadcrumb", async () => {
      await openBrowser(
        makeUseCases({
          listInstances: vi.fn(async () => [instanceA]),
          listDecks: vi.fn(async () => [deck]),
          listCards: vi.fn(async () => [card]),
        }),
      );

      fireEvent.click(await screen.findByRole("link", { name: "水" }));

      expect(
        await screen.findByRole("heading", { name: "Card" }),
      ).toBeInTheDocument();
      expect(window.location.hash).toContain("#/card?");
      const trail = within(
        screen.getByRole("navigation", { name: "Breadcrumb" }),
      );
      expect(
        trail.getAllByRole("link").map((link) => link.textContent),
      ).toEqual(["Decks", deck.title.en, "Browser", "水"]);
      expect(trail.getByRole("link", { name: "水" })).toHaveAttribute(
        "aria-current",
        "page",
      );

      fireEvent.click(trail.getByRole("link", { name: "Browser" }));
      expect(
        await screen.findByRole("heading", { name: `Browser: ${deck.title.en}` }),
      ).toBeInTheDocument();
    });

    it("shows a saved edit on the page and in its breadcrumb", async () => {
      let front: Card["front"] = { ja: "水" };
      await openBrowser(
        makeUseCases({
          listInstances: vi.fn(async () => [instanceA]),
          listDecks: vi.fn(async () => [deck]),
          listCards: vi.fn(async () => [{ ...card, front }]),
          updateCard: vi.fn(async (_deck, edited: Card, content) => {
            front = content.front;
            return { ...edited, ...content };
          }),
        }),
      );
      fireEvent.click(await screen.findByRole("link", { name: "水" }));

      fireEvent.input(await screen.findByLabelText("Front"), {
        target: { value: "火" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(await screen.findByRole("link", { name: "火" })).toHaveAttribute(
        "aria-current",
        "page",
      );
    });

    it("returns to the Browser after removing the card", async () => {
      vi.stubGlobal("confirm", vi.fn(() => true));
      let removed = false;
      await openBrowser(
        makeUseCases({
          listInstances: vi.fn(async () => [instanceA]),
          listDecks: vi.fn(async () => [deck]),
          listCards: vi.fn(async () => (removed ? [] : [card])),
          removeCard: vi.fn(async () => {
            removed = true;
          }),
        }),
      );
      fireEvent.click(await screen.findByRole("link", { name: "水" }));
      fireEvent.click(
        await screen.findByRole("button", { name: "Remove card" }),
      );

      expect(
        await screen.findByText("No cards in this deck yet."),
      ).toBeInTheDocument();
      expect(window.location.hash).toContain("#/browse?");
    });

    it("sends a deep link to an unknown card back to the Browser", async () => {
      window.history.replaceState(
        null,
        "",
        routeToHash({
          screen: "card",
          instanceUrl: instanceA.url,
          deckUrl: deck.url,
          cardUrl: `${deck.cardsDocumentUrl}#gone`,
        }),
      );
      renderWorkspace(
        makeUseCases({
          listInstances: vi.fn(async () => [instanceA]),
          listDecks: vi.fn(async () => [deck]),
          listCards: vi.fn(async () => [card]),
        }),
      );
      expect(
        await screen.findByRole("heading", { name: `Browser: ${deck.title.en}` }),
      ).toBeInTheDocument();
    });

    it("shows a loading state, then an error, when the cards cannot be read", async () => {
      window.history.replaceState(
        null,
        "",
        routeToHash({
          screen: "card",
          instanceUrl: instanceA.url,
          deckUrl: deck.url,
          cardUrl: card.url,
        }),
      );
      let fail: (error: Error) => void = () => undefined;
      const useCases = makeUseCases({
        listInstances: vi.fn(async () => [instanceA]),
        listDecks: vi.fn(async () => [deck]),
        listCards: vi.fn(
          () => new Promise<Card[]>((_resolve, reject) => (fail = reject)),
        ),
      });
      renderWorkspace(useCases);
      expect(await screen.findByText("Loading card…")).toBeInTheDocument();
      await waitFor(() => {
        expect(useCases.listCards).toHaveBeenCalled();
      });
      await act(async () => fail(new Error("cards unreachable")));
      expect(await screen.findByText("cards unreachable")).toBeInTheDocument();
    });
  });

  describe("developer settings", () => {
    it("hides the WebID document by default, without fetching it", async () => {
      const useCases = makeUseCases({
        listInstances: vi.fn(async () => [instanceA]),
        listDecks: vi.fn(async () => [deck]),
      });
      renderWorkspace(useCases);

      await screen.findByRole("heading", { name: "Decks" });
      await waitFor(() => {
        expect(useCases.getPreferences).toHaveBeenCalledWith(instanceA.url);
      });
      expect(screen.queryByText("WebID document")).toBeNull();
      expect(useCases.viewWebIdDocument).not.toHaveBeenCalled();
    });

    it("shows the WebID document once developer mode is activated", async () => {
      const useCases = makeUseCases({
        listInstances: vi.fn(async () => [instanceA]),
        listDecks: vi.fn(async () => [deck]),
        getPreferences: vi.fn(async () => ({
          ...DEFAULT_PREFERENCES,
          developerMode: true,
        })),
      });
      renderWorkspace(useCases);

      expect(await screen.findByText("WebID document")).toBeInTheDocument();
      await waitFor(() => {
        expect(useCases.viewWebIdDocument).toHaveBeenCalledWith(session);
      });
    });

    it("keeps developer tools hidden when preferences cannot be read", async () => {
      renderWorkspace(
        makeUseCases({
          listInstances: vi.fn(async () => [instanceA]),
          listDecks: vi.fn(async () => [deck]),
          getPreferences: vi.fn(async () => {
            throw new Error("preferences unreachable");
          }),
        }),
      );

      await screen.findByRole("heading", { name: "Decks" });
      expect(screen.queryByText("WebID document")).toBeNull();
      expect(screen.queryByText("preferences unreachable")).toBeNull();
    });

    it("links to the validation tool only in developer mode, and the tool checks the instance", async () => {
      const useCases = makeUseCases({
        listInstances: vi.fn(async () => [instanceA]),
        listDecks: vi.fn(async () => [deck]),
      });
      const { unmount } = renderWorkspace(useCases);
      await screen.findByRole("heading", { name: "Decks" });
      await waitFor(() => {
        expect(useCases.getPreferences).toHaveBeenCalledWith(instanceA.url);
      });
      expect(screen.queryByRole("link", { name: "Validate this instance" })).toBeNull();
      unmount();

      const developer = makeUseCases({
        listInstances: vi.fn(async () => [instanceA]),
        listDecks: vi.fn(async () => [deck]),
        getPreferences: vi.fn(async () => ({
          ...DEFAULT_PREFERENCES,
          developerMode: true,
        })),
      });
      renderWorkspace(developer);
      const link = await screen.findByRole("link", { name: "Validate this instance" });
      expect(link).toHaveAttribute(
        "href",
        routeToHash({ screen: "validation", instanceUrl: instanceA.url }),
      );
      fireEvent.click(link);
      expect(
        await screen.findByRole("heading", { name: "Validation of Deck set A" }),
      ).toBeInTheDocument();
      expect(await screen.findByText("All 0 documents conform.")).toBeInTheDocument();
      expect(developer.validateInstance).toHaveBeenCalledWith(instanceA.url);
      expect(
        screen.getByRole("link", { name: "Validation", current: "page" }),
      ).toBeInTheDocument();
    });

    it("explains how to turn developer mode on when the validation route is opened without it", async () => {
      const useCases = makeUseCases({
        listInstances: vi.fn(async () => [instanceA]),
        listDecks: vi.fn(async () => [deck]),
      });
      window.history.replaceState(
        null,
        "",
        routeToHash({ screen: "validation", instanceUrl: instanceA.url }),
      );
      renderWorkspace(useCases);
      const hint = await screen.findByText(/Developer mode is off/);
      expect(within(hint).getByRole("link", { name: "Preferences" })).toHaveAttribute(
        "href",
        routeToHash({ screen: "preferences", instanceUrl: instanceA.url }),
      );
    });

    it("turns on as soon as the setting is saved", async () => {
      let developerMode = false;
      const useCases = makeUseCases({
        listInstances: vi.fn(async () => [instanceA]),
        listDecks: vi.fn(async () => [deck]),
        getPreferences: vi.fn(async () => ({
          ...DEFAULT_PREFERENCES,
          developerMode,
        })),
        savePreferences: vi.fn(async (_url, preferences) => {
          developerMode = preferences.developerMode;
        }),
      });
      renderWorkspace(useCases);

      fireEvent.click(
        await screen.findByRole("link", { name: "Preferences" }),
      );
      fireEvent.click(await screen.findByLabelText("Developer mode"));
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(await screen.findByText("WebID document")).toBeInTheDocument();
    });
  });

  it("shows a breadcrumb trail whose links lead back up", async () => {
    renderWorkspace(
      makeUseCases({
        listInstances: vi.fn(async () => [instanceA]),
        listDecks: vi.fn(async () => [deck]),
      }),
    );

    await screen.findByRole("heading", { name: "Decks" });
    expect(
      within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole(
        "link",
        { name: "Decks" },
      ),
    ).toHaveAttribute("aria-current", "page");

    fireEvent.click(screen.getByRole("link", { name: "Kanji N5" }));
    fireEvent.click(await screen.findByRole("link", { name: "Browser" }));
    await screen.findByRole("heading", { name: "Browser: Kanji N5" });

    const trail = within(
      screen.getByRole("navigation", { name: "Breadcrumb" }),
    );
    expect(trail.getByText("Browser")).toHaveAttribute("aria-current", "page");

    const decksHref = trail.getByRole("link", { name: "Decks" }).getAttribute("href")!;
    window.history.pushState(null, "", decksHref);
    fireEvent(window, new Event("hashchange"));

    expect(
      await screen.findByRole("heading", { name: "Decks" }),
    ).toBeInTheDocument();
  });

  it("returns to the deck list when the brand link empties the route", async () => {
    renderWorkspace(
      makeUseCases({
        listInstances: vi.fn(async () => [instanceA]),
        listDecks: vi.fn(async () => [deck]),
      }),
    );

    fireEvent.click(await screen.findByRole("link", { name: "Kanji N5" }));
    await screen.findByRole("heading", { name: "Kanji N5" });

    window.history.replaceState(null, "", "#/");
    fireEvent(window, new Event("hashchange"));

    expect(
      await screen.findByRole("heading", { name: "Decks" }),
    ).toBeInTheDocument();
  });

  it("falls back to the instance picker for a deep link to an unknown instance", async () => {
    window.history.replaceState(
      null,
      "",
      "#/decks?instance=https%3A%2F%2Felsewhere.example%2F",
    );
    renderWorkspace(
      makeUseCases({
        listInstances: vi.fn(async () => [instanceA, instanceB]),
      }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "Choose a Solid Memo instance",
      }),
    ).toBeInTheDocument();
  });

  it("falls back to the storage picker for an unknown instance when none exist", async () => {
    window.history.replaceState(
      null,
      "",
      "#/decks?instance=https%3A%2F%2Felsewhere.example%2F",
    );
    renderWorkspace(makeUseCases());

    expect(
      await screen.findByRole("heading", { name: "Choose a storage" }),
    ).toBeInTheDocument();
  });

  it("falls back to the deck list for a deep link to an unknown deck", async () => {
    window.history.replaceState(
      null,
      "",
      `#/deck?instance=${encodeURIComponent(
        instanceA.url,
      )}&deck=${encodeURIComponent(`${instanceA.url}catalog.ttl#gone`)}`,
    );
    renderWorkspace(
      makeUseCases({
        listInstances: vi.fn(async () => [instanceA]),
        listDecks: vi.fn(async () => [deck]),
      }),
    );

    expect(
      await screen.findByRole("heading", { name: "Decks" }),
    ).toBeInTheDocument();
  });

  it("shows a loading state while a deep-linked deck is being fetched", async () => {
    window.history.replaceState(
      null,
      "",
      `#/deck?instance=${encodeURIComponent(
        instanceA.url,
      )}&deck=${encodeURIComponent(deck.url)}`,
    );
    renderWorkspace(
      makeUseCases({
        listInstances: vi.fn(async () => [instanceA]),
        listDecks: vi.fn(() => new Promise<Deck[]>(() => { })),
      }),
    );

    expect(await screen.findByText("Loading deck…")).toBeInTheDocument();
  });

  it("shows an error when resolving a deep-linked deck fails", async () => {
    window.history.replaceState(
      null,
      "",
      `#/deck?instance=${encodeURIComponent(
        instanceA.url,
      )}&deck=${encodeURIComponent(deck.url)}`,
    );
    renderWorkspace(
      makeUseCases({
        listInstances: vi.fn(async () => [instanceA]),
        listDecks: vi.fn(async () => {
          throw new Error("catalog unreachable");
        }),
      }),
    );

    expect(
      await screen.findByText("catalog unreachable"),
    ).toBeInTheDocument();
  });

  describe("courses", () => {
    const courseRoute = { screen: "course", instanceUrl: instanceA.url, deckUrl: courseDeck.url } as const;
    const chapterRoute = { ...courseRoute, screen: "courseChapter", chapterUrl: CH1 } as const;
    const reviewRoute = { ...courseRoute, screen: "courseReview", chapterUrl: CH1 } as const;

    function courseUseCases(overrides: Partial<UseCases> = {}) {
      return makeUseCases({
        listInstances: vi.fn(async () => [instanceA]),
        listDecks: vi.fn(async () => [courseDeck]),
        getCourse: vi.fn(async () => makeCourse()),
        ...overrides,
      });
    }

    it("starts a course from its library page and opens it, under its deck in the trail", async () => {
      let started = false;
      const useCases = courseUseCases({
        listDecks: vi.fn(async () => (started ? [courseDeck] : [])),
        listLibraryDecks: vi.fn(async () => [courseLibraryDeck]),
        startCourse: vi.fn(async () => {
          started = true;
          return courseDeck;
        }),
      });
      window.history.replaceState(
        null,
        "",
        routeToHash({ screen: "libraryDeck", instanceUrl: instanceA.url, libraryDeckUrl: courseLibraryDeck.seriesUrl }),
      );
      renderWorkspace(useCases);
      fireEvent.click(await screen.findByRole("button", { name: "Start course" }));

      expect(await screen.findByRole("link", { name: "Start the course" })).toBeInTheDocument();
      expect(window.location.hash).toBe(routeToHash(courseRoute));
      expect(useCases.getCourse).toHaveBeenCalledWith(courseDeck);
      const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
      expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual([
        "Decks",
        "Solid fundamentals",
        "Course",
      ]);
      expect(document.title).toBe("Course – Solid fundamentals – Solid Memo");
    });

    it("takes a chapter from the course, named in the trail, and goes on to its final review", async () => {
      window.history.replaceState(null, "", routeToHash(courseRoute));
      renderWorkspace(
        courseUseCases({ answerCourseQuestion: vi.fn(async () => ({ effect: "introduce" as const, state: null })) }),
      );
      fireEvent.click(await screen.findByRole("link", { name: "Start the course" }));
      expect(await screen.findByRole("heading", { name: "Step 1 of 2" })).toBeInTheDocument();
      expect(window.location.hash).toBe(routeToHash(chapterRoute));
      const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
      expect(within(nav).getByRole("link", { name: "Linked data" })).toHaveAttribute("aria-current", "page");

      const answer = async (option: string, next: string) => {
        fireEvent.click(screen.getByRole("radio", { name: option }));
        fireEvent.click(screen.getByRole("button", { name: "Check" }));
        fireEvent.click(await screen.findByRole("button", { name: next }));
      };
      // Each step's theory comes first. The options are shuffled: the right one is found by its text.
      expect(document.querySelector(".course-theory")).not.toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "On to the question" }));
      // The question is asked without the theory.
      expect(document.querySelector(".course-theory")).toBeNull();
      await answer("An IRI", "Next");
      fireEvent.click(screen.getByRole("button", { name: "On to the questions" }));
      await answer("Three terms", "Next");
      await answer("A syntax", "On to the final review");
      expect(await screen.findByRole("heading", { name: "Final review: Linked data" })).toBeInTheDocument();
      expect(document.querySelector(".course-theory")).toBeNull();
      expect(window.location.hash).toBe(routeToHash(reviewRoute));
      expect(within(screen.getByRole("navigation", { name: "Breadcrumb" })).getAllByRole("link").map((l) => l.textContent)).toEqual([
        "Decks",
        "Solid fundamentals",
        "Course",
        "Linked data",
        "Final review",
      ]);
    });

    it("falls back to the course for a chapter it does not have, or one still locked", async () => {
      window.history.replaceState(null, "", routeToHash({ ...chapterRoute, chapterUrl: `${CH1}-gone` }));
      const { unmount } = renderWorkspace(courseUseCases());
      expect(await screen.findByRole("link", { name: "Start the course" })).toBeInTheDocument();
      expect(window.location.hash).toBe(routeToHash(courseRoute));
      unmount();

      window.history.replaceState(null, "", routeToHash({ ...reviewRoute, chapterUrl: CH2 }));
      renderWorkspace(courseUseCases());
      expect(await screen.findByRole("link", { name: "Start the course" })).toBeInTheDocument();
      expect(window.location.hash).toBe(routeToHash(courseRoute));
    });

    it("falls back to the deck's page for a deck that is no copy of a course", async () => {
      const useCases = courseUseCases({ listDecks: vi.fn(async () => [{ ...courseDeck, sourceUrl: undefined }]) });
      window.history.replaceState(null, "", routeToHash(courseRoute));
      renderWorkspace(useCases);
      await waitFor(() => expect(window.location.hash).toBe(routeToHash({ ...courseRoute, screen: "deckDetail" })));
      expect(useCases.getCourse).not.toHaveBeenCalled();
    });

    it("shows a loading state while the course is read, and why it could not be", async () => {
      window.history.replaceState(null, "", routeToHash(courseRoute));
      const { unmount } = renderWorkspace(courseUseCases({ getCourse: vi.fn(() => new Promise<never>(() => undefined)) }));
      expect(await screen.findByText("Loading the course…")).toBeInTheDocument();
      unmount();

      renderWorkspace(
        courseUseCases({
          getCourse: vi.fn(async () => {
            throw new Error("release unreachable");
          }),
        }),
      );
      expect(await screen.findByText("release unreachable")).toBeInTheDocument();
    });
  });
});
