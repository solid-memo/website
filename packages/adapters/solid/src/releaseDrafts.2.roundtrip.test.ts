// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * Every release of the deck library made a draft in a pod as it is, then
 * published again at its own address (docs/testing.md, The round trip):
 * what it says comes back whole, apart from what publishing sets (its
 * format versions, its time of change). Its own Turbo task, `npm run
 * test:roundtrip -w @solid-memo/solid`, run by `npm run check`, again only
 * when decks/ changes; the unit tests make the trip with a few releases.
 * This file takes one shard of the releases, each such file another
 * (testing/releaseShards.ts), so that they run at once.
 */
import { describeRoundTrips } from "./testing/releaseShards";

describeRoundTrips(2);
