import { describe, expect, test } from "vitest";
import { formatCellNumberValue } from "../../number-format.js";

describe("date format locales", () => {
  test.each([
    ["[$-417]dddd, mmmm d, yyyy", "rm-CH", "venderdi", "mars"],
    ["[$-467]dddd, mmmm d, yyyy", "ff-NG", "mawnde", "mbooy"],
    ["[$-435]dddd, mmmm d, yyyy", "zu-ZA", "ULwesihlanu", "Mashi"],
    ["[$-461]dddd, mmmm d, yyyy", "ne-NP", "शुक्रबार", "मार्च"],
  ])("renders month and weekday names for %s", (code, locale, weekday, month) => {
    const text = formatCellNumberValue(45366, { kind: "date", code, locale }).text;
    expect(text).toContain(weekday);
    expect(text).toContain(month);
  });

  test("keeps built-in locale data and date-system behavior intact", () => {
    expect(
      formatCellNumberValue(45366, { kind: "date", code: "[$-407]dddd, mmmm d, yyyy" }).text,
    ).toBe("Freitag, März 15, 2024");
    expect(
      formatCellNumberValue(0, { kind: "date", code: "[$-467]yyyy/m/d" }, { dateSystem: "1904" })
        .text,
    ).toBe("1904/1/1");
  });

  test("preserves the former numeric fallback while adding date names", () => {
    expect(formatCellNumberValue(1234.5, { kind: "custom", code: "[$-467]#,##0.00" }).text).toBe(
      "1,234.50",
    );
    expect(formatCellNumberValue(1234.5, { kind: "custom", code: "[$-843]#,##0.00" }).text).toBe(
      "1,234.50",
    );
  });

  test("keeps region and script-specific date names separate", () => {
    expect(formatCellNumberValue(45366, { kind: "date", code: "[$-443]mmmm" }).text).toBe("mart");
    expect(formatCellNumberValue(45366, { kind: "date", code: "[$-843]mmmm" }).text).toBe("март");
  });

  test.each([
    ["3C0C", "mercredi"],
    ["C0A", "miércoles"],
    ["4801", "الأربعاء"],
    ["101A", "srijeda"],
  ])("localizes newly mapped %s even when its language is already built in", (lcid, weekday) => {
    expect(formatCellNumberValue(40982, { kind: "date", code: `[$-${lcid}]dddd` }).text).toBe(
      weekday,
    );
  });

  test("localizes padded LCIDs while leaving literal prefixes and numeric sections intact", () => {
    expect(formatCellNumberValue(40982, { kind: "date", code: "[$-0003c0c]dddd" }).text).toBe(
      "mercredi",
    );
    expect(
      formatCellNumberValue(-1234.5, {
        kind: "custom",
        code: "[$-3C0C]dddd;[$-3C0C]#,##0.00",
      }).text,
    ).toBe("1,234.50");
    expect(
      formatCellNumberValue(40982, {
        kind: "date",
        code: '[$-3C0C]dddd" [$-3C0C]"',
      }).text,
    ).toBe("mercredi [$-3C0C]");
  });
});
