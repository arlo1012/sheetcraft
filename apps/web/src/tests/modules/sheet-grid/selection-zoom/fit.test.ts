import { describe, expect, test } from "vitest";
import { getSelectionFitZoom } from "../../../../modules/sheet-grid/selection-zoom";

const viewportSize = { width: 808, height: 608 };
const headerSize = { width: 48, height: 28 };

describe("selection fit zoom", () => {
  test("fits the complete selection with room for headers and its outline", () => {
    expect(
      getSelectionFitZoom({
        selectionRect: { x: 600, y: 200, width: 960, height: 240 },
        viewportSize,
        headerSize,
        frozenSize: { width: 0, height: 0 },
      }),
    ).toBe(79);
  });

  test("reserves frozen panes when the selection starts in the scrolling body", () => {
    expect(
      getSelectionFitZoom({
        selectionRect: { x: 600, y: 200, width: 800, height: 400 },
        viewportSize,
        headerSize,
        frozenSize: { width: 200, height: 40 },
      }),
    ).toBe(76);
  });

  test("counts a selection crossing frozen panes only once", () => {
    expect(
      getSelectionFitZoom({
        selectionRect: { x: 80, y: 20, width: 600, height: 400 },
        viewportSize,
        headerSize,
        frozenSize: { width: 200, height: 40 },
      }),
    ).toBe(109);
  });

  test("keeps the supported zoom bounds and ignores completely hidden ranges", () => {
    const options = { viewportSize, headerSize, frozenSize: { width: 0, height: 0 } };
    expect(
      getSelectionFitZoom({ ...options, selectionRect: { x: 0, y: 0, width: 48, height: 24 } }),
    ).toBe(400);
    expect(
      getSelectionFitZoom({
        ...options,
        selectionRect: { x: 0, y: 0, width: 10000, height: 10000 },
      }),
    ).toBe(10);
    expect(
      getSelectionFitZoom({ ...options, selectionRect: { x: 0, y: 0, width: 200, height: 0 } }),
    ).toBeUndefined();
  });
});
