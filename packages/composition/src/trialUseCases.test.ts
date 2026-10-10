import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SHAPE_SOURCES, SITE, shapesFetch } from "@solid-memo/vocab/tooling/sources";
import { GUEST_SESSION } from "@solid-memo/domain/guest";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import { TRIAL_ORIGIN } from "@solid-memo/domain/release/trial";
import { DRAFT, playableCourseDraft } from "@solid-memo/domain/testing/releaseDraft";
import { createShaclShapeValidator } from "@solid-memo/solid/shaclShapeValidator";
import { createAppUseCases } from "./appUseCases";
import { createTrialUseCases, NO_LOGIN, readOnlyFetch } from "./trialUseCases";

const SERVED = "http://localhost:5173/";

/** The requests that reached the network, each by its address and method. */
let requests: { url: string; method: string }[];

/** A network with only the served site on it, its files read from this repository. */
function servedSiteNetwork(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input instanceof Request ? input.url : input);
  requests.push({ url, method: input instanceof Request ? input.method : (init?.method ?? "GET") });
  if (!url.startsWith(SERVED)) return Promise.resolve(new Response("Not found", { status: 404 }));
  return shapesFetch(`${SITE}${url.slice(SERVED.length)}`);
}

beforeEach(() => {
  requests = [];
  vi.stubGlobal("fetch", vi.fn(servedSiteNetwork));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readOnlyFetch", () => {
  const pod = vi.fn(async () => new Response("ok"));
  const read = readOnlyFetch(pod);

  it("passes reads on", async () => {
    await read("https://alice.example/a.ttl");
    await read("https://alice.example/a.ttl", { method: "head" });
    await read(new Request("https://alice.example/a.ttl"));
    expect(pod).toHaveBeenCalledTimes(3);
  });

  it("refuses every other request before it is sent", async () => {
    pod.mockClear();
    await expect(read("https://alice.example/a.ttl", { method: "PUT" })).rejects.toThrow("A trial does not write to https://alice.example/a.ttl (PUT).");
    await expect(read(new Request("https://alice.example/a.ttl", { method: "DELETE" }))).rejects.toThrow("(DELETE)");
    await expect(read(new URL("https://alice.example/a.ttl"), { method: "patch" })).rejects.toThrow("(PATCH)");
    expect(pod).not.toHaveBeenCalled();
  });
});

describe("NO_LOGIN", () => {
  it("has no session, and logs no one in or out", async () => {
    expect(await NO_LOGIN.restore()).toBeNull();
    NO_LOGIN.onSessionExpired(() => undefined)();
    for (const refused of [NO_LOGIN.discoverOidcIssuer("x"), NO_LOGIN.login("x"), NO_LOGIN.loginWithIssuer("x"), NO_LOGIN.logout()]) {
      await expect(refused).rejects.toThrow("no login");
    }
  });
});

describe("createTrialUseCases", () => {
  it("throws on a trial's write to a real pod, which never sees it", { timeout: 30_000 }, async () => {
    const podFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("", { status: 404 }));
    const shapeValidator = createShaclShapeValidator({ fetch: podFetch, shapesFetch, ...SHAPE_SOURCES });
    const { useCases } = createTrialUseCases(playableCourseDraft(), { podFetch, shapeValidator, ruleset: "test" });
    await expect(useCases.savePreferences("https://alice.example/solid-memo/main/", DEFAULT_PREFERENCES)).rejects.toThrow(
      "A trial does not write to https://alice.example/solid-memo/main/",
    );
    expect(podFetch.mock.calls.every(([, init]) => (init?.method ?? "GET") === "GET")).toBe(true);
  });

  it(
    "plays a draft in a pod of its own, each trial afresh, the user's study as it was",
    { timeout: 60_000 },
    async () => {
      const app = createAppUseCases({ clientName: "Solid Memo", servedSite: SERVED, ruleset: "test", indexedDB: undefined });
      await app.startGuest("My study");
      const [instance] = await app.listInstances(GUEST_SESSION);
      await app.createDeck(instance!.url, { en: "Capitals" });
      const decks = await app.listDecks(instance!.url);
      const draft = playableCourseDraft();

      const opened = await app.openTrial(draft, instance!.url);
      if (!opened.ok) throw new Error("The course can be played.");
      const { useCases, instance: played, deck } = opened.trial;
      expect(played.url.startsWith(TRIAL_ORIGIN)).toBe(true);
      expect(deck.sourceUrl).toBe(DRAFT);
      const course = await useCases.getCourse(deck);
      expect(course.outline.chapters.map((chapter) => chapter.id)).toEqual(["ch-a"]);
      const question = course.cards["q-a-1a"]!;
      await useCases.answerCourseQuestion(played.url, deck, question, { correct: true }, new Date());
      expect((await useCases.getCourse(deck)).answeredCardIds).toEqual(["q-a-1a"]);
      expect((await useCases.checkInstance(played.url)).conforms).toBe(true);

      // Another trial starts afresh.
      const again = await app.openTrial(draft, instance!.url);
      if (!again.ok) throw new Error("The course can be played.");
      expect((await again.trial.useCases.getCourse(again.trial.deck)).answeredCardIds).toEqual([]);

      // The user's study is as it was, and nothing but the site was asked.
      expect(await app.listDecks(instance!.url)).toEqual(decks);
      expect(requests.every(({ url, method }) => url.startsWith(SERVED) && method === "GET")).toBe(true);
    },
  );
});
