import { describe, expect, test, vi } from "vitest";
import type { PageViewPaintState } from "../../../../modules/page-layout/page-view-types";
import {
  clipPageBreakPreviewPrintArea,
  clipPageBreakPreviewOutside,
  getPageBreakPreviewPrintRect,
  paintPageBreakPreview,
  paintPageBreakPreviewBackground,
} from "../../../../modules/page-layout/rendering/page-view-painter";

const viewport = { width: 100, height: 80 };

function state(printRect: PageViewPaintState["printRect"]): PageViewPaintState {
  return {
    mode: "page-break-preview",
    pages: [],
    printRect,
    rowBreaks: [],
    columnBreaks: [],
    pageLabel: (page) => String(page),
    millimetresPerUnit: 1,
  };
}

function canvas() {
  const fills: Array<{ color: unknown; x: number; y: number; width: number; height: number }> = [];
  let fillStyle: unknown = "";
  const raw = {
    getTransform: vi.fn(() => ({ a: 1, d: 1, e: 0, f: 0 })),
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(value: unknown) {
      fillStyle = value;
    },
    fillRect(x: number, y: number, width: number, height: number) {
      fills.push({ color: fillStyle, x, y, width, height });
    },
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
  };
  const context = raw as unknown as CanvasRenderingContext2D & {
    rect: ReturnType<typeof vi.fn>;
    clip: ReturnType<typeof vi.fn>;
  };
  return { context, fills };
}

describe("page-break preview painter", () => {
  test("uses an opaque gray surface outside the visible print area", () => {
    const { context, fills } = canvas();
    const printed = paintPageBreakPreviewBackground(
      context,
      state({ x: 20, y: 10, width: 40, height: 30 }),
      { x: 0, y: 0 },
      viewport,
      "#ffffff",
    );

    expect(fills).toEqual([
      { color: "#c4c4c4", x: 0, y: 0, width: 100, height: 80 },
      { color: "#ffffff", x: 20, y: 10, width: 40, height: 30 },
    ]);
    expect(printed).toEqual({ x: 20, y: 10, width: 40, height: 30 });
  });

  test("keeps the full viewport gray when the print area is offscreen", () => {
    const { context, fills } = canvas();
    const printed = paintPageBreakPreviewBackground(
      context,
      state({ x: 220, y: 110, width: 40, height: 30 }),
      { x: 0, y: 0 },
      viewport,
      "#ffffff",
    );

    expect(
      getPageBreakPreviewPrintRect(
        state({ x: -40, y: -20, width: 10, height: 10 }),
        { x: 0, y: 0 },
        viewport,
      ),
    ).toBeUndefined();
    expect(printed).toBeUndefined();
    expect(fills).toEqual([{ color: "#c4c4c4", x: 0, y: 0, width: 100, height: 80 }]);

    clipPageBreakPreviewOutside(context, printed, viewport);
    expect(context.rect).toHaveBeenCalledWith(0, 0, 100, 80);
    expect(context.clip).toHaveBeenCalledWith("nonzero");
  });

  test("uses the same snapped print boundary for the inside and outside clips", () => {
    const printed = { x: 10.1, y: 9.9, width: 40.2, height: 30.3 };
    const inside = canvas();
    const outside = canvas();
    const transform = { a: 2.5, d: 2.5, e: 0.3, f: 0.7 };
    vi.mocked(inside.context.getTransform).mockReturnValue(transform as DOMMatrix);
    vi.mocked(outside.context.getTransform).mockReturnValue(transform as DOMMatrix);

    clipPageBreakPreviewPrintArea(inside.context, printed);
    clipPageBreakPreviewOutside(outside.context, printed, viewport);

    expect(outside.context.rect).toHaveBeenLastCalledWith(
      ...vi.mocked(inside.context.rect).mock.calls[0]!,
    );
    for (const [x, y, width, height] of vi.mocked(outside.context.rect).mock.calls) {
      expect(x * transform.a + transform.e).toBeCloseTo(
        Math.round(x * transform.a + transform.e),
        8,
      );
      expect(y * transform.d + transform.f).toBeCloseTo(
        Math.round(y * transform.d + transform.f),
        8,
      );
      expect((x + width) * transform.a + transform.e).toBeCloseTo(
        Math.round((x + width) * transform.a + transform.e),
        8,
      );
      expect((y + height) * transform.d + transform.f).toBeCloseTo(
        Math.round((y + height) * transform.d + transform.f),
        8,
      );
    }
  });

  test("paints an in-range drag candidate last and skips one outside the print area", () => {
    const context = {
      getTransform: vi.fn(() => ({ a: 1, d: 1, e: 0, f: 0 })),
      save: vi.fn(),
      restore: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      setLineDash: vi.fn(),
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 0,
      textAlign: "" as CanvasTextAlign,
      textBaseline: "" as CanvasTextBaseline,
      font: "",
    } as unknown as CanvasRenderingContext2D;
    const preview = Object.assign(state({ x: 10, y: 10, width: 70, height: 50 }), {
      dragBoundary: { axis: "row" as const, offset: 40, removing: false },
    });

    paintPageBreakPreview(context, preview, { x: 0, y: 0 }, viewport);
    expect(context.moveTo).toHaveBeenLastCalledWith(10, 40.5);
    expect(context.lineTo).toHaveBeenLastCalledWith(80, 40.5);
    expect(context.setLineDash).toHaveBeenLastCalledWith([]);

    const outside = Object.assign(state({ x: 10, y: 10, width: 70, height: 50 }), {
      dragBoundary: { axis: "column" as const, offset: 90, removing: false },
    });
    paintPageBreakPreview(context, outside, { x: 0, y: 0 }, viewport);
    expect(context.moveTo).toHaveBeenCalledTimes(1);

    const removing = Object.assign(state({ x: 10, y: 10, width: 70, height: 50 }), {
      dragBoundary: { axis: "column" as const, offset: 90, removing: true },
    });
    paintPageBreakPreview(context, removing, { x: 0, y: 0 }, viewport);
    expect(context.moveTo).toHaveBeenLastCalledWith(90.5, 10);
    expect(context.lineTo).toHaveBeenLastCalledWith(90.5, 60);
    expect(context.setLineDash).toHaveBeenLastCalledWith([5, 3]);

    const corner = Object.assign(state({ x: 10, y: 10, width: 70, height: 50 }), {
      dragCorner: { x: 30, y: 35 },
    });
    paintPageBreakPreview(context, corner, { x: 10, y: 5 }, viewport);
    expect(context.strokeRect).toHaveBeenLastCalledWith(16, 26, 8, 8);

    const offscreenCorner = Object.assign(state({ x: 10, y: 10, width: 70, height: 50 }), {
      dragCorner: { x: -20, y: -20 },
    });
    paintPageBreakPreview(context, offscreenCorner, { x: 0, y: 0 }, viewport);
    expect(context.strokeRect).toHaveBeenCalledTimes(6);
  });

  test("keeps the page-break edge on backing pixels at fractional zoom and translation", () => {
    const context = {
      getTransform: vi.fn(() => ({ a: 2.5, d: 2.5, e: 0.3, f: 0.7 })),
      save: vi.fn(),
      restore: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      setLineDash: vi.fn(),
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 0,
      textAlign: "" as CanvasTextAlign,
      textBaseline: "" as CanvasTextBaseline,
      font: "",
    } as unknown as CanvasRenderingContext2D;

    paintPageBreakPreview(
      context,
      state({ x: 10, y: 10, width: 70, height: 50 }),
      { x: 0, y: 0 },
      viewport,
      1.25,
    );

    const [x, y, width, height] = vi.mocked(context.strokeRect).mock.calls[0]!;
    const strokeWidth = 1.6;
    expect(Number.isInteger((x - strokeWidth / 2) * 2.5 + 0.3)).toBe(true);
    expect(Number.isInteger((x + width + strokeWidth / 2) * 2.5 + 0.3)).toBe(true);
    expect(Number.isInteger((y - strokeWidth / 2) * 2.5 + 0.7)).toBe(true);
    expect(Number.isInteger((y + height + strokeWidth / 2) * 2.5 + 0.7)).toBe(true);
  });
});
