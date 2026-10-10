import { describe, expect, it } from "vitest";
import { getThing, getUrl, getStringNoLocale } from "@inrupt/solid-client";
import { GUEST_ORIGIN, GUEST_WEBID } from "@solid-memo/domain/guest";
import { readDataset } from "./datasets";
import { createLocalGuestPod } from "./localGuestPod";
import { createLocalPod } from "./localPod";
import { createMemoryResourceStore } from "./memoryResourceStore";

function guestPod() {
  const store = createMemoryResourceStore();
  const fetch = createLocalPod({ root: GUEST_ORIGIN, store, newEtag: () => `"${crypto.randomUUID()}"` });
  return { store, fetch, pod: createLocalGuestPod({ fetch, store }) };
}

describe("createLocalGuestPod", () => {
  it("starts with a profile naming the pod's root as the guest's storage", async () => {
    const { fetch, pod } = guestPod();
    expect(await pod.exists()).toBe(false);
    await pod.start();
    expect(await pod.exists()).toBe(true);
    const me = getThing(await readDataset(GUEST_WEBID, fetch), GUEST_WEBID)!;
    expect(getUrl(me, "http://www.w3.org/ns/pim/space#storage")).toBe(GUEST_ORIGIN);
    expect(getStringNoLocale(me, "http://xmlns.com/foaf/0.1/name")).toBe("Guest");
  });

  it("starts a pod at another origin, with its own profile", async () => {
    const origin = "https://trial.solid-memo.invalid/";
    const store = createMemoryResourceStore();
    const fetch = createLocalPod({ root: origin, store, newEtag: () => `"${crypto.randomUUID()}"` });
    await createLocalGuestPod({ fetch, store, origin }).start();
    const me = getThing(await readDataset(`${origin}profile/card`, fetch), `${origin}profile/card#me`)!;
    expect(getUrl(me, "http://www.w3.org/ns/pim/space#storage")).toBe(origin);
  });

  it("keeps a pod already started", async () => {
    const { store, pod } = guestPod();
    await pod.start();
    const urls = await store.urls();
    await pod.start();
    expect(await store.urls()).toEqual(urls);
  });

  it("fails when the profile cannot be written", async () => {
    const pod = createLocalGuestPod({
      fetch: async () => new Response(null, { status: 500 }),
      store: createMemoryResourceStore(),
    });
    await expect(pod.start()).rejects.toMatchObject({ code: "guestPodStartFailed", detail: "status: 500" });
  });

  it("discards everything", async () => {
    const { store, pod } = guestPod();
    await pod.start();
    await pod.discard();
    expect(await store.urls()).toEqual([]);
    expect(await pod.exists()).toBe(false);
  });
});
