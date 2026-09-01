import { describe, expect, test } from "vitest";
import {
  resolveBorderJunctions,
  resolveVisibleBorderSegments,
  resolveVisibleDiagonalBorderSegments,
  type SheetBorderSegment,
} from "../../../../modules/sheet-grid/border-presentation";
import { createSheetGeometry } from "../../../../modules/sheet-grid/geometry";
import { createSheet, setCellStyle } from "@idea10/core/workbook";

function coversPoint(segment: SheetBorderSegment, x: number, y: number): boolean {
  if (segment.orientation === "horizontal") {
    return (
      x >= segment.x &&
      x < segment.x + segment.length &&
      y >= segment.y &&
      y < segment.y + segment.thickness
    );
  }
  return (
    x >= segment.x &&
    x < segment.x + segment.thickness &&
    y >= segment.y &&
    y < segment.y + segment.length
  );
}

describe("sheet border presentation", () => {
  test("resolves both diagonal directions against each visible cell geometry", () => {
    const sheet = createSheet();
    setCellStyle(
      sheet,
      { row: 0, column: 0 },
      {
        borderDiagonalUp: { style: "thin", color: "#112233" },
        borderDiagonalDown: { style: "medium", color: "#445566" },
      },
    );
    setCellStyle(
      sheet,
      { row: 1, column: 1 },
      {
        borderDiagonalUp: { style: "double", color: "#778899" },
      },
    );
    const geometry = createSheetGeometry({
      rowCount: 2,
      columnCount: 2,
      rowHeight: 30,
      columnWidth: 40,
    });

    const segments = resolveVisibleDiagonalBorderSegments(
      sheet,
      geometry,
      { startRow: 0, endRow: 0, startColumn: 0, endColumn: 0 },
      { x: 5, y: 7 },
    );

    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({
      direction: "up",
      row: 0,
      column: 0,
      x: -5,
      y: -7,
      width: 40,
      height: 30,
      length: 50,
      thickness: 1,
      css: "1px solid #112233",
    });
    expect(segments[0]?.angle).toBeCloseTo(-36.87, 2);
    expect(segments[1]).toMatchObject({
      direction: "down",
      thickness: 2,
      css: "2px solid #445566",
    });
    expect(segments[1]?.angle).toBeCloseTo(36.87, 2);
  });

  test("resolves a 3 by 3 grid into continuous runs that own every center intersection", () => {
    const sheet = createSheet();
    const border = { style: "thin", color: "#20242c" } as const;
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        setCellStyle(
          sheet,
          { row, column },
          {
            borderTop: border,
            borderRight: border,
            borderBottom: border,
            borderLeft: border,
          },
        );
      }
    }
    const geometry = createSheetGeometry({ rowCount: 3, columnCount: 3 });
    const segments = resolveVisibleBorderSegments(
      sheet,
      geometry,
      { startRow: 0, endRow: 2, startColumn: 0, endColumn: 2 },
      { x: 0, y: 0 },
    );

    expect(segments).toHaveLength(8);
    expect(segments.filter(({ orientation }) => orientation === "horizontal")).toHaveLength(4);
    expect(segments.filter(({ orientation }) => orientation === "vertical")).toHaveLength(4);

    const centerIntersections: [number, number][] = [
      [95, 23],
      [191, 23],
      [95, 47],
      [191, 47],
    ];
    for (const [x, y] of centerIntersections) {
      const owners = segments.filter((segment) => coversPoint(segment, x, y));
      expect(owners.some(({ orientation }) => orientation === "horizontal")).toBe(true);
      expect(owners.some(({ orientation }) => orientation === "vertical")).toBe(true);
    }
  });

  test("uses upper and left owners for shared-edge conflicts", () => {
    const sheet = createSheet();
    setCellStyle(
      sheet,
      { row: 0, column: 0 },
      {
        borderRight: { style: "medium", color: "#112233" },
        borderBottom: { style: "dashed", color: "#445566" },
      },
    );
    setCellStyle(
      sheet,
      { row: 0, column: 1 },
      {
        borderLeft: { style: "double", color: "#778899" },
      },
    );
    setCellStyle(
      sheet,
      { row: 1, column: 0 },
      {
        borderTop: { style: "dotted", color: "#aabbcc" },
      },
    );
    const segments = resolveVisibleBorderSegments(
      sheet,
      createSheetGeometry({ rowCount: 2, columnCount: 2 }),
      { startRow: 0, endRow: 1, startColumn: 0, endColumn: 1 },
      { x: 0, y: 0 },
    );

    expect(segments.find(({ key }) => key === "vertical:1:0-0")).toMatchObject({
      x: 94,
      placement: "before",
      thickness: 2,
      css: "2px solid #112233",
    });
    expect(segments.find(({ key }) => key === "horizontal:1:0-0")).toMatchObject({
      y: 23,
      placement: "before",
      thickness: 1,
      css: "1px dashed #445566",
    });
  });

  test("aligns a selected range's borders with the existing gridline tracks", () => {
    const sheet = createSheet();
    const border = { style: "thin", color: "#20242c" } as const;
    setCellStyle(
      sheet,
      { row: 1, column: 1 },
      {
        borderTop: border,
        borderRight: border,
        borderBottom: border,
        borderLeft: border,
      },
    );
    const segments = resolveVisibleBorderSegments(
      sheet,
      createSheetGeometry({ rowCount: 3, columnCount: 3 }),
      { startRow: 0, endRow: 2, startColumn: 0, endColumn: 2 },
      { x: 0, y: 0 },
    );

    expect(segments.find(({ key }) => key === "horizontal:1:1-1")).toMatchObject({
      x: 95,
      y: 23,
      length: 97,
      placement: "before",
    });
    expect(segments.find(({ key }) => key === "vertical:1:1-1")).toMatchObject({
      x: 95,
      y: 23,
      length: 25,
      placement: "before",
    });
    expect(segments.find(({ key }) => key === "horizontal:2:1-1")).toMatchObject({
      y: 47,
      placement: "before",
    });
    expect(segments.find(({ key }) => key === "vertical:2:1-1")).toMatchObject({
      x: 191,
      placement: "before",
    });
    const topLeftOwners = segments.filter((segment) => coversPoint(segment, 95, 23));
    expect(topLeftOwners.some(({ orientation }) => orientation === "horizontal")).toBe(true);
    expect(topLeftOwners.some(({ orientation }) => orientation === "vertical")).toBe(true);
  });

  test("resolves virtual-range boundaries from off-range owners", () => {
    const sheet = createSheet();
    setCellStyle(
      sheet,
      { row: 2, column: 4 },
      {
        borderBottom: { style: "medium", color: "#112233" },
      },
    );
    setCellStyle(
      sheet,
      { row: 3, column: 3 },
      {
        borderRight: { style: "double", color: "#445566" },
      },
    );
    setCellStyle(
      sheet,
      { row: 3, column: 4 },
      {
        borderTop: { style: "thin", color: "#778899" },
        borderLeft: { style: "thin", color: "#aabbcc" },
      },
    );
    const geometry = createSheetGeometry({ rowCount: 10, columnCount: 10 });
    const segments = resolveVisibleBorderSegments(
      sheet,
      geometry,
      { startRow: 3, endRow: 4, startColumn: 4, endColumn: 5 },
      { x: 384, y: 72 },
    );

    expect(segments.find(({ key }) => key === "horizontal:3:4-4")).toMatchObject({
      x: 0,
      y: 0,
      length: 96,
      thickness: 2,
      css: "2px solid #112233",
    });
    expect(segments.find(({ key }) => key === "vertical:4:3-3")).toMatchObject({
      x: 0,
      y: 0,
      length: 24,
      thickness: 3,
      css: "3px double #445566",
    });
  });

  test("keeps partially clipped thick borders on their physical grid track", () => {
    const sheet = createSheet();
    setCellStyle(
      sheet,
      { row: 2, column: 2 },
      {
        borderRight: { style: "double", color: "#112233" },
        borderBottom: { style: "double", color: "#445566" },
      },
    );
    const segments = resolveVisibleBorderSegments(
      sheet,
      createSheetGeometry({ rowCount: 6, columnCount: 6 }),
      { startRow: 2, endRow: 3, startColumn: 2, endColumn: 3 },
      { x: 286, y: 70 },
    );

    expect(segments.find(({ key }) => key === "horizontal:3:2-2")).toMatchObject({ y: -1 });
    expect(segments.find(({ key }) => key === "vertical:3:2-2")).toMatchObject({ x: -1 });
  });

  test("gives every crossing a deterministic one-pixel owner", () => {
    const sheet = createSheet();
    setCellStyle(
      sheet,
      { row: 0, column: 0 },
      {
        borderRight: { style: "double", color: "#112233" },
        borderBottom: { style: "double", color: "#445566" },
      },
    );
    const segments = resolveVisibleBorderSegments(
      sheet,
      createSheetGeometry({ rowCount: 2, columnCount: 2 }),
      { startRow: 0, endRow: 1, startColumn: 0, endColumn: 1 },
      { x: 0, y: 0 },
    );
    const junctions = resolveBorderJunctions(segments);

    expect(junctions.find(({ key }) => key === "junction:1:1")).toEqual({
      key: "junction:1:1",
      rowEdge: 1,
      columnEdge: 1,
      x: 94,
      y: 22,
      color: "#112233",
    });
  });
});
