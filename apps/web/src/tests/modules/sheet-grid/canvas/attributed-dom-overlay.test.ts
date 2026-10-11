import { describe, expect, test } from "vitest";
import type {
  CanvasCell,
  SheetCanvasScene,
} from "../../../../modules/sheet-grid/canvas/cell-scene";
import type { SheetRenderFrame } from "../../../../modules/sheet-grid/rendering/sheet-render-frame";
import { getAttributedDomCells } from "../../../../modules/sheet-grid/canvas/attributed-dom-overlay";
import type { CellTextLayout } from "../../../../shared/cell-text/text-presentation";
import type { PageViewPaintState } from "../../../../modules/page-layout/page-view-types";

const frame = {
  body: { x: 40, y: 24, width: 200, height: 160 },
  layout: { bodyScrollPosition: { x: 100, y: 50 } },
  panes: {
    body: { clip: { x: 50, y: 30, width: 150, height: 130 }, translation: { x: -100, y: -50 } },
    left: { clip: { x: 0, y: 30, width: 50, height: 130 }, translation: { x: 0, y: -50 } },
  },
} as unknown as SheetRenderFrame;
function cell(overrides: Partial<CanvasCell> = {}): CanvasCell {
  return {
    address: { row: 2, column: 3 },
    hasNote: false,
    rect: { x: 120, y: 60, width: 100, height: 50 },
    contentRect: { x: 120, y: 60, width: 100, height: 50 },
    style: undefined,
    content: {
      text: "aא",
      style: undefined,
      textLayout: { canvasBidiRequired: true } as CellTextLayout,
    },
    ...overrides,
  };
}
const scene = (...cells: CanvasCell[]): SheetCanvasScene => ({ panes: [{ id: "body", cells }] });

describe("virtualized attributed DOM projection", () => {
  test("places the full cell relative to the scrolled, clipped pane and header inset", () => {
    const result = getAttributedDomCells({ scene: scene(cell()), frame });
    expect(result).toHaveLength(1);
    expect(result[0]?.clip).toEqual({ x: 90, y: 54, width: 69, height: 29 });
    expect(result[0]?.placement).toEqual({ x: -30, y: -20, width: 99, height: 49 });
  });

  test("does not create DOM for plain Canvas cells, outside cells or editing content", () => {
    const plain = cell({ content: { text: "plain", style: undefined } });
    const outside = cell({ contentRect: { x: 400, y: 60, width: 10, height: 10 } });
    expect(getAttributedDomCells({ scene: scene(plain, outside), frame })).toEqual([]);
    expect(
      getAttributedDomCells({ scene: scene(cell()), frame, editingCell: { row: 2, column: 3 } }),
    ).toEqual([]);
  });

  test("keeps merged fragments isolated across frozen panes", () => {
    const merged = cell({ contentRect: { x: 20, y: 60, width: 200, height: 50 } });
    const split: SheetCanvasScene = {
      panes: [
        { id: "left", cells: [merged] },
        { id: "body", cells: [merged] },
      ],
    };
    const result = getAttributedDomCells({ scene: split, frame });
    expect(result.map((item) => item.paneId)).toEqual(["left", "body"]);
    expect(result[0]?.clip).toEqual({ x: 60, y: 54, width: 30, height: 29 });
    expect(result[1]?.clip).toEqual({ x: 90, y: 54, width: 69, height: 29 });
    expect(result[0]?.key).not.toBe(result[1]?.key);
  });

  test("deduplicates center-across-selection source per pane and hides source while editing", () => {
    const c = cell({
      span: {
        kind: "centerContinuous",
        source: { row: 2, column: 1 },
        range: { start: { row: 2, column: 1 }, end: { row: 2, column: 3 } },
      },
    });
    expect(getAttributedDomCells({ scene: scene(c, c), frame })).toHaveLength(1);
    expect(
      getAttributedDomCells({ scene: scene(c, c), frame, editingCell: { row: 2, column: 1 } }),
    ).toEqual([]);
  });

  test("clips the same logical content to printable page fragments without moving its origin", () => {
    const pageView = {
      mode: "page-layout",
      pages: [
        { contentRect: { x: 160, y: 85, width: 20, height: 20 } },
        { contentRect: { x: 190, y: 85, width: 20, height: 20 } },
      ],
    } as unknown as PageViewPaintState;
    const result = getAttributedDomCells({ scene: scene(cell()), frame, pageView });
    expect(result).toHaveLength(2);
    expect(result[0]?.clip).toEqual({ x: 100, y: 59, width: 20, height: 20 });
    expect(result[0]?.placement).toEqual({ x: -40, y: -25, width: 99, height: 49 });
    expect(result[1]?.clip).toEqual({ x: 130, y: 59, width: 20, height: 20 });
  });
});
