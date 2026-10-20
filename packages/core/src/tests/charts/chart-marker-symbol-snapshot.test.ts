import { describe, expect, expectTypeOf, test } from "vitest";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
  type WorkbookSnapshot,
  type WorkbookSnapshotV93,
} from "../../serialization.js";
import type { SheetChartDrawing } from "../../sheet-drawings.js";
import { createWorkbook, getActiveSheet } from "../../workbook.js";
import { group, nested } from "../shape-groups/fixtures.js";
import { formatDrawing } from "./chart-format-fixture.js";

function raw(format: unknown, version = 93) {
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

describe("conditional chart marker symbol snapshot93", () => {
  test("roundtrips explicit, hidden and dormant shapes in workbook and standalone sheet", () => {
    expectTypeOf<WorkbookSnapshotV93>().toExtend<WorkbookSnapshot>();
    for (const markerSymbol of ["circle", "square"]) {
      const format = {
        categoryAxis: { titleText: {} },
        series: [
          { id: "apple", markerSymbol, markerSizePt: 9, markers: false },
          { id: "dormant", markerSymbol: "square" },
        ],
      };
      const workbook = deserializeWorkbook(raw(format));
      const saved = serializeWorkbook(workbook);
      expect(saved.version).toBe(93);
      expect(serializeWorkbook(deserializeWorkbook(saved))).toEqual(saved);
      const sheet = getActiveSheet(workbook);
      expect((sheet.drawings![0]! as SheetChartDrawing).chart.format).toEqual(format);
      const standalone = serializeSheet(sheet);
      expect(serializeSheet(deserializeSheet(standalone))).toEqual(standalone);
      const rebuilt = createWorkbook({ id: "rebuilt", sheetId: "owner" });
      getActiveSheet(rebuilt).drawings = deserializeSheet(standalone).drawings;
      expect(serializeWorkbook(rebuilt).version).toBe(93);
    }
  });

  test("gates raw presence in every older version before validation or getter reads", () => {
    let reads = 0;
    const getter = {
      enumerable: true,
      get() {
        reads++;
        throw Error("Unexpected marker accessor read");
      },
    };
    const invalidEntries = [
      { id: "a", markerSymbol: undefined },
      { id: "a", markerSymbol: null },
      { id: "a", markerSymbol: "none" },
      { id: "a", markerSymbol: "triangle" },
      Object.defineProperty({ id: "a" }, "markerSymbol", getter),
      Object.assign(Object.create({ markerSymbol: "square" }), { id: "a" }),
      Object.assign(Object.create(Object.defineProperty({}, "markerSymbol", getter)), {
        id: "a",
      }),
    ];
    const entries = [
      ...invalidEntries,
      { id: "a", markerSymbol: "circle" },
      { id: "a", markerSymbol: "square", markerSizePt: 9 },
      Object.defineProperty({ id: "a" }, "markerSymbol", { value: "square" }),
    ];
    for (const entry of entries)
      for (let version = 1; version < 93; version++)
        expect(() => deserializeWorkbook(raw({ series: [entry] }, version))).toThrow(/version 93/);
    for (const entry of invalidEntries) {
      const snapshot = raw({ series: [entry] });
      expect(() => deserializeWorkbook(snapshot)).toThrow();
      expect(() => deserializeSheet(snapshot.sheets[0]!)).toThrow();
    }
    for (const format of [
      { series: Object.defineProperty([{}], "0", getter) },
      Object.defineProperty({}, "series", getter),
    ]) {
      expect(() => deserializeWorkbook(raw(format))).toThrow();
      expect(() => deserializeSheet(raw(format).sheets[0]!)).toThrow();
    }
    expect(reads).toBe(0);
  });

  test("gates inherited containers and invalid nested owners without admitting grouped charts", () => {
    let reads = 0;
    const getter = {
      enumerable: true,
      get() {
        reads++;
        throw Error("Unexpected drawing accessor read");
      },
    };
    for (const version of Array.from({ length: 92 }, (_, index) => index + 1)) {
      const format = { series: [{ id: "dormant", markerSymbol: undefined }] };
      const snapshot = raw(format, version);
      const drawing = snapshot.sheets[0]!.drawings[0]!;
      const { kind: _kind, ...withoutKind } = drawing;
      const inheritedFormat = Object.assign(Object.create({ format }), drawing.chart);
      delete inheritedFormat.format;
      const outer = { ...group(), members: [{ ...nested(), members: [drawing] }] };
      for (const candidate of [
        outer,
        { ...drawing, kind: "shape" },
        withoutKind,
        Object.assign(Object.create({ kind: "chart" }), withoutKind),
        Object.defineProperty({ ...drawing }, "kind", getter),
        { ...drawing, chart: inheritedFormat },
        { ...drawing, chart: { ...drawing.chart, format: Object.create(format) } },
      ]) {
        const sheets = [{ ...snapshot.sheets[0]!, drawings: [candidate] }];
        expect(() => deserializeWorkbook({ ...snapshot, sheets })).toThrow(/version 93/);
        expect(() => deserializeWorkbook({ ...snapshot, sheets, version: 93 })).toThrow();
        expect(() => deserializeSheet(sheets[0]!)).toThrow();
      }
    }
    expect(reads).toBe(0);
  });

  test("omission retains older versions and byte-equivalent data without injecting a shape", () => {
    for (const [format, version] of [
      [{ series: [{ id: "apple", markers: true }] }, 80],
      [{ categoryAxis: { titleText: {} }, series: [{ id: "apple" }] }, 91],
      [{ series: [{ id: "apple", markerSizePt: 9, markers: false }] }, 92],
    ] as const) {
      const previous = serializeWorkbook(deserializeWorkbook(raw(format, version)));
      const saved = serializeWorkbook(deserializeWorkbook(raw(format)));
      expect(saved.version).toBe(version);
      expect(JSON.stringify(saved)).toBe(JSON.stringify(previous));
      expect(
        (getActiveSheet(deserializeWorkbook(saved)).drawings![0]! as SheetChartDrawing).chart
          .format,
      ).toEqual(format);
    }
  });
});
