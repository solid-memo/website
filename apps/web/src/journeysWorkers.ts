// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * Unregisters the service workers left under the site's journeys/ folder
 * (docs/deployment.md#the-journeys-report). Until v4.1.2 the user
 * journeys' report was published there, and its trace viewer's service
 * worker, once registered, stays registered after its script is gone: it
 * still loads any trace a link names and serves that trace's pages on
 * the app's origin. The app registers no service worker of its own, so
 * any under journeys/ is the viewer's.
 *
 * A browser with no service workers (an insecure context) has no
 * container; one that refuses to list them (some private modes) has
 * none to clean, so neither stops the app.
 */
export async function unregisterJourneysWorkers(
  container: Pick<ServiceWorkerContainer, "getRegistrations"> | undefined,
  site: string,
): Promise<void> {
  if (!container) return;
  const journeys = new URL("journeys/", site).href;
  try {
    const registrations = await container.getRegistrations();
    await Promise.all(
      registrations
        .filter((registration) => registration.scope.startsWith(journeys))
        .map((registration) => registration.unregister()),
    );
  } catch {
    // Nothing listed, or nothing removed: nothing more to do.
  }
}
