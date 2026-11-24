// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { GuestPod, ResourceStore } from "@solid-memo/application/ports";
import { AppError } from "@solid-memo/domain/appError";
import { GUEST_ORIGIN } from "@solid-memo/domain/guest";
import { buildThing, createSolidDataset, createThing, setThing } from "./client/rdf";
import { solidDatasetAsTurtle } from "./client/resources";
import { RDF } from "./vocab";

const FOAF = "http://xmlns.com/foaf/0.1/";
const PIM_STORAGE = "http://www.w3.org/ns/pim/space#storage";

/**
 * The guest's pod (docs/guest-mode.md), kept in `store` and served by
 * `fetch` (createLocalPod over the same store). Starting it writes the
 * guest's WebID profile (`<origin>profile/card#me`), naming the pod's
 * root as its storage; the instance and its type index are made as on
 * any pod, by the use cases. A Studio trial's pod is one too, at its own
 * `origin` (docs/studio.md, The trial).
 */
export function createLocalGuestPod({
  fetch,
  store,
  origin = GUEST_ORIGIN,
}: {
  fetch: typeof globalThis.fetch;
  store: ResourceStore;
  origin?: string;
}): GuestPod {
  const profileUrl = `${origin}profile/card`;
  return {
    async exists() {
      return (await store.get(profileUrl)) !== undefined;
    },
    async start() {
      const response = await fetch(profileUrl, {
        method: "PUT",
        headers: { "Content-Type": "text/turtle", "If-None-Match": "*" },
        body: solidDatasetAsTurtle(setThing(createSolidDataset(), profileOf(origin))),
      });
      // 412: started already (in another tab, say).
      if (!response.ok && response.status !== 412) {
        throw new AppError("guestPodStartFailed", { status: response.status });
      }
    },
    discard: () => store.clear(),
  };
}

/** The guest's WebID (`#me`): a person named Guest, whose storage is the pod's root. */
function profileOf(origin: string) {
  return buildThing(createThing({ name: "me" }))
    .addUrl(RDF.type, `${FOAF}Person`)
    .addStringNoLocale(`${FOAF}name`, "Guest")
    .addUrl(PIM_STORAGE, origin)
    .build();
}
