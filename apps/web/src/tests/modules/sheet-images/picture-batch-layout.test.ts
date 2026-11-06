// 未执行：按用户要求仅编写测试，避免额外内存占用。
import { describe, expect, test } from "vitest";
import {
  createWorkbook,
  getActiveSheet,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
} from "@sheetcraft/core/workbook";
import {
  getPictureBatchCellAddresses,
  getPictureBatchCellLayout,
  getPictureBatchCellFrames,
  getPictureBatchFloatingOffsets,
} from "../../../modules/sheet-images/picture-batch-layout";

function sheet() {
  return getActiveSheet(createWorkbook({ id: "batch-layout", sheetId: "sheet" }));
}

describe("batch picture caption reservations", () => {
  test.each([
    {
      arrangement: "horizontal",
      placement: "after",
      pictures: [
        { row: 2, column: 3 },
        { row: 2, column: 4 },
        { row: 4, column: 3 },
      ],
      names: [
        { row: 3, column: 3 },
        { row: 3, column: 4 },
        { row: 5, column: 3 },
      ],
    },
    {
      arrangement: "horizontal",
      placement: "before",
      pictures: [
        { row: 3, column: 3 },
        { row: 3, column: 4 },
        { row: 5, column: 3 },
      ],
      names: [
        { row: 2, column: 3 },
        { row: 2, column: 4 },
        { row: 4, column: 3 },
      ],
    },
    {
      arrangement: "vertical",
      placement: "after",
      pictures: [
        { row: 2, column: 3 },
        { row: 3, column: 3 },
        { row: 2, column: 5 },
      ],
      names: [
        { row: 2, column: 4 },
        { row: 3, column: 4 },
        { row: 2, column: 6 },
      ],
    },
    {
      arrangement: "vertical",
      placement: "before",
      pictures: [
        { row: 2, column: 4 },
        { row: 3, column: 4 },
        { row: 2, column: 6 },
      ],
      names: [
        { row: 2, column: 3 },
        { row: 3, column: 3 },
        { row: 2, column: 5 },
      ],
    },
  ] as const)(
    "reserves $placement captions for $arrangement placement without colliding with the next band",
    ({ arrangement, placement, pictures, names }) => {
      expect(
        getPictureBatchCellLayout(sheet(), { row: 2, column: 3 }, 3, arrangement, 2, placement),
      ).toEqual({ pictures, names });
    },
  );

  test("reserves full merged picture and caption regions before placing the next wrapped row", () => {
    const source = sheet();
    source.mergedCells = [
      { start: { row: 1, column: 1 }, end: { row: 2, column: 2 } },
      { start: { row: 3, column: 1 }, end: { row: 4, column: 2 } },
      { start: { row: 2, column: 3 }, end: { row: 3, column: 4 } },
    ];
    expect(
      getPictureBatchCellLayout(source, { row: 1, column: 1 }, 3, "horizontal", 2, "after"),
    ).toEqual({
      pictures: [
        { row: 1, column: 1 },
        { row: 1, column: 3 },
        { row: 5, column: 1 },
      ],
      names: [
        { row: 3, column: 1 },
        { row: 2, column: 3 },
        { row: 6, column: 1 },
      ],
    });
  });

  test.each([
    ["horizontal", { row: MAX_SHEET_ROWS - 1, column: 0 }],
    ["vertical", { row: 0, column: MAX_SHEET_COLUMNS - 1 }],
  ] as const)(
    "rejects %s placement when the caption would cross the sheet boundary",
    (arrangement, start) => {
      expect(() =>
        getPictureBatchCellLayout(sheet(), start, 1, arrangement, undefined, "after"),
      ).toThrow(RangeError);
    },
  );

  test("keeps the original picture-only layout when captions are disabled", () => {
    expect(getPictureBatchCellLayout(sheet(), { row: 2, column: 3 }, 2, "vertical")).toEqual({
      pictures: [
        { row: 2, column: 3 },
        { row: 3, column: 3 },
      ],
      names: [],
    });
  });
});

describe("batch floating pictures fitted to cells", () => {
  test("centers a proportional image inside a cell with a two-pixel minimum inset", () => {
    const source = sheet();
    source.defaultColumnWidth = 120;
    source.defaultRowHeight = 80;
    const [frame] = getPictureBatchCellFrames(
      source,
      [{ row: 2, column: 3 }],
      [{ width: 200, height: 100 }],
    );
    expect(frame).toMatchObject({ anchor: { row: 2, column: 3 } });
    expect(frame!.offsetX).toBeCloseTo(2);
    expect(frame!.offsetY).toBeCloseTo(11);
    expect(frame!.width).toBeCloseTo(116);
    expect(frame!.height).toBeCloseTo(58);
  });

  test("fits the entire merged cell area using custom row and column sizes", () => {
    const source = sheet();
    source.columnWidths.set(1, 70);
    source.columnWidths.set(2, 90);
    source.rowHeights.set(1, 30);
    source.rowHeights.set(2, 50);
    source.mergedCells = [{ start: { row: 1, column: 1 }, end: { row: 2, column: 2 } }];
    expect(
      getPictureBatchCellFrames(source, [{ row: 1, column: 1 }], [{ width: 100, height: 100 }]),
    ).toEqual([{ anchor: { row: 1, column: 1 }, offsetX: 42, offsetY: 2, width: 76, height: 76 }]);
  });

  test("uses the proposed row height for fitting without changing sheet geometry", () => {
    const source = sheet();
    source.defaultColumnWidth = 120;
    source.rowHeights.set(2, 30);
    const before = [...source.rowHeights];
    const [frame] = getPictureBatchCellFrames(
      source,
      [{ row: 2, column: 3 }],
      [{ width: 200, height: 100 }],
      100,
    );
    expect(frame).toMatchObject({ anchor: { row: 2, column: 3 } });
    expect(frame!.offsetX).toBeCloseTo(2);
    expect(frame!.offsetY).toBeCloseTo(21);
    expect(frame!.width).toBeCloseTo(116);
    expect(frame!.height).toBeCloseTo(58);
    expect([...source.rowHeights]).toEqual(before);
  });

  test("rejects a destination too small to retain the picture's inset", () => {
    const source = sheet();
    source.hiddenColumns = new Set([3]);
    expect(() =>
      getPictureBatchCellFrames(source, [{ row: 2, column: 3 }], [{ width: 200, height: 100 }]),
    ).toThrow(RangeError);
  });
});

describe("batch picture cell layout", () => {
  test.each([
    {
      arrangement: "horizontal",
      expected: [
        { row: 2, column: 3 },
        { row: 2, column: 4 },
        { row: 3, column: 3 },
        { row: 3, column: 4 },
        { row: 4, column: 3 },
      ],
    },
    {
      arrangement: "vertical",
      expected: [
        { row: 2, column: 3 },
        { row: 3, column: 3 },
        { row: 2, column: 4 },
        { row: 3, column: 4 },
        { row: 2, column: 5 },
      ],
    },
  ] as const)(
    "wraps $arrangement cell placement after the requested number of pictures",
    ({ arrangement, expected }) => {
      expect(
        getPictureBatchCellAddresses(sheet(), { row: 2, column: 3 }, 5, arrangement, 2),
      ).toEqual(expected);
    },
  );

  test("starts a wrapped horizontal row after the tallest merged region in the preceding row", () => {
    const source = sheet();
    source.mergedCells = [
      { start: { row: 1, column: 2 }, end: { row: 3, column: 3 } },
      { start: { row: 1, column: 4 }, end: { row: 2, column: 5 } },
      { start: { row: 4, column: 2 }, end: { row: 5, column: 4 } },
    ];
    const addresses = getPictureBatchCellAddresses(
      source,
      { row: 1, column: 2 },
      5,
      "horizontal",
      2,
    );
    expect(addresses).toEqual([
      { row: 1, column: 2 },
      { row: 1, column: 4 },
      { row: 4, column: 2 },
      { row: 4, column: 5 },
      { row: 6, column: 2 },
    ]);
    expect(new Set(addresses.map(({ row, column }) => `${row}:${column}`)).size).toBe(5);
  });

  test("starts a wrapped vertical column after the widest merged region in the preceding column", () => {
    const source = sheet();
    source.mergedCells = [
      { start: { row: 1, column: 2 }, end: { row: 2, column: 4 } },
      { start: { row: 3, column: 2 }, end: { row: 4, column: 3 } },
      { start: { row: 1, column: 5 }, end: { row: 3, column: 6 } },
    ];
    const addresses = getPictureBatchCellAddresses(source, { row: 1, column: 2 }, 5, "vertical", 2);
    expect(addresses).toEqual([
      { row: 1, column: 2 },
      { row: 3, column: 2 },
      { row: 1, column: 5 },
      { row: 4, column: 5 },
      { row: 1, column: 7 },
    ]);
    expect(new Set(addresses.map(({ row, column }) => `${row}:${column}`)).size).toBe(5);
  });

  test.each([
    ["horizontal", { row: MAX_SHEET_ROWS - 1, column: 0 }],
    ["vertical", { row: 0, column: MAX_SHEET_COLUMNS - 1 }],
  ] as const)(
    "rejects a new wrapped %s band that would cross the sheet boundary",
    (arrangement, start) => {
      expect(() => getPictureBatchCellAddresses(sheet(), start, 3, arrangement, 2)).toThrow(
        RangeError,
      );
    },
  );

  test("places vertical images after each merged region without repeating covered cells", () => {
    const source = sheet();
    source.mergedCells = [
      { start: { row: 1, column: 2 }, end: { row: 3, column: 3 } },
      { start: { row: 4, column: 2 }, end: { row: 5, column: 2 } },
    ];
    expect(getPictureBatchCellAddresses(source, { row: 1, column: 2 }, 3, "vertical")).toEqual([
      { row: 1, column: 2 },
      { row: 4, column: 2 },
      { row: 6, column: 2 },
    ]);
  });

  test("places horizontal images after the full width of each merged region", () => {
    const source = sheet();
    source.mergedCells = [
      { start: { row: 1, column: 2 }, end: { row: 2, column: 4 } },
      { start: { row: 1, column: 5 }, end: { row: 1, column: 6 } },
    ];
    expect(getPictureBatchCellAddresses(source, { row: 1, column: 2 }, 3, "horizontal")).toEqual([
      { row: 1, column: 2 },
      { row: 1, column: 5 },
      { row: 1, column: 7 },
    ]);
  });

  test("uses a merged region's anchor when the selected start is inside it", () => {
    const source = sheet();
    source.mergedCells = [{ start: { row: 1, column: 2 }, end: { row: 3, column: 4 } }];
    expect(getPictureBatchCellAddresses(source, { row: 2, column: 3 }, 2, "horizontal")).toEqual([
      { row: 1, column: 2 },
      { row: 2, column: 5 },
    ]);
  });

  test.each(["vertical", "horizontal"] as const)(
    "allows one picture at the last cell for %s placement",
    (arrangement) => {
      const last = { row: MAX_SHEET_ROWS - 1, column: MAX_SHEET_COLUMNS - 1 };
      expect(getPictureBatchCellAddresses(sheet(), last, 1, arrangement)).toEqual([last]);
    },
  );

  test.each([
    ["vertical", { row: MAX_SHEET_ROWS - 1, column: 0 }],
    ["horizontal", { row: 0, column: MAX_SHEET_COLUMNS - 1 }],
  ] as const)("rejects %s placement beyond the sheet boundary", (arrangement, start) => {
    expect(() => getPictureBatchCellAddresses(sheet(), start, 2, arrangement)).toThrow(RangeError);
  });

  test("counts merged extents when determining whether another vertical image can fit", () => {
    const source = sheet();
    source.mergedCells = [
      {
        start: { row: MAX_SHEET_ROWS - 2, column: 0 },
        end: { row: MAX_SHEET_ROWS - 1, column: 0 },
      },
    ];
    expect(() =>
      getPictureBatchCellAddresses(source, { row: MAX_SHEET_ROWS - 2, column: 0 }, 2, "vertical"),
    ).toThrow(RangeError);
  });
});

describe("batch floating picture layout", () => {
  const sizes = [
    { width: 120, height: 80 },
    { width: 200, height: 50 },
    { width: 50, height: 100 },
  ];
  test("separates vertical pictures by twelve pixels using each picture's actual height", () => {
    expect(getPictureBatchFloatingOffsets(sizes, "vertical")).toEqual([
      { offsetX: 0, offsetY: 0 },
      { offsetX: 0, offsetY: 92 },
      { offsetX: 0, offsetY: 154 },
    ]);
  });
  test("separates horizontal pictures by twelve pixels using each picture's actual width", () => {
    expect(getPictureBatchFloatingOffsets(sizes, "horizontal")).toEqual([
      { offsetX: 0, offsetY: 0 },
      { offsetX: 132, offsetY: 0 },
      { offsetX: 344, offsetY: 0 },
    ]);
  });
  test("cascades successive pictures by twenty-four pixels on both axes", () => {
    expect(getPictureBatchFloatingOffsets(sizes, "cascade")).toEqual([
      { offsetX: 0, offsetY: 0 },
      { offsetX: 24, offsetY: 24 },
      { offsetX: 48, offsetY: 48 },
    ]);
  });
  test("does not create offsets for an empty batch", () => {
    expect(getPictureBatchFloatingOffsets([], "vertical")).toEqual([]);
  });

  test.each([
    {
      arrangement: "horizontal",
      expected: [
        { offsetX: 0, offsetY: 0 },
        { offsetX: 132, offsetY: 0 },
        { offsetX: 0, offsetY: 92 },
        { offsetX: 62, offsetY: 92 },
        { offsetX: 0, offsetY: 204 },
      ],
    },
    {
      arrangement: "vertical",
      expected: [
        { offsetX: 0, offsetY: 0 },
        { offsetX: 0, offsetY: 92 },
        { offsetX: 212, offsetY: 0 },
        { offsetX: 212, offsetY: 112 },
        { offsetX: 314, offsetY: 0 },
      ],
    },
  ] as const)(
    "wraps mixed-size floating pictures $arrangement with no overlaps between rows or columns",
    ({ arrangement, expected }) => {
      const mixed = [...sizes, { width: 90, height: 40 }, { width: 75, height: 60 }];
      const offsets = getPictureBatchFloatingOffsets(mixed, arrangement, 2);
      expect(offsets).toEqual(expected);
      for (let first = 0; first < mixed.length; first += 1)
        for (let second = first + 1; second < mixed.length; second += 1) {
          const a = { ...offsets[first]!, ...mixed[first]! };
          const b = { ...offsets[second]!, ...mixed[second]! };
          expect(
            a.offsetX + a.width <= b.offsetX ||
              b.offsetX + b.width <= a.offsetX ||
              a.offsetY + a.height <= b.offsetY ||
              b.offsetY + b.height <= a.offsetY,
          ).toBe(true);
        }
    },
  );

  test("keeps cascade offsets unchanged when a wrap count is provided", () => {
    expect(getPictureBatchFloatingOffsets(sizes, "cascade", 1)).toEqual([
      { offsetX: 0, offsetY: 0 },
      { offsetX: 24, offsetY: 24 },
      { offsetX: 48, offsetY: 48 },
    ]);
  });
});

describe("batch picture wrap validation", () => {
  test.each([0, -1, 1.5, 101, NaN, Infinity])(
    "rejects invalid wrap count %s for cell and floating arrangements",
    (wrapAfter) => {
      for (const arrangement of ["horizontal", "vertical"] as const) {
        expect(() =>
          getPictureBatchCellAddresses(sheet(), { row: 0, column: 0 }, 2, arrangement, wrapAfter),
        ).toThrow(RangeError);
        expect(() =>
          getPictureBatchFloatingOffsets(
            [
              { width: 100, height: 60 },
              { width: 80, height: 90 },
            ],
            arrangement,
            wrapAfter,
          ),
        ).toThrow(RangeError);
      }
    },
  );

  test("accepts one picture per row or column", () => {
    expect(
      getPictureBatchCellAddresses(sheet(), { row: 0, column: 0 }, 2, "horizontal", 1),
    ).toEqual([
      { row: 0, column: 0 },
      { row: 1, column: 0 },
    ]);
    expect(
      getPictureBatchFloatingOffsets(
        [
          { width: 100, height: 60 },
          { width: 80, height: 90 },
        ],
        "vertical",
        1,
      ),
    ).toEqual([
      { offsetX: 0, offsetY: 0 },
      { offsetX: 112, offsetY: 0 },
    ]);
  });

  test("accepts the maximum wrap count without prematurely starting another row or column", () => {
    expect(
      getPictureBatchCellAddresses(sheet(), { row: 0, column: 0 }, 2, "horizontal", 100),
    ).toEqual([
      { row: 0, column: 0 },
      { row: 0, column: 1 },
    ]);
    expect(
      getPictureBatchFloatingOffsets(
        [
          { width: 100, height: 60 },
          { width: 80, height: 90 },
        ],
        "vertical",
        100,
      ),
    ).toEqual([
      { offsetX: 0, offsetY: 0 },
      { offsetX: 0, offsetY: 72 },
    ]);
  });
});
