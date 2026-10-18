import { describe, expect, expectTypeOf, test } from "vitest";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
  type WorkbookSnapshot,
  type WorkbookSnapshotV90,
} from "../../serialization.js";
import { createWorkbook, getActiveSheet } from "../../workbook.js";
import type { ChartFormatSettings } from "../../chart-format.js";
import type { SheetChartDrawing } from "../../sheet-drawings.js";
import { createTestWorkbookSession } from "../helpers.js";
import { group, nested } from "../shape-groups/fixtures.js";
import { formatDrawing } from "./chart-format-fixture.js";

const text = { scriptFonts: { latin: { kind: "theme", role: "minor", slot: "latin" } } } as const;
function raw(format: unknown, version = 90) {
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
describe("script font snapshot90 admission and lifecycle", () => {
  test.each<ChartFormatSettings>([
    { title: text },
    { legend: { text } },
    { categoryAxis: { text } },
    { valueAxis: { text } },
    { secondaryValueAxis: { text } },
  ])("roundtrips every text owner and standalone sheet %j", (format) => {
    expectTypeOf<WorkbookSnapshotV90>().toExtend<WorkbookSnapshot>();
    const workbook = deserializeWorkbook(raw(format));
    const saved = serializeWorkbook(workbook);
    expect(saved.version).toBe(90);
    expect(serializeWorkbook(deserializeWorkbook(saved))).toEqual(saved);
    const sheet = serializeSheet(getActiveSheet(workbook));
    expect(serializeSheet(deserializeSheet(sheet))).toEqual(sheet);
  });
  test("gates all old envelopes and malformed raw presence without getter evaluation", () => {
    let reads = 0;
    const getter = {
      enumerable: true,
      get() {
        reads++;
        throw Error("read");
      },
    };
    for (const value of [
      text,
      { scriptFonts: undefined },
      { scriptFonts: null },
      Object.defineProperty({}, "scriptFonts", getter),
      Object.create({ scriptFonts: {} }),
    ]) {
      for (const format of [
        { title: value },
        { legend: { text: value } },
        { categoryAxis: { text: value } },
        { valueAxis: { text: value } },
        { secondaryValueAxis: { text: value } },
      ]) {
        for (let version = 1; version < 90; version++)
          expect(() => deserializeWorkbook(raw(format, version))).toThrow(/version 90/);
      }
    }
    expect(reads).toBe(0);
  });
  test("gates nested chart payloads without widening group member support", () => {
    const snapshot = raw({ title: text }, 89);
    const drawing = snapshot.sheets[0]!.drawings[0]!;
    const outer = { ...group(), members: [{ ...nested(), members: [drawing] }] };
    expect(() =>
      deserializeWorkbook({ ...snapshot, sheets: [{ ...snapshot.sheets[0]!, drawings: [outer] }] }),
    ).toThrow(/version 90/);
    // Group-owned charts remain unsupported, even in the new envelope.
    expect(() =>
      deserializeWorkbook({
        ...snapshot,
        version: 90,
        sheets: [{ ...snapshot.sheets[0]!, drawings: [outer] }],
      }),
    ).toThrow();
  });
  test("theme-only CS presence selects90; old snapshots do not gain new defaults", () => {
    const workbook = createWorkbook({ id: "book", sheetId: "owner" });
    const old = serializeWorkbook(workbook);
    expect(old.version).toBeLessThan(90);
    expect(serializeWorkbook(deserializeWorkbook(old))).toEqual(old);
    workbook.theme.fonts!.bodyComplexScript = "";
    const saved = serializeWorkbook(workbook);
    expect(saved.version).toBe(90);
    expect(serializeWorkbook(deserializeWorkbook(saved))).toEqual(saved);
    for (const value of ["", undefined, null])
      expect(() =>
        deserializeWorkbook({
          ...saved,
          version: 89,
          theme: { ...saved.theme, fonts: { ...saved.theme.fonts, bodyComplexScript: value } },
        }),
      ).toThrow(/version 90/);
    delete workbook.theme.fonts!.bodyComplexScript;
    expect(serializeWorkbook(workbook)).toEqual(old);
  });
  test("theme CS raw accessor and inherited presence gates without invoking getters", () => {
    let reads = 0;
    const getter = {
      enumerable: true,
      get() {
        reads++;
        throw Error("read");
      },
    };
    const snapshot = raw({});
    for (const key of ["headingComplexScript", "bodyComplexScript"]) {
      for (const fonts of [
        Object.defineProperty({ ...snapshot.theme.fonts }, key, getter),
        Object.assign(Object.create({ [key]: "" }), snapshot.theme.fonts),
      ]) {
        for (const version of [1, 17, 43, 89]) {
          const payload = { ...snapshot, version, theme: { ...snapshot.theme, fonts } };
          expect(() => deserializeWorkbook(payload)).toThrow(/version 90/);
        }
        expect(() =>
          deserializeWorkbook({ ...snapshot, theme: { ...snapshot.theme, fonts } }),
        ).toThrow();
      }
    }
    expect(reads).toBe(0);
  });
  test("commands detach every slot; unrelated edits preserve bindings; reset and undo are atomic", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    sheet.drawings = [formatDrawing()];
    const before = serializeWorkbook(session.workbook);
    const input = formatDrawing({ title: structuredClone(text) });
    const command = createSetSheetDrawingsCommand(sheet.id, [input]);
    input.chart.format!.title!.scriptFonts!.latin = { kind: "automatic" };
    expect(executeWorkbookCommand(session, command)).toBe(true);
    const after = serializeWorkbook(session.workbook);
    expect(after.version).toBe(90);
    expect((sheet.drawings![0]! as SheetChartDrawing).chart.format!.title).toEqual(text);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
    expect(
      executeWorkbookCommand(
        session,
        createSetSheetDrawingsCommand(sheet.id, [
          formatDrawing({ title: { ...text, bold: true } }),
        ]),
      ),
    ).toBe(true);
    expect((sheet.drawings![0]! as SheetChartDrawing).chart.format!.title!.scriptFonts).toEqual(
      text.scriptFonts,
    );
    expect(
      executeWorkbookCommand(
        session,
        createSetSheetDrawingsCommand(sheet.id, [
          formatDrawing({ title: { fontFamily: "Arial" } }),
        ]),
      ),
    ).toBe(true);
    expect(serializeWorkbook(session.workbook).version).toBe(80);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook).version).toBe(90);
  });
});
