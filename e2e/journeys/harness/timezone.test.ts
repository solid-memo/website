import { describe, expect, it } from "vitest";
import { noonTimeZone } from "./timezone.ts";

const localHour = (zone: string, at: Date) =>
  Number(new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "numeric", hourCycle: "h23" }).format(at));

describe("noonTimeZone", () => {
  it("names UTC itself at noon UTC", () => {
    expect(noonTimeZone(new Date("2026-10-07T12:30:00Z"))).toBe("Etc/GMT");
  });

  it("names the zone ahead of UTC, with the IANA's inverted sign, in the morning", () => {
    expect(noonTimeZone(new Date("2026-10-07T03:59:00Z"))).toBe("Etc/GMT-9");
  });

  it.each(Array.from({ length: 24 }, (_, hour) => hour))("puts %i:15 UTC at noon in a zone that exists", (hour) => {
    const at = new Date(Date.UTC(2026, 9, 7, hour, 15));
    expect(localHour(noonTimeZone(at), at)).toBe(12);
  });
});
