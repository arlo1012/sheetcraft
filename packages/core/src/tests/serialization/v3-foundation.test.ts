import { describe, expect, test } from "vitest";
import {
  createFormulaError,
  FORMULA_ERROR_TOKENS,
  type FormulaErrorCode,
} from "../../formula/types.js";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
} from "../../serialization.js";
import {
  getActiveSheet,
  getCellContent,
  setCellContent,
  setSheetMetadata,
} from "../../workbook.js";
import { createTestWorkbook } from "../helpers.js";

describe("formula and image foundation snapshots", () => {
  test("writes V4 with date system, typed errors, empty text, raw sources and metadata", () => {
    const workbook = createTestWorkbook();
    workbook.dateSystem = "1904";
    const sheet = getActiveSheet(workbook);
    Object.keys(FORMULA_ERROR_TOKENS).forEach((code, row) => {
      setCellContent(
        sheet,
        { row, column: 0 },
        { kind: "error", error: createFormulaError(code as FormulaErrorCode) },
      );
    });
    setCellContent(sheet, { row: 0, column: 1 }, { kind: "literal", value: "" });
    setCellContent(sheet, { row: 1, column: 1 }, { kind: "literal", value: "#N/A" });
    setCellContent(
      sheet,
      { row: 2, column: 1 },
      { kind: "formula", formula: { source: "= SUM( $a$1 , B2 ) " } },
    );
    setSheetMetadata(sheet, {
      freezePanes: { rows: 1, columns: 2 },
      mergedCells: [],
      filter: {
        range: { start: { row: 0, column: 0 }, end: { row: 15, column: 1 } },
        columns: [{ column: 0, allowedValues: [{ kind: "error", code: "NA" }] }],
      },
    });
    const snapshot = serializeWorkbook(workbook);
    const restored = deserializeWorkbook(JSON.parse(JSON.stringify(snapshot)));
    expect(snapshot.version).toBe(35);
    expect(snapshot.dateSystem).toBe("1904");
    expect(serializeWorkbook(restored)).toEqual(snapshot);
    expect(getCellContent(getActiveSheet(restored), { row: 0, column: 1 })).toEqual({
      kind: "literal",
      value: "",
    });
    expect(getCellContent(getActiveSheet(restored), { row: 15, column: 1 })).toBeNull();
    expect(serializeSheet(deserializeSheet(serializeSheet(sheet)))).toEqual(snapshot.sheets[0]);
    const restoredError = getActiveSheet(restored).cells.get("0:0")?.content;
    if (restoredError?.kind === "error") restoredError.error.code = "REF";
    expect(serializeWorkbook(workbook)).toEqual(snapshot);
    expect(JSON.stringify(snapshot)).not.toContain("computed");
  });

  test.each([1, 2])(
    "defaults V%i migration to 1900 and writes only the current schema",
    (version) => {
      const cells =
        version === 1
          ? [{ address: { row: 0, column: 0 }, value: "#N/A" }]
          : [
              {
                address: { row: 0, column: 0 },
                content: { kind: "literal", value: "#N/A" },
              },
            ];
      const restored = deserializeWorkbook({
        version,
        id: "old",
        activeSheetId: "sheet",
        sheets: [
          {
            id: "sheet",
            name: "Old",
            cells,
            rowHeights: [],
            columnWidths: [],
          },
        ],
      });
      expect(restored.dateSystem).toBe("1900");
      expect(getCellContent(getActiveSheet(restored), { row: 0, column: 0 })).toEqual({
        kind: "literal",
        value: "#N/A",
      });
      expect(serializeWorkbook(restored)).toMatchObject({
        version: 35,
        dateSystem: "1900",
      });
    },
  );

  test("rejects unsupported V3 date systems and malformed error content with a path", () => {
    const snapshot = serializeWorkbook(createTestWorkbook());
    for (const dateSystem of [undefined, null, 1900, "1901"]) {
      expect(() => deserializeWorkbook({ ...snapshot, dateSystem })).toThrow(
        expect.objectContaining({
          data: expect.objectContaining({
            code: "invalid_snapshot",
            details: expect.objectContaining({ path: "$.dateSystem" }),
          }),
        }),
      );
    }
    for (const error of [
      { kind: "formula-error", code: "UNKNOWN" },
      { kind: "other", code: "NA" },
      null,
    ]) {
      const invalid = structuredClone(snapshot);
      Object.assign(invalid.sheets[0]!, {
        cells: [{ address: { row: 0, column: 0 }, content: { kind: "error", error } }],
      });
      expect(() => deserializeWorkbook(invalid)).toThrow(
        expect.objectContaining({
          data: expect.objectContaining({ code: "invalid_snapshot" }),
        }),
      );
    }
  });

  test("does not smuggle V3 cell or filter semantics into a V2 declaration", () => {
    const { dateSystem: _dateSystem, ...current } = serializeWorkbook(createTestWorkbook());
    for (const content of [
      { kind: "literal", value: "" },
      { kind: "error", error: createFormulaError("NA") },
    ] as const) {
      const invalid = { ...structuredClone(current), version: 2 };
      invalid.sheets[0]!.cells.push({
        address: { row: 0, column: 0 },
        content,
      });
      expect(() => deserializeWorkbook(invalid)).toThrow();
    }
    const invalidFilter = { ...structuredClone(current), version: 2 };
    invalidFilter.sheets[0]!.filter = {
      range: { start: { row: 0, column: 0 }, end: { row: 2, column: 0 } },
      columns: [{ column: 0, allowedValues: [{ kind: "error", code: "NA" }] }],
    };
    expect(() => deserializeWorkbook(invalidFilter)).toThrow("Invalid filter value");
  });

  test.each([1, 2])(
    "rejects a V%i declaration carrying a V3-only date system instead of discarding it",
    (version) => {
      const current = serializeWorkbook(createTestWorkbook());
      for (const dateSystem of ["1900", "1904", undefined]) {
        expect(() => deserializeWorkbook({ ...current, version, dateSystem })).toThrow(
          "requires snapshot version 3 or newer",
        );
      }
    },
  );

  test("loads the exact formula V3 protocol and migrates it to V4", () => {
    const current = serializeWorkbook(createTestWorkbook());
    const v3 = {
      ...current,
      version: 3 as const,
      sheets: current.sheets.map(({ floatingImages: _floatingImages, ...sheet }) => sheet),
    };
    const restored = deserializeWorkbook(v3);
    expect(serializeWorkbook(restored)).toMatchObject({
      version: 35,
      dateSystem: "1900",
      sheets: [{ floatingImages: [] }],
    });
  });
});
