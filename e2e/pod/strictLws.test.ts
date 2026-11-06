// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { ruleFor, targetOf } from "./strictLws.ts";

describe("the strict LWS proxy's rules", () => {
  it("lists a container only as LWS does, and refuses Turtle alone", () => {
    expect(ruleFor("GET", "/a/", "text/turtle")).toEqual({ refuse: 406 });
    expect(ruleFor("HEAD", "/a/", "text/turtle, */*;q=0.1")).toEqual({
      send: true,
      accept: "application/lws+json",
    });
    expect(ruleFor("GET", "/a/", "application/lws+json")).toEqual({
      send: true,
      accept: "application/lws+json",
    });
    expect(ruleFor("GET", "/a/", undefined)).toEqual({
      send: true,
      accept: "application/lws+json",
    });
    expect(ruleFor("GET", "/", "application/lws+cid")).toEqual({ send: true });
  });

  it("refuses every PATCH and a PUT of a resource not there, and sends the rest on", () => {
    expect(ruleFor("PATCH", "/a/b.ttl", undefined)).toEqual({ refuse: 415 });
    expect(ruleFor("PUT", "/a/b.ttl", undefined)).toEqual({ sendIfThere: true });
    expect(ruleFor("GET", "/a/b.ttl", "text/turtle")).toEqual({ send: true });
    expect(ruleFor("POST", "/a/", undefined)).toEqual({ send: true });
    expect(ruleFor("DELETE", "/a/b.ttl", undefined)).toEqual({ send: true });
  });
});

describe("the strict LWS proxy's target", () => {
  const server = "http://127.0.0.1:3000/";

  it("keeps a request's path and query", () => {
    expect(targetOf(server, "/a/b.ttl?c=d").href).toBe("http://127.0.0.1:3000/a/b.ttl?c=d");
    expect(targetOf(server, "/a/../b/").href).toBe("http://127.0.0.1:3000/b/");
  });

  it("stays on the server, whatever host a request line names", () => {
    for (const requestTarget of [
      "http://elsewhere.example/a",
      "//elsewhere.example/a",
      "/\\elsewhere.example/a",
      "/.//elsewhere.example/a",
      "http://user:password@elsewhere.example:8080/a",
    ])
      expect(targetOf(server, requestTarget).host).toBe("127.0.0.1:3000");
  });
});
