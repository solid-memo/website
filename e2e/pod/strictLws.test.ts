// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { ruleFor } from "./strictLws.ts";

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
