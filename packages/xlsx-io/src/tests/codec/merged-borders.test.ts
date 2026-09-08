import { strFromU8, unzipSync } from "fflate/browser";
import { createApplyCellBordersCommand, createMergeCellsCommand } from "@idea10/core/commands";
import { createWorkbookSession, executeWorkbookCommand } from "@idea10/core/history";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import { serializeWorkbook } from "@idea10/core/serialization";
import { createWorkbook, getActiveSheet, type CellRange } from "@idea10/core/workbook";
import { describe, expect, test } from "vitest";
import { encodeXlsx } from "../../index.js";

type BorderExpectation = Record<"top" | "right" | "bottom" | "left", string>;

function xlsxBorderStyles(bytes: Uint8Array, address: string): BorderExpectation {
  const archive = unzipSync(bytes);
  const sheet = strFromU8(archive["xl/worksheets/sheet1.xml"]!);
  const styles = strFromU8(archive["xl/styles.xml"]!);
  const cell = sheet.match(new RegExp(`<c r="${address}"[^>]*>`))?.[0];
  expect(cell).toBeDefined();
  const styleId = cell?.match(/ s="(\d+)"/)?.[1];
  expect(styleId).toBeDefined();

  const cellXfs = styles.match(/<cellXfs\b[^>]*>(.*?)<\/cellXfs>/s)?.[1];
  expect(cellXfs).toBeDefined();
  const formats = [...(cellXfs ?? "").matchAll(/<xf\b[^>]*?(?:\/>|>.*?<\/xf>)/gs)];
  const format = formats[Number(styleId)]?.[0];
  expect(format).toBeDefined();
  const borderId = format?.match(/ borderId="(\d+)"/)?.[1];
  expect(borderId).toBeDefined();

  const borders = styles.match(/<borders\b[^>]*>(.*?)<\/borders>/s)?.[1];
  expect(borders).toBeDefined();
  const border = [...(borders ?? "").matchAll(/<border>(.*?)<\/border>/gs)][Number(borderId)]?.[1];
  expect(border).toBeDefined();
  const color = (side: keyof BorderExpectation) =>
    border?.match(
      new RegExp(`<${side} style="[^"]+"><color rgb="FF([0-9A-F]{6})"/></${side}>`),
    )?.[1];
  const result = {
    top: color("top"),
    right: color("right"),
    bottom: color("bottom"),
    left: color("left"),
  };
  expect(result).toEqual({
    top: expect.any(String),
    right: expect.any(String),
    bottom: expect.any(String),
    left: expect.any(String),
  });
  return result as BorderExpectation;
}

function mergeWithAllBorders(range: CellRange, color = "#112233") {
  const workbook = createWorkbook({ id: "merged-borders", sheetId: "sheet" });
  const session = createWorkbookSession({
    workbook,
    idFactory: createSequentialIdFactory(),
  });
  const sheet = getActiveSheet(workbook);
  const border = { style: "thin" as const, color };
  expect(executeWorkbookCommand(session, createMergeCellsCommand(sheet.id, range))).toBe(true);
  expect(
    executeWorkbookCommand(
      session,
      createApplyCellBordersCommand(sheet.id, range, { preset: "all", border }),
    ),
  ).toBe(true);
  return { workbook, session, sheet };
}

function expectMergedBorders(
  bytes: Uint8Array,
  merge: string,
  cells: readonly string[],
  expected: BorderExpectation,
): void {
  const sheet = strFromU8(unzipSync(bytes)["xl/worksheets/sheet1.xml"]!);
  expect(sheet).toContain(`<mergeCell ref="${merge}"/>`);
  for (const address of cells) expect(xlsxBorderStyles(bytes, address)).toEqual(expected);
}

describe("XLSX merged-cell borders", () => {
  test("projects an all-borders merged rectangle to every physical XLSX cell without mutating Core", async () => {
    const { workbook } = mergeWithAllBorders({
      start: { row: 0, column: 0 },
      end: { row: 1, column: 1 },
    });
    const before = serializeWorkbook(workbook);

    const result = await encodeXlsx(workbook);

    expectMergedBorders(result.bytes, "A1:B2", ["A1", "B1", "A2", "B2"], {
      top: "112233",
      right: "112233",
      bottom: "112233",
      left: "112233",
    });
    expect(serializeWorkbook(workbook)).toEqual(before);
  });

  test.each([
    [
      "single-row",
      { start: { row: 0, column: 0 }, end: { row: 0, column: 2 } },
      "A1:C1",
      ["A1", "B1", "C1"],
    ],
    [
      "single-column",
      { start: { row: 0, column: 0 }, end: { row: 2, column: 0 } },
      "A1:A3",
      ["A1", "A2", "A3"],
    ],
  ] as const)("projects all borders for a %s merge", async (_name, range, merge, cells) => {
    const { workbook } = mergeWithAllBorders(range);
    const before = serializeWorkbook(workbook);

    const result = await encodeXlsx(workbook);

    expectMergedBorders(result.bytes, merge, cells, {
      top: "112233",
      right: "112233",
      bottom: "112233",
      left: "112233",
    });
    expect(serializeWorkbook(workbook)).toEqual(before);
  });

  test("keeps distinct perimeter sides when all borders is subsequently refined", async () => {
    const range = { start: { row: 0, column: 0 }, end: { row: 1, column: 1 } };
    const { workbook, session, sheet } = mergeWithAllBorders(range, "#010203");
    const sides = [
      ["top", { style: "thin" as const, color: "#112233" }],
      ["right", { style: "medium" as const, color: "#223344" }],
      ["bottom", { style: "dashed" as const, color: "#334455" }],
      ["left", { style: "dotted" as const, color: "#445566" }],
    ] as const;
    for (const [preset, border] of sides) {
      expect(
        executeWorkbookCommand(
          session,
          createApplyCellBordersCommand(sheet.id, range, { preset, border }),
        ),
      ).toBe(true);
    }
    const before = serializeWorkbook(workbook);

    const result = await encodeXlsx(workbook);

    expectMergedBorders(result.bytes, "A1:B2", ["A1", "B1", "A2", "B2"], {
      top: "112233",
      right: "223344",
      bottom: "334455",
      left: "445566",
    });
    expect(serializeWorkbook(workbook)).toEqual(before);
  });
});
