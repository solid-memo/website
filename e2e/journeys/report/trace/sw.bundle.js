// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/*
 * Published in place of the report's own trace viewer
 * (docs/deployment.md#the-journeys-report), at the address of its service
 * worker. A browser that opened a trace before then still has that worker
 * registered, and checks this address for its update: it installs this one
 * instead, which unregisters itself and reloads the pages it controlled,
 * so they load from the site again, with no worker between.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    self.registration
      .unregister()
      .then(() => self.clients.matchAll({ type: "window" }))
      .then((clients) => Promise.allSettled(clients.map((client) => client.navigate(client.url)))),
  );
});
