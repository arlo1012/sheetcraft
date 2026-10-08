import { describe, expect, test } from "vitest";
import { doesSheetFilterColumnMatch, getSheetFilterValue } from "../../filter-values.js";
import {
  normalizeSheetFilterCondition,
  getActiveSheet,
  type SheetFilterCondition,
  type SheetFilterValueCondition,
} from "../../workbook.js";
import {
  serializeWorkbook,
  deserializeWorkbook,
  serializeSheet,
  deserializeSheet,
} from "../../serialization.js";
import { createBuiltinTableStyles } from "../../table-styles.js";
import { createTestWorkbookSession } from "../helpers.js";

const matches = (condition: SheetFilterCondition, value: string | number | null) =>
  doesSheetFilterColumnMatch(
    { column: 0, allowedValues: [], condition },
    getSheetFilterValue(value),
  );

describe("text filter comparison conditions", () => {
  test.each([
    { operator: "greaterThan", expected: [false, false, true] },
    { operator: "greaterThanOrEqual", expected: [false, true, true] },
    { operator: "lessThan", expected: [true, false, false] },
    { operator: "lessThanOrEqual", expected: [true, true, false] },
  ] as const)("$operator compares labels case-insensitively", ({ operator, expected }) => {
    const condition: SheetFilterValueCondition = { kind: "text", operator, value: "bEtA" };
    expect(["alpha", "BETA", "gamma"].map((value) => matches(condition, value))).toEqual(expected);
  });

  test.each([
    { operator: "between", expected: [false, true, true, true, false] },
    { operator: "notBetween", expected: [true, false, false, false, true] },
  ] as const)(
    "$operator uses two inclusive case-insensitive lexical bounds",
    ({ operator, expected }) => {
      const condition: SheetFilterValueCondition = {
        kind: "text",
        operator,
        value: "b",
        value2: "D",
      };
      expect(["a", "B", "c", "d", "e"].map((value) => matches(condition, value))).toEqual(expected);
      expect(normalizeSheetFilterCondition(condition)).toEqual(condition);
    },
  );

  test("text comparison preserves lexical ordering of numeric-looking labels", () => {
    expect(matches({ kind: "text", operator: "lessThan", value: "3" }, "20")).toBe(true);
    expect(matches({ kind: "number", operator: "lessThan", value: 3 }, 20)).toBe(false);
    expect(matches({ kind: "text", operator: "between", value: "10", value2: "3" }, "20")).toBe(
      true,
    );
  });

  test.each([
    { operator: "doesNotBeginWith", pattern: "a?", accepted: "beta", rejected: "Alpha" },
    { operator: "doesNotEndWith", pattern: "?a", accepted: "tail", rejected: "BETA" },
    { operator: "doesNotBeginWith", pattern: "~*", accepted: "alpha", rejected: "*literal" },
    { operator: "doesNotEndWith", pattern: "~?", accepted: "alpha", rejected: "literal?" },
  ] as const)(
    "$operator negates anchored wildcard patterns $pattern",
    ({ operator, pattern, accepted, rejected }) => {
      const condition: SheetFilterValueCondition = { kind: "text", operator, value: pattern };
      expect(matches(condition, accepted)).toBe(true);
      expect(matches(condition, rejected)).toBe(false);
      expect(normalizeSheetFilterCondition(condition)).toEqual(condition);
    },
  );

  test("combines new text comparisons with existing text conditions", () => {
    const condition: SheetFilterCondition = {
      kind: "compound",
      operator: "and",
      conditions: [
        { kind: "text", operator: "between", value: "a", value2: "d" },
        { kind: "text", operator: "doesNotBeginWith", value: "b" },
      ],
    };
    expect(["alpha", "beta", "charlie", "echo"].map((value) => matches(condition, value))).toEqual([
      true,
      false,
      true,
      false,
    ]);
  });

  test.each([
    { kind: "text", operator: "between", value: "a" },
    { kind: "text", operator: "notBetween", value: "a" },
    { kind: "text", operator: "between", value: "a", value2: 3 },
    { kind: "text", operator: "notBetween", value: "a", value2: null },
    { kind: "text", operator: "greaterThan", value: 1 },
  ])("rejects malformed text comparison bounds %#", (condition) => {
    expect(() => normalizeSheetFilterCondition(condition as SheetFilterCondition)).toThrow();
  });

  test.each(["simple", "compound"] as const)(
    "round trips V37 %s sheet filter and rejects it in V36",
    (kind) => {
      const session = createTestWorkbookSession();
      const sheet = getActiveSheet(session.workbook);
      const comparison: SheetFilterValueCondition = {
        kind: "text",
        operator: "between",
        value: "alpha",
        value2: "delta",
      };
      sheet.filter = {
        range: { start: { row: 0, column: 0 }, end: { row: 4, column: 0 } },
        columns: [
          {
            column: 0,
            allowedValues: [],
            condition:
              kind === "simple"
                ? comparison
                : {
                    kind: "compound",
                    operator: "and",
                    conditions: [
                      comparison,
                      { kind: "text", operator: "doesNotEndWith", value: "z" },
                    ],
                  },
          },
        ],
      };
      const snapshot = serializeWorkbook(session.workbook);
      expect(snapshot.version).toBe(37);
      expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
      expect(() => deserializeWorkbook({ ...snapshot, version: 36 })).toThrow();
    },
  );

  test("accepts legacy text conditions in a V36 snapshot", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    sheet.filter = {
      range: { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
      columns: [
        {
          column: 0,
          allowedValues: [],
          condition: { kind: "text", operator: "contains", value: "alpha" },
        },
      ],
    };
    const snapshot = serializeWorkbook(session.workbook);
    expect(serializeWorkbook(deserializeWorkbook({ ...snapshot, version: 36 })).version).toBe(37);
  });
  test("gates text comparisons inside table filters and infers standalone sheet format", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const range = { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } };
    sheet.tables = [
      {
        id: "table-1",
        name: "Labels",
        range,
        columns: [{ id: "label", name: "Label" }],
        style: createBuiltinTableStyles()[0]!,
        headerRow: true,
        totalRow: false,
        firstColumn: false,
        lastColumn: false,
        bandedRows: true,
        bandedColumns: false,
        filterButton: true,
        filter: {
          range,
          columns: [
            {
              column: 0,
              allowedValues: [],
              condition: { kind: "text", operator: "greaterThan", value: "alpha" },
            },
          ],
        },
      },
    ];
    const snapshot = serializeWorkbook(session.workbook);
    expect(() => deserializeWorkbook({ ...snapshot, version: 36 })).toThrow();
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
    expect(serializeSheet(deserializeSheet(serializeSheet(sheet)))).toEqual(serializeSheet(sheet));
  });
});
