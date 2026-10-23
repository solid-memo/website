// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

// The components' own test setup (packages/ui): the DOM matchers, and what happy-dom lacks.
import "@solid-memo/ui/test/setup";
import { addCatalogs } from "@solid-memo/ui/i18n";
import { STUDIO_CATALOGS } from "../ui/catalogs";

// The Studio's messages, added to `ui`'s as the page adds them when it
// fetches the Studio (apps/web/src/App.tsx), in every language the setup
// above fetched.
await addCatalogs(STUDIO_CATALOGS);
