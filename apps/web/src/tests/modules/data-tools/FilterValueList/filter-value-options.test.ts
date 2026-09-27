import { describe, expect, test } from "vitest";
import { getMatchingFilterValues } from "../../../../modules/data-tools/filter-value-options";

const values = [
  { key: { kind: "string" as const, value: "north america" }, label: "North America", count: 4 },
  { key: { kind: "string" as const, value: "north europe" }, label: "North Europe", count: 2 },
  { key: { kind: "string" as const, value: "south america" }, label: "South America", count: 3 },
];

describe("getMatchingFilterValues", () => {
  test("matches every case-insensitive whitespace-separated keyword", () => {
    expect(getMatchingFilterValues(values, " NORTH  america ")).toEqual([values[0]]);
    expect(getMatchingFilterValues(values, "south north")).toEqual([]);
  });
});
