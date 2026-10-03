import { describe, expect, test } from "vitest";
import {
  DEFAULT_FILTER_SEARCH_OPTIONS,
  getMatchingFilterValues,
} from "../../../modules/data-tools/filter-value-options";

const values = [
  { key: { kind: "string" as const, value: "beijing north" }, label: "北京 North", count: 4 },
  { key: { kind: "string" as const, value: "shanghai south" }, label: "上海 South", count: 2 },
  { key: { kind: "string" as const, value: "beijing space" }, label: "北京  North", count: 1 },
  { key: { kind: "string" as const, value: "beijingnorth7" }, label: "北京North7", count: 1 },
];

describe("getMatchingFilterValues search options", () => {
  test("defaults to all-keyword matching", () => {
    expect(DEFAULT_FILTER_SEARCH_OPTIONS).toEqual({ mode: "all", pinyin: true });
    expect(getMatchingFilterValues(values, "north beijing")).toEqual([
      values[0],
      values[2],
      values[3],
    ]);
  });

  test("matches any keyword when requested", () => {
    expect(getMatchingFilterValues(values, "north south", { mode: "any", pinyin: false })).toEqual(
      values,
    );
  });

  test("matches a literal phrase and preserves its inner spaces", () => {
    expect(
      getMatchingFilterValues(values, "北京 North", { mode: "phrase", pinyin: false }),
    ).toEqual([values[0]]);
    expect(
      getMatchingFilterValues(values, "北京  North", { mode: "phrase", pinyin: false }),
    ).toEqual([values[2]]);
  });

  test("matches full pinyin and initials when pinyin is enabled", () => {
    expect(getMatchingFilterValues(values, "beijing", { mode: "all", pinyin: true })).toEqual([
      values[0],
      values[2],
      values[3],
    ]);
    expect(getMatchingFilterValues(values, "bj", { mode: "all", pinyin: true })).toEqual([
      values[0],
      values[2],
      values[3],
    ]);
  });

  test("matches a mixed Chinese and Latin label by its compact pinyin phrase", () => {
    expect(
      getMatchingFilterValues(values, "beijingnorth7", { mode: "phrase", pinyin: true }),
    ).toEqual([values[3]]);
  });

  test("does not use pinyin when disabled, while preserving Latin matching", () => {
    expect(getMatchingFilterValues(values, "beijing", { mode: "all", pinyin: false })).toEqual([]);
    expect(getMatchingFilterValues(values, "north", { mode: "all", pinyin: false })).toEqual([
      values[0],
      values[2],
      values[3],
    ]);
  });

  test("returns every value for a blank query", () => {
    expect(getMatchingFilterValues(values, "   ", { mode: "phrase", pinyin: false })).toEqual(
      values,
    );
  });
});
