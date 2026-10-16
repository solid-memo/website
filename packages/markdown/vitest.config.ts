// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { packageConfig } from "../../vitest.shared.ts";

// The type of Mermaid on the drawing page (tooling/mermaid.d.ts) holds no code.
export default packageConfig({ include: ["tooling/**/*.ts"], exclude: ["tooling/**/*.d.ts"] });
