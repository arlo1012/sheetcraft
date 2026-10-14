import { describe, expect, expectTypeOf, test } from "vitest";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
  type WorkbookSnapshot,
  type WorkbookSnapshotV80,
} from "../../serialization.js";
import type { ChartFormatSettings } from "../../chart-format.js";
import type { SheetChart } from "../../sheet-charts.js";
import type { SheetChartDrawing } from "../../sheet-drawings.js";
import {
  createSheet,
  createWorkbook,
  createSheetSparseState,
  getActiveSheet,
  getSheetMetadata,
  insertSheet,
} from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { chartFormat, formatDrawing } from "./chart-format-fixture.js";
import { elementDrawing } from "./chart-elements-fixture.js";
import { sourceDrawing } from "./chart-source-fixture.js";

function raw(drawing: unknown, version = 80) {
  const snapshot = serializeWorkbook(createWorkbook({ id: "workbook", sheetId: "owner" }));
  const result = {
    ...snapshot,
    version,
    sheets: [{ ...snapshot.sheets[0]!, drawings: [drawing] }],
  };
  if (version < 3) delete (result as { dateSystem?: unknown }).dateSystem;
  return result;
}

describe("conditional chart-format snapshot80 and isolated history", () => {
  test.each<ChartFormatSettings>([
    {},
    chartFormat(),
    { plot: { fill: "transparent" } },
    { series: [] },
  ])("roundtrips workbook and standalone sheet sparse settings %j", (format) => {
    expectTypeOf<WorkbookSnapshotV80>().toExtend<WorkbookSnapshot>();
    const input = formatDrawing(format),
      workbook = deserializeWorkbook(raw(input));
    const saved = serializeWorkbook(workbook);
    expect(saved.version).toBe(80);
    expect(saved.sheets[0]!.drawings).toEqual([input]);
    expect(serializeWorkbook(deserializeWorkbook(saved))).toEqual(saved);
    const standalone = serializeSheet(getActiveSheet(workbook));
    expect(serializeSheet(deserializeSheet(standalone))).toEqual(standalone);
    expect((saved.sheets[0]!.drawings![0]! as SheetChartDrawing).chart.format).not.toBe(format);
    expect((standalone.drawings![0]! as SheetChartDrawing).chart.format).not.toBe(format);
  });

  test("absent format keeps old envelopes and importing80 does not upgrade unformatted data", () => {
    const workbook = createWorkbook({ id: "workbook", sheetId: "owner" }),
      sheet = getActiveSheet(workbook);
    const empty = serializeWorkbook(workbook);
    sheet.drawings = [formatDrawing()];
    const old = serializeWorkbook(workbook),
      before = JSON.stringify(old);
    expect(old.version).toBe(43);
    for (const version of [26, 43, 78, 79, 80])
      expect(
        JSON.stringify(serializeWorkbook(deserializeWorkbook(raw(formatDrawing(), version)))),
      ).toBe(before);
    sheet.drawings = [elementDrawing({})];
    expect(serializeWorkbook(workbook).version).toBe(78);
    sheet.drawings = [sourceDrawing()];
    expect(serializeWorkbook(workbook).version).toBe(79);
    (sheet.drawings[0]! as SheetChartDrawing).chart.format = {};
    expect(serializeWorkbook(workbook).version).toBe(80);
    delete (sheet.drawings[0]! as SheetChartDrawing).chart.format;
    expect(serializeWorkbook(workbook).version).toBe(79);
    sheet.drawings = [formatDrawing()];
    expect(JSON.stringify(serializeWorkbook(workbook))).toBe(before);
    sheet.drawings = [];
    expect(serializeWorkbook(workbook)).toEqual(empty);
  });

  test("every V1–79 rejects field presence before format/source/kind accessors or malformed values", () => {
    let reads = 0;
    const getter = {
      enumerable: true,
      get() {
        reads++;
        throw Error("Unexpected getter read");
      },
    };
    const drawing = formatDrawing(),
      inheritedChart = Object.assign(
        Object.create(Object.defineProperty({}, "format", getter)),
        drawing.chart,
      );
    const inputs = [
      formatDrawing({}),
      formatDrawing(chartFormat()),
      { ...drawing, chart: { ...drawing.chart, format: undefined } },
      { ...drawing, chart: { ...drawing.chart, format: null } },
      { ...drawing, chart: { ...drawing.chart, format: { valueAxis: { min: 4, max: 1 } } } },
      { ...drawing, chart: Object.defineProperty({ ...drawing.chart }, "format", getter) },
      { ...drawing, chart: inheritedChart },
      {
        ...drawing,
        chart: { ...drawing.chart, format: Object.defineProperty({}, "title", getter) },
      },
      Object.defineProperty(formatDrawing({}), "kind", getter),
      {
        ...sourceDrawing(),
        chart: Object.defineProperty({ ...sourceDrawing().chart, format: {} }, "source", getter),
      },
    ];
    for (let version = 1; version <= 79; version++)
      for (const input of inputs)
        expect(() => deserializeWorkbook(raw(input, version))).toThrow(/version 80/);
    expect(reads).toBe(0);
    for (const input of inputs.slice(2)) expect(() => deserializeWorkbook(raw(input))).toThrow();
    expect(reads).toBe(0);
  });

  test("V80 requires own chart kind and payload, validates nested descriptors without reads", () => {
    let reads = 0;
    const getter = {
      enumerable: true,
      get() {
        reads++;
        throw Error("Unexpected getter read");
      },
    };
    const drawing = formatDrawing(chartFormat()),
      { chart: _chart, ...withoutChart } = drawing;
    for (const input of [
      { ...drawing, kind: "shape" },
      Object.defineProperty({ ...withoutChart }, "chart", getter),
      Object.assign(Object.create(Object.defineProperty({}, "chart", getter)), withoutChart),
      {
        ...drawing,
        chart: {
          ...drawing.chart,
          format: {
            valueAxis: {
              numberFormat: Object.defineProperty({ kind: "number" }, "fractionDigits", getter),
            },
          },
        },
      },
      {
        ...drawing,
        chart: { ...drawing.chart, format: { categoryAxis: { line: { fill: "#112233" } } } },
      },
      { ...drawing, chart: { ...drawing.chart, format: Object.create({ title: {} }) } },
    ])
      expect(() => deserializeWorkbook(raw(input))).toThrow();
    expect(reads).toBe(0);
  });

  test("format80 wins after mixed chart sources/elements in different sheets and standalone inference", () => {
    const workbook = createWorkbook({ id: "workbook", sheetId: "owner" }),
      first = getActiveSheet(workbook),
      second = createSheet("Second", "second");
    insertSheet(workbook, second);
    first.drawings = [sourceDrawing()];
    second.drawings = [formatDrawing(chartFormat())];
    const saved = serializeWorkbook(workbook);
    expect(saved.version).toBe(80);
    expect(serializeWorkbook(deserializeWorkbook(saved))).toEqual(saved);
    const standalone = serializeSheet(second);
    expect(serializeSheet(deserializeSheet(standalone))).toEqual(standalone);
    second.drawings = [elementDrawing({})];
    expect(serializeWorkbook(workbook).version).toBe(79);
  });

  test("one accepted format change is one undo; reset restores absence; equivalent key orders are no-op", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, [formatDrawing()]));
    const before = serializeWorkbook(session.workbook);
    session.history.undoStack = [];
    const input = formatDrawing(chartFormat()),
      expected = structuredClone(input);
    const command = createSetSheetDrawingsCommand(sheet.id, [input]);
    input.chart.format!.valueAxis!.min = 40;
    input.chart.format!.series![0]!.color = "#abcdef";
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(session.history.undoStack).toHaveLength(1);
    expect(sheet.drawings).toEqual([expected]);
    const after = serializeWorkbook(session.workbook);
    for (const drawings of [
      command.drawings,
      createSheetSparseState(sheet).drawings!,
      getSheetMetadata(sheet).drawings!,
      after.sheets[0]!.drawings!,
    ]) {
      const format = (drawings[0]! as SheetChartDrawing).chart.format!;
      format.valueAxis!.min = 60;
      format.series![0]!.axis = "primary";
      const numberFormat = format.valueAxis?.numberFormat;
      if (numberFormat?.kind === "number") numberFormat.fractionDigits = 2;
      expect(sheet.drawings).toEqual([expected]);
    }
    const stable = serializeWorkbook(session.workbook);
    const reordered = structuredClone(expected);
    reordered.chart.format!.bar = { overlap: 50, gapWidth: 50 };
    expect(
      executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, [reordered])),
    ).toBe(false);
    expect(session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(stable);
    expect(
      executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, [formatDrawing()])),
    ).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(stable);
  });

  test("invalid format batches and forged commands reject atomically without state or history changes", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, [formatDrawing()]));
    const before = serializeWorkbook(session.workbook),
      history = structuredClone(session.history);
    const invalid = formatDrawing(chartFormat());
    invalid.chart = { ...invalid.chart, format: { valueAxis: { min: 2, max: 1 } } } as SheetChart;
    expect(() =>
      createSetSheetDrawingsCommand(sheet.id, [
        formatDrawing(chartFormat()),
        { ...invalid, id: "bad" },
      ]),
    ).toThrow();
    const forged = createSetSheetDrawingsCommand(sheet.id, [formatDrawing(chartFormat())]);
    (forged.drawings[0]! as SheetChartDrawing).chart = invalid.chart;
    expect(() => executeWorkbookCommand(session, forged)).toThrow();
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(session.history).toEqual(history);
  });
});
