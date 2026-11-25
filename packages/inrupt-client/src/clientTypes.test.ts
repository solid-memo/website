// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, it } from "vitest";
import type * as DeclaredAccess from "@solid-memo/solid-client/access";
import type * as DeclaredRdf from "@solid-memo/solid-client/rdf";
import type * as DeclaredResources from "@solid-memo/solid-client/resources";
import type * as DeclaredSession from "@solid-memo/solid-client/session";
import * as access from "./access";
import * as rdf from "./rdf";
import * as resources from "./resources";
import * as session from "./session";

/**
 * This client gives every module packages/solid-client declares, each
 * export with the declared type: the typecheck of this file fails
 * otherwise, as the build would put the client in place of them
 * (scripts/solidClient.ts).
 */
it("gives every module packages/solid-client declares, with its types", () => {
  const given = {
    access: access satisfies typeof DeclaredAccess,
    rdf: rdf satisfies typeof DeclaredRdf,
    resources: resources satisfies typeof DeclaredResources,
    session: session satisfies typeof DeclaredSession,
  };
  expect(Object.keys(given)).toEqual(["access", "rdf", "resources", "session"]);
});
