// 未执行：按用户要求仅编写测试，不运行检查。
import { describe, expect, test } from "vitest";
import {
  createSparklineScaleResolver,
  normalizeCellSparkline,
  type CellSparkline,
} from "../../sparklines.js";
import {
  deserializeWorkbook,
  serializeWorkbook,
  deserializeSheet,
  serializeSheet,
} from "../../serialization.js";
import {
  createSheetEvaluator,
  getActiveSheet,
  setCellContent,
  setCellSparkline,
} from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";

function definition(patch: Partial<CellSparkline> = {}): CellSparkline {
  return {
    type: "line",
    source: { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
    color: "#2563eb",
    negativeColor: "#ef4444",
    markers: false,
    axis: false,
    showHidden: false,
    empty: "gap",
    ...patch,
  };
}

function fixture() {
  const session = createTestWorkbookSession();
  const sheet = getActiveSheet(session.workbook);
  [
    [10, 20],
    [-30, 40],
    [-1000, 1000],
  ].forEach((values, column) =>
    values.forEach((value, row) => {
      setCellContent(sheet, { row, column }, { kind: "literal", value });
    }),
  );
  const primary = definition({
    groupId: "shared",
    minAxis: { type: "group" },
    maxAxis: { type: "group" },
  });
  const peer = { ...primary, source: { start: { row: 0, column: 1 }, end: { row: 1, column: 1 } } };
  const unrelated = {
    ...primary,
    groupId: "unrelated",
    source: { start: { row: 0, column: 2 }, end: { row: 1, column: 2 } },
  };
  setCellSparkline(sheet, { row: 0, column: 4 }, primary);
  setCellSparkline(sheet, { row: 1000, column: 4 }, peer);
  setCellSparkline(sheet, { row: 0, column: 5 }, unrelated);
  return { session, sheet, primary, peer };
}

describe("sparkline axis scale definitions", () => {
  test("preserves and deep-clones explicit axis settings without adding absent settings", () => {
    const original = definition({
      minAxis: { type: "custom", value: -2.5 },
      maxAxis: { type: "group" },
    });
    const normalized = normalizeCellSparkline(original)!;
    expect(normalized).toEqual(original);
    expect(normalized.minAxis).not.toBe(original.minAxis);
    expect(normalized.maxAxis).not.toBe(original.maxAxis);
    if (normalized.minAxis?.type === "custom") normalized.minAxis.value = 0;
    expect(original.minAxis).toEqual({ type: "custom", value: -2.5 });
    const legacy = normalizeCellSparkline(definition())!;
    expect(Object.hasOwn(legacy, "minAxis")).toBe(false);
    expect(Object.hasOwn(legacy, "maxAxis")).toBe(false);
  });

  test.each(["minAxis", "maxAxis"] as const)(
    "validates %s mode and finite custom values",
    (field) => {
      for (const value of [
        null,
        { type: "unknown" },
        { type: "custom" },
        { type: "custom", value: "2" },
        { type: "custom", value: NaN },
        { type: "custom", value: Infinity },
        { type: "custom", value: -Infinity },
      ]) {
        expect(() =>
          normalizeCellSparkline({ ...definition(), [field]: value } as unknown as CellSparkline),
        ).toThrow();
      }
      for (const value of [{ type: "individual" }, { type: "group" }, { type: "custom", value: 0 }])
        expect(() =>
          normalizeCellSparkline({ ...definition(), [field]: value } as CellSparkline),
        ).not.toThrow();
    },
  );

  test("rejects reversed dual custom limits but accepts equal finite limits", () => {
    expect(() =>
      normalizeCellSparkline(
        definition({
          minAxis: { type: "custom", value: 5 },
          maxAxis: { type: "custom", value: 4 },
        }),
      ),
    ).toThrow();
    expect(
      normalizeCellSparkline(
        definition({
          minAxis: { type: "custom", value: 0 },
          maxAxis: { type: "custom", value: 0 },
        }),
      )?.minAxis,
    ).toEqual({ type: "custom", value: 0 });
  });
});

describe("sparkline axis snapshot version 97", () => {
  test.each([
    { label: "individual minimum", patch: { minAxis: { type: "individual" as const } } },
    { label: "group maximum", patch: { maxAxis: { type: "group" as const } } },
    { label: "custom zero minimum", patch: { minAxis: { type: "custom" as const, value: 0 } } },
    { label: "custom zero maximum", patch: { maxAxis: { type: "custom" as const, value: 0 } } },
  ])(
    "requires version 97 for an explicit $label and infers standalone sheet support",
    ({ patch }) => {
      const session = createTestWorkbookSession();
      const sheet = getActiveSheet(session.workbook);
      const address = { row: 4, column: 4 };
      setCellSparkline(sheet, address, definition());
      expect(serializeWorkbook(session.workbook).version).toBeLessThan(97);
      setCellSparkline(sheet, address, definition(patch));
      const snapshot = serializeWorkbook(session.workbook);
      expect(snapshot.version).toBe(97);
      expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
      expect(() => deserializeWorkbook({ ...snapshot, version: 96 })).toThrow(/version 97/);
      const standalone = serializeSheet(sheet);
      expect(serializeSheet(deserializeSheet(standalone))).toEqual(standalone);
    },
  );

  test("preserves both finite fractional custom boundaries in workbook and standalone round trips", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellSparkline(
      sheet,
      { row: 4, column: 4 },
      definition({
        minAxis: { type: "custom", value: -2.5 },
        maxAxis: { type: "custom", value: 10.25 },
      }),
    );
    const snapshot = serializeWorkbook(session.workbook);
    expect(snapshot.version).toBe(97);
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
    const standalone = serializeSheet(sheet);
    expect(serializeSheet(deserializeSheet(standalone))).toEqual(standalone);
  });
});

describe("sparkline source-derived axis scales", () => {
  test("includes offscreen members of the same persistent group and excludes unrelated groups", () => {
    const f = fixture();
    const before = serializeWorkbook(f.session.workbook);
    const resolve = createSparklineScaleResolver(f.sheet, createSheetEvaluator(f.sheet));
    expect(resolve(f.primary, [10, 20])).toEqual({ min: -30, max: 40 });
    expect(resolve(f.primary)).toEqual({ min: -30, max: 40 });
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });

  test("resolves min and max independently between individual and group modes", () => {
    const f = fixture();
    const resolve = createSparklineScaleResolver(f.sheet, createSheetEvaluator(f.sheet));
    expect(
      resolve(
        { ...f.primary, minAxis: { type: "group" }, maxAxis: { type: "individual" } },
        [10, 20],
      ),
    ).toEqual({ min: -30, max: 20 });
    expect(
      resolve(
        { ...f.primary, minAxis: { type: "individual" }, maxAxis: { type: "group" } },
        [10, 20],
      ),
    ).toEqual({ min: 10, max: 40 });
    expect(resolve(definition(), [10, 20])).toEqual({ min: 10, max: 20 });
  });

  test.each([
    { type: "line" as const, values: [10, 20], expected: { min: 10, max: 20 } },
    { type: "column" as const, values: [10, 20], expected: { min: 0, max: 20 } },
    { type: "column" as const, values: [-20, -10], expected: { min: -20, max: 0 } },
    { type: "column" as const, values: [-20, 10], expected: { min: -20, max: 10 } },
    { type: "winLoss" as const, values: [-20, 100], expected: { min: -1, max: 1 } },
    { type: "winLoss" as const, values: [10, 20], expected: { min: -1, max: 1 } },
  ])("uses the $type automatic domain for $values", ({ type, values, expected }) => {
    const f = fixture();
    const resolve = createSparklineScaleResolver(f.sheet, createSheetEvaluator(f.sheet));
    expect(resolve(definition({ type }), values)).toEqual(expected);
  });

  test("includes zero in an all-positive column group even when all data minima exceed zero", () => {
    const f = fixture();
    setCellContent(f.sheet, { row: 0, column: 1 }, { kind: "literal", value: 30 });
    const resolve = createSparklineScaleResolver(f.sheet, createSheetEvaluator(f.sheet));
    expect(resolve({ ...f.primary, type: "column" }, [10, 20])).toEqual({ min: 0, max: 40 });
  });

  test.each([
    {
      type: "line" as const,
      minAxis: { type: "custom" as const, value: 25 },
      maxAxis: undefined,
      expected: { min: 25, max: 25 },
    },
    {
      type: "line" as const,
      minAxis: undefined,
      maxAxis: { type: "custom" as const, value: 5 },
      expected: { min: 5, max: 5 },
    },
    {
      type: "line" as const,
      minAxis: { type: "custom" as const, value: 5 },
      maxAxis: undefined,
      expected: { min: 5, max: 20 },
    },
    {
      type: "line" as const,
      minAxis: undefined,
      maxAxis: { type: "custom" as const, value: 25 },
      expected: { min: 10, max: 25 },
    },
    {
      type: "column" as const,
      minAxis: { type: "custom" as const, value: 25 },
      maxAxis: undefined,
      expected: { min: 25, max: 25 },
    },
    {
      type: "column" as const,
      minAxis: undefined,
      maxAxis: { type: "custom" as const, value: -5 },
      expected: { min: -5, max: -5 },
    },
  ])(
    "retains a custom $type boundary when the automatic opposite side crosses it",
    ({ type, minAxis, maxAxis, expected }) => {
      const f = fixture();
      const resolve = createSparklineScaleResolver(f.sheet, createSheetEvaluator(f.sheet));
      expect(resolve(definition({ type, minAxis, maxAxis }), [10, 20])).toEqual(expected);
    },
  );

  test("keeps win/loss fixed to minus one and one even with custom axis settings", () => {
    const f = fixture();
    const resolve = createSparklineScaleResolver(f.sheet, createSheetEvaluator(f.sheet));
    expect(
      resolve(
        definition({
          type: "winLoss",
          minAxis: { type: "custom", value: -50 },
          maxAxis: { type: "custom", value: 100 },
        }),
        [-30, 40],
      ),
    ).toEqual({ min: -1, max: 1 });
  });

  test("uses each group member's visible source values and refreshes after changing hidden-data settings", () => {
    const f = fixture();
    f.sheet.hiddenColumns = new Set([1]);
    const visible = createSparklineScaleResolver(f.sheet, createSheetEvaluator(f.sheet));
    expect(visible(f.primary, [10, 20])).toEqual({ min: 10, max: 20 });
    setCellSparkline(f.sheet, { row: 1000, column: 4 }, { ...f.peer, showHidden: true });
    const refreshed = createSparklineScaleResolver(f.sheet, createSheetEvaluator(f.sheet));
    expect(refreshed(f.primary, [10, 20])).toEqual({ min: -30, max: 40 });
  });
});
