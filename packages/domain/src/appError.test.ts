import { describe, expect, it } from "vitest";
import { AppError, fillTemplate, technicalDetail } from "./appError";

describe("AppError", () => {
  it("names the error by its code and says it in English, its values filled in", () => {
    const error = new AppError("deckGone", { deck: "Capitals" });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("AppError");
    expect(error.code).toBe("deckGone");
    expect(error.vars).toEqual({ deck: "Capitals" });
    expect(error.message).toBe("The deck “Capitals” no longer exists. Perhaps it was removed in another tab or app.");
    expect(error.detail).toBe("");
    expect(new AppError("webIdEmpty").vars).toEqual({});
  });

  it("says a value in several languages in its English", () => {
    const title = { en: "Capitals", sv: "Huvudstäder" };
    const error = new AppError("deckGone", { deck: title });
    expect(error.vars).toEqual({ deck: title });
    expect(error.message).toContain("“Capitals”");
    expect(technicalDetail("{a}", { a: 1, deck: title })).toBe("deck: Capitals");
  });

  it("picks the singular for a count of one, the plural otherwise", () => {
    expect(new AppError("movedCopyInvalid", { count: 1 }).message).toContain("(1 problem)");
    expect(new AppError("movedCopyInvalid", { count: 3 }).message).toContain("(3 problems)");
  });

  it("keeps the values its text leaves out as its technical detail, after the text in its message", () => {
    const error = new AppError("storageInaccessible", { url: "https://pod.example/", status: 403 });
    expect(error.detail).toBe("url: https://pod.example/\nstatus: 403");
    expect(error.message).toBe(
      "Solid Memo cannot open that storage. Check the address, and that you are logged in with the account that owns it.\nurl: https://pod.example/\nstatus: 403",
    );
    expect(technicalDetail({ one: "{count} {a}", other: "{count} {b}" }, { count: 2, a: 1, b: 2, c: 3 })).toBe("c: 3");
  });

  it("leaves a placeholder without a value as it is", () => {
    expect(fillTemplate("<{url}> already exists.", {})).toBe("<{url}> already exists.");
  });
});
