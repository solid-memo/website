import { describe, expect, it } from "vitest";
import { profileNameOf } from "./account";
import type { WebIdDocument } from "./webIdDocument";

const WEB_ID = "https://alice.example/profile/card#me";
const FOAF_NAME = "http://xmlns.com/foaf/0.1/name";
const XSD_STRING = "http://www.w3.org/2001/XMLSchema#string";

function profile(
  values: WebIdDocument["subjects"][number]["properties"][number]["values"],
  subject = WEB_ID,
): WebIdDocument {
  return {
    url: "https://alice.example/profile/card",
    subjects: [{ url: subject, properties: [{ predicate: FOAF_NAME, values }] }],
  };
}

describe("profileNameOf", () => {
  it("takes the profile's foaf:name, plain or language-tagged", () => {
    expect(
      profileNameOf(profile([{ type: "literal", value: "Alice", dataType: XSD_STRING }]), WEB_ID),
    ).toBe("Alice");
    expect(
      profileNameOf(profile([{ type: "langString", value: " Alice ", language: "en" }]), WEB_ID),
    ).toBe("Alice");
  });

  it("skips values that are not usable as a name", () => {
    expect(
      profileNameOf(
        profile([
          { type: "iri", value: "https://alice.example/name" },
          { type: "blankNode", value: "b0" },
          { type: "literal", value: "   ", dataType: XSD_STRING },
          { type: "literal", value: "Alice", dataType: XSD_STRING },
        ]),
        WEB_ID,
      ),
    ).toBe("Alice");
  });

  it("is undefined without a name, or when the name is on another subject", () => {
    expect(profileNameOf({ url: "", subjects: [] }, WEB_ID)).toBeUndefined();
    expect(profileNameOf(profile([]), WEB_ID)).toBeUndefined();
    expect(
      profileNameOf(
        profile(
          [{ type: "literal", value: "Bob", dataType: XSD_STRING }],
          "https://bob.example/profile/card#me",
        ),
        WEB_ID,
      ),
    ).toBeUndefined();
  });
});
