import { afterEach, describe, expect, test, vi } from "vitest";
import {
  BUILTIN_SORT_LISTS,
  parseCustomSortList,
  readCustomSortLists,
  writeCustomSortLists,
} from "../../../../modules/data-tools/custom-sort-lists";

const STORAGE_KEY = "idea10.sort.customLists";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.removeItem(STORAGE_KEY);
});

describe("custom sort lists", () => {
  test("parses newline-delimited values, trimming blanks and preserving first duplicates", () => {
    expect(parseCustomSortList("  High  \n\nMedium\r\nLow\nHigh\n  ")).toEqual([
      "High",
      "Medium",
      "Low",
    ]);
  });

  test("provides the built-in English and Chinese sequences", () => {
    expect(BUILTIN_SORT_LISTS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          values: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
        }),
        expect.objectContaining({
          values: expect.arrayContaining(["January", "February", "March", "April"]),
        }),
        expect.objectContaining({
          values: ["日", "一", "二", "三", "四", "五", "六"],
        }),
        expect.objectContaining({
          values: [
            "正月",
            "二月",
            "三月",
            "四月",
            "五月",
            "六月",
            "七月",
            "八月",
            "九月",
            "十月",
            "冬月",
            "腊月",
          ],
        }),
      ]),
    );
    expect(BUILTIN_SORT_LISTS.every((list) => list.id.startsWith("builtin:"))).toBe(true);
  });

  test("round-trips versioned lists without sharing mutable arrays", () => {
    const lists = [{ id: "priority", values: ["High", "Medium", "Low"] }];
    expect(writeCustomSortLists(lists)).toBe(true);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({
      version: 1,
      lists,
    });

    lists[0]!.values[0] = "Changed";
    const restored = readCustomSortLists();
    expect(restored).toEqual([{ id: "priority", values: ["High", "Medium", "Low"] }]);
    restored[0]!.values[0] = "Mutated";
    expect(readCustomSortLists()).toEqual([{ id: "priority", values: ["High", "Medium", "Low"] }]);
  });

  test("rejects corrupt or invalid saved lists", () => {
    localStorage.setItem(STORAGE_KEY, "not json");
    expect(readCustomSortLists()).toEqual([]);

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        lists: [{ id: "builtin:week", values: ["Sun"] }],
      }),
    );
    expect(readCustomSortLists()).toEqual([]);
    expect(writeCustomSortLists([{ id: "priority", values: [" "] }])).toBe(false);
    expect(
      writeCustomSortLists([
        { id: "same", values: ["One"] },
        { id: "same", values: ["Two"] },
      ]),
    ).toBe(false);
  });

  test("handles unavailable browser storage", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("storage unavailable");
      },
      setItem: () => {
        throw new Error("storage unavailable");
      },
    });
    expect(readCustomSortLists()).toEqual([]);
    expect(writeCustomSortLists([{ id: "priority", values: ["High"] }])).toBe(false);
  });
});
