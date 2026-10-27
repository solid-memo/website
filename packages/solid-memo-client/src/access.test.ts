// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Quad } from "@rdfjs/types";
import { Parser } from "n3";
import { describe, expect, it } from "vitest";
import { accessContract } from "@solid-memo/solid/testing/contract/access";
import { grantPublicRead } from "./access";

accessContract(grantPublicRead);

const DOCUMENT = "https://alice.example/solid-memo/v1.ttl";
const ACR = `${DOCUMENT}.acr`;
const ACP = "http://www.w3.org/ns/solid/acp#";
const ACL = "http://www.w3.org/ns/auth/acl#";
const FOAF_AGENT = "http://xmlns.com/foaf/0.1/Agent";
const TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const POD = "https://alice.example/";
const FOLDER = `${POD}solid-memo/`;
const OWN_ACL = `${DOCUMENT}.acl`;
const ALICE = `${POD}profile/card#me`;
const PREFIXES = `@prefix acl: <${ACL}>. @prefix acp: <${ACP}>. @prefix foaf: <http://xmlns.com/foaf/0.1/>.\n`;

/**
 * A pod with Access Control Policies whose document's ACR starts as
 * `acr` (Turtle, prefixes acp: and acl: declared); a PATCH adds its
 * INSERT DATA statements to it. `patches` counts the PATCHes.
 */
function acpPod(acr: string) {
  let body = `@prefix acp: <${ACP}>. @prefix acl: <http://www.w3.org/ns/auth/acl#>.\n${acr}\n`;
  const pod = { patches: 0, fetch: (async () => new Response()) as typeof globalThis.fetch };
  pod.fetch = async (input, init) => {
    const url = String(input);
    if (url === DOCUMENT) return new Response(null, { headers: { Link: `<${ACR}>; rel="acl"` } });
    if (init?.method === "PATCH") {
      pod.patches += 1;
      body += String(init.body).replace(/^INSERT DATA \{|\}$/g, "");
      return new Response(null, { status: 205 });
    }
    return new Response(body, {
      headers: { Link: `<${ACP}AccessControlResource>; rel="type"` },
    });
  };
  return pod;
}

/** An ACR applying one policy of `policy`'s statements, as <#p>. */
const applying = (policy: string) =>
  `<> acp:accessControl <#c>. <#c> acp:apply <#p>. <#p> ${policy}.`;

describe("grantPublicRead, on an Access Control Resource", () => {
  it("leaves alone an ACR whose policy already lets everyone read", async () => {
    const pod = acpPod(
      `${applying("acp:allow acl:Read; acp:anyOf <#m>")} <#m> acp:agent acp:PublicAgent.`,
    );
    await expect(grantPublicRead(DOCUMENT, { fetch: pod.fetch })).resolves.toBe(true);
    expect(pod.patches).toBe(0);
  });

  it("adds read for everyone where a policy naming everyone also needs another agent, a client or no one excluded", async () => {
    for (const policy of [
      `${applying("acp:allow acl:Read; acp:allOf <#m1>, <#m2>")} <#m1> acp:agent acp:PublicAgent. <#m2> acp:agent <https://alice.example/#me>.`,
      `${applying("acp:allow acl:Read; acp:anyOf <#m>")} <#m> acp:agent acp:PublicAgent; acp:client <https://app.example/id>.`,
      `${applying("acp:allow acl:Read; acp:anyOf <#m>; acp:noneOf <#n>")} <#m> acp:agent acp:PublicAgent. <#n> acp:agent acp:PublicAgent.`,
    ]) {
      const pod = acpPod(policy);
      await expect(grantPublicRead(DOCUMENT, { fetch: pod.fetch })).resolves.toBe(true);
      expect(pod.patches).toBe(1);
    }
  });

  it("says a document whose ACR denies everyone read is not public, and writes nothing", async () => {
    const pod = acpPod(
      `<> acp:accessControl <#c>. <#c> acp:apply <#allow>, <#deny>.
       <#allow> acp:allow acl:Read; acp:anyOf <#m>.
       <#deny> acp:deny acl:Read; acp:anyOf <#m>.
       <#m> acp:agent acp:PublicAgent.`,
    );
    await expect(grantPublicRead(DOCUMENT, { fetch: pod.fetch })).resolves.toBe(false);
    expect(pod.patches).toBe(0);
  });
});

/** How a fake pod answers a URL: 200 and an empty body unless said, the same to a HEAD unless `head` says. */
interface Answer {
  status?: number;
  head?: number;
  link?: string;
  body?: string;
}

/**
 * A pod answering each URL as `answers` says, and 404 where it says
 * nothing. A PATCH's INSERT DATA statements are kept in `patches` and,
 * unless the server `ignores` them, added to the resource; `refuses`
 * answers every PATCH 403.
 */
function fakePod(
  answers: Record<string, Answer>,
  { refuses = false, ignores = false }: { refuses?: boolean; ignores?: boolean } = {},
) {
  const patches: { url: string; quads: Quad[] }[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = String(input);
    const answer = answers[url] ?? { status: 404 };
    if (init?.method === "PATCH") {
      const inserted = String(init.body).replace(/^INSERT DATA \{|\}$/g, "");
      patches.push({ url, quads: new Parser().parse(inserted) });
      if (!refuses && !ignores)
        answers[url] = { ...answer, status: 200, body: `${answer.body ?? ""}\n${inserted}` };
      return new Response(null, { status: refuses ? 403 : 205 });
    }
    const head = init?.method === "HEAD";
    const status = (head ? answer.head : undefined) ?? answer.status ?? 200;
    const headers = answer.link === undefined ? undefined : { Link: answer.link };
    return new Response(head ? null : (answer.body ?? ""), { status, headers });
  };
  return { fetch, patches };
}

/** Each quad as "subject predicate object", sorted. */
const lines = (quads: Quad[]) =>
  quads.map((one) => `${one.subject.value} ${one.predicate.value} ${one.object.value}`).sort();

/** The four statements of a rule of read for everyone of the document alone, named `rule`. */
const publicRule = (rule: string) => [
  `${rule} ${ACL}accessTo ${DOCUMENT}`,
  `${rule} ${ACL}agentClass ${FOAF_AGENT}`,
  `${rule} ${ACL}mode ${ACL}Read`,
  `${rule} ${TYPE} ${ACL}Authorization`,
];

/** The document, naming its ACL among other links, and that ACL as `acl` says. */
const withOwnAcl = (acl: Answer): Record<string, Answer> => ({
  [DOCUMENT]: { link: `<${POD}profile/card>; title="owner", <v1.ttl.acl>; rel=acl` },
  [OWN_ACL]: acl,
});

const OWNER = `<#owner> a acl:Authorization; acl:agent <${ALICE}>; acl:accessTo <${DOCUMENT}>; acl:mode acl:Read, acl:Write, acl:Control.`;

describe("grantPublicRead, on a Web Access Control ACL", () => {
  it("adds read for everyone of the document alone to its ACL, by a name it does not use, and keeps the owner's rule", async () => {
    const pod = fakePod(
      withOwnAcl({
        body: `${PREFIXES}${OWNER}
          <#public> a acl:Authorization; acl:agentClass foaf:Agent; acl:accessTo <${POD}elsewhere.ttl>; acl:mode acl:Read.`,
      }),
    );
    await expect(grantPublicRead(DOCUMENT, { fetch: pod.fetch })).resolves.toBe(true);
    expect(pod.patches).toHaveLength(1);
    expect(pod.patches[0]?.url).toBe(OWN_ACL);
    expect(lines(pod.patches[0]?.quads ?? [])).toEqual(publicRule(`${OWN_ACL}#public-2`).sort());
  });

  it("leaves alone an ACL that already lets everyone read the document", async () => {
    const pod = fakePod(
      withOwnAcl({
        body: `${PREFIXES}<#all> a acl:Authorization; acl:agentClass foaf:Agent; acl:accessTo <${DOCUMENT}>; acl:mode acl:Read.`,
      }),
    );
    await expect(grantPublicRead(DOCUMENT, { fetch: pod.fetch })).resolves.toBe(true);
    expect(pod.patches).toEqual([]);
  });

  it("writes an ACL not written yet with the default rules of the nearest folder's ACL, for the document alone, and read for everyone", async () => {
    const pod = fakePod({
      ...withOwnAcl({ status: 404 }),
      // The folder answers no HEAD, and has no ACL of its own; the pod's root has one.
      [FOLDER]: { head: 405, link: `<.acl>; rel="acl"` },
      [POD]: { link: `<${POD}.acl>; rel="acl"` },
      [`${POD}.acl`]: {
        body: `${PREFIXES}
          <#owner> a acl:Authorization; acl:agent <${ALICE}>; acl:accessTo <./>; acl:default <./>;
            acl:mode acl:Read, acl:Write, acl:Control; <https://example.org/note> [ <https://example.org/by> "Alice" ].
          <#signedIn> a acl:Authorization; acl:agentClass acl:AuthenticatedAgent; acl:defaultForNew <./>; acl:mode acl:Append.
          <#rootOnly> a acl:Authorization; acl:agent <https://bob.example/#me>; acl:accessTo <./>; acl:mode acl:Write.
          <#elsewhere> a acl:Authorization; acl:agent <https://carol.example/#me>; acl:default <./other/>; acl:mode acl:Write.`,
      },
    });
    await expect(grantPublicRead(DOCUMENT, { fetch: pod.fetch })).resolves.toBe(true);
    expect(pod.patches).toHaveLength(1);
    expect(pod.patches[0]?.url).toBe(OWN_ACL);
    const owner = `${OWN_ACL}#inherited-1`;
    const signedIn = `${OWN_ACL}#inherited-2`;
    expect(lines(pod.patches[0]?.quads ?? [])).toEqual(
      [
        `${owner} ${TYPE} ${ACL}Authorization`,
        `${owner} ${ACL}agent ${ALICE}`,
        `${owner} ${ACL}mode ${ACL}Read`,
        `${owner} ${ACL}mode ${ACL}Write`,
        `${owner} ${ACL}mode ${ACL}Control`,
        `${owner} ${ACL}accessTo ${DOCUMENT}`,
        `${signedIn} ${TYPE} ${ACL}Authorization`,
        `${signedIn} ${ACL}agentClass ${ACL}AuthenticatedAgent`,
        `${signedIn} ${ACL}mode ${ACL}Append`,
        `${signedIn} ${ACL}accessTo ${DOCUMENT}`,
        ...publicRule(`${OWN_ACL}#public`),
      ].sort(),
    );
  });

  it.each<[string, Record<string, Answer>]>([
    [
      "no folder above has an ACL",
      { [FOLDER]: { link: `<.acl>; rel="acl"` }, [POD]: { link: `<.acl>; rel="acl"` } },
    ],
    ["a folder names no ACL", { [FOLDER]: {} }],
    [
      "the folder's ACL cannot be read",
      { [FOLDER]: { link: `<.acl>; rel="acl"` }, [`${FOLDER}.acl`]: { status: 403 } },
    ],
    [
      "the folder's access control is an ACR",
      {
        [FOLDER]: { link: `<.acr>; rel="acl"` },
        [`${FOLDER}.acr`]: { link: `<${ACP}AccessControlResource>; rel="type"` },
      },
    ],
  ])(
    "says an ACL not written yet is not public, and writes nothing, when %s",
    async (_, folders) => {
      const pod = fakePod({ ...withOwnAcl({ status: 404 }), ...folders });
      await expect(grantPublicRead(DOCUMENT, { fetch: pod.fetch })).resolves.toBe(false);
      expect(pod.patches).toEqual([]);
    },
  );

  it("says the document is not public, and writes nothing, when its ACL cannot be read", async () => {
    const pod = fakePod(withOwnAcl({ status: 403 }));
    await expect(grantPublicRead(DOCUMENT, { fetch: pod.fetch })).resolves.toBe(false);
    expect(pod.patches).toEqual([]);
  });

  it("says the document is not public when the server refuses the PATCH, or takes it and does not apply it", async () => {
    for (const server of [{ refuses: true }, { ignores: true }]) {
      const pod = fakePod(withOwnAcl({ body: `${PREFIXES}${OWNER}` }), server);
      await expect(grantPublicRead(DOCUMENT, { fetch: pod.fetch })).resolves.toBe(false);
      expect(pod.patches).toHaveLength(1);
    }
  });
});

describe("grantPublicRead, on an Access Control Resource, what it writes", () => {
  const acr = (body: string): Record<string, Answer> => ({
    [DOCUMENT]: { link: `<${ACR}>; rel="acl"` },
    [ACR]: { link: `<${ACP}AccessControlResource>; rel="type"`, body: `${PREFIXES}${body}` },
  });

  it("adds a control allowing everyone read and nothing more, by a name the ACR does not use, and keeps its controls", async () => {
    const pod = fakePod(
      acr(`${applying("acp:allow acl:Read, acl:Write, acl:Control; acp:allOf <#m>")} <#m> acp:agent <${ALICE}>.
        <> acp:accessControl <#publicRead>. <#publicRead> acp:apply <#p>.`),
    );
    await expect(grantPublicRead(DOCUMENT, { fetch: pod.fetch })).resolves.toBe(true);
    expect(pod.patches).toHaveLength(1);
    const control = `${ACR}#publicRead-2`;
    expect(lines(pod.patches[0]?.quads ?? [])).toEqual(
      [
        `${ACR} ${ACP}accessControl ${control}`,
        `${control} ${TYPE} ${ACP}AccessControl`,
        `${control} ${ACP}apply ${control}Policy`,
        `${control}Policy ${TYPE} ${ACP}Policy`,
        `${control}Policy ${ACP}allow ${ACL}Read`,
        `${control}Policy ${ACP}anyOf ${control}Matcher`,
        `${control}Matcher ${TYPE} ${ACP}Matcher`,
        `${control}Matcher ${ACP}agent ${ACP}PublicAgent`,
      ].sort(),
    );
  });

  it("says the document is not public when the server refuses the PATCH", async () => {
    const pod = fakePod(acr(""), { refuses: true });
    await expect(grantPublicRead(DOCUMENT, { fetch: pod.fetch })).resolves.toBe(false);
    expect(pod.patches).toHaveLength(1);
  });
});
