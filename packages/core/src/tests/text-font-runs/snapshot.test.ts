import { describe, expect, test } from "vitest";
import {
  serializeWorkbook,
  deserializeWorkbook,
  serializeSheet,
  deserializeSheet,
} from "../../serialization.js";
import { getActiveSheet, getCellContent, setCellContent } from "../../workbook.js";
import { createTestWorkbook } from "../helpers.js";
import { calculatedColumnFixture } from "../tables/calculated-column-fixture.js";
import { fixture as pivotFixture } from "../pivot-tables/fixture.js";
import { createSetPivotTableCommand } from "../../commands/pivot-tables.js";
import { executeWorkbookCommand } from "../../history.js";

const address = { row: 10, column: 10 };
const content = {
  kind: "literal" as const,
  value: "A🙂B",
  fontRuns: [{ start: 1, end: 3, fontFamily: "Symbol" }],
};

describe("font-run snapshots", () => {
  test("uses 46 only for actual runs and round-trips independent sheet/workbook metadata", () => {
    const workbook = createTestWorkbook();
    const sheet = getActiveSheet(workbook);
    expect(serializeWorkbook(workbook).version).toBe(43);
    setCellContent(sheet, address, { kind: "literal", value: "plain", fontRuns: [] });
    expect(serializeWorkbook(workbook).version).toBe(43);
    setCellContent(sheet, address, content);
    const snapshot = serializeWorkbook(workbook);
    expect(snapshot.version).toBe(46);
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
    const single = deserializeSheet(serializeSheet(sheet));
    expect(getCellContent(single, address)).toEqual(content);
    const saved = snapshot.sheets[0]!.cells.find((cell) => cell.address.row === 10)!.content;
    if (saved?.kind === "literal" && saved.fontRuns)
      (saved.fontRuns[0] as { fontFamily: string }).fontFamily = "Changed";
    expect(getCellContent(sheet, address)).toEqual(content);
    expect(getCellContent(single, address)).toEqual(content);
  });

  test.each([2, 3, 42, 43, 44, 45])(
    "rejects runs in explicit version %i instead of silently stripping",
    (version) => {
      const workbook = createTestWorkbook();
      setCellContent(getActiveSheet(workbook), address, content);
      expect(() => deserializeWorkbook({ ...serializeWorkbook(workbook), version })).toThrow();
    },
  );

  test.each([
    { ...content, fontRuns: [{ start: 1, end: 2, fontFamily: "Symbol" }] },
    { ...content, fontRuns: [{ start: 0, end: 5, fontFamily: "Symbol" }] },
    { kind: "literal", value: 12, fontRuns: [] },
    { kind: "formula", formula: { source: "=1" }, fontRuns: [] },
    { kind: "error", error: { kind: "formula-error", code: "NA" }, fontRuns: [] },
    { kind: "image", image: { assetId: "a", altText: "" }, fontRuns: [] },
  ])("rejects invalid new snapshot metadata %#", (invalid) => {
    const snapshot = serializeWorkbook(createTestWorkbook());
    snapshot.sheets[0]!.cells = [{ address, content: invalid as typeof content }];
    expect(() => deserializeWorkbook({ ...snapshot, version: 46 })).toThrow();
    expect(() => deserializeSheet(snapshot.sheets[0])).toThrow();
  });

  test("standalone sheet inference retains 46 above calculated-column version 45", () => {
    const f = calculatedColumnFixture();
    executeWorkbookCommand(f.session, f.formula(1));
    expect(serializeWorkbook(f.workbook).version).toBe(45);
    setCellContent(f.sheet, address, content);
    expect(serializeWorkbook(f.workbook).version).toBe(46);
    expect(getCellContent(deserializeSheet(serializeSheet(f.sheet)), address)).toEqual(content);
  });

  test("standalone sheet inference retains 46 above manual-order version 44", () => {
    const f = pivotFixture();
    executeWorkbookCommand(
      f.session,
      createSetPivotTableCommand(f.destination.id, {
        ...f.table,
        sortFields: [{ axis: "rows", field: 0, order: "manual", members: ["West", "East"] }],
      }),
    );
    expect(serializeWorkbook(f.workbook).version).toBe(44);
    setCellContent(f.destination, address, content);
    expect(serializeWorkbook(f.workbook).version).toBe(46);
    expect(getCellContent(deserializeSheet(serializeSheet(f.destination)), address)).toEqual(
      content,
    );
  });
});
