// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Quad, Term } from "@rdfjs/types";
import { DataFactory, Parser, Writer } from "n3";
import type { GrantPublicRead } from "@solid-memo/solid/client/interface";

export type { GrantPublicRead } from "@solid-memo/solid/client/interface";

const { namedNode, quad } = DataFactory;

const ACL = "http://www.w3.org/ns/auth/acl#";
const ACP = "http://www.w3.org/ns/solid/acp#";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const FOAF_AGENT = "http://xmlns.com/foaf/0.1/Agent";
const ACCESS_CONTROL_RESOURCE = `${ACP}AccessControlResource`;

/**
 * The public-read grant (GrantPublicRead, interface.ts) with fetch and
 * n3 alone, no Inrupt library; it passes the same contract as the
 * library's (src/testing/contract/access.ts). The document's access
 * control is the one its server names (`rel="acl"`). That is an Access
 * Control Resource when its own answer says so (`rel="type"`), a 404
 * too, as the Community Solid Server answers one not written yet, or
 * when it speaks ACP; it is a Web Access Control ACL otherwise. Either
 * way read for everyone is added to it, for the document alone, in one
 * PATCH whose statements each end in " ." (node-solid-server refuses a
 * "." touching the term before it, sparqlUpdate.ts), and nothing is
 * taken away. Public when the access control, read again, says so.
 * Every request goes by URL, so a fence around `fetch`
 * (solidReleasePublisher.ts) can read where each goes.
 */
export const grantPublicRead: GrantPublicRead = async (url, { fetch }) => {
  const control = linked(await headOrGet(url, fetch), url, "acl")[0];
  if (control === undefined) return false;
  const current = await readControl(control, fetch);
  if (current === undefined) return false;
  if (current.acp) {
    const read = publicAcpRead(current.quads, control);
    // A policy denying everyone read wins over any that allows it.
    if (read === "denied") return false;
    const additions = read === "allowed" ? [] : publicAcpQuads(current.quads, control);
    if (!(await insert(control, additions, fetch))) return false;
    const after = await readControl(control, fetch);
    return after !== undefined && publicAcpRead(after.quads, control) === "allowed";
  }
  // An ACL not written yet: the rules the document inherits come along,
  // so that its owner keeps what the folder's ACL gave them.
  const own = current.exists ? current.quads : await inheritedRules(url, control, fetch);
  if (own === undefined) return false;
  const additions = [
    ...(current.exists ? [] : own),
    ...(isPublicWac(own, url) ? [] : publicWacQuads(own, url, control)),
  ];
  if (!(await insert(control, additions, fetch))) return false;
  const after = await readControl(control, fetch);
  return after !== undefined && !after.acp && isPublicWac(after.quads, url);
};

/** What an access control holds, and whether it is an ACR; undefined when it cannot be read. */
interface AccessControl {
  acp: boolean;
  exists: boolean;
  quads: Quad[];
}

async function readControl(
  url: string,
  fetch: typeof globalThis.fetch,
): Promise<AccessControl | undefined> {
  const response = await fetch(url, { headers: { Accept: "text/turtle" } });
  const typed = linked(response, url, "type").includes(ACCESS_CONTROL_RESOURCE);
  if (response.status === 404) return { acp: typed, exists: false, quads: [] };
  if (!response.ok) return undefined;
  const quads = parse(await response.text(), base(response, url));
  const speaksAcp = quads.some((one) =>
    [one.predicate, one.object].some((term) => term.value.startsWith(ACP)),
  );
  return { acp: typed || speaksAcp, exists: true, quads };
}

/**
 * The rules a document without an ACL of its own inherits, as rules of
 * the document in its new ACL at `acl`: each `acl:default` rule of the
 * nearest folder above it that has an ACL, for that folder, made a rule
 * with `acl:accessTo` the document and nothing else, as
 * @inrupt/solid-client's universal access copies them, though never as
 * an `acl:default`. Undefined when no folder's ACL can be read.
 */
async function inheritedRules(
  url: string,
  acl: string,
  fetch: typeof globalThis.fetch,
): Promise<Quad[] | undefined> {
  let resource = new URL(url);
  while (resource.pathname !== "/") {
    const folder = new URL(resource.pathname.endsWith("/") ? ".." : ".", resource);
    const folderAcl = linked(await headOrGet(folder.href, fetch), folder.href, "acl")[0];
    if (folderAcl === undefined) return undefined;
    const current = await readControl(folderAcl, fetch);
    if (current === undefined || current.acp) return undefined;
    if (current.exists) return copiedRules(current.quads, folder.href, url, acl);
    resource = folder;
  }
  return undefined;
}

/** The folder's default rules in `quads`, each as a rule of `url` alone, named in `acl`. */
function copiedRules(quads: Quad[], folder: string, url: string, acl: string): Quad[] {
  const defaults = new Set([`${ACL}default`, `${ACL}defaultForNew`]);
  const rules = subjectsWith(quads, RDF_TYPE, `${ACL}Authorization`).filter((rule) =>
    quads.some(
      (one) =>
        one.subject.equals(rule) &&
        defaults.has(one.predicate.value) &&
        one.object.value === folder,
    ),
  );
  return rules.flatMap((rule, index) => {
    const copy = namedNode(`${acl}#inherited-${index + 1}`);
    const kept = quads.filter(
      (one) =>
        one.subject.equals(rule) &&
        one.object.termType !== "BlankNode" &&
        one.predicate.value !== `${ACL}accessTo` &&
        !defaults.has(one.predicate.value),
    );
    return [
      ...kept.map((one) => quad(copy, one.predicate, one.object)),
      quad(copy, namedNode(`${ACL}accessTo`), namedNode(url)),
    ];
  });
}

/** Whether an ACL lets everyone read `url`. */
function isPublicWac(quads: Quad[], url: string): boolean {
  return subjectsWith(quads, RDF_TYPE, `${ACL}Authorization`).some(
    (rule) =>
      has(quads, rule, `${ACL}agentClass`, FOAF_AGENT) &&
      has(quads, rule, `${ACL}accessTo`, url) &&
      has(quads, rule, `${ACL}mode`, `${ACL}Read`),
  );
}

/** A rule of read for everyone of `url` alone, named in the ACL at `acl` by a name it does not use. */
function publicWacQuads(quads: Quad[], url: string, acl: string): Quad[] {
  const rule = namedNode(unusedName(quads, `${acl}#public`));
  return [
    quad(rule, namedNode(RDF_TYPE), namedNode(`${ACL}Authorization`)),
    quad(rule, namedNode(`${ACL}agentClass`), namedNode(FOAF_AGENT)),
    quad(rule, namedNode(`${ACL}accessTo`), namedNode(url)),
    quad(rule, namedNode(`${ACL}mode`), namedNode(`${ACL}Read`)),
  ];
}

/**
 * Whether the ACR at `acr` lets everyone (`acp:PublicAgent`) read its
 * resource, by the policies its access controls apply: "allowed" when
 * one allows read and none denies it, "denied" when one denies it. A
 * policy is everyone's, as @inrupt/solid-client's universal access
 * matches one, when it has an allOf or anyOf matcher, every allOf
 * matcher and some anyOf one (if any) match everyone, and no noneOf one
 * names `acp:PublicAgent`. A matcher matches everyone when it names
 * `acp:PublicAgent` and nothing more of the requester: no client,
 * issuer or credential.
 */
function publicAcpRead(quads: Quad[], acr: string): "allowed" | "denied" | "not granted" {
  const objects = (subject: Term, predicate: string) =>
    quads
      .filter((one) => one.subject.equals(subject) && one.predicate.value === predicate)
      .map((one) => one.object);
  const namesPublic = (matcher: Term) => has(quads, matcher, `${ACP}agent`, `${ACP}PublicAgent`);
  const matchesEveryone = (matcher: Term) =>
    namesPublic(matcher) &&
    ["client", "issuer", "vc"].every((more) => objects(matcher, `${ACP}${more}`).length === 0);
  const isEveryones = (policy: Term) => {
    const allOf = objects(policy, `${ACP}allOf`);
    const anyOf = objects(policy, `${ACP}anyOf`);
    return (
      allOf.length + anyOf.length > 0 &&
      allOf.every(matchesEveryone) &&
      (anyOf.length === 0 || anyOf.some(matchesEveryone)) &&
      !objects(policy, `${ACP}noneOf`).some(namesPublic)
    );
  };
  const policies = objects(namedNode(acr), `${ACP}accessControl`)
    .flatMap((control) => objects(control, `${ACP}apply`))
    .filter(isEveryones);
  const read = (verb: string) =>
    policies.some((policy) => has(quads, policy, `${ACP}${verb}`, `${ACL}Read`));
  if (read("deny")) return "denied";
  return read("allow") ? "allowed" : "not granted";
}

/**
 * An access control of the resource the ACR at `acr` is for, applying a
 * policy that allows read to a matcher of everyone, as @inrupt/solid-client
 * writes one; the ACR's other access controls are left as they are.
 */
function publicAcpQuads(quads: Quad[], acr: string): Quad[] {
  const control = namedNode(unusedName(quads, `${acr}#publicRead`));
  const policy = namedNode(`${control.value}Policy`);
  const matcher = namedNode(`${control.value}Matcher`);
  const type = namedNode(RDF_TYPE);
  return [
    quad(namedNode(acr), namedNode(`${ACP}accessControl`), control),
    quad(control, type, namedNode(`${ACP}AccessControl`)),
    quad(control, namedNode(`${ACP}apply`), policy),
    quad(policy, type, namedNode(`${ACP}Policy`)),
    quad(policy, namedNode(`${ACP}allow`), namedNode(`${ACL}Read`)),
    quad(policy, namedNode(`${ACP}anyOf`), matcher),
    quad(matcher, type, namedNode(`${ACP}Matcher`)),
    quad(matcher, namedNode(`${ACP}agent`), namedNode(`${ACP}PublicAgent`)),
  ];
}

/**
 * Add `quads` to the document at `url` in one SPARQL Update PATCH, one
 * N-Triples statement a line; whether the server took it. Nothing to add
 * is no request.
 */
async function insert(
  url: string,
  quads: Quad[],
  fetch: typeof globalThis.fetch,
): Promise<boolean> {
  if (quads.length === 0) return true;
  const triples = new Writer({ format: "N-Triples" }).quadsToString(quads);
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/sparql-update" },
    body: `INSERT DATA {\n${triples}}`,
  });
  return response.ok;
}

/** A HEAD of `url`, or a GET when the server will not answer that. */
async function headOrGet(url: string, fetch: typeof globalThis.fetch): Promise<Response> {
  const head = await fetch(url, { method: "HEAD" });
  return head.ok ? head : fetch(url);
}

/** The targets of a response's Link header with relation `rel`, made absolute. */
function linked(response: Response, url: string, rel: string): string[] {
  const header = response.headers.get("Link") ?? "";
  const found: string[] = [];
  for (const [, target, params] of header.matchAll(/<([^>]*)>([^<]*)/g)) {
    const relation = /;\s*rel\s*=\s*(?:"([^"]*)"|([^\s;,]+))/i.exec(params);
    const relations = (relation?.[1] ?? relation?.[2] ?? "").split(/\s+/);
    if (relations.includes(rel)) found.push(new URL(target, base(response, url)).href);
  }
  return found;
}

function base(response: Response, url: string): string {
  return response.url === "" ? url : response.url;
}

function parse(text: string, baseIRI: string): Quad[] {
  return new Parser({ baseIRI }).parse(text) as Quad[];
}

function subjectsWith(quads: Quad[], predicate: string, object: string): Term[] {
  return quads
    .filter((one) => one.predicate.value === predicate && one.object.value === object)
    .map((one) => one.subject);
}

function has(quads: Quad[], subject: Term, predicate: string, object: string): boolean {
  return quads.some(
    (one) =>
      one.subject.equals(subject) &&
      one.predicate.value === predicate &&
      one.object.value === object,
  );
}

/** `name`, or `name` and a number, whichever no subject in `quads` is yet. */
function unusedName(quads: Quad[], name: string): string {
  const used = new Set(quads.map((one) => one.subject.value));
  let candidate = name;
  for (let number = 2; used.has(candidate); number++) candidate = `${name}-${number}`;
  return candidate;
}
