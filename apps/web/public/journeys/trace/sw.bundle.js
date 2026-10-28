// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/*
 * Published at the address of the trace viewer's service worker from when
 * the user journeys' report was at /journeys/
 * (docs/deployment.md#the-journeys-report). A browser that opened a trace
 * there still has that worker registered, and checks this address for its
 * update on its next visit under /journeys/trace/, even one that never
 * opens the app: it installs this one instead, which unregisters itself
 * and reloads the pages it controlled, so they load from the site again,
 * with no worker between.
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
