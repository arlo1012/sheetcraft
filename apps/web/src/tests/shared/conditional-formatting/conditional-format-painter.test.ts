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
    expect(ratings.fillRect).toHaveBeenCalledTimes(5);
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
    expect(diamond.fillStyle).toBe("#db4c3f");
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
    expect(topArrow.fillStyle).toBe("#2fa84f");
    const fourArrow = context();
    paintConditionalFormatVisual(fourArrow, rect, {
      iconSet: { iconSet: "fourArrows", iconIndex: 0, showValue: true },
    });
    expect((fourArrow.rotate as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe(Math.PI);
    const emptyQuarter = context();
    paintConditionalFormatVisual(emptyQuarter, rect, {
      iconSet: { iconSet: "fiveQuarters", iconIndex: 0, showValue: true },
    });
    expect(emptyQuarter.fill).not.toHaveBeenCalled();
    const fullQuarter = context();
    paintConditionalFormatVisual(fullQuarter, rect, {
      iconSet: { iconSet: "fiveQuarters", iconIndex: 4, showValue: true },
    });
    expect(fullQuarter.fill).toHaveBeenCalledOnce();
  });

  test("renders the missing WPS triangle/star sets and authentic four/five-level shapes", () => {
    const rect = { x: 0, y: 0, width: 80, height: 24 };
    const downTriangle = context();
    paintConditionalFormatVisual(downTriangle, rect, {
      iconSet: { iconSet: "threeTriangles", iconIndex: 0, showValue: true },
    });
    expect(downTriangle.fillStyle).toBe("#db4c3f");
    expect(downTriangle.lineTo).toHaveBeenCalledTimes(2);
    const middleTriangle = context();
    paintConditionalFormatVisual(middleTriangle, rect, {
      iconSet: { iconSet: "threeTriangles", iconIndex: 1, showValue: true },
    });
    expect(middleTriangle.fillRect).toHaveBeenCalledOnce();
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
    expect(redToBlack.fillStyle).toBe("#24292f");
    const lights = context();
    paintConditionalFormatVisual(lights, rect, {
      iconSet: { iconSet: "fourTrafficLights", iconIndex: 0, showValue: true },
    });
    expect(lights.fillStyle).toBe("#3f454d");
    const boxes = context();
    paintConditionalFormatVisual(boxes, rect, {
      iconSet: { iconSet: "fiveBoxes", iconIndex: 3, showValue: true },
    });
    expect(boxes.fillRect).toHaveBeenCalledTimes(4);
  });
});
