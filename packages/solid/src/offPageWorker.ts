// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { offPageJobs } from "./offPageJobs";
import type { Port } from "./offPageProtocol";
import { serveOffPage } from "./offPageServe";

// The worker the page runs its work on documents the app did not write in (offPage.ts): its scope is its channel.
serveOffPage(globalThis as unknown as Port, offPageJobs());
