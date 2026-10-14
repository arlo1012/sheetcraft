import { describe, expect, expectTypeOf, test } from "vitest";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
  type WorkbookSnapshot,
  type WorkbookSnapshotV84,
} from "../../serialization.js";
import type { SheetChartDrawing } from "../../sheet-drawings.js";
import { createSheet, createWorkbook, getActiveSheet, insertSheet } from "../../workbook.js";
import { elementDrawing } from "./chart-elements-fixture.js";
import { formatDrawing } from "./chart-format-fixture.js";
import { layoutDrawing } from "./chart-layout-fixture.js";
import { presentationDrawing } from "./chart-presentation-fixture.js";
import { sourceDrawing } from "./chart-source-fixture.js";

function raw(drawing: unknown, version = 84) {
  const snapshot = serializeWorkbook(createWorkbook({ id: "workbook", sheetId: "owner" }));
  const result = {
    ...snapshot,
    version,
    sheets: [{ ...snapshot.sheets[0]!, drawings: [drawing] }],
  };
  if (version < 3) delete (result as { dateSystem?: unknown }).dateSystem;
  return result;
}

function rectangleDrawing(): SheetChartDrawing {
  const drawing = elementDrawing();
  return {
    ...drawing,
    chart: {
      ...drawing.chart,
      rectangleSeries: {
        rows: [{ index: 1, id: "row-one" }],
        columns: [{ index: 1, id: "column-one" }],
      },
    },
  };
}

function filteredDrawing(
  drawing = rectangleDrawing(),
  hiddenSeriesIds = ["column-one", "retired"],
): SheetChartDrawing {
  return { ...drawing, chart: { ...drawing.chart, seriesFilter: { hiddenSeriesIds } } };
}

describe("conditional sparse chart series-filter snapshot84", () => {
  test("writes84 only for filter presence, including empty and dormant source-owned choices", () => {
    expectTypeOf<WorkbookSnapshotV84>().toExtend<WorkbookSnapshot>();
    const broken = elementDrawing(),
      unsupported = elementDrawing(),
      noSeries = sourceDrawing("owner");
    broken.chart.range = null;
    unsupported.chart.type = "pie";
    noSeries.chart.source = {
      kind: "series",
      categories: { kind: "generated" },
      series: [],
    };
    const inputs = [
      filteredDrawing(),
      filteredDrawing(rectangleDrawing(), []),
      filteredDrawing(elementDrawing(), ["unbound"]),
      filteredDrawing(sourceDrawing("owner"), ["apple", "retired"]),
      filteredDrawing(broken, ["retired"]),
      filteredDrawing(unsupported, ["retired"]),
      filteredDrawing(noSeries, ["retired"]),
    ];
    for (const input of inputs) {
      const workbook = deserializeWorkbook(raw(input)),
        saved = serializeWorkbook(workbook),
        sheet = getActiveSheet(workbook);
      expect(saved.version).toBe(84);
      expect(saved.sheets[0]!.drawings).toEqual([input]);
      expect(serializeWorkbook(deserializeWorkbook(saved))).toEqual(saved);
      const standalone = serializeSheet(sheet);
      expect(serializeSheet(deserializeSheet(standalone))).toEqual(standalone);
      const copied = saved.sheets[0]!.drawings![0]! as SheetChartDrawing,
        current = sheet.drawings![0]! as SheetChartDrawing;
      expect(current.chart.seriesFilter).not.toBe(input.chart.seriesFilter);
      expect(current.chart.seriesFilter!.hiddenSeriesIds).not.toBe(
        input.chart.seriesFilter!.hiddenSeriesIds,
      );
      expect(copied.chart.seriesFilter).not.toBe(current.chart.seriesFilter);
      copied.chart.seriesFilter!.hiddenSeriesIds.push("snapshot-only");
      expect(current.chart.seriesFilter).toEqual(input.chart.seriesFilter);
      expect(serializeSheet(sheet)).toEqual(standalone);
    }
  });

  test("reading84 without filters adds no defaults and preserves exact43/78–83 write envelopes", () => {
    const workbook = createWorkbook({ id: "workbook", sheetId: "owner" }),
      sheet = getActiveSheet(workbook);
    for (const [drawing, version] of [
      [elementDrawing(), 43],
      [elementDrawing({}), 78],
      [sourceDrawing("owner"), 79],
      [formatDrawing({ valueAxis: { title: "Sales" } }), 80],
      [presentationDrawing({}), 81],
      [layoutDrawing(), 82],
      [rectangleDrawing(), 83],
    ] as const) {
      sheet.drawings = [drawing];
      const before = serializeWorkbook(workbook);
      expect(before.version).toBe(version);
      const restored = deserializeWorkbook(raw(drawing));
      expect(serializeWorkbook(restored)).toEqual(before);
      expect(
        (getActiveSheet(restored).drawings![0]! as SheetChartDrawing).chart,
      ).not.toHaveProperty("seriesFilter");
      sheet.drawings = [filteredDrawing(drawing, [])];
      expect(serializeWorkbook(workbook).version).toBe(84);
      sheet.drawings = [drawing];
      expect(JSON.stringify(serializeWorkbook(workbook))).toBe(JSON.stringify(before));
    }
  });

  test("all V1–83 gate raw presence before malformed payloads, owners and older feature getters", () => {
    let reads = 0;
    const getter = {
      enumerable: true,
      get() {
        reads++;
        throw Error("Unexpected read");
      },
    };
    const drawing = elementDrawing(),
      inputs: unknown[] = [];
    for (const seriesFilter of [undefined, null, {}, { hiddenSeriesIds: [] }]) {
      const chart = Object.defineProperty({ ...drawing.chart, seriesFilter }, "source", getter);
      inputs.push({ ...drawing, chart }, { ...drawing, kind: "shape", chart });
    }
    inputs.push(
      { ...drawing, chart: Object.defineProperty({ ...drawing.chart }, "seriesFilter", getter) },
      {
        ...drawing,
        chart: Object.assign(Object.create({ seriesFilter: undefined }), drawing.chart),
      },
      Object.defineProperty(filteredDrawing(), "kind", getter),
    );
    for (const key of [
      "rectangleSeries",
      "presentation",
      "format",
      "elements",
      "type",
      "range",
      "dataCache",
      "pivotTableId",
    ])
      inputs.push({
        ...drawing,
        chart: Object.defineProperty(
          { ...drawing.chart, seriesFilter: { hiddenSeriesIds: [] } },
          key,
          getter,
        ),
      });
    for (let version = 1; version <= 83; version++)
      for (const input of inputs)
        expect(() => deserializeWorkbook(raw(input, version))).toThrow(/version 84/);
    expect(reads).toBe(0);
  });

  test("V84 rejects nonchart, inherited and accessor owners without consuming getters", () => {
    let reads = 0;
    const getter = {
      enumerable: true,
      get() {
        reads++;
        throw Error("Unexpected read");
      },
    };
    const drawing = filteredDrawing(),
      { chart: _chart, kind: _kind, ...withoutOwner } = drawing;
    const inputs: unknown[] = [
      ...["shape", "textBox", "equation", "shapeGroup"].map((kind) => ({ ...drawing, kind })),
      Object.defineProperty({ ...drawing }, "kind", getter),
      Object.assign(Object.create({ kind: "chart" }), withoutOwner, { chart: drawing.chart }),
      Object.defineProperty({ ...drawing }, "chart", getter),
      Object.assign(Object.create({ chart: drawing.chart }), withoutOwner, { kind: "chart" }),
      {
        ...drawing,
        chart: Object.assign(Object.create({ seriesFilter: { hiddenSeriesIds: [] } }), _chart, {
          seriesFilter: undefined,
        }),
      },
      {
        ...drawing,
        chart: Object.defineProperty({ ...elementDrawing().chart }, "seriesFilter", getter),
      },
      {
        ...drawing,
        chart: Object.assign(
          Object.create({ seriesFilter: { hiddenSeriesIds: [] } }),
          elementDrawing().chart,
        ),
      },
    ];
    for (const input of inputs) {
      expect(() => deserializeWorkbook(raw(input))).toThrow();
      expect(() => deserializeSheet(raw(input).sheets[0])).toThrow();
    }
    expect(reads).toBe(0);
  });

  test("any cache/Pivot field presence is incompatible before own, inherited or sibling accessors", () => {
    let reads = 0;
    const getter = {
      enumerable: true,
      get() {
        reads++;
        throw Error("Unexpected read");
      },
    };
    for (const key of ["dataCache", "pivotTableId"])
      for (const chart of [
        { ...filteredDrawing().chart, [key]: undefined },
        { ...filteredDrawing().chart, [key]: null },
        Object.defineProperty({ ...filteredDrawing().chart }, key, getter),
        Object.assign(Object.create({ [key]: undefined }), filteredDrawing().chart),
        Object.assign(
          Object.create(Object.defineProperty({}, key, getter)),
          filteredDrawing().chart,
        ),
      ]) {
        Object.defineProperty(chart, "presentation", getter);
        const input = { ...elementDrawing(), chart };
        expect(() => deserializeWorkbook(raw(input))).toThrow(/source ownership/);
        expect(() => deserializeSheet(raw(input).sheets[0])).toThrow(/source ownership/);
      }
    expect(reads).toBe(0);
  });

  test("V84 validates bounded plain records and dense unique IDs without payload getter effects", () => {
    let reads = 0;
    const getter = {
      enumerable: true,
      get() {
        reads++;
        throw Error("Unexpected read");
      },
    };
    const sparse: unknown[] = [];
    sparse.length = 1;
    const arrayAccessor = Object.defineProperty(["one"], "0", getter),
      customPrototype = ["one"];
    Object.setPrototypeOf(customPrototype, Object.create(Array.prototype));
    const invalid: unknown[] = [
      undefined,
      null,
      false,
      [],
      {},
      { hiddenSeriesIds: undefined },
      { hiddenSeriesIds: null },
      { hiddenSeriesIds: [undefined] },
      { hiddenSeriesIds: [1] },
      { hiddenSeriesIds: [""] },
      { hiddenSeriesIds: [" "] },
      { hiddenSeriesIds: ["x".repeat(129)] },
      { hiddenSeriesIds: ["duplicate", "duplicate"] },
      { hiddenSeriesIds: [], extra: true },
      { hiddenSeriesIds: [], [Symbol("unknown")]: true },
      Object.create({ hiddenSeriesIds: [] }),
      Object.defineProperty({}, "hiddenSeriesIds", getter),
      { hiddenSeriesIds: sparse },
      { hiddenSeriesIds: arrayAccessor },
      { hiddenSeriesIds: customPrototype },
      { hiddenSeriesIds: Object.assign([], { extra: true }) },
      { hiddenSeriesIds: Object.assign([], { [Symbol("unknown")]: true }) },
      { hiddenSeriesIds: Array.from({ length: 513 }, (_, index) => `id-${index}`) },
    ];
    for (const seriesFilter of invalid) {
      const input = { ...elementDrawing(), chart: { ...elementDrawing().chart, seriesFilter } };
      expect(() => deserializeWorkbook(raw(input))).toThrow();
      expect(() => deserializeSheet(raw(input).sheets[0])).toThrow();
    }
    expect(reads).toBe(0);
    const hiddenSeriesIds = Array.from({ length: 512 }, (_, index) => `id-${index}`);
    hiddenSeriesIds[0] = "x".repeat(128);
    const input = filteredDrawing(elementDrawing(), hiddenSeriesIds),
      saved = serializeWorkbook(deserializeWorkbook(raw(input)));
    expect(saved.version).toBe(84);
    expect((saved.sheets[0]!.drawings![0]! as SheetChartDrawing).chart.seriesFilter).toEqual({
      hiddenSeriesIds,
    });
  });

  test("V84 wins across mixed sheets and drops to each preceding feature once filters are removed", () => {
    const workbook = createWorkbook({ id: "workbook", sheetId: "owner" }),
      first = getActiveSheet(workbook),
      second = createSheet("Second", "second");
    insertSheet(workbook, second);
    first.drawings = [filteredDrawing(rectangleDrawing(), [])];
    second.drawings = [layoutDrawing()];
    const saved = serializeWorkbook(workbook);
    expect(saved.version).toBe(84);
    expect(serializeWorkbook(deserializeWorkbook(saved))).toEqual(saved);
    const restored = deserializeSheet(serializeSheet(first)),
      standaloneWorkbook = createWorkbook({ id: "standalone", sheetId: restored.id });
    standaloneWorkbook.sheets.set(restored.id, restored);
    expect(serializeWorkbook(standaloneWorkbook).version).toBe(84);
    first.drawings = [rectangleDrawing()];
    expect(serializeWorkbook(workbook).version).toBe(83);
    first.drawings = [];
    expect(serializeWorkbook(workbook).version).toBe(82);
    second.drawings = [sourceDrawing(second.id)];
    expect(serializeWorkbook(workbook).version).toBe(79);
    second.drawings = [];
    expect(serializeWorkbook(workbook).version).toBe(43);
  });
});
