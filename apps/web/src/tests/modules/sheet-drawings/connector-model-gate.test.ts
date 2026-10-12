import { describe, expect, test } from "vitest";
import { createWorkbook, getActiveSheet, createSheetSparseState } from "@sheetcraft/core/workbook";
import { serializeSheet, serializeWorkbook } from "@sheetcraft/core/serialization";
import { createSetSheetDrawingsCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { groupShapeRoots } from "@sheetcraft/core/shape-group-planning";
import {
  assertShapeCommandSupport,
  assertWorkbookShapeSupport,
  UnsupportedShapeConnectorDocumentError,
} from "../../../modules/sheet-drawings/shape-document-support";
import { resolveShapeDrawing } from "../../../modules/sheet-drawings/resolved-shape-drawing";
import { resolveShapeGroupProjection } from "../../../modules/sheet-drawings/resolved-shape-group";
import {
  getPrintableShapeLeaves,
  ShapePrintError,
} from "../../../modules/page-layout/page-print-shapes";
import { framedShape } from "./framed-shape-fixture";

function fixture() {
  const workbook = createWorkbook({ id: "workbook", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  const target = { ...framedShape(), id: "target", shapeGeometry: { preset: "rect" as const } };
  const line = {
    ...framedShape(),
    id: "connection",
    shapeGeometry: { preset: "bentConnector3" as const },
    shapeConnector: {
      kind: "shape-connector-v1" as const,
      begin: { kind: "site" as const, targetId: "target", preset: "rect" as const, siteIndex: 3 },
      end: { kind: "free" as const, xRatio: 1, yRatio: 1 },
    },
  };
  sheet.drawings = [target, line];
  return { workbook, sheet, line, metrics: createPictureSheetMetrics(sheet) };
}
describe("connector model-only live gate", () => {
  test("document admission refuses unresolved connection consumers without mutating original data", () => {
    const { workbook } = fixture();
    const before = serializeWorkbook(workbook);
    expect(before.version).toBe(63);
    expect(() => assertWorkbookShapeSupport(workbook)).toThrow(
      UnsupportedShapeConnectorDocumentError,
    );
    expect(serializeWorkbook(workbook)).toEqual(before);
  });
  test("all content-bearing command ingress preserves the explicit unsupported boundary", () => {
    const { workbook, sheet } = fixture();
    const before = serializeWorkbook(workbook),
      state = createSheetSparseState(sheet);
    const commands: WorkbookCommand[] = [
      createSetSheetDrawingsCommand(sheet.id, sheet.drawings!),
      { type: "addSheet", sheet: serializeSheet(sheet), index: 0, activeSheetId: sheet.id },
      { type: "restoreSheetState", sheetId: sheet.id, state },
      { type: "restoreTableTransaction", states: [{ sheetId: sheet.id, state }], tableStyles: [] },
    ];
    for (const command of commands)
      expect(() => assertShapeCommandSupport(command)).toThrow(
        UnsupportedShapeConnectorDocumentError,
      );
    expect(serializeWorkbook(workbook)).toEqual(before);
  });
  test("leaf projection and internal print cannot use the stale carrier rectangle as a route", () => {
    const { sheet, line, metrics } = fixture();
    expect(() => resolveShapeDrawing(line, metrics)).toThrow(/connector rendering/i);
    expect(() => [...getPrintableShapeLeaves(sheet, metrics)]).toThrow(ShapePrintError);
  });
  test("owned connector leaves are also blocked, while ordinary static geometry still works", () => {
    const { workbook, sheet, metrics } = fixture();
    sheet.drawings = groupShapeRoots(
      sheet.drawings!,
      ["target", "connection"],
      { id: "group", name: "Group" },
      metrics,
    );
    const root = sheet.drawings[0]!;
    if (root.kind !== "shapeGroup") throw Error("Expected owned root");
    expect(() => assertWorkbookShapeSupport(workbook)).toThrow(
      UnsupportedShapeConnectorDocumentError,
    );
    expect(() => resolveShapeGroupProjection(root, metrics)).toThrow(/connector rendering/i);
    const connector = root.members[1]!;
    if (connector.kind !== "shape") throw Error("Expected connector leaf");
    delete connector.shapeConnector;
    expect(() => assertWorkbookShapeSupport(workbook)).not.toThrow();
    expect(resolveShapeGroupProjection(root, metrics).leaves).toHaveLength(2);
  });
});
