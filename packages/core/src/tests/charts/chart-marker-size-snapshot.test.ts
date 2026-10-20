import { describe, expect, expectTypeOf, test } from "vitest";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
  type WorkbookSnapshot,
  type WorkbookSnapshotV92,
} from "../../serialization.js";
import type { SheetChartDrawing } from "../../sheet-drawings.js";
import { createWorkbook, getActiveSheet } from "../../workbook.js";
import { group, nested } from "../shape-groups/fixtures.js";
import { formatDrawing } from "./chart-format-fixture.js";

function raw(format: unknown, version = 92) {
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

describe("conditional chart marker size snapshot92", () => {
  test("roundtrips explicit, hidden and dormant sizes in workbook and standalone sheet", () => {
    expectTypeOf<WorkbookSnapshotV92>().toExtend<WorkbookSnapshot>();
    for (const markerSizePt of [2, 5, 9, 72]) {
      const format = {
        categoryAxis: { titleText: {} },
        series: [
          { id: "apple", markerSizePt, markers: false },
          { id: "dormant", markerSizePt: 72 },
        ],
      };
      const workbook = deserializeWorkbook(raw(format));
      const saved = serializeWorkbook(workbook);
      expect(saved.version).toBe(92);
      expect(serializeWorkbook(deserializeWorkbook(saved))).toEqual(saved);
      const sheet = getActiveSheet(workbook);
      expect((sheet.drawings![0]! as SheetChartDrawing).chart.format).toEqual(format);
      const standalone = serializeSheet(sheet);
      expect(serializeSheet(deserializeSheet(standalone))).toEqual(standalone);
      const rebuilt = createWorkbook({ id: "rebuilt", sheetId: "owner" });
      getActiveSheet(rebuilt).drawings = deserializeSheet(standalone).drawings;
      expect(serializeWorkbook(rebuilt).version).toBe(92);
    }
  });

  test("gates raw field presence in every older version before validation or getter reads", () => {
    let reads = 0;
    const getter = {
      enumerable: true,
      get() {
        reads++;
        throw Error("Unexpected marker accessor read");
      },
    };
    const invalidEntries = [
      { id: "a", markerSizePt: undefined },
      { id: "a", markerSizePt: null },
      { id: "a", markerSizePt: 2.5 },
      Object.defineProperty({ id: "a" }, "markerSizePt", getter),
      Object.assign(Object.create({ markerSizePt: 9 }), { id: "a" }),
    ];
    const entries = [
      ...invalidEntries,
      { id: "a", markerSizePt: 5 },
      Object.defineProperty({ id: "a" }, "markerSizePt", { value: 9 }),
    ];
    for (const entry of entries)
      for (let version = 1; version < 92; version++)
        expect(() => deserializeWorkbook(raw({ series: [entry] }, version))).toThrow(/version 92/);
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

  test("checks nested groups and invalid drawing owners without admitting grouped charts", () => {
    const snapshot = raw({ series: [{ id: "dormant", markerSizePt: undefined }] }, 91);
    const drawing = snapshot.sheets[0]!.drawings[0]!;
    const outer = { ...group(), members: [{ ...nested(), members: [drawing] }] };
    for (const candidate of [outer, { ...drawing, kind: "shape" }]) {
      const sheets = [{ ...snapshot.sheets[0]!, drawings: [candidate] }];
      expect(() => deserializeWorkbook({ ...snapshot, sheets })).toThrow(/version 92/);
      expect(() => deserializeWorkbook({ ...snapshot, sheets, version: 92 })).toThrow();
      expect(() => deserializeSheet(sheets[0]!)).toThrow();
    }
  });

  test("omission retains the old minimum version and never injects a default size", () => {
    for (const [format, version] of [
      [{ series: [{ id: "apple", markers: true }] }, 80],
      [{ categoryAxis: { titleText: {} }, series: [{ id: "apple" }] }, 91],
    ] as const) {
      const saved = serializeWorkbook(deserializeWorkbook(raw(format)));
      expect(saved.version).toBe(version);
      expect(
        (getActiveSheet(deserializeWorkbook(saved)).drawings![0]! as SheetChartDrawing).chart
          .format,
      ).toEqual(format);
    }
  });
});
