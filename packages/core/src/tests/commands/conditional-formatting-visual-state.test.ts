import { describe, expect, test } from "vitest";
import type {
  ConditionalFormatCondition,
  SheetConditionalFormatRule,
} from "../../conditional-formatting.js";
import { copyConditionalFormatRules } from "../../conditional-formatting-transfer.js";
import { createSetSheetConditionalFormatsCommand } from "../../commands/conditional-formatting.js";
import { createInsertSheetAxisCommand } from "../../commands/index.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";
import { deserializeWorkbook, serializeWorkbook } from "../../serialization.js";
import { getActiveSheet } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";

const conditions: ConditionalFormatCondition[] = [
  { kind: "rank", count: 10, percent: true, bottom: true },
  { kind: "average", above: false },
  { kind: "date", period: "last7Days" },
  {
    kind: "dataBar",
    minimum: { kind: "autoMin" },
    maximum: { kind: "autoMax" },
    color: "#22A06B",
    negativeColor: "#C9362B",
    borderColor: "#18794E",
    negativeBorderColor: "#8A1F11",
    gradient: false,
    showValue: false,
    direction: "rightToLeft",
    axisPosition: "middle",
    axisColor: "#1D2129",
  },
  {
    kind: "colorScale",
    stops: [
      { threshold: { kind: "min" }, color: "#F8696B" },
      { threshold: { kind: "percentile", value: 50 }, color: "#FFEB84" },
      { threshold: { kind: "max" }, color: "#63BE7B" },
    ],
  },
  {
    kind: "iconSet",
    iconSet: "threeArrows",
    reverse: true,
    showValue: false,
    thresholds: [
      { kind: "percent", value: 0 },
      { kind: "percent", value: 33 },
      { kind: "percent", value: 67 },
    ],
  },
];

describe("advanced conditional format state lifecycle", () => {
  test.each(conditions)(
    "keeps $kind rules through snapshots, structural undo, and redo",
    (condition) => {
      const session = createTestWorkbookSession();
      const sheet = getActiveSheet(session.workbook);
      const visual = ["dataBar", "colorScale", "iconSet"].includes(condition.kind);
      const rule: SheetConditionalFormatRule = {
        id: condition.kind,
        anchor: { row: 2, column: 1 },
        ranges: [{ start: { row: 2, column: 1 }, end: { row: 9, column: 1 } }],
        condition,
        style: visual ? {} : { bold: true },
      };
      expect(
        executeWorkbookCommand(session, createSetSheetConditionalFormatsCommand(sheet.id, [rule])),
      ).toBe(true);
      const before = structuredClone(sheet.conditionalFormats ?? []);
      expect(
        deserializeWorkbook(serializeWorkbook(session.workbook)).sheets.get(sheet.id)
          ?.conditionalFormats,
      ).toEqual(before);
      executeWorkbookCommand(session, createInsertSheetAxisCommand(sheet.id, "row", 0, 2));
      expect(sheet.conditionalFormats?.[0]?.ranges[0]?.start.row).toBe(4);
      expect(sheet.conditionalFormats?.[0]?.condition).toEqual(before[0]?.condition);
      expect(JSON.parse(JSON.stringify(session.history.undoStack[0]?.command))).toEqual(
        session.history.undoStack[0]?.command,
      );
      undoWorkbookCommand(session);
      expect(sheet.conditionalFormats).toEqual(before);
      redoWorkbookCommand(session);
      expect(sheet.conditionalFormats?.[0]?.ranges[0]?.start.row).toBe(4);
    },
  );

  test("copied scale thresholds and colors cannot mutate the source or saved history", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const source: SheetConditionalFormatRule = {
      id: "scale",
      anchor: { row: 0, column: 0 },
      ranges: [{ start: { row: 0, column: 0 }, end: { row: 2, column: 0 } }],
      condition: structuredClone(conditions[4]!),
      style: {},
    };
    executeWorkbookCommand(session, createSetSheetConditionalFormatsCommand(sheet.id, [source]));
    const copy = copyConditionalFormatRules(sheet.conditionalFormats ?? [], source.ranges[0]!, {
      start: { row: 0, column: 2 },
      end: { row: 2, column: 2 },
    })[0]!;
    if (copy.condition.kind !== "colorScale") throw new Error("Expected a copied scale");
    copy.condition.stops[0].color = "#000000";
    expect(sheet.conditionalFormats?.[0]?.condition).toEqual(source.condition);
    executeWorkbookCommand(session, createSetSheetConditionalFormatsCommand(sheet.id, [copy]));
    copy.condition.stops[0].color = "#FFFFFF";
    undoWorkbookCommand(session);
    expect(sheet.conditionalFormats?.[0]?.condition).toEqual(source.condition);
  });
});
