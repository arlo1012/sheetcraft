import { describe, expect, test } from "vitest";
import { normalizeSheetDrawing, type SheetDrawing } from "../../sheet-drawings.js";
import {
  MAX_TEXT_BOX_REFERENCE_SHEET_ID_LENGTH,
  mapSheetDrawingTextReferences,
  mapWorkbookTextReferences,
  normalizeTextBoxTextReference,
} from "../../text-box-reference.js";
import {
  createWorkbook,
  getActiveSheet,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
} from "../../workbook.js";
import { shapeText } from "../drawings/shape-text-fixture.js";
import { linkedBox, framedBox, ownedBox, target } from "./fixtures.js";

const cast = (value: unknown) => value as SheetDrawing;

describe("bounded TextBox single-cell references", () => {
  test("literal absence, explicit broken reference, and canonical/legacy/hidden owned links are detached", () => {
    const literal = linkedBox();
    delete literal.textReference;
    literal.text = "literal";
    expect(normalizeSheetDrawing(literal)).not.toHaveProperty("textReference");
    expect(normalizeSheetDrawing(linkedBox("missing", null))).toEqual(linkedBox("missing", null));
    for (const input of [linkedBox(), framedBox(), ownedBox()]) {
      const result = normalizeSheetDrawing(input);
      expect(result).toEqual(input);
      expect(target(result).textReference).not.toBe(target(input).textReference);
      expect(target(result).textReference!.cell).not.toBe(target(input).textReference!.cell);
      target(result).textReference!.cell!.row = 99;
      expect(target(input).textReference!.cell!.row).toBe(4);
    }
  });

  test("only text boxes can link, and uniform layout/body/warp survive without literal or runs", () => {
    const input = framedBox();
    expect(normalizeSheetDrawing(input)).toEqual(input);
    for (const invalid of [
      { ...linkedBox(), kind: "shape" },
      { ...linkedBox(), kind: "wordArt" },
      { ...linkedBox(), text: "stale" },
      { ...linkedBox(), shapeText: { ...shapeText(), characterRuns: [] } },
      { ...linkedBox(), shapeText: { ...shapeText(), characterRuns: undefined } },
      { ...linkedBox(), shapeText: undefined },
      { ...framedBox(), shapeText: undefined },
    ])
      expect(() => normalizeSheetDrawing(cast(invalid))).toThrow();
    const group = ownedBox();
    Object.assign(group, { textReference: { sheetId: "source", cell: null } });
    expect(() => normalizeSheetDrawing(group)).toThrow();
  });

  test("complete ordinary own records reject undefined, ranges, unbounded and prototype-spoofed data", () => {
    const bad = [
      undefined,
      null,
      {},
      { sheetId: "source" },
      { sheetId: "source", cell: undefined },
      { sheetId: "", cell: null },
      { sheetId: " ", cell: null },
      { sheetId: "x".repeat(MAX_TEXT_BOX_REFERENCE_SHEET_ID_LENGTH + 1), cell: null },
      { sheetId: "source", cell: { row: 0, column: 0, end: { row: 1, column: 1 } } },
      { sheetId: "source", cell: { row: MAX_SHEET_ROWS, column: 0 } },
      { sheetId: "source", cell: { row: 0, column: MAX_SHEET_COLUMNS } },
      { sheetId: "source", cell: { row: Infinity, column: 0 } },
      { sheetId: "source", cell: { row: NaN, column: 0 } },
      { sheetId: "source", cell: { row: 0.5, column: 0 } },
      { sheetId: "source", cell: { row: -1, column: 0 } },
      Object.create({ sheetId: "source", cell: null }),
      { sheetId: "source", cell: Object.create({ row: 0, column: 0 }) },
      { sheetId: "source", cell: null, extra: undefined },
      { sheetId: "source", cell: null, [Symbol("extra")]: 1 },
    ];
    for (const reference of bad) {
      expect(() => normalizeTextBoxTextReference(reference)).toThrow();
      expect(() =>
        normalizeSheetDrawing(cast({ ...linkedBox(), textReference: reference })),
      ).toThrow();
    }
    expect(
      normalizeTextBoxTextReference({
        sheetId: "x".repeat(1024),
        cell: { row: MAX_SHEET_ROWS - 1, column: MAX_SHEET_COLUMNS - 1 },
      }),
    ).toEqual({
      sheetId: "x".repeat(1024),
      cell: { row: MAX_SHEET_ROWS - 1, column: MAX_SHEET_COLUMNS - 1 },
    });
  });

  test("reference and owner accessors are rejected without evaluating them", () => {
    let hits = 0;
    const getter = {
      enumerable: true,
      get() {
        hits++;
        throw Error("read");
      },
    };
    const reference = Object.defineProperty({ cell: null }, "sheetId", getter);
    const cell = Object.defineProperty({ column: 0 }, "row", getter);
    const accessor = Object.defineProperty(linkedBox(), "textReference", getter);
    const inherited = Object.create(Object.defineProperty({}, "textReference", getter));
    const literal = linkedBox();
    delete literal.textReference;
    Object.assign(inherited, literal);
    const kind = Object.defineProperty(linkedBox(), "kind", getter);
    const text = Object.defineProperty(linkedBox(), "text", getter);
    const anchor = Object.defineProperty({ row: 0, column: 0 }, "extra", getter);
    for (const input of [
      accessor,
      inherited,
      kind,
      text,
      { ...linkedBox(), anchor },
      { ...linkedBox(), textReference: reference },
      { ...linkedBox(), textReference: { sheetId: "source", cell } },
    ])
      expect(() => normalizeSheetDrawing(cast(input))).toThrow();
    expect(hits).toBe(0);
  });

  test("pure whole-forest/workbook mapping includes hidden descendants, only matching targets, and permanent tombstones", () => {
    const workbook = createWorkbook({ id: "workbook", sheetId: "owner" });
    const sheet = getActiveSheet(workbook);
    sheet.drawings = [
      ownedBox(),
      { ...linkedBox("other"), id: "other" },
      { ...linkedBox("source", null), id: "broken" },
    ];
    const before = structuredClone(sheet.drawings);
    const plan = mapWorkbookTextReferences(workbook, "source", (cell) => ({
      ...cell,
      row: cell.row + 1,
    }));
    expect(plan).toHaveLength(1);
    expect(target(plan[0]!.drawings[0]!).textReference!.cell).toEqual({ row: 5, column: 2 });
    expect(target(plan[0]!.drawings[1]!).textReference!.sheetId).toBe("other");
    expect(target(plan[0]!.drawings[2]!).textReference!.cell).toBeNull();
    expect(sheet.drawings).toEqual(before);
    expect(mapWorkbookTextReferences(workbook, "unrelated", () => null)).toEqual([]);
    expect(
      target(
        mapSheetDrawingTextReferences([ownedBox()], (reference) => ({
          ...reference,
          cell: null,
        }))[0]!,
      ).textReference!.cell,
    ).toBeNull();
    expect(() =>
      mapWorkbookTextReferences(workbook, "source", () => ({ row: MAX_SHEET_ROWS, column: 0 })),
    ).toThrow();
    expect(sheet.drawings).toEqual(before);
  });
});
