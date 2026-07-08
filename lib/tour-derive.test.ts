import { describe, it, expect } from "vitest";
import { dsFromDate, labelFromDate, monthFromDate, shortDs, MONTHS } from "./tour-derive";

describe("tour-derive", () => {
  it("derives ds as month*100+day", () => {
    expect(dsFromDate("2026-04-17")).toBe(417);
    expect(dsFromDate("2026-11-12")).toBe(1112);
  });
  it("derives the display label", () => {
    expect(labelFromDate("2026-04-17")).toBe("17 Apr");
    expect(labelFromDate("2026-08-01")).toBe("1 Aug");
  });
  it("derives the month number", () => {
    expect(monthFromDate("2026-05-23")).toBe(5);
  });
  it("formats shortDs as DD.MM", () => {
    expect(shortDs(417)).toBe("17.04");
    expect(shortDs(801)).toBe("01.08");
  });
  it("exposes month names indexed from 1", () => {
    expect(MONTHS[4]).toBe("Apr");
  });
});
