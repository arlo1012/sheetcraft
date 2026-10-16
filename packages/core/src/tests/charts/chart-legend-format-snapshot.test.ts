import { describe, expect, expectTypeOf, test } from "vitest";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
  type WorkbookSnapshot,
  type WorkbookSnapshotV88,
} from "../../serialization.js";
import { createWorkbook, getActiveSheet } from "../../workbook.js";
import { formatDrawing } from "./chart-format-fixture.js";
import type { SheetChartDrawing } from "../../sheet-drawings.js";

function raw(drawing: unknown, version = 88) {
  const snapshot = serializeWorkbook(createWorkbook({ id: "workbook", sheetId: "owner" }));
  const result = {
    ...snapshot,
    version,
    sheets: [{ ...snapshot.sheets[0]!, drawings: [drawing] }],
  };
  if (version < 3) delete (result as { dateSystem?: unknown }).dateSystem;
  return result;
}

describe("independent legend format snapshot88", () => {
  test.each([
    {},
    { text: {} },
    { surface: {} },
    {
      text: { fontSize: 18, bold: false },
      surface: { fill: "transparent", stroke: "#123456", strokeWidth: 2 },
    },
  ])("roundtrips sparse legend %j", (legend) => {
    expectTypeOf<WorkbookSnapshotV88>().toExtend<WorkbookSnapshot>();
    const drawing = formatDrawing({ legend });
    const workbook = deserializeWorkbook(raw(drawing));
    const saved = serializeWorkbook(workbook);
    expect(saved.version).toBe(88);
    expect(saved.sheets[0]!.drawings).toEqual([drawing]);
    expect(serializeWorkbook(deserializeWorkbook(saved))).toEqual(saved);
    const standalone = serializeSheet(getActiveSheet(workbook));
    expect(serializeSheet(deserializeSheet(standalone))).toEqual(standalone);
    expect((saved.sheets[0]!.drawings![0]! as SheetChartDrawing).chart.format!.legend).not.toBe(
      legend,
    );
  });

  test("every old envelope gates legend presence before consuming malformed data or getters", () => {
    let reads = 0;
    const getter = {
      enumerable: true,
      get() {
        reads++;
        throw Error("Unexpected read");
      },
    };
    const drawing = formatDrawing();
    const formats = [
      { legend: {} },
      { legend: undefined },
      { legend: null },
      { legend: { text: { fontSize: -1 } } },
      Object.defineProperty({}, "legend", getter),
      Object.create({ legend: {} }),
    ];
    for (let version = 1; version < 88; version++)
      for (const format of formats)
        expect(() =>
          deserializeWorkbook(raw({ ...drawing, chart: { ...drawing.chart, format } }, version)),
        ).toThrow(/version 88/);
    for (const format of formats.slice(1))
      expect(() =>
        deserializeWorkbook(raw({ ...drawing, chart: { ...drawing.chart, format } })),
      ).toThrow();
    expect(() =>
      deserializeWorkbook(
        raw(Object.defineProperty(formatDrawing({ legend: {} }), "kind", getter), 87),
      ),
    ).toThrow(/version 88/);
    expect(() =>
      deserializeWorkbook(raw({ ...formatDrawing({ legend: {} }), kind: "shape" })),
    ).toThrow();
    expect(reads).toBe(0);
  });

  test("absence keeps old payloads and clearing downgrades to remaining independent features", () => {
    const workbook = deserializeWorkbook(raw(formatDrawing({ title: { bold: true } })));
    const sheet = getActiveSheet(workbook);
    expect(serializeWorkbook(workbook).version).toBe(80);
    sheet.defaultRowHeight = 30;
    const drawing = sheet.drawings![0]! as SheetChartDrawing;
    expect(serializeWorkbook(workbook).version).toBe(87);
    drawing.chart.format!.legend = {};
    expect(serializeWorkbook(workbook).version).toBe(88);
    delete drawing.chart.format!.legend;
    expect(serializeWorkbook(workbook).version).toBe(87);
    delete sheet.defaultRowHeight;
    expect(serializeWorkbook(workbook).version).toBe(80);
    delete drawing.chart.format;
    expect(serializeWorkbook(workbook).version).toBe(43);
  });
});
