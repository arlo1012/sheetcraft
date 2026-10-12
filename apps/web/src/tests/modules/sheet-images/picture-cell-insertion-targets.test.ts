// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import type { CellContent } from "@sheetcraft/core/formula";
import {
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  createCellKey,
  createSheet,
  getCellContent,
  setCellContent,
  setCellStyle,
  type CellAddress,
} from "@sheetcraft/core/workbook";
import {
  capturePictureCellInsertionTargets,
  isPictureCellInsertionTargetsCurrent,
} from "../../../modules/sheet-images/picture-cell-insertion-targets";

const anchor = { row: 2, column: 3 },
  tail = { row: 4, column: 5 };

function fixture() {
  return createSheet("Insertion", "insertion-sheet");
}

const occupiedContents: CellContent[] = [
  { kind: "literal", value: "original" },
  { kind: "literal", value: "" },
  { kind: "literal", value: 0 },
  { kind: "literal", value: false },
  {
    kind: "literal",
    value: "Mixed fonts",
    fontRuns: [{ start: 0, end: 5, fontFamily: "Arial" }],
  },
  { kind: "formula", formula: { source: '=IF(A1="","",A1)' } },
  { kind: "error", error: { kind: "formula-error", code: "DIV0" } },
  {
    kind: "image",
    image: {
      assetId: "original-image",
      altText: "Original",
      transform: { appearance: { opacity: 0.6, border: { color: "#123456", width: 2 } } },
    },
  },
  {
    kind: "image",
    image: {
      assetId: "original-framed-image",
      altText: "Original framed",
      frame: {
        kind: "cell-picture-frame-v1",
        size: { width: 120, height: 80 },
        source: { widthRatio: 2, heightRatio: 1, offsetXRatio: -0.2, offsetYRatio: 0 },
        angleDeg: 37,
      },
      lockAspectRatio: true,
    },
  },
];

describe("local picture cell insertion target leases", () => {
  test.each(occupiedContents)("captures occupied %o content without mutation", (content) => {
    const sheet = fixture();
    setCellContent(sheet, anchor, content);
    const before = structuredClone(sheet),
      lease = capturePictureCellInsertionTargets(sheet, [anchor]);
    expect(lease.addresses).toEqual([anchor]);
    expect(lease.occupiedAddresses).toEqual([anchor]);
    expect(lease.contents[0]!.get(createCellKey(anchor))).toEqual(getCellContent(sheet, anchor));
    expect(lease.contents[0]!.get(createCellKey(anchor))).not.toBe(
      sheet.cells.get(createCellKey(anchor))!.content,
    );
    expect(isPictureCellInsertionTargetsCurrent(sheet, lease)).toBe(true);
    expect(sheet).toEqual(before);
    setCellContent(sheet, anchor, { kind: "literal", value: "late edit" });
    const edited = structuredClone(sheet);
    expect(isPictureCellInsertionTargetsCurrent(sheet, lease)).toBe(false);
    expect(sheet).toEqual(edited);
  });

  test("canonical merged anchors summarize all sparse content, including hidden tails", () => {
    const sheet = fixture(),
      requested = { ...tail },
      blank = { row: 6, column: 3 };
    sheet.mergedCells = [{ start: anchor, end: tail }];
    setCellContent(sheet, tail, { kind: "literal", value: "hidden tail content" });
    const before = structuredClone(sheet),
      lease = capturePictureCellInsertionTargets(sheet, [requested, blank]);
    expect(lease.addresses).toEqual([anchor, blank]);
    expect(lease.ranges).toEqual([
      { start: anchor, end: tail },
      { start: blank, end: blank },
    ]);
    expect(lease.occupiedAddresses).toEqual([anchor]);
    expect(lease.contents[0]!.get(createCellKey(tail))).toEqual({
      kind: "literal",
      value: "hidden tail content",
    });
    expect(lease.ranges[0]).not.toBe(sheet.mergedCells[0]);
    expect(lease.merges[0]![0]).not.toBe(sheet.mergedCells[0]);
    requested.row = 20;
    expect(lease.requestedAddresses).toEqual([tail, blank]);
    expect(isPictureCellInsertionTargetsCurrent(sheet, lease)).toBe(true);
    expect(sheet).toEqual(before);
  });

  test.each(["addition", "removal", "change"] as const)(
    "late merged-tail content %s invalidates the whole batch",
    (change) => {
      const sheet = fixture();
      sheet.mergedCells = [{ start: anchor, end: tail }];
      if (change !== "addition")
        setCellContent(sheet, tail, { kind: "literal", value: "original" });
      const lease = capturePictureCellInsertionTargets(sheet, [anchor, { row: 7, column: 3 }]);
      setCellContent(
        sheet,
        tail,
        change === "removal" ? null : { kind: "formula", formula: { source: "=1+2" } },
      );
      const before = structuredClone(sheet);
      expect(isPictureCellInsertionTargetsCurrent(sheet, lease)).toBe(false);
      expect(sheet).toEqual(before);
    },
  );

  test("blank later batch targets are captured before asynchronous work starts", () => {
    const sheet = fixture(),
      second = { row: 3, column: 3 },
      lease = capturePictureCellInsertionTargets(sheet, [anchor, second]);
    expect(lease.occupiedAddresses).toEqual([]);
    setCellContent(sheet, second, { kind: "literal", value: "late second-cell edit" });
    expect(isPictureCellInsertionTargetsCurrent(sheet, lease)).toBe(false);
  });

  test("cell styles and unrelated edits do not invalidate captured content", () => {
    const sheet = fixture();
    setCellContent(sheet, anchor, { kind: "literal", value: "original" });
    const blank = { row: 8, column: 3 },
      lease = capturePictureCellInsertionTargets(sheet, [anchor, blank]);
    setCellStyle(sheet, anchor, { bold: true, fontFamily: "Arial" });
    setCellStyle(sheet, blank, { bold: true });
    setCellContent(sheet, { row: 100, column: 100 }, { kind: "literal", value: "unrelated" });
    sheet.mergedCells = [{ start: { row: 10, column: 10 }, end: { row: 11, column: 11 } }];
    const before = structuredClone(sheet);
    expect(lease.occupiedAddresses).toEqual([anchor]);
    expect(isPictureCellInsertionTargetsCurrent(sheet, lease)).toBe(true);
    expect(sheet).toEqual(before);
  });

  test("nested font runs are detached and their edits invalidate the lease", () => {
    const sheet = fixture();
    setCellContent(sheet, anchor, occupiedContents[4]!);
    const lease = capturePictureCellInsertionTargets(sheet, [anchor]),
      captured = lease.contents[0]!.get(createCellKey(anchor))!,
      actual = sheet.cells.get(createCellKey(anchor))!.content!;
    if (captured.kind !== "literal" || actual.kind !== "literal") throw Error("Expected text");
    expect(captured.fontRuns).not.toBe(actual.fontRuns);
    expect(captured.fontRuns![0]).not.toBe(actual.fontRuns![0]);
    actual.fontRuns = [{ start: 0, end: 5, fontFamily: "Georgia" }];
    expect(captured.fontRuns).toEqual([{ start: 0, end: 5, fontFamily: "Arial" }]);
    expect(isPictureCellInsertionTargetsCurrent(sheet, lease)).toBe(false);
  });

  test("nested cell-picture frame metadata is detached and checked", () => {
    const sheet = fixture();
    setCellContent(sheet, anchor, occupiedContents[8]!);
    const lease = capturePictureCellInsertionTargets(sheet, [anchor]),
      captured = lease.contents[0]!.get(createCellKey(anchor))!,
      actual = sheet.cells.get(createCellKey(anchor))!.content!;
    if (
      captured.kind !== "image" ||
      actual.kind !== "image" ||
      !captured.image.frame ||
      !actual.image.frame
    )
      throw Error("Expected framed cell picture");
    expect(captured.image.frame).not.toBe(actual.image.frame);
    expect(captured.image.frame.source).not.toBe(actual.image.frame.source);
    actual.image.frame.source.widthRatio = 3;
    expect(captured.image.frame.source.widthRatio).toBe(2);
    expect(isPictureCellInsertionTargetsCurrent(sheet, lease)).toBe(false);
  });

  test.each(["add", "remove", "resize", "anchor", "same-bounds-topology"] as const)(
    "changed merge %s invalidates the lease",
    (change) => {
      const sheet = fixture();
      if (change !== "add") sheet.mergedCells = [{ start: anchor, end: tail }];
      const lease = capturePictureCellInsertionTargets(sheet, [tail]);
      if (change === "add") sheet.mergedCells = [{ start: anchor, end: tail }];
      if (change === "remove") sheet.mergedCells = [];
      if (change === "resize")
        sheet.mergedCells[0]!.end = { row: tail.row + 1, column: tail.column };
      if (change === "anchor")
        sheet.mergedCells[0]!.start = { row: anchor.row - 1, column: anchor.column };
      if (change === "same-bounds-topology") sheet.mergedCells.push({ start: tail, end: tail });
      const before = structuredClone(sheet);
      expect(isPictureCellInsertionTargetsCurrent(sheet, lease)).toBe(false);
      expect(sheet).toEqual(before);
    },
  );

  test("a partly locked merged range rejects capture and later permission loss", () => {
    const sheet = fixture();
    sheet.mergedCells = [{ start: anchor, end: { ...anchor, column: anchor.column + 1 } }];
    const lease = capturePictureCellInsertionTargets(sheet, [anchor]);
    sheet.properties.protected = true;
    setCellStyle(sheet, anchor, { unlocked: true });
    const before = structuredClone(sheet);
    expect(() => capturePictureCellInsertionTargets(sheet, [anchor])).toThrow(/editable/);
    expect(isPictureCellInsertionTargetsCurrent(sheet, lease)).toBe(false);
    expect(sheet).toEqual(before);
    setCellStyle(sheet, { ...anchor, column: anchor.column + 1 }, { unlocked: true });
    expect(isPictureCellInsertionTargetsCurrent(sheet, lease)).toBe(true);
  });

  test("giant empty merged areas only walk the sparse content records", () => {
    const sheet = fixture(),
      origin = { row: 0, column: 0 },
      last = { row: MAX_SHEET_ROWS - 1, column: MAX_SHEET_COLUMNS - 1 };
    sheet.mergedCells = [{ start: origin, end: last }];
    setCellContent(sheet, last, { kind: "literal", value: "far sparse tail" });
    const get = vi.spyOn(sheet.cells, "get"),
      before = structuredClone(sheet),
      lease = capturePictureCellInsertionTargets(sheet, [last]);
    expect(lease.addresses).toEqual([origin]);
    expect(lease.occupiedAddresses).toEqual([origin]);
    expect(lease.contents[0]!.size).toBe(1);
    expect(isPictureCellInsertionTargetsCurrent(sheet, lease)).toBe(true);
    expect(get).not.toHaveBeenCalled();
    expect(sheet).toEqual(before);
  });

  test.each([
    { row: -1, column: 0 },
    { row: 0, column: -1 },
    { row: MAX_SHEET_ROWS, column: 0 },
    { row: 0, column: MAX_SHEET_COLUMNS },
    { row: 0.5, column: 0 },
    { row: Number.NaN, column: 0 },
    { row: 0, column: Number.POSITIVE_INFINITY },
  ])("rejects an invalid target %o without mutation", (address) => {
    const sheet = fixture(),
      before = structuredClone(sheet);
    expect(() => capturePictureCellInsertionTargets(sheet, [address])).toThrow();
    expect(sheet).toEqual(before);
  });

  test("bounded counts and duplicate or overlapping destinations reject atomically", () => {
    const sheet = fixture(),
      hundred = Array.from({ length: 100 }, (_, row) => ({ row, column: 0 }));
    expect(capturePictureCellInsertionTargets(sheet, hundred).addresses).toHaveLength(100);
    const before = structuredClone(sheet);
    expect(() => capturePictureCellInsertionTargets(sheet, [])).toThrow();
    expect(() =>
      capturePictureCellInsertionTargets(sheet, [...hundred, { row: 100, column: 0 }]),
    ).toThrow();
    expect(() => capturePictureCellInsertionTargets(sheet, [anchor, anchor])).toThrow(/overlap/);
    const sparse: CellAddress[] = [];
    sparse.length = 1;
    expect(() => capturePictureCellInsertionTargets(sheet, sparse)).toThrow();
    expect(sheet).toEqual(before);
    sheet.mergedCells = [{ start: anchor, end: tail }];
    const merged = structuredClone(sheet);
    expect(() => capturePictureCellInsertionTargets(sheet, [anchor, tail])).toThrow(/overlap/);
    expect(sheet).toEqual(merged);
  });
});
