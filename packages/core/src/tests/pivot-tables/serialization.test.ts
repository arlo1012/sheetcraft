import { describe, expect, test } from "vitest";
import { createSetPivotTableCommand } from "../../commands/pivot-tables.js";
import { executeWorkbookCommand } from "../../history.js";
import {
  serializeWorkbook,
  deserializeWorkbook,
  serializeSheet,
  deserializeSheet,
} from "../../serialization.js";
import { fixture } from "./fixture.js";

describe("pivot snapshot protocol", () => {
  test("round trips V31 definitions, output cells, and pivot chart binding", () => {
    const f = fixture();
    executeWorkbookCommand(
      f.session,
      createSetPivotTableCommand(f.destination.id, f.table, { chartId: "chart" }),
    );
    const snapshot = serializeWorkbook(f.workbook);
    expect(snapshot.version).toBe(32);
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
    const standalone = serializeSheet(f.destination);
    expect(serializeSheet(deserializeSheet(standalone))).toEqual(standalone);
    expect(() => deserializeWorkbook({ ...snapshot, version: 30 })).toThrow();
  });
  test("accepts historical V30 workbooks without pivot payloads", () => {
    const f = fixture();
    const snapshot = serializeWorkbook(f.workbook);
    const previous = {
      ...snapshot,
      version: 30,
      sheets: snapshot.sheets.map(({ pivotTables: _pivots, ...sheet }) => sheet),
    };
    expect(serializeWorkbook(deserializeWorkbook(previous)).version).toBe(32);
  });
});
