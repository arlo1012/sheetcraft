// 未执行：按用户要求仅编写测试，不运行检查。
import { describe, expect, test, vi } from "vitest";
import type { CellSparkline } from "@sheetcraft/core/sparklines";
import { paintSparkline } from "../../../modules/sparklines/sparkline-painter";

function paint(type: CellSparkline["type"], values: readonly number[], axis = true) {
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
  };
  const sparkline: CellSparkline = {
    type,
    source: null,
    color: "#123456",
    negativeColor: "#654321",
    markers: false,
    axis,
    showHidden: false,
    empty: "gap",
  };
  // The inset plot spans x=13..113 and y=23..63, with its middle at y=43.
  paintSparkline(
    context as unknown as CanvasRenderingContext2D,
    { x: 10, y: 20, width: 106, height: 46 },
    sparkline,
    values,
  );
  return context;
}

describe("sparkline axis geometry", () => {
  test.each([
    { label: "unequal positive and negative magnitudes", values: [9, -1], barTops: [23, 43] },
    { label: "only positive values", values: [1, 9], barTops: [23, 23] },
    { label: "only negative values", values: [-9, -1], barTops: [43, 43] },
  ])("aligns the win/loss axis with both bar baselines for $label", ({ values, barTops }) => {
    const context = paint("winLoss", values);

    expect(context.moveTo.mock.calls).toEqual([[13, 43]]);
    expect(context.lineTo.mock.calls).toEqual([[113, 43]]);
    expect(context.stroke).toHaveBeenCalledTimes(1);
    expect(context.fillRect.mock.calls).toEqual([
      [20, barTops[0], 36, 20],
      [70, barTops[1], 36, 20],
    ]);
  });

  test("keeps the column axis at the numerical zero rather than the plot middle", () => {
    const context = paint("column", [9, -1]);

    // A 9-to-1 magnitude ratio places zero four pixels above the plot bottom.
    expect(context.moveTo.mock.calls).toEqual([[13, 59]]);
    expect(context.lineTo.mock.calls).toEqual([[113, 59]]);
    expect(context.fillRect.mock.calls).toEqual([
      [20, 23, 36, 36],
      [70, 59, 36, 4],
    ]);
  });

  test.each(["winLoss", "column"] as const)(
    "draws %s bars without an axis when the axis option is disabled",
    (type) => {
      const context = paint(type, [9, -1], false);

      expect(context.fillRect).toHaveBeenCalledTimes(2);
      expect(context.moveTo).not.toHaveBeenCalled();
      expect(context.lineTo).not.toHaveBeenCalled();
      expect(context.stroke).not.toHaveBeenCalled();
    },
  );
});
