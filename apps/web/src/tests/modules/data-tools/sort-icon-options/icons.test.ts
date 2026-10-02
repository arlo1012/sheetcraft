import { describe, expect, test } from "vitest";
import { createWorkbookSession } from "@idea10/core/history";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import type { SheetConditionalFormatRule } from "@idea10/core/conditional-formatting";
import { createSheetEvaluator, getActiveSheet, setCellContent } from "@idea10/core/workbook";
import { getSortIconColumns } from "../../../../modules/data-tools/sort-icon-options";

describe("getSortIconColumns", () => {
  test("discovers displayed custom/reversed glyphs, keeps family identity and separates the header", () => {
    const sheet = getActiveSheet(
      createWorkbookSession({ idFactory: createSequentialIdFactory() }).workbook,
    );
    [20, 0, 10, 0, "text"].forEach((value, row) =>
      setCellContent(sheet, { row, column: 0 }, { kind: "literal", value }),
    );
    [1, 2].forEach((row) =>
      setCellContent(sheet, { row, column: 1 }, { kind: "literal", value: 0 }),
    );
    const range = { start: { row: 0, column: 0 }, end: { row: 4, column: 1 } };
    const thresholds = [
      { kind: "num" as const, value: 0 },
      { kind: "num" as const, value: 10 },
      { kind: "num" as const, value: 20 },
    ];
    sheet.conditionalFormats = [
      {
        id: "custom",
        style: {},
        anchor: range.start,
        ranges: [{ start: range.start, end: { row: 4, column: 0 } }],
        condition: {
          kind: "iconSet",
          iconSet: "threeArrows",
          thresholds,
          reverse: true,
          icons: [
            { iconSet: "threeFlags", iconIndex: 1 },
            null,
            { iconSet: "threeTrafficLights", iconIndex: 2 },
          ],
        },
      },
      ...["threeArrows", "fourArrows"].map((iconSet, index): SheetConditionalFormatRule => ({
        id: iconSet,
        style: {},
        anchor: { row: index + 1, column: 1 },
        ranges: [{ start: { row: index + 1, column: 1 }, end: { row: index + 1, column: 1 } }],
        condition: {
          kind: "iconSet",
          iconSet: iconSet as "threeArrows" | "fourArrows",
          thresholds:
            iconSet === "threeArrows" ? thresholds : [...thresholds, { kind: "num", value: 30 }],
        },
      })),
    ];
    expect(getSortIconColumns(sheet, range, createSheetEvaluator(sheet))).toEqual([
      {
        column: 0,
        icons: [{ iconSet: "threeTrafficLights", iconIndex: 2 }, null],
        headerIcon: { iconSet: "threeFlags", iconIndex: 1 },
      },
      {
        column: 1,
        icons: [
          { iconSet: "threeArrows", iconIndex: 0 },
          { iconSet: "fourArrows", iconIndex: 0 },
          null,
        ],
        headerIcon: null,
      },
    ]);
  });

  test("represents unformatted body cells as no icon and leaves an empty body without candidates", () => {
    const sheet = getActiveSheet(
      createWorkbookSession({ idFactory: createSequentialIdFactory() }).workbook,
    );
    expect(
      getSortIconColumns(sheet, { start: { row: 0, column: 0 }, end: { row: 2, column: 0 } }),
    ).toEqual([{ column: 0, icons: [null], headerIcon: null }]);
    expect(
      getSortIconColumns(sheet, { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } })[0]
        ?.icons,
    ).toEqual([]);
  });
});
