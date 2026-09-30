import { describe, expect, test, vi } from "vitest";
import {
  getConditionalFormatIconSlot,
  paintConditionalFormatVisual,
} from "../../../shared/conditional-formatting/conditional-format-painter";

function context() {
  const gradient = { addColorStop: vi.fn() };
  return {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    clip: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    scale: vi.fn(),
    arc: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    createLinearGradient: vi.fn(() => gradient),
    gradient,
  } as unknown as CanvasRenderingContext2D & {
    gradient: { addColorStop: ReturnType<typeof vi.fn> };
  };
}

describe("conditional format canvas painter", () => {
  test("the no-icon choice neither paints a glyph nor reserves text space", () => {
    const canvas = context();
    const rect = { x: 0, y: 0, width: 80, height: 24 };
    const visual = {
      iconSet: { hidden: true as const, showValue: false },
    };
    expect(getConditionalFormatIconSlot(rect, visual)).toBe(0);
    paintConditionalFormatVisual(canvas, rect, visual);
    expect(canvas.beginPath).not.toHaveBeenCalled();
    expect(canvas.fill).not.toHaveBeenCalled();
    expect(canvas.fillRect).not.toHaveBeenCalled();
  });

  test("paints a negative data bar from its axis with the negative color and a visible axis", () => {
    const canvas = context();
    paintConditionalFormatVisual(
      canvas,
      { x: 10, y: 5, width: 100, height: 24 },
      {
        dataBar: {
          start: 0,
          end: 0.4,
          axis: 0.4,
          color: "#4f81bd",
          negativeColor: "#c0504d",
          gradient: false,
          showValue: true,
        },
      },
    );
    expect(canvas.fillStyle).toBe("#c0504d");
    expect(canvas.fillRect).toHaveBeenCalledWith(12, 8, 38.400000000000006, 18);
    expect(canvas.stroke).toHaveBeenCalledOnce();
  });

  test("uses WPS-style gradient direction: positive solid at the left and negative solid at the axis", () => {
    const positive = context();
    paintConditionalFormatVisual(
      positive,
      { x: 0, y: 0, width: 100, height: 24 },
      {
        dataBar: { start: 0, end: 1, axis: 0, color: "#4f81bd", gradient: true, showValue: true },
      },
    );
    expect(positive.gradient.addColorStop).toHaveBeenNthCalledWith(1, 0, "#4f81bd");
    expect(positive.gradient.addColorStop).toHaveBeenNthCalledWith(2, 1, "#4f81bd66");
    const negative = context();
    paintConditionalFormatVisual(
      negative,
      { x: 0, y: 0, width: 100, height: 24 },
      {
        dataBar: {
          start: 0,
          end: 0.5,
          axis: 0.5,
          color: "#4f81bd",
          negativeColor: "#c0504d",
          gradient: true,
          showValue: true,
        },
      },
    );
    expect(negative.gradient.addColorStop).toHaveBeenNthCalledWith(1, 0, "#c0504d66");
    expect(negative.gradient.addColorStop).toHaveBeenNthCalledWith(2, 1, "#c0504d");
  });

  test("uses native paths for icons and reserves a cell-text slot", () => {
    const canvas = context();
    const rect = { x: 0, y: 0, width: 80, height: 24 };
    expect(
      getConditionalFormatIconSlot(rect, {
        iconSet: { iconSet: "threeArrows", iconIndex: 2, showValue: true },
      }),
    ).toBeGreaterThan(4);
    paintConditionalFormatVisual(canvas, rect, {
      iconSet: { iconSet: "threeArrows", iconIndex: 2, showValue: true },
    });
    expect(canvas.beginPath).toHaveBeenCalled();
    expect(canvas.fill).toHaveBeenCalled();
    expect(canvas.drawImage).toBeUndefined();
  });

  test("paints positive and negative borders inside the bar and uses the configured axis color", () => {
    const canvas = context();
    const dataBar = {
      start: 0.5,
      end: 1,
      axis: 0.5,
      color: "#638ec6",
      borderColor: "#112233",
      negativeBorderColor: "#aa0000",
      axisColor: "#008800",
      gradient: false,
      showValue: false,
      negative: false,
    };
    paintConditionalFormatVisual(canvas, { x: 0, y: 0, width: 100, height: 24 }, { dataBar });
    expect(canvas.strokeRect).toHaveBeenCalledWith(50.5, 3.5, 47, 17);
    expect(canvas.strokeStyle).toBe("#008800");
    expect(canvas.stroke).toHaveBeenCalledOnce();

    const negative = context();
    paintConditionalFormatVisual(
      negative,
      { x: 0, y: 0, width: 100, height: 24 },
      { dataBar: { ...dataBar, negative: true, axisPosition: "none" } },
    );
    expect(negative.strokeStyle).toBe("#aa0000");
    expect(negative.strokeRect).toHaveBeenCalledOnce();
    expect(negative.stroke).not.toHaveBeenCalled();

    const borderless = context();
    paintConditionalFormatVisual(
      borderless,
      { x: 0, y: 0, width: 100, height: 24 },
      { dataBar: { ...dataBar, borderColor: undefined, negative: true } },
    );
    expect(borderless.strokeRect).not.toHaveBeenCalled();

    const positiveOnly = context();
    paintConditionalFormatVisual(
      positiveOnly,
      { x: 0, y: 0, width: 100, height: 24 },
      { dataBar: { ...dataBar, axisPosition: "middle", axisVisible: false } },
    );
    expect(positiveOnly.strokeRect).toHaveBeenCalledOnce();
    expect(positiveOnly.stroke).not.toHaveBeenCalled();
  });

  test("keeps RTL bar colors tied to value sign and mirrors the gradient", () => {
    const dataBar = {
      start: 0,
      end: 0.5,
      axis: 0.5,
      color: "#638ec6",
      negativeColor: "#ff0000",
      gradient: true,
      showValue: true,
      direction: "rightToLeft" as const,
      negative: false,
    };
    const positive = context();
    paintConditionalFormatVisual(positive, { x: 0, y: 0, width: 100, height: 24 }, { dataBar });
    expect(positive.gradient.addColorStop).toHaveBeenNthCalledWith(1, 0, "#638ec666");
    expect(positive.gradient.addColorStop).toHaveBeenNthCalledWith(2, 1, "#638ec6");

    const negative = context();
    paintConditionalFormatVisual(
      negative,
      { x: 0, y: 0, width: 100, height: 24 },
      { dataBar: { ...dataBar, start: 0.5, end: 1, negative: true } },
    );
    expect(negative.gradient.addColorStop).toHaveBeenNthCalledWith(1, 0, "#ff0000");
    expect(negative.gradient.addColorStop).toHaveBeenNthCalledWith(2, 1, "#ff000066");
  });

  test("without an axis negative bars use the same gradient direction as positive bars", () => {
    const canvas = context();
    paintConditionalFormatVisual(
      canvas,
      { x: 0, y: 0, width: 100, height: 24 },
      {
        dataBar: {
          start: 0,
          end: 0.5,
          axis: 0,
          color: "#638ec6",
          negativeColor: "#ff0000",
          gradient: true,
          showValue: true,
          negative: true,
          axisPosition: "none",
        },
      },
    );
    expect(canvas.gradient.addColorStop).toHaveBeenNthCalledWith(1, 0, "#ff0000");
    expect(canvas.gradient.addColorStop).toHaveBeenNthCalledWith(2, 1, "#ff000066");
    expect(canvas.stroke).not.toHaveBeenCalled();
  });

  test("keeps arrow directions, symbols, ratings, quarters, and boxes as distinct native shapes", () => {
    const rect = { x: 0, y: 0, width: 80, height: 24 };
    const arrows = context();
    paintConditionalFormatVisual(arrows, rect, {
      iconSet: { iconSet: "fiveArrows", iconIndex: 0, showValue: true },
    });
    const arrowAngle = (arrows.rotate as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    const upward = context();
    paintConditionalFormatVisual(upward, rect, {
      iconSet: { iconSet: "fiveArrows", iconIndex: 4, showValue: true },
    });
    expect((upward.rotate as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).not.toBe(arrowAngle);

    const symbols = context();
    paintConditionalFormatVisual(symbols, rect, {
      iconSet: { iconSet: "threeSymbolsCircled", iconIndex: 1, showValue: true },
    });
    expect(symbols.arc).toHaveBeenCalled();
    expect(symbols.lineTo).toHaveBeenCalled();

    const ratings = context();
    paintConditionalFormatVisual(ratings, rect, {
      iconSet: { iconSet: "fiveRatings", iconIndex: 3, showValue: true },
    });
    expect(ratings.fillRect).toHaveBeenCalledTimes(4);
    const quarters = context();
    paintConditionalFormatVisual(quarters, rect, {
      iconSet: { iconSet: "fiveQuarters", iconIndex: 3, showValue: true },
    });
    expect(quarters.arc).toHaveBeenCalled();
    const boxes = context();
    paintConditionalFormatVisual(boxes, rect, {
      iconSet: { iconSet: "fiveBoxes", iconIndex: 3, showValue: true },
    });
    expect(boxes.fillRect).toHaveBeenCalledTimes(4);
  });

  test("uses distinct sign geometry, authentic arrow colors, and empty-to-full quarter fills", () => {
    const rect = { x: 0, y: 0, width: 80, height: 24 };
    const diamond = context();
    paintConditionalFormatVisual(diamond, rect, {
      iconSet: { iconSet: "threeSigns", iconIndex: 0, showValue: true },
    });
    expect(diamond.arc).not.toHaveBeenCalled();
    expect(diamond.lineTo).toHaveBeenCalledTimes(3);
    expect(diamond.fillStyle).toBe("#DF5934");
    const triangle = context();
    paintConditionalFormatVisual(triangle, rect, {
      iconSet: { iconSet: "threeSigns", iconIndex: 1, showValue: true },
    });
    expect(triangle.arc).not.toHaveBeenCalled();
    expect(triangle.lineTo).toHaveBeenCalledTimes(2);
    const circle = context();
    paintConditionalFormatVisual(circle, rect, {
      iconSet: { iconSet: "threeSigns", iconIndex: 2, showValue: true },
    });
    expect(circle.arc).toHaveBeenCalled();
    const topArrow = context();
    paintConditionalFormatVisual(topArrow, rect, {
      iconSet: { iconSet: "fiveArrows", iconIndex: 4, showValue: true },
    });
    expect(topArrow.fillStyle).toBe("#70AC98");
    const fourArrow = context();
    paintConditionalFormatVisual(fourArrow, rect, {
      iconSet: { iconSet: "fourArrows", iconIndex: 0, showValue: true },
    });
    expect((fourArrow.rotate as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe(Math.PI);
    const emptyQuarter = context();
    paintConditionalFormatVisual(emptyQuarter, rect, {
      iconSet: { iconSet: "fiveQuarters", iconIndex: 0, showValue: true },
    });
    expect(emptyQuarter.fill).toHaveBeenCalledOnce();
    expect(emptyQuarter.fillStyle).toBe("#FFFFFF");
    const fullQuarter = context();
    paintConditionalFormatVisual(fullQuarter, rect, {
      iconSet: { iconSet: "fiveQuarters", iconIndex: 4, showValue: true },
    });
    expect(fullQuarter.fill).toHaveBeenCalledTimes(2);
    expect(fullQuarter.fillStyle).toBe("#555756");
  });

  test("renders the missing WPS triangle/star sets and authentic four/five-level shapes", () => {
    const rect = { x: 0, y: 0, width: 80, height: 24 };
    const downTriangle = context();
    paintConditionalFormatVisual(downTriangle, rect, {
      iconSet: { iconSet: "threeTriangles", iconIndex: 0, showValue: true },
    });
    expect(downTriangle.fillStyle).toBe("#DF5934");
    expect(downTriangle.lineTo).toHaveBeenCalledTimes(2);
    const middleTriangle = context();
    paintConditionalFormatVisual(middleTriangle, rect, {
      iconSet: { iconSet: "threeTriangles", iconIndex: 1, showValue: true },
    });
    expect(middleTriangle.lineTo).toHaveBeenCalledTimes(3);
    expect(middleTriangle.stroke).toHaveBeenCalledOnce();
    const halfStar = context();
    paintConditionalFormatVisual(halfStar, rect, {
      iconSet: { iconSet: "threeStars", iconIndex: 1, showValue: true },
    });
    expect(halfStar.clip).toHaveBeenCalledOnce();
    expect(halfStar.fillRect).toHaveBeenCalledOnce();
    const redToBlack = context();
    paintConditionalFormatVisual(redToBlack, rect, {
      iconSet: { iconSet: "fourRedToBlack", iconIndex: 0, showValue: true },
    });
    expect(redToBlack.fillStyle).toBe("#555756");
    const lights = context();
    paintConditionalFormatVisual(lights, rect, {
      iconSet: { iconSet: "fourTrafficLights", iconIndex: 0, showValue: true },
    });
    expect(lights.fillStyle).toBe("#555756");
    const boxes = context();
    paintConditionalFormatVisual(boxes, rect, {
      iconSet: { iconSet: "fiveBoxes", iconIndex: 3, showValue: true },
    });
    expect(boxes.fillRect).toHaveBeenCalledTimes(4);
  });
});
