// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { MigrationStep } from "../step";

/**
 * Instance format 2 adds what an updated copy says about the instance it
 * replaces; a format-1 meta document replaces nothing.
 */
export const INSTANCE_1_TO_2: MigrationStep<"instance", 1, 2> = {
  shape: "instance",
  from: 1,
  to: 2,
  up: (data) => ({ ...data }),
};
