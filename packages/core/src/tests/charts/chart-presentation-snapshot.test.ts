import { describe, expect, expectTypeOf, test } from "vitest";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
  type WorkbookSnapshot,
  type WorkbookSnapshotV81,
} from "../../serialization.js";
import type { ChartPresentationSettings } from "../../chart-presentation.js";
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
import { chartPresentation, presentationDrawing } from "./chart-presentation-fixture.js";
import { chartFormat, formatDrawing } from "./chart-format-fixture.js";
import { elementDrawing } from "./chart-elements-fixture.js";
import { sourceDrawing } from "./chart-source-fixture.js";

function raw(drawing: unknown, version = 81) {
  const snapshot = serializeWorkbook(createWorkbook({ id: "workbook", sheetId: "owner" }));
  const result = {
    ...snapshot,
    version,
    sheets: [{ ...snapshot.sheets[0]!, drawings: [drawing] }],
  };
  if (version < 3) delete (result as { dateSystem?: unknown }).dateSystem;
  return result;
}

describe("conditional chart presentation snapshot81 and isolated history", () => {
  test.each<ChartPresentationSettings>([
    {},
    chartPresentation(),
    { lineMarkers: true },
    { palette: ["#fff"] },
    { background: "#123456" },
  ])("roundtrips workbook and standalone sheet settings %j", (presentation) => {
    expectTypeOf<WorkbookSnapshotV81>().toExtend<WorkbookSnapshot>();
    const input = presentationDrawing(presentation),
      workbook = deserializeWorkbook(raw(input));
    const saved = serializeWorkbook(workbook);
    expect(saved.version).toBe(81);
    expect(saved.sheets[0]!.drawings).toEqual([input]);
    expect(serializeWorkbook(deserializeWorkbook(saved))).toEqual(saved);
    const standalone = serializeSheet(getActiveSheet(workbook));
    expect(serializeSheet(deserializeSheet(standalone))).toEqual(standalone);
    const retained = (saved.sheets[0]!.drawings![0]! as SheetChartDrawing).chart.presentation!;
    expect(retained).not.toBe(presentation);
    if (presentation.palette) expect(retained.palette).not.toBe(presentation.palette);
  });

  test("absence preserves older write envelopes and reading81 does not add presentation", () => {
    const workbook = createWorkbook({ id: "workbook", sheetId: "owner" }),
      sheet = getActiveSheet(workbook);
    sheet.drawings = [presentationDrawing()];
    const before = serializeWorkbook(workbook);
    expect(before.version).toBe(43);
    for (const version of [26, 43, 78, 79, 80, 81])
      expect(serializeWorkbook(deserializeWorkbook(raw(presentationDrawing(), version)))).toEqual(
        before,
      );
    for (const [drawing, version] of [
      [elementDrawing({}), 78],
      [sourceDrawing(), 79],
      [formatDrawing(chartFormat()), 80],
    ] as const) {
      sheet.drawings = [drawing];
      const legacy = serializeWorkbook(workbook);
      expect(legacy.version).toBe(version);
      drawing.chart.presentation = { palette: ["#123456"], background: "#fff" };
      expect(serializeWorkbook(workbook).version).toBe(81);
      delete drawing.chart.presentation;
      expect(serializeWorkbook(workbook)).toEqual(legacy);
    }
  });

  test("every V1–80 rejects presence before malformed choices and sibling/kind getters", () => {
    let reads = 0;
    const getter = {
      enumerable: true,
      get() {
        reads++;
        throw Error("Unexpected getter read");
      },
    };
    const drawing = presentationDrawing(),
      inheritedChart = Object.assign(
        Object.create(Object.defineProperty({}, "presentation", getter)),
        drawing.chart,
      );
    const inputs = [
      presentationDrawing({}),
      presentationDrawing(chartPresentation()),
      { ...drawing, chart: { ...drawing.chart, presentation: undefined } },
      { ...drawing, chart: { ...drawing.chart, presentation: null } },
      { ...drawing, chart: { ...drawing.chart, presentation: { percentStacked: false } } },
      { ...drawing, chart: Object.defineProperty({ ...drawing.chart }, "presentation", getter) },
      { ...drawing, chart: inheritedChart },
      {
        ...drawing,
        chart: { ...drawing.chart, presentation: Object.defineProperty({}, "palette", getter) },
      },
      Object.defineProperty(presentationDrawing({}), "kind", getter),
      {
        ...drawing,
        chart: Object.defineProperty({ ...drawing.chart, presentation: {} }, "format", getter),
      },
      {
        ...drawing,
        chart: Object.defineProperty({ ...drawing.chart, presentation: {} }, "source", getter),
      },
      {
        ...drawing,
        chart: Object.defineProperty({ ...drawing.chart, presentation: {} }, "type", getter),
      },
    ];
    for (let version = 1; version <= 80; version++)
      for (const input of inputs)
        expect(() => deserializeWorkbook(raw(input, version))).toThrow(/version 81/);
    expect(reads).toBe(0);
    for (const input of inputs.slice(2, 11))
      expect(() => deserializeWorkbook(raw(input))).toThrow();
    expect(reads).toBe(0);
  });

  test("V81 rejects illegal ownership and malformed nested data without getter reads", () => {
    let reads = 0;
    const getter = {
      enumerable: true,
      get() {
        reads++;
        throw Error("Unexpected getter read");
      },
    };
    const drawing = presentationDrawing(chartPresentation()),
      { chart: _chart, ...withoutChart } = drawing;
    for (const input of [
      { ...drawing, kind: "shape" },
      Object.defineProperty(drawing, "kind", getter),
      Object.defineProperty({ ...withoutChart }, "chart", getter),
      Object.assign(Object.create(Object.defineProperty({}, "chart", getter)), withoutChart),
      {
        ...presentationDrawing(),
        chart: {
          ...presentationDrawing().chart,
          presentation: Object.create({ palette: ["#fff"] }),
        },
      },
      {
        ...presentationDrawing(),
        chart: {
          ...presentationDrawing().chart,
          presentation: { palette: Object.defineProperty(["#fff"], "0", getter) },
        },
      },
      {
        ...presentationDrawing(),
        chart: { ...presentationDrawing().chart, presentation: { unknown: true } },
      },
    ])
      expect(() => deserializeWorkbook(raw(input))).toThrow();
    expect(reads).toBe(0);
  });

  test("presentation81 wins last across mixed sheets and standalone inference", () => {
    const workbook = createWorkbook({ id: "workbook", sheetId: "owner" }),
      first = getActiveSheet(workbook);
    const second = createSheet("Second", "second");
    insertSheet(workbook, second);
    first.drawings = [presentationDrawing(chartPresentation())];
    second.drawings = [sourceDrawing(), { ...formatDrawing(chartFormat()), id: "formatted" }];
    const saved = serializeWorkbook(workbook);
    expect(saved.version).toBe(81);
    expect(serializeWorkbook(deserializeWorkbook(saved))).toEqual(saved);
    const standalone = serializeSheet(first);
    expect(serializeSheet(deserializeSheet(standalone))).toEqual(standalone);
    first.drawings = [];
    expect(serializeWorkbook(workbook).version).toBe(80);
  });

  test("one accepted change is one undo, reset restores absence and canonical reordering is a no-op", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    executeWorkbookCommand(
      session,
      createSetSheetDrawingsCommand(sheet.id, [presentationDrawing()]),
    );
    const before = serializeWorkbook(session.workbook);
    session.history.undoStack = [];
    const input = presentationDrawing(chartPresentation()),
      expected = structuredClone(input);
    const command = createSetSheetDrawingsCommand(sheet.id, [input]);
    input.chart.presentation!.palette![0] = "#fff";
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
      const settings = (drawings[0]! as SheetChartDrawing).chart.presentation!;
      settings.palette![0] = "#000";
      settings.lineMarkers = true;
      expect(sheet.drawings).toEqual([expected]);
    }
    const stable = serializeWorkbook(session.workbook),
      reordered = structuredClone(expected);
    reordered.chart.presentation = {
      background: "#FEFEFE",
      palette: ["#123456", "#ABC"],
      lineMarkers: false,
      percentStacked: true,
    };
    expect(
      executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, [reordered])),
    ).toBe(false);
    expect(session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(stable);
    expect(
      executeWorkbookCommand(
        session,
        createSetSheetDrawingsCommand(sheet.id, [presentationDrawing()]),
      ),
    ).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(stable);
  });

  test("malformed batches and forged command payloads reject atomically", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    executeWorkbookCommand(
      session,
      createSetSheetDrawingsCommand(sheet.id, [presentationDrawing()]),
    );
    const before = serializeWorkbook(session.workbook),
      history = structuredClone(session.history);
    const invalid = { ...presentationDrawing(chartPresentation()), id: "bad" };
    invalid.chart.stacked = false;
    expect(() =>
      createSetSheetDrawingsCommand(sheet.id, [presentationDrawing(chartPresentation()), invalid]),
    ).toThrow();
    const forged = createSetSheetDrawingsCommand(sheet.id, [
      presentationDrawing(chartPresentation()),
    ]);
    (forged.drawings[0]! as SheetChartDrawing).chart = invalid.chart;
    expect(() => executeWorkbookCommand(session, forged)).toThrow();
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(session.history).toEqual(history);
  });
});
