// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  fixedOffsetZone,
  noonTimeZone,
  offsetWhereItIs,
  zonesAcrossTheDayTurn,
} from "./timezone.ts";

const localHour = (zone: string, at: Date) =>
  Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "numeric", hourCycle: "h23" }).format(
      at,
    ),
  );

describe("noonTimeZone", () => {
  it("names UTC itself at noon UTC as UTC, the one name of it Firefox takes", () => {
    expect(noonTimeZone(new Date("2026-10-07T12:30:00Z"))).toBe("UTC");
  });

  it("names the zone ahead of UTC, with the IANA's inverted sign, in the morning", () => {
    expect(noonTimeZone(new Date("2026-10-07T03:59:00Z"))).toBe("Etc/GMT-9");
  });

  it.each(Array.from({ length: 24 }, (_, hour) => hour))(
    "puts %i:15 UTC at noon in a zone that exists",
    (hour) => {
      const at = new Date(Date.UTC(2026, 9, 7, hour, 15));
      expect(localHour(noonTimeZone(at), at)).toBe(12);
    },
  );
});

/** The offset of a zone fixedOffsetZone names, as ECMAScript's Intl writes it ("+05:30"): Node's does not read ICU's "GMT+05:30". */
const offsetOf = (zone: string) => zone.replace(/^GMT/, "");

describe("fixedOffsetZone", () => {
  it("names a zone ahead of UTC to the minute", () => {
    expect(fixedOffsetZone(5 * 60 + 30)).toBe("GMT+05:30");
  });

  it("names a zone behind UTC, and UTC itself", () => {
    expect(fixedOffsetZone(-11 * 60 - 5)).toBe("GMT-11:05");
    expect(fixedOffsetZone(0)).toBe("GMT+00:00");
  });

  it("names the offset it is", () => {
    const at = new Date("2026-10-07T20:15:00Z");
    expect(localHour(offsetOf(fixedOffsetZone(-14 * 60)), at)).toBe(6);
    expect(localHour(offsetOf(fixedOffsetZone(14 * 60)), at)).toBe(10);
  });

  it.each([14 * 60 + 1, -14 * 60 - 1, 0.5])(
    "refuses %d minutes, which no answer may record",
    (minutes) => {
      expect(() => fixedOffsetZone(minutes)).toThrow(RangeError);
    },
  );
});

describe("offsetWhereItIs", () => {
  it.each(Array.from({ length: 24 }, (_, hour) => hour))(
    "puts %i:15 UTC at 2 o'clock, with room to move on 4 hours",
    (hour) => {
      const at = new Date(Date.UTC(2026, 9, 7, hour, 15, 42));
      const offset = offsetWhereItIs(at, 2);
      expect(offset).toBeGreaterThanOrEqual(-14 * 60);
      expect(offset + 4 * 60).toBeLessThanOrEqual(14 * 60);
      const local = new Date(at.getTime() + offset * 60_000);
      expect([local.getUTCHours(), local.getUTCMinutes(), local.getUTCSeconds()]).toEqual([
        2, 0, 42,
      ]);
      expect(localHour(offsetOf(fixedOffsetZone(offset)), at)).toBe(2);
      expect(localHour(offsetOf(fixedOffsetZone(offset + 3 * 60)), at)).toBe(5);
    },
  );

  it("takes the zone furthest behind UTC", () => {
    expect(offsetWhereItIs(new Date("2026-10-07T12:00:00Z"), 2)).toBe(-10 * 60);
    expect(offsetWhereItIs(new Date("2026-10-07T23:00:00Z"), 2)).toBe(3 * 60);
  });
});

describe("zonesAcrossTheDayTurn", () => {
  it.each(Array.from({ length: 24 }, (_, hour) => hour))(
    "puts %i:15 UTC before 3 a.m. in one zone that exists, and five hours on in the other",
    (hour) => {
      const at = new Date(Date.UTC(2026, 9, 7, hour, 15));
      const { before, after } = zonesAcrossTheDayTurn(at);
      expect(localHour(before, at)).toBeLessThan(3);
      expect(localHour(after, at)).toBe(localHour(before, at) + 5);
    },
  );

  it("names the zones as the IANA does, with inverted signs, midnight's where it can", () => {
    expect(zonesAcrossTheDayTurn(new Date("2026-10-07T20:00:00Z"))).toEqual({
      before: "Etc/GMT-4",
      after: "Etc/GMT-9",
    });
    expect(zonesAcrossTheDayTurn(new Date("2026-10-07T00:30:00Z"))).toEqual({
      before: "UTC",
      after: "Etc/GMT-5",
    });
  });

  it("takes the zone furthest behind UTC where midnight is too far ahead", () => {
    expect(zonesAcrossTheDayTurn(new Date("2026-10-07T14:00:00Z"))).toEqual({
      before: "Etc/GMT+12",
      after: "Etc/GMT+7",
    });
  });
});
