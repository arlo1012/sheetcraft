import { describe, expect, test } from "vitest";
import type { SheetConditionalFormatRule } from "../../conditional-formatting.js";
import {
  createMultiKeySortSheetRangeCommand,
  createSortCellIconResolver,
  tryApplyWorkbookCommand,
} from "../../commands/index.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { getActiveSheet, setCellContent } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";

function iconRule(
  id: string,
  condition: SheetConditionalFormatRule["condition"],
  stopIfTrue = false,
): SheetConditionalFormatRule {
  return {
    id,
    anchor: { row: 0, column: 0 },
    ranges: [{ start: { row: 0, column: 0 }, end: { row: 2, column: 0 } }],
    condition,
    style: {},
    ...(stopIfTrue ? { stopIfTrue: true } : {}),
  };
}

function iconCondition(overrides = {}) {
  return {
    kind: "iconSet" as const,
    iconSet: "threeArrows" as const,
    thresholds: [
      { kind: "num" as const, value: 0 },
      { kind: "num" as const, value: 10 },
      { kind: "num" as const, value: 20 },
    ],
    ...overrides,
  };
}

describe("conditional-format icon sorting", () => {
  test("resolves the current reverse/custom glyph and treats hidden or stop-priority icons as absent", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    for (const [row, value] of [0, 10, 20].entries())
      setCellContent(sheet, { row, column: 0 }, { kind: "literal", value });
    sheet.conditionalFormats = [
      iconRule(
        "custom",
        iconCondition({
          reverse: true,
          icons: [
            { iconSet: "threeFlags" as const, iconIndex: 1 },
            null,
            { iconSet: "threeTrafficLights" as const, iconIndex: 2 },
          ],
        }),
      ),
    ];
    const resolve = createSortCellIconResolver(sheet);
    expect(resolve({ row: 0, column: 0 })).toEqual({
      iconSet: "threeTrafficLights",
      iconIndex: 2,
    });
    expect(resolve({ row: 1, column: 0 })).toBeNull();
    expect(resolve({ row: 2, column: 0 })).toEqual({ iconSet: "threeFlags", iconIndex: 1 });

    sheet.conditionalFormats.unshift(
      iconRule("hidden-first", iconCondition({ icons: [null, null, null] }), true),
    );
    expect(createSortCellIconResolver(sheet)({ row: 2, column: 0 })).toBeNull();
    sheet.conditionalFormats.unshift({
      ...iconRule("style-stop", { kind: "cellValue", operator: "greaterThan", value: -1 }, true),
      style: { fillColor: "#ff0000" },
    });
    expect(createSortCellIconResolver(sheet)({ row: 2, column: 0 })).toBeNull();
  });

  test("keeps the header fixed and matches the exact family/index for top, bottom, and no-icon sorting", () => {
    const createFixture = () => {
      const session = createTestWorkbookSession();
      const sheet = getActiveSheet(session.workbook);
      for (const [row, [value, label]] of [
        ["Value", "Label"],
        [1, "same-index-other-family"],
        [2, "no-icon-b"],
        [3, "target"],
        [4, "no-icon-a"],
      ].entries()) {
        setCellContent(sheet, { row, column: 0 }, { kind: "literal", value: value! });
        setCellContent(sheet, { row, column: 1 }, { kind: "literal", value: label! });
      }
      const glyph = (id: string, row: number, iconSet: "threeFlags" | "threeArrows") => ({
        ...iconRule(
          id,
          iconCondition({
            icons: [
              { iconSet, iconIndex: 1 },
              { iconSet, iconIndex: 1 },
              { iconSet, iconIndex: 1 },
            ],
          }),
        ),
        ranges: [{ start: { row, column: 0 }, end: { row, column: 0 } }],
      });
      sheet.conditionalFormats = [
        glyph("other", 1, "threeArrows"),
        glyph("target", 3, "threeFlags"),
      ];
      return { session, sheet };
    };
    const sort = (
      direction: "ascending" | "descending",
      icon: { iconSet: "threeFlags"; iconIndex: number } | null,
    ) => {
      const { session, sheet } = createFixture();
      expect(
        executeWorkbookCommand(
          session,
          createMultiKeySortSheetRangeCommand(
            sheet.id,
            { start: { row: 0, column: 0 }, end: { row: 4, column: 1 } },
            [{ column: 0, direction, sortOn: "icon", icon }],
            { hasHeader: true },
          ),
        ),
      ).toBe(true);
      return [0, 1, 2, 3, 4].map((row) => sheet.cells.get(`${row}:1`)?.content);
    };
    expect(sort("ascending", { iconSet: "threeFlags", iconIndex: 1 })).toEqual([
      { kind: "literal", value: "Label" },
      { kind: "literal", value: "target" },
      { kind: "literal", value: "same-index-other-family" },
      { kind: "literal", value: "no-icon-b" },
      { kind: "literal", value: "no-icon-a" },
    ]);
    expect(sort("descending", { iconSet: "threeFlags", iconIndex: 1 })).toEqual([
      { kind: "literal", value: "Label" },
      { kind: "literal", value: "same-index-other-family" },
      { kind: "literal", value: "no-icon-b" },
      { kind: "literal", value: "no-icon-a" },
      { kind: "literal", value: "target" },
    ]);
    expect(sort("ascending", null)).toEqual([
      { kind: "literal", value: "Label" },
      { kind: "literal", value: "no-icon-b" },
      { kind: "literal", value: "no-icon-a" },
      { kind: "literal", value: "same-index-other-family" },
      { kind: "literal", value: "target" },
    ]);
  });

  test("snapshots formula-derived icons before moving rows, applies the next key to nonmatches, and supports undo/redo", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    for (const [row, [value, thresholdState, label]] of [
      [2, 5, "low-b"],
      [10, 0, "match"],
      [3, 0, "low-a"],
    ].entries()) {
      setCellContent(sheet, { row, column: 0 }, { kind: "literal", value: value! });
      setCellContent(sheet, { row, column: 1 }, { kind: "literal", value: thresholdState! });
      setCellContent(sheet, { row, column: 2 }, { kind: "literal", value: label! });
    }
    sheet.conditionalFormats = [
      iconRule(
        "formula-threshold",
        iconCondition({
          thresholds: [
            { kind: "num", value: 0 },
            { kind: "formula", formula: "=$B$1" },
            { kind: "num", value: 100 },
          ],
        }),
      ),
    ];
    const command = createMultiKeySortSheetRangeCommand(
      sheet.id,
      { start: { row: 0, column: 0 }, end: { row: 2, column: 2 } },
      [
        {
          column: 0,
          direction: "ascending",
          sortOn: "icon",
          icon: { iconSet: "threeArrows", iconIndex: 1 },
        },
        { column: 2, direction: "ascending" },
      ],
    );
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect([0, 1, 2].map((row) => sheet.cells.get(`${row}:2`)?.content)).toEqual([
      { kind: "literal", value: "match" },
      { kind: "literal", value: "low-a" },
      { kind: "literal", value: "low-b" },
    ]);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(redoWorkbookCommand(session)).toBe(true);

    const icon = { iconSet: "threeArrows" as const, iconIndex: 1 };
    const clone = createMultiKeySortSheetRangeCommand(sheet.id, command.range, [
      { column: 0, direction: "ascending", sortOn: "icon", icon },
    ]);
    icon.iconIndex = 0;
    expect(clone.sortKeys?.[0]?.icon).toEqual({ iconSet: "threeArrows", iconIndex: 1 });
  });

  test("rejects missing, invalid, or incompatible icon sort payloads", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const base = {
      type: "sortSheetRange" as const,
      sheetId: sheet.id,
      range: { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
      keyColumn: 0,
      direction: "ascending" as const,
    };
    for (const key of [
      { column: 0, direction: "ascending", sortOn: "icon" },
      {
        column: 0,
        direction: "ascending",
        sortOn: "icon",
        icon: { iconSet: "threeArrows", iconIndex: 3 },
      },
      { column: 0, direction: "ascending", sortOn: "icon", icon: null, color: "#ff0000" },
      { column: 0, direction: "ascending", sortOn: "value", icon: null },
      { column: 0, direction: "ascending", sortOn: "icon", icon: null, customOrder: ["x"] },
    ])
      expect(
        tryApplyWorkbookCommand(session.workbook, { ...base, sortKeys: [key] } as never),
      ).toMatchObject({
        ok: false,
        error: { code: "invalid_command_payload" },
      });
  });
});
