import { describe, expect, test } from "vitest";
import { getCellFormatBorderCapabilities } from "../../../modules/cell-format/border-capabilities";

function range(startRow: number, startColumn: number, endRow: number, endColumn: number) {
  return {
    start: { row: startRow, column: startColumn },
    end: { row: endRow, column: endColumn },
  };
}

describe("cell format border capabilities", () => {
  test("excludes unavailable internal edges for single-cell and one-dimensional selections", () => {
    expect(getCellFormatBorderCapabilities(range(2, 2, 2, 2), [])).toEqual({
      innerHorizontal: false,
      innerVertical: false,
    });
    expect(getCellFormatBorderCapabilities(range(2, 2, 2, 4), [])).toEqual({
      innerHorizontal: false,
      innerVertical: true,
    });
    expect(getCellFormatBorderCapabilities(range(2, 2, 4, 2), [])).toEqual({
      innerHorizontal: true,
      innerVertical: false,
    });
  });

  test("allows each internal edge only when a physical track exists", () => {
    expect(getCellFormatBorderCapabilities(range(2, 2, 3, 3), [])).toEqual({
      innerHorizontal: true,
      innerVertical: true,
    });
    expect(getCellFormatBorderCapabilities(range(2, 2, 3, 3), [range(2, 2, 3, 3)])).toEqual({
      innerHorizontal: false,
      innerVertical: false,
    });
  });

  test("preserves boundaries between neighboring merges and excludes their internal tracks", () => {
    expect(
      getCellFormatBorderCapabilities(range(0, 0, 1, 3), [range(0, 0, 1, 1), range(0, 2, 1, 3)]),
    ).toEqual({
      innerHorizontal: false,
      innerVertical: true,
    });
    expect(
      getCellFormatBorderCapabilities(range(0, 0, 1, 3), [range(0, 0, 0, 3), range(1, 0, 1, 3)]),
    ).toEqual({
      innerHorizontal: true,
      innerVertical: false,
    });
    expect(
      getCellFormatBorderCapabilities(range(0, 0, 2, 3), [range(0, 0, 1, 3), range(5, 5, 6, 6)]),
    ).toEqual({
      innerHorizontal: true,
      innerVertical: true,
    });
  });

  test("handles large merged selections without traversing their cells", () => {
    const large = range(0, 0, 999999, 9999);
    expect(getCellFormatBorderCapabilities(large, [large])).toEqual({
      innerHorizontal: false,
      innerVertical: false,
    });
  });
});
