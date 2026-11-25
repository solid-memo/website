// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { fn } from "storybook/test";

/**
 * What the test fakes (src/test/fakes/) take from Vitest, in the
 * Storybook, which has no Vitest: `vi.fn` is Storybook's own spy, the
 * same kind (Vitest's spies), so a fake's calls show in the Actions
 * panel. main.ts points "vitest" here; the stories' test runs the
 * fakes with Vitest's own.
 */
export const vi = { fn };
