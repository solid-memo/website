/**
 * Every release of the deck library made a draft in a pod as it is, then
 * published again at its own address (docs/testing.md, The round trip):
 * what it says comes back whole, apart from what publishing sets (its
 * format versions, its time of change). Its own Turbo task, `npm run
 * test:roundtrip -w @solid-memo/solid`, run by `npm run check`, again only
 * when decks/ changes; the unit tests make the trip with a few releases.
 */
import { describe, expect, it } from "vitest";
import { draftPod, libraryReleases, roundTrip } from "./testing/releaseDrafts";

describe.each(libraryReleases())("decks/%s", (path) => {
  it("comes back whole as a draft published again", { timeout: 60_000 }, async () => {
    const { release, assembled } = await roundTrip(await draftPod(), path);
    expect(assembled).toEqual(release);
  });
});
