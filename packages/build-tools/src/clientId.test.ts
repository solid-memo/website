// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CLIENT_ID_FILE, clientIdDocument, clientIdPlugin, clientIdUrl } from "./clientId.ts";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "solid-memo-client-id-"));
});

describe("clientIdUrl", () => {
  it("is the document's address at the site's root", () => {
    expect(clientIdUrl("https://example.org")).toBe("https://example.org/clientid.jsonld");
  });
});

describe("clientIdDocument", () => {
  const document = JSON.parse(clientIdDocument("https://example.org", "Example Cards")) as Record<
    string,
    unknown
  >;

  it("names itself by its own address, in the context Solid-OIDC defines", () => {
    expect(document["@context"]).toEqual(["https://www.w3.org/ns/solid/oidc-context.jsonld"]);
    expect(document.client_id).toBe(clientIdUrl("https://example.org"));
  });

  it("sends the provider back to the site's root alone, under the site's name", () => {
    expect(document.redirect_uris).toEqual(["https://example.org/"]);
    expect(document.client_name).toBe("Example Cards");
    expect(document.client_uri).toBe("https://example.org/");
    expect(document.logo_uri).toBe("https://example.org/solid-memo-avatar.png");
  });

  it("asks for what the login asks for, as a public client", () => {
    expect(document.scope).toBe("openid offline_access webid");
    expect(document.grant_types).toEqual(["authorization_code", "refresh_token"]);
    expect(document.response_types).toEqual(["code"]);
    expect(document.token_endpoint_auth_method).toBe("none");
    expect(document.application_type).toBe("web");
  });

  it("has no terms of service and no post-logout redirect", () => {
    expect(document).not.toHaveProperty("tos_uri");
    expect(document).not.toHaveProperty("post_logout_redirect_uris");
  });

  it("is JSON, ending in a line break", () => {
    expect(clientIdDocument("https://example.org", "x").endsWith("}\n")).toBe(true);
  });
});

describe("clientIdPlugin", () => {
  async function run(origin: string | null, publicDir: string) {
    const plugin = clientIdPlugin({ origin, name: () => "Example Cards" });
    (plugin.configResolved as (config: { publicDir: string }) => void)({ publicDir });
    const emitFile = vi.fn<(file: { fileName: string; source: string }) => void>();
    await (plugin.generateBundle as unknown as (this: { emitFile: typeof emitFile }) => void).call({
      emitFile,
    });
    return Object.fromEntries(emitFile.mock.calls.map(([file]) => [file.fileName, file.source]));
  }

  it("runs in the build only", () => {
    expect(clientIdPlugin({ origin: null, name: () => "x" }).apply).toBe("build");
  });

  it("writes the document when there is a domain", async () => {
    expect(await run("https://example.org", dir)).toEqual({
      [CLIENT_ID_FILE]: clientIdDocument("https://example.org", "Example Cards"),
    });
  });

  it("writes none without a domain", async () => {
    expect(await run(null, dir)).toEqual({});
  });

  it("writes it with no public folder to look in for a copy", async () => {
    expect(await run("https://example.org", "")).toEqual({
      [CLIENT_ID_FILE]: clientIdDocument("https://example.org", "Example Cards"),
    });
  });

  it("refuses a copy of the document in the public folder", async () => {
    await writeFile(join(dir, CLIENT_ID_FILE), "{}");
    await expect(run(null, dir)).rejects.toThrow(
      `${join(dir, CLIENT_ID_FILE)}: the build writes clientid.jsonld from CNAME (docs/authentication.md); delete this copy.`,
    );
  });
});
