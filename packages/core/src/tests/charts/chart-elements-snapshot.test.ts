import { describe, expect, expectTypeOf, test } from "vitest";
import {
  createReplaceSheetDrawingCollectionsCommand,
  createSetSheetDrawingsCommand,
} from "../../commands/drawings.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
  type WorkbookSnapshot,
  type WorkbookSnapshotV78,
} from "../../serialization.js";
import type { ChartElementSettings, SheetChart } from "../../sheet-charts.js";
import type { SheetChartDrawing } from "../../sheet-drawings.js";
import {
  createSheet,
  createSheetSparseState,
  createWorkbook,
  getActiveSheet,
  getSheetMetadata,
  insertSheet,
} from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { equationDrawing } from "../equations/fixtures.js";
import { framedEquationDrawing } from "../equations/root-frame-fixtures.js";
import { elementChart, elementDrawing } from "./chart-elements-fixture.js";

function raw(drawing: unknown, version = 78) {
  const snapshot = serializeWorkbook(createWorkbook({ id: "workbook", sheetId: "owner" }));
  const result = {
    ...snapshot,
    version,
    sheets: [{ ...snapshot.sheets[0]!, drawings: [drawing] }],
  };
  if (version < 3) delete (result as { dateSystem?: unknown }).dateSystem;
  return result;
}

const choices: ChartElementSettings = {
  titlePosition: "overlay",
  legendPosition: "topRight",
  legendOverlay: false,
  labelPosition: "outsideEnd",
};

describe("conditional chart-elements snapshot78 and history", () => {
  test.each<ChartElementSettings>([
    {},
    choices,
    { titlePosition: "none" },
    { legendOverlay: true },
  ])(
    "roundtrips complete workbook and standalone sheets for owned sparse settings %j",
    (elements) => {
      expectTypeOf<WorkbookSnapshotV78>().toExtend<WorkbookSnapshot>();
      const input = elementDrawing(elements),
        workbook = deserializeWorkbook(raw(input)),
        saved = serializeWorkbook(workbook);
      expect(saved.version).toBe(78);
      expect(saved.sheets[0]!.drawings).toEqual([input]);
      expect(serializeWorkbook(deserializeWorkbook(saved))).toEqual(saved);
      const sheet = getActiveSheet(workbook),
        standalone = serializeSheet(sheet);
      expect(serializeSheet(deserializeSheet(standalone))).toEqual(standalone);
      const restored = standalone.drawings![0]! as SheetChartDrawing;
      expect(restored.chart.elements).not.toBe(elements);
      const isolated = saved.sheets[0]!.drawings![0]! as SheetChartDrawing;
      isolated.chart.elements!.legendPosition = "left";
      expect((sheet.drawings![0]! as SheetChartDrawing).chart.elements).toEqual(elements);
    },
  );

  test("absent settings preserve old write envelopes and exact JSON snapshots", () => {
    const workbook = createWorkbook({ id: "workbook", sheetId: "owner" }),
      sheet = getActiveSheet(workbook);
    const empty = serializeWorkbook(workbook);
    expect(empty.version).toBe(43);
    sheet.drawings = [elementDrawing()];
    const old = serializeWorkbook(workbook),
      before = JSON.stringify(old);
    expect(old.version).toBe(43);
    expect(JSON.stringify(serializeWorkbook(deserializeWorkbook(old)))).toBe(before);
    expect(serializeWorkbook(deserializeWorkbook(raw(elementDrawing(), 26)))).toEqual(old);
    expect(serializeWorkbook(deserializeWorkbook(raw(elementDrawing(), 78)))).toEqual(old);
    sheet.drawings = [elementDrawing(choices)];
    expect(serializeWorkbook(workbook).version).toBe(78);
    sheet.drawings = [elementDrawing()];
    expect(JSON.stringify(serializeWorkbook(workbook))).toBe(before);
    sheet.drawings = [];
    expect(serializeWorkbook(workbook)).toEqual(empty);
  });

  test("every V1–77 rejects raw presence before malformed, inherited or accessor choices are read", () => {
    let reads = 0;
    const getter = {
      enumerable: true,
      get() {
        reads++;
        throw Error("Unexpected getter read");
      },
    };
    const inherited = Object.assign(
      Object.create(Object.defineProperty({}, "elements", getter)),
      elementChart(),
    );
    const drawing = elementDrawing(choices),
      { kind: _kind, ...withoutKind } = drawing;
    const inputs = [
      drawing,
      elementDrawing({}),
      { ...drawing, chart: { ...elementChart(), elements: undefined } },
      { ...drawing, chart: { ...elementChart(), elements: { titlePosition: "bad" } } },
      { ...drawing, chart: Object.defineProperty(elementChart(), "elements", getter) },
      { ...drawing, chart: inherited },
      {
        ...drawing,
        chart: { ...elementChart(), elements: Object.defineProperty({}, "titlePosition", getter) },
      },
      Object.assign(Object.create({ kind: "chart" }), withoutKind),
      Object.defineProperty({ ...drawing }, "kind", getter),
    ];
    for (let version = 1; version <= 77; version++)
      for (const input of inputs)
        expect(() => deserializeWorkbook(raw(input, version))).toThrow(/version 78/);
    expect(reads).toBe(0);
    for (const input of inputs.slice(2)) expect(() => deserializeWorkbook(raw(input))).toThrow();
    expect(reads).toBe(0);
  });

  test("V78 rejects unknown choices, inherited settings and chart payload accessors without reads", () => {
    let reads = 0;
    const getter = {
      enumerable: true,
      get() {
        reads++;
        throw Error("Unexpected getter read");
      },
    };
    for (const elements of [
      null,
      [],
      { legendOverlay: "false" },
      { legendPosition: "corner" },
      { labelPosition: "middle" },
      { titlePosition: "above", unknown: true },
      Object.create({ legendOverlay: false }),
      Object.defineProperty({}, "unknown", getter),
    ])
      expect(() =>
        deserializeWorkbook(raw({ ...elementDrawing(), chart: { ...elementChart(), elements } })),
      ).toThrow();
    const { chart: _chart, ...withoutChart } = elementDrawing();
    const inheritedChart = Object.assign(
      Object.create(Object.defineProperty({}, "chart", getter)),
      withoutChart,
    );
    for (const drawing of [
      Object.defineProperty(elementDrawing(), "chart", getter),
      inheritedChart,
      { ...elementDrawing(choices), kind: "shape" },
    ])
      expect(() => deserializeWorkbook(raw(drawing))).toThrow();
    expect(reads).toBe(0);
  });

  test("chart elements infer78 after mixed old and equation75–77 features in every sheet", () => {
    const workbook = createWorkbook({ id: "workbook", sheetId: "owner" }),
      first = getActiveSheet(workbook),
      second = createSheet("Second", "second");
    insertSheet(workbook, second);
    first.drawings = [equationDrawing(), framedEquationDrawing()];
    first.drawings[1]!.id = "framed-equation";
    (first.drawings[1]! as ReturnType<typeof framedEquationDrawing>).equationFlipX = true;
    second.drawings = [elementDrawing(choices)];
    expect(serializeWorkbook(workbook).version).toBe(78);
    const before = serializeWorkbook(workbook);
    expect(serializeWorkbook(deserializeWorkbook(before))).toEqual(before);
    first.drawings.push({ ...elementDrawing(choices), id: "mixed-chart" });
    const standalone = serializeSheet(first);
    expect(serializeSheet(deserializeSheet(standalone))).toEqual(standalone);
    first.drawings.pop();
    second.drawings = [elementDrawing()];
    expect(serializeWorkbook(workbook).version).toBe(77);
  });

  test("commands, sparse state, metadata and snapshots isolate settings with exact Undo/Redo", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, [elementDrawing()]));
    const before = serializeWorkbook(session.workbook),
      input = elementDrawing({ ...choices }),
      expected = structuredClone(input),
      command = createSetSheetDrawingsCommand(sheet.id, [input]);
    input.chart.elements!.titlePosition = "above";
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(sheet.drawings).toEqual([expected]);
    const after = serializeWorkbook(session.workbook);
    expect(after.version).toBe(78);
    for (const drawings of [
      command.drawings,
      createSheetSparseState(sheet).drawings!,
      getSheetMetadata(sheet).drawings!,
      after.sheets[0]!.drawings!,
    ]) {
      const chart = (drawings[0]! as SheetChartDrawing).chart;
      chart.elements!.legendOverlay = true;
      chart.elements!.legendPosition = "bottom";
      expect(sheet.drawings).toEqual([expected]);
    }
    const unchanged = serializeWorkbook(session.workbook);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(unchanged);
  });

  test("cross-sheet collection replacement preserves settings and reversible history", () => {
    const session = createTestWorkbookSession(),
      first = getActiveSheet(session.workbook),
      second = createSheet("Second", "second");
    insertSheet(session.workbook, second);
    first.drawings = [elementDrawing(choices)];
    const before = serializeWorkbook(session.workbook),
      command = createReplaceSheetDrawingCollectionsCommand([
        { sheetId: first.id, expectedDrawings: first.drawings, drawings: [] },
        { sheetId: second.id, expectedDrawings: [], drawings: first.drawings },
      ]);
    expect(executeWorkbookCommand(session, command)).toBe(true);
    const after = serializeWorkbook(session.workbook);
    expect(first.drawings).toEqual([]);
    expect(second.drawings).toEqual([elementDrawing(choices)]);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
  });

  test("invalid chart-setting batches leave state and history unchanged", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, [elementDrawing()]));
    const before = serializeWorkbook(session.workbook),
      history = structuredClone(session.history),
      invalid = elementDrawing(choices);
    invalid.chart = {
      ...invalid.chart,
      elements: { legendOverlay: "false" },
    } as unknown as SheetChart;
    expect(() =>
      createSetSheetDrawingsCommand(sheet.id, [elementDrawing(choices), { ...invalid, id: "bad" }]),
    ).toThrow();
    const forged = createSetSheetDrawingsCommand(sheet.id, [elementDrawing(choices)]);
    (forged.drawings[0]! as SheetChartDrawing).chart = invalid.chart;
    expect(() => executeWorkbookCommand(session, forged)).toThrow();
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(session.history).toEqual(history);
  });
});
