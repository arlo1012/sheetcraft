import { describe, expect, expectTypeOf, test } from "vitest";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
  type WorkbookSnapshot,
  type WorkbookSnapshotV91,
} from "../../serialization.js";
import { normalizeSheetDrawings, type SheetChartDrawing } from "../../sheet-drawings.js";
import { createWorkbook, getActiveSheet } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { group, nested } from "../shape-groups/fixtures.js";
import { formatDrawing } from "./chart-format-fixture.js";

const axes = ["categoryAxis", "valueAxis", "secondaryValueAxis"] as const;
const titleText = {
  bold: true,
  scriptFonts: { latin: { kind: "theme", role: "minor", slot: "latin" } },
} as const;
function raw(format: unknown, version = 91) {
  const saved = serializeWorkbook(createWorkbook({ id: "book", sheetId: "owner" }));
  const drawing = formatDrawing();
  const result = {
    ...saved,
    version,
    sheets: [
      { ...saved.sheets[0]!, drawings: [{ ...drawing, chart: { ...drawing.chart, format } }] },
    ],
  };
  if (version < 3) delete (result as { dateSystem?: unknown }).dateSystem;
  return result;
}

describe("independent axis title snapshot91 and lifecycle", () => {
  test.each(axes)(
    "roundtrips %s empty, explicit and dormant state in workbook and sheet",
    (axis) => {
      expectTypeOf<WorkbookSnapshotV91>().toExtend<WorkbookSnapshot>();
      for (const settings of [
        { titleText: {} },
        { titleRotation: 0 },
        {
          title: "Sales",
          titleVisible: false,
          titleText,
          titleRotation: -90,
          text: { bold: false },
        },
      ]) {
        const workbook = deserializeWorkbook(raw({ [axis]: settings }));
        const saved = serializeWorkbook(workbook);
        expect(saved.version).toBe(91);
        expect(serializeWorkbook(deserializeWorkbook(saved))).toEqual(saved);
        expect(
          (getActiveSheet(workbook).drawings![0]! as SheetChartDrawing).chart.format![axis],
        ).toEqual(settings);
        const sheet = serializeSheet(getActiveSheet(workbook));
        expect(serializeSheet(deserializeSheet(sheet))).toEqual(sheet);
      }
    },
  );

  test("raw presence gates every older envelope before normalization or getter evaluation", () => {
    let reads = 0;
    const getter = {
      enumerable: true,
      get() {
        reads++;
        throw Error("read");
      },
    };
    for (const axis of axes)
      for (const key of ["titleText", "titleRotation"]) {
        for (const settings of [
          { [key]: {} },
          { [key]: undefined },
          { [key]: null },
          Object.defineProperty({}, key, getter),
          Object.create({ [key]: {} }),
        ]) {
          for (let version = 1; version < 91; version++)
            expect(() => deserializeWorkbook(raw({ [axis]: settings }, version))).toThrow(
              /version 91/,
            );
        }
        for (const settings of [
          { [key]: undefined },
          { [key]: null },
          Object.defineProperty({}, key, getter),
          Object.create({ [key]: {} }),
        ])
          expect(() => deserializeWorkbook(raw({ [axis]: settings }))).toThrow();
      }
    expect(reads).toBe(0);
  });

  test("nested raw presence gates without admitting group-owned charts", () => {
    const snapshot = raw({ categoryAxis: { titleText } }, 90);
    const drawing = snapshot.sheets[0]!.drawings[0]!;
    const outer = { ...group(), members: [{ ...nested(), members: [drawing] }] };
    const sheets = [{ ...snapshot.sheets[0]!, drawings: [outer] }];
    expect(() => deserializeWorkbook({ ...snapshot, sheets })).toThrow(/version 91/);
    expect(() => deserializeWorkbook({ ...snapshot, sheets, version: 91 })).toThrow();
  });

  test("old shared typography does not gain independent fields or upgrade its envelope", () => {
    for (const format of [
      { categoryAxis: { title: "Sales", text: { bold: false } } },
      { valueAxis: { title: "Sales", text: titleText } },
    ]) {
      const saved = serializeWorkbook(deserializeWorkbook(raw(format)));
      expect(saved.version).toBeLessThan(91);
      expect(serializeWorkbook(deserializeWorkbook(saved))).toEqual(saved);
      expect(
        (getActiveSheet(deserializeWorkbook(saved)).drawings![0]! as SheetChartDrawing).chart
          .format,
      ).toEqual(format);
    }
  });

  test.each(axes)(
    "%s command clone, hide, copy, reset and Undo/Redo preserve independent state",
    (axis) => {
      const session = createTestWorkbookSession();
      const sheet = getActiveSheet(session.workbook);
      sheet.drawings = [formatDrawing()];
      const before = serializeWorkbook(session.workbook);
      const settings = {
        title: "Sales",
        titleVisible: false,
        titleText: structuredClone(titleText),
        titleRotation: -90,
      };
      const input = formatDrawing({ [axis]: settings });
      const command = createSetSheetDrawingsCommand(sheet.id, [input]);
      input.chart.format![axis]!.titleText!.scriptFonts!.latin = { kind: "automatic" };
      expect(executeWorkbookCommand(session, command)).toBe(true);
      expect(session.history.undoStack).toHaveLength(1);
      const after = serializeWorkbook(session.workbook);
      expect(after.version).toBe(91);
      expect((sheet.drawings![0]! as SheetChartDrawing).chart.format![axis]!.titleText).toEqual(
        titleText,
      );
      expect(undoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(before);
      expect(redoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(after);
      const copied = normalizeSheetDrawings(sheet.drawings);
      (copied[0]! as SheetChartDrawing).chart.format![axis]!.titleText!.scriptFonts!.latin = {
        kind: "automatic",
      };
      expect(serializeWorkbook(session.workbook)).toEqual(after);
      (copied[0]! as SheetChartDrawing).chart.format![axis]!.titleText = {};
      expect(executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, copied))).toBe(
        true,
      );
      expect((sheet.drawings![0]! as SheetChartDrawing).chart.format![axis]!.titleText).toEqual({});
      expect(serializeWorkbook(session.workbook).version).toBe(91);
      expect(undoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(after);
    },
  );
});
