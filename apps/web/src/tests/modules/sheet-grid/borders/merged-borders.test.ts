import { describe, expect, test } from "vitest";
import { createSheet, setCellStyle } from "@idea10/core/workbook";
import { createSheetGeometry } from "@idea10/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@idea10/sheet-engine/visibility";
import {
  resolveVisibleBorderSegments,
  resolveVisibleDiagonalBorderSegments,
} from "../../../../modules/sheet-grid/border-presentation";

const border = { style: "mediumDashDot", color: "#4472c4" } as const;
const geometry = createSheetGeometry({
  rowCount: 12,
  columnCount: 10,
  rowHeight: 20,
  columnWidth: 40,
});
const visible = { startRow: 0, endRow: 8, startColumn: 0, endColumn: 7 };

function mergedSheet() {
  const sheet = createSheet("Sheet1", "merged-borders");
  sheet.mergedCells = [{ start: { row: 2, column: 2 }, end: { row: 5, column: 4 } }];
  setCellStyle(
    sheet,
    { row: 2, column: 2 },
    {
      borderTop: border,
      borderRight: border,
      borderBottom: border,
      borderLeft: border,
    },
  );
  return sheet;
}

describe("merged cell border presentation", () => {
  test("projects all anchor borders onto the full merged perimeter without internal lines", () => {
    const sheet = mergedSheet();
    setCellStyle(
      sheet,
      { row: 3, column: 3 },
      {
        borderTop: { style: "thick", color: "#ff0000" },
        borderRight: { style: "double", color: "#ff0000" },
      },
    );
    const segments = resolveVisibleBorderSegments(sheet, geometry, visible, { x: 0, y: 0 });
    expect(segments).toHaveLength(4);
    expect(segments).toMatchObject([
      { orientation: "horizontal", edge: 2, start: 2, end: 4, x: 78, y: 38, length: 122 },
      { orientation: "horizontal", edge: 6, start: 2, end: 4, x: 78, y: 118, length: 122 },
      { orientation: "vertical", edge: 2, start: 2, end: 5, x: 78, y: 38, length: 82 },
      { orientation: "vertical", edge: 5, start: 2, end: 5, x: 198, y: 38, length: 82 },
    ]);
    expect(
      segments.every((segment) => segment.style === border.style && segment.color === border.color),
    ).toBe(true);
  });

  test("keeps the far edges visible when the merge anchor is outside the viewport", () => {
    const segments = resolveVisibleBorderSegments(
      mergedSheet(),
      geometry,
      { startRow: 4, endRow: 7, startColumn: 3, endColumn: 6 },
      { x: 120, y: 80 },
    );
    expect(segments).toHaveLength(2);
    expect(segments).toMatchObject([
      { orientation: "horizontal", edge: 6, start: 3, end: 4, x: 0, y: 38, length: 80 },
      { orientation: "vertical", edge: 5, start: 4, end: 5, x: 78, y: 0, length: 40 },
    ]);
  });

  test("keeps upper and left neighbor precedence against a merged perimeter", () => {
    const sheet = mergedSheet();
    const neighbor = { style: "double", color: "#ff0000" } as const;
    setCellStyle(sheet, { row: 1, column: 3 }, { borderBottom: neighbor });
    setCellStyle(sheet, { row: 4, column: 1 }, { borderRight: neighbor });
    const segments = resolveVisibleBorderSegments(sheet, geometry, visible, { x: 0, y: 0 });
    expect(segments.find((segment) => segment.key === "horizontal:2:3-3")).toMatchObject({
      style: "double",
      color: "#ff0000",
    });
    expect(segments.find((segment) => segment.key === "vertical:2:4-4")).toMatchObject({
      style: "double",
      color: "#ff0000",
    });
    expect(
      segments.some(
        (segment) => segment.orientation === "horizontal" && segment.edge > 2 && segment.edge < 6,
      ),
    ).toBe(false);
  });

  test("uses collapsed merged boundaries when its first and last rows are hidden", () => {
    const sheet = mergedSheet();
    const rows = createRowVisibilityIndex({
      rowCount: 12,
      defaultRowHeight: 20,
      hiddenIntervals: [
        { start: 2, end: 2 },
        { start: 5, end: 5 },
      ],
    });
    const segments = resolveVisibleBorderSegments(
      sheet,
      geometry,
      visible,
      { x: 0, y: 0 },
      rows,
      [0, 1, 3, 4, 6, 7, 8],
    );
    expect(segments).toHaveLength(4);
    expect(segments.filter((segment) => segment.orientation === "horizontal")).toMatchObject([
      { edge: 3, y: 38, length: 122 },
      { edge: 6, y: 78, length: 122 },
    ]);
    expect(segments.filter((segment) => segment.orientation === "vertical")).toMatchObject([
      { edge: 2, y: 38, length: 42 },
      { edge: 5, y: 38, length: 42 },
    ]);
  });

  test("draws each diagonal once across the entire merge with an offscreen anchor", () => {
    const sheet = mergedSheet();
    setCellStyle(
      sheet,
      { row: 2, column: 2 },
      { borderDiagonalUp: border, borderDiagonalDown: border },
    );
    setCellStyle(
      sheet,
      { row: 4, column: 3 },
      { borderDiagonalDown: { style: "thin", color: "#ff0000" } },
    );
    const segments = resolveVisibleDiagonalBorderSegments(
      sheet,
      geometry,
      visible,
      { x: 120, y: 80 },
      undefined,
      [4, 5, 6],
      [3, 4, 5],
    );
    expect(segments).toHaveLength(2);
    expect(segments).toMatchObject([
      {
        direction: "up",
        row: 2,
        column: 2,
        x: -40,
        y: -40,
        width: 120,
        height: 80,
        color: border.color,
      },
      {
        direction: "down",
        row: 2,
        column: 2,
        x: -40,
        y: -40,
        width: 120,
        height: 80,
        color: border.color,
      },
    ]);
    expect(segments[0]?.length).toBeCloseTo(Math.hypot(120, 80));
  });
});
