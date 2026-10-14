import { describe, expect, expectTypeOf, test } from "vitest";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
  type WorkbookSnapshot,
  type WorkbookSnapshotV79,
} from "../../serialization.js";
import { createWorkbook, getActiveSheet } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { elementDrawing } from "./chart-elements-fixture.js";
import { sourceDrawing } from "./chart-source-fixture.js";
import type { SheetChartDrawing } from "../../sheet-drawings.js";

function raw(value: unknown, version: number) {
  const snapshot = serializeWorkbook(createWorkbook({ id: "workbook", sheetId: "source" }));
  return { ...snapshot, version, sheets: [{ ...snapshot.sheets[0]!, drawings: [value] }] };
}
describe("conditional chart source snapshot79 and isolated history", () => {
  test("writes79 only for actual sources, roundtrips source/tombstone/zero-series and keeps legacy write envelopes", () => {
    expectTypeOf<WorkbookSnapshotV79>().toExtend<WorkbookSnapshot>();
    for (const input of [
      sourceDrawing(),
      {
        ...sourceDrawing(),
        chart: {
          ...sourceDrawing().chart,
          source: {
            kind: "series" as const,
            categories: { kind: "generated" as const },
            series: [],
          },
        },
      },
    ]) {
      const workbook = deserializeWorkbook(raw(input, 79)),
        saved = serializeWorkbook(workbook);
      expect(saved.version).toBe(79);
      expect(serializeWorkbook(deserializeWorkbook(saved))).toEqual(saved);
      const standalone = serializeSheet(getActiveSheet(workbook));
      expect(serializeSheet(deserializeSheet(standalone))).toEqual(standalone);
      expect((saved.sheets[0]!.drawings![0]! as SheetChartDrawing).chart.source).not.toBe(
        input.chart.source,
      );
    }
    const workbook = createWorkbook({ id: "workbook", sheetId: "source" }),
      sheet = getActiveSheet(workbook);
    sheet.drawings = [elementDrawing()];
    expect(serializeWorkbook(workbook).version).toBe(43);
    sheet.drawings = [elementDrawing({})];
    expect(serializeWorkbook(workbook).version).toBe(78);
    sheet.drawings = [sourceDrawing()];
    expect(serializeWorkbook(workbook).version).toBe(79);
    const source = (sheet.drawings[0]! as SheetChartDrawing).chart.source!;
    source.series[0]!.name = { kind: "cell", sheetId: "deleted", cell: null };
    source.series[0]!.values = { kind: "range", sheetId: "deleted", range: null };
    const saved = serializeWorkbook(workbook);
    expect(serializeWorkbook(deserializeWorkbook(saved))).toEqual(saved);
  });
  test.each([43, 73, 74, 75, 76, 77, 78])(
    "rejects source presence in earlier envelope%s before malformed/accessor/inherited fields",
    (version) => {
      for (const value of [undefined, null, {}, sourceDrawing().chart.source]) {
        expect(() =>
          deserializeWorkbook(
            raw(
              { ...sourceDrawing(), chart: { ...sourceDrawing().chart, source: value } },
              version,
            ),
          ),
        ).toThrow(/version 79/);
      }
      let calls = 0;
      const chart = Object.defineProperty({ ...sourceDrawing().chart }, "source", {
        get: () => {
          calls++;
          return sourceDrawing().chart.source;
        },
      });
      expect(() => deserializeWorkbook(raw({ ...sourceDrawing(), chart }, version))).toThrow(
        /version 79/,
      );
      const inherited = Object.assign(
        Object.create({ source: sourceDrawing().chart.source }) as object,
        { ...elementDrawing().chart, range: null },
      );
      expect(() =>
        deserializeWorkbook(raw({ ...sourceDrawing(), chart: inherited }, version)),
      ).toThrow(/version 79/);
      expect(calls).toBe(0);
    },
  );
  test("clones drafts and Undo/Redo source data without nested caller aliases", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook),
      input = sourceDrawing(sheet.id);
    const command = createSetSheetDrawingsCommand(sheet.id, [input]);
    input.chart.source!.series[0]!.name = { kind: "literal", text: "caller" };
    expect(executeWorkbookCommand(session, command)).toBe(true);
    const after = serializeWorkbook(session.workbook);
    const current = (sheet.drawings![0]! as SheetChartDrawing).chart.source!;
    expect(current.series[0]!.name.kind).toBe("cell");
    if (command.drawings[0]!.kind !== "chart") throw Error("Expected chart");
    command.drawings[0]!.chart.source!.series[0]!.name = {
      kind: "literal",
      text: "changed command",
    };
    expect(serializeWorkbook(session.workbook)).toEqual(after);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(sheet.drawings).toEqual([]);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
  });
});
