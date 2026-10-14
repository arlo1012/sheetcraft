import { describe, expect, expectTypeOf, test } from "vitest";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
  type WorkbookSnapshot,
  type WorkbookSnapshotV82,
} from "../../serialization.js";
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
import { chartLayoutElements, chartLayoutFormat, layoutDrawing } from "./chart-layout-fixture.js";
import { elementDrawing } from "./chart-elements-fixture.js";
import { formatDrawing } from "./chart-format-fixture.js";
import { presentationDrawing } from "./chart-presentation-fixture.js";
import { sourceDrawing } from "./chart-source-fixture.js";

function raw(drawing: unknown, version = 82) {
  const snapshot = serializeWorkbook(createWorkbook({ id: "workbook", sheetId: "owner" }));
  const result = {
    ...snapshot,
    version,
    sheets: [{ ...snapshot.sheets[0]!, drawings: [drawing] }],
  };
  if (version < 3) delete (result as { dateSystem?: unknown }).dateSystem;
  return result;
}
function leafDrawings(): SheetChartDrawing[] {
  return [
    elementDrawing({ dataTable: "none" }),
    elementDrawing({ dataTable: "withLegendKeys" }),
    elementDrawing({ dataTable: "withoutLegendKeys" }),
    elementDrawing({ labelContent: "value" }),
    elementDrawing({ labelContent: "seriesAndValue" }),
    elementDrawing({ labelScope: "all" }),
    elementDrawing({ labelScope: "lastCategory" }),
    elementDrawing({ labelScope: "lastSeries" }),
    ...["categoryAxis", "valueAxis", "secondaryValueAxis"].flatMap((axis) =>
      (axis === "categoryAxis"
        ? ["titleVisible"]
        : ["majorGridlines", "minorGridlines", "titleVisible"]
      ).flatMap((key) => [false, true].map((value) => formatDrawing({ [axis]: { [key]: value } }))),
    ),
    layoutDrawing(),
  ];
}

describe("conditional sparse chart layout snapshot82", () => {
  test("each new leaf, including explicit none and false, upgrades only to82 and roundtrips standalone", () => {
    expectTypeOf<WorkbookSnapshotV82>().toExtend<WorkbookSnapshot>();
    for (const input of leafDrawings()) {
      const workbook = deserializeWorkbook(raw(input)),
        saved = serializeWorkbook(workbook);
      expect(saved.version).toBe(82);
      expect(saved.sheets[0]!.drawings).toEqual([input]);
      expect(serializeWorkbook(deserializeWorkbook(saved))).toEqual(saved);
      const standalone = serializeSheet(getActiveSheet(workbook));
      expect(serializeSheet(deserializeSheet(standalone))).toEqual(standalone);
    }
  });

  test("old78/80/81 data keeps exact envelopes and reading82 adds no new defaults", () => {
    const workbook = createWorkbook({ id: "workbook", sheetId: "owner" }),
      sheet = getActiveSheet(workbook);
    for (const [input, version] of [
      [elementDrawing(), 43],
      [elementDrawing({}), 78],
      [formatDrawing({ valueAxis: { title: "Sales" } }), 80],
      [presentationDrawing({}), 81],
    ] as const) {
      sheet.drawings = [input];
      const before = serializeWorkbook(workbook),
        originalElements = input.chart.elements;
      expect(before.version).toBe(version);
      expect(serializeWorkbook(deserializeWorkbook(raw(input)))).toEqual(before);
      input.chart.elements = { ...input.chart.elements, dataTable: "none" };
      expect(serializeWorkbook(workbook).version).toBe(82);
      if (originalElements === undefined) delete input.chart.elements;
      else input.chart.elements = originalElements;
      expect(serializeWorkbook(workbook)).toEqual(before);
    }
  });

  test("all V1–81 gate leaf presence before nested, sibling and discriminator getters", () => {
    let reads = 0;
    const getter = {
      enumerable: true,
      get() {
        reads++;
        throw Error("Unexpected read");
      },
    };
    const drawing = elementDrawing(),
      inputs: unknown[] = leafDrawings();
    for (const key of ["dataTable", "labelContent", "labelScope"]) {
      for (const value of [undefined, null, false, "unsupported"])
        inputs.push({ ...drawing, chart: { ...drawing.chart, elements: { [key]: value } } });
      for (const elements of [
        Object.defineProperty({}, key, getter),
        Object.create({ [key]: "none" }),
      ])
        inputs.push({ ...drawing, chart: { ...drawing.chart, elements } });
    }
    for (const axis of ["categoryAxis", "valueAxis", "secondaryValueAxis"])
      for (const key of axis === "categoryAxis"
        ? ["titleVisible"]
        : ["majorGridlines", "minorGridlines", "titleVisible"])
        for (const settings of [
          { [key]: undefined },
          { [key]: null },
          Object.defineProperty({}, key, getter),
          Object.create(Object.defineProperty({}, key, getter)),
        ])
          inputs.push({ ...drawing, chart: { ...drawing.chart, format: { [axis]: settings } } });
    inputs.push(
      {
        ...drawing,
        chart: Object.assign(Object.create({ elements: { dataTable: "none" } }), drawing.chart),
      },
      {
        ...drawing,
        chart: {
          ...drawing.chart,
          format: Object.create({ valueAxis: { majorGridlines: false } }),
        },
      },
      Object.defineProperty(layoutDrawing(), "kind", getter),
      { ...layoutDrawing(), kind: "shape" },
    );
    for (const key of ["presentation", "source", "type"])
      inputs.push({
        ...drawing,
        chart: Object.defineProperty(
          { ...drawing.chart, elements: { dataTable: "none" } },
          key,
          getter,
        ),
      });
    inputs.push({
      ...drawing,
      chart: Object.defineProperty(
        { ...drawing.chart, format: { valueAxis: { majorGridlines: false } } },
        "elements",
        getter,
      ),
    });
    for (let version = 1; version <= 81; version++)
      for (const input of inputs)
        expect(() => deserializeWorkbook(raw(input, version))).toThrow(/version 82/);
    expect(reads).toBe(0);
  });

  test("V82 rejects malformed or illegal ownership without reading feature accessors", () => {
    let reads = 0;
    const getter = {
      enumerable: true,
      get() {
        reads++;
        throw Error("Unexpected read");
      },
    };
    const drawing = layoutDrawing(),
      { chart: _chart, kind: _kind, ...withoutOwner } = drawing;
    const inputs = [
      { ...drawing, kind: "shape" },
      Object.defineProperty({ ...drawing }, "kind", getter),
      Object.assign(Object.create({ kind: "chart" }), withoutOwner, { chart: drawing.chart }),
      Object.defineProperty({ ...drawing }, "chart", getter),
      Object.assign(Object.create({ chart: drawing.chart }), withoutOwner, { kind: "chart" }),
      { ...drawing, chart: { ...drawing.chart, elements: { dataTable: undefined } } },
      { ...drawing, chart: { ...drawing.chart, elements: { labelContent: null } } },
      { ...drawing, chart: { ...drawing.chart, elements: { labelScope: "firstSeries" } } },
      { ...drawing, chart: { ...drawing.chart, elements: Object.create({ dataTable: "none" }) } },
      {
        ...drawing,
        chart: { ...drawing.chart, elements: Object.defineProperty({}, "dataTable", getter) },
      },
      {
        ...drawing,
        chart: { ...drawing.chart, format: { valueAxis: { minorGridlines: undefined } } },
      },
      {
        ...drawing,
        chart: {
          ...drawing.chart,
          format: { categoryAxis: Object.defineProperty({}, "titleVisible", getter) },
        },
      },
      {
        ...drawing,
        chart: {
          ...drawing.chart,
          format: { secondaryValueAxis: Object.create({ majorGridlines: false }) },
        },
      },
      {
        ...drawing,
        chart: {
          ...drawing.chart,
          format: Object.create({ valueAxis: { majorGridlines: false } }),
        },
      },
    ];
    for (const input of inputs) expect(() => deserializeWorkbook(raw(input))).toThrow();
    expect(reads).toBe(0);
    expect(drawing).toEqual(layoutDrawing());
  });

  test("latest inference wins last across mixed sheets and drops back once new leaves are removed", () => {
    const workbook = createWorkbook({ id: "workbook", sheetId: "owner" }),
      first = getActiveSheet(workbook),
      second = createSheet("Second", "second");
    insertSheet(workbook, second);
    first.drawings = [layoutDrawing()];
    second.drawings = [sourceDrawing(), { ...presentationDrawing({}), id: "presentation" }];
    const saved = serializeWorkbook(workbook);
    expect(saved.version).toBe(82);
    expect(serializeWorkbook(deserializeWorkbook(saved))).toEqual(saved);
    const restored = deserializeSheet(serializeSheet(first));
    const fromStandalone = createWorkbook({ id: "standalone", sheetId: restored.id });
    fromStandalone.sheets.set(restored.id, restored);
    expect(serializeWorkbook(fromStandalone).version).toBe(82);
    first.drawings = [];
    expect(serializeWorkbook(workbook).version).toBe(81);
    second.drawings!.pop();
    expect(serializeWorkbook(workbook).version).toBe(79);
  });

  test("one layout change is one detached Undo/Redo and reordered identical truth is a no-op", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, [elementDrawing()]));
    session.history.undoStack = [];
    const before = serializeWorkbook(session.workbook),
      input = layoutDrawing(),
      command = createSetSheetDrawingsCommand(sheet.id, [input]);
    input.chart.elements!.dataTable = "none";
    input.chart.format!.valueAxis!.minorGridlines = true;
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(sheet.drawings).toEqual([layoutDrawing()]);
    expect(session.history.undoStack).toHaveLength(1);
    const after = serializeWorkbook(session.workbook);
    for (const drawings of [
      command.drawings,
      createSheetSparseState(sheet).drawings!,
      getSheetMetadata(sheet).drawings!,
      after.sheets[0]!.drawings!,
    ]) {
      const chart = (drawings[0]! as SheetChartDrawing).chart;
      chart.elements!.labelScope = "all";
      chart.format!.categoryAxis!.titleVisible = true;
      chart.format!.secondaryValueAxis!.majorGridlines = true;
      expect(sheet.drawings).toEqual([layoutDrawing()]);
    }
    const stable = serializeWorkbook(session.workbook),
      reordered = layoutDrawing();
    reordered.chart.elements = {
      labelScope: "lastCategory",
      labelContent: "seriesAndValue",
      dataTable: "withLegendKeys",
      labelPosition: "outsideEnd",
      legendOverlay: false,
      legendPosition: "right",
      titlePosition: "above",
    };
    reordered.chart.format = {
      secondaryValueAxis: chartLayoutFormat().secondaryValueAxis,
      valueAxis: chartLayoutFormat().valueAxis,
      categoryAxis: chartLayoutFormat().categoryAxis,
    };
    expect(
      executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, [reordered])),
    ).toBe(false);
    expect(session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(stable);
  });

  test("malformed batches and forged layout payloads reject without state or history changes", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, [elementDrawing()]));
    const before = serializeWorkbook(session.workbook),
      history = structuredClone(session.history),
      invalid = { ...layoutDrawing(), id: "bad" };
    invalid.chart.elements = { dataTable: undefined };
    expect(() => createSetSheetDrawingsCommand(sheet.id, [layoutDrawing(), invalid])).toThrow();
    const forged = createSetSheetDrawingsCommand(sheet.id, [layoutDrawing()]);
    (forged.drawings[0]! as SheetChartDrawing).chart = invalid.chart;
    expect(() => executeWorkbookCommand(session, forged)).toThrow();
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(session.history).toEqual(history);
    expect(chartLayoutElements()).toEqual(layoutDrawing().chart.elements);
  });
});
