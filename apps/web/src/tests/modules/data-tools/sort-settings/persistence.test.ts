import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { readSortSettings, writeSortSettings } from "../../../../modules/data-tools/sort-settings";
import type { SortInitial } from "../../../../modules/data-tools/data-tools-types";

const target = {
  sheetId: "sheet",
  range: { start: { row: 1, column: 1 }, end: { row: 6, column: 3 } },
};
const settings: SortInitial = {
  hasHeader: true,
  headerLocked: true,
  caseSensitive: true,
  sortMethod: "stroke",
  column: 1,
  direction: "descending",
  levels: [
    { column: 1, direction: "descending", customOrder: ["3", "1", "6", "2", "5", "4"] },
    { column: 2, direction: "ascending", sortOn: "cellColor", color: null },
    { column: 3, direction: "descending", sortOn: "fontColor", color: "#ff0000" },
  ],
};

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("sort settings persistence", () => {
  test("round-trips custom sequences, color levels, and options without persisting filter locks", () => {
    expect(writeSortSettings("book", target, settings)).toBe(true);
    const restored = readSortSettings("book", target)!;
    expect(restored).toEqual({ ...settings, headerLocked: undefined });
    restored.levels![0]!.customOrder!.reverse();
    expect(readSortSettings("book", target)?.levels).toEqual(settings.levels);
  });

  test("normalizes range direction and isolates document, sheet, and range", () => {
    writeSortSettings("book", target, settings);
    expect(
      readSortSettings("book", {
        ...target,
        range: { start: target.range.end, end: target.range.start },
      }),
    ).toBeDefined();
    expect(readSortSettings("other-book", target)).toBeUndefined();
    expect(readSortSettings("book", { ...target, sheetId: "other" })).toBeUndefined();
    expect(
      readSortSettings("book", {
        ...target,
        range: { ...target.range, end: { row: 7, column: 3 } },
      }),
    ).toBeUndefined();
  });
  test("round-trips visible icon identities and no-icon levels without sharing saved objects", () => {
    const iconSettings: SortInitial = {
      ...settings,
      levels: [
        {
          column: 1,
          direction: "ascending",
          sortOn: "icon",
          icon: { iconSet: "fourArrows", iconIndex: 2 },
        },
        { column: 1, direction: "descending", sortOn: "icon", icon: null },
      ],
    };
    writeSortSettings("book", target, iconSettings);
    expect(readSortSettings("book", target)?.levels).toEqual(iconSettings.levels);
    readSortSettings("book", target)!.levels![0]!.icon!.iconIndex = 0;
    expect(readSortSettings("book", target)?.levels).toEqual(iconSettings.levels);
    const key = localStorage.key(0)!;
    for (const level of [
      { column: 1, direction: "ascending", sortOn: "icon" },
      {
        column: 1,
        direction: "ascending",
        sortOn: "icon",
        icon: { iconSet: "unknown", iconIndex: 0 },
      },
      {
        column: 1,
        direction: "ascending",
        sortOn: "icon",
        icon: { iconSet: "threeArrows", iconIndex: 3 },
      },
      { column: 1, direction: "ascending", sortOn: "icon", icon: null, color: "#ff0000" },
      { column: 1, direction: "ascending", sortOn: "icon", icon: null, customOrder: ["A"] },
      { column: 1, direction: "ascending", sortOn: "value", icon: null },
      { column: 1, direction: "ascending", sortOn: "cellColor", color: "#ff0000", icon: null },
    ]) {
      localStorage.setItem(
        key,
        JSON.stringify({ version: 1, settings: { ...settings, levels: [level] } }),
      );
      expect(readSortSettings("book", target)).toBeUndefined();
    }
  });

  test("keeps existing range preferences without a sort method readable", () => {
    const previousSettings = { ...settings };
    delete previousSettings.sortMethod;
    writeSortSettings("book", target, previousSettings);
    expect(readSortSettings("book", target)?.levels).toEqual(settings.levels);
    expect(readSortSettings("book", target)?.sortMethod).toBeUndefined();
  });

  test("ignores malformed or unsupported snapshots and invalid sort levels", () => {
    writeSortSettings("book", target, settings);
    const key = localStorage.key(0)!;
    for (const value of [
      "invalid-json",
      JSON.stringify({ version: 2, settings }),
      JSON.stringify({ version: 1, settings: { ...settings, sortMethod: "radical" } }),
      JSON.stringify({
        version: 1,
        settings: { ...settings, levels: [{ column: 9, direction: "ascending" }] },
      }),
      JSON.stringify({
        version: 1,
        settings: {
          ...settings,
          levels: [{ column: 1, direction: "ascending", customOrder: [null] }],
        },
      }),
      JSON.stringify({
        version: 1,
        settings: { ...settings, levels: [{ column: 1, direction: "sideways" }] },
      }),
    ]) {
      localStorage.setItem(key, value);
      expect(readSortSettings("book", target)).toBeUndefined();
    }
  });

  test("storage access and quota failures do not break sorting", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
    });
    expect(readSortSettings("book", target)).toBeUndefined();
    expect(writeSortSettings("book", target, settings)).toBe(false);
  });
});
