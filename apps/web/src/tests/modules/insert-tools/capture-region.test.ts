// 未执行：按用户要求仅编写测试，避免额外内存占用。
import { describe, expect, test } from "vitest";
import {
  captureRegionBetween,
  setCaptureRegionField,
} from "../../../modules/insert-tools/capture-region";

describe("screen capture region", () => {
  test.each([
    [
      { x: 20, y: 30 },
      { x: 180, y: 130 },
    ],
    [
      { x: 180, y: 130 },
      { x: 20, y: 30 },
    ],
    [
      { x: 20, y: 130 },
      { x: 180, y: 30 },
    ],
  ])("selects the same rectangle for either drag direction", (start, end) => {
    expect(captureRegionBetween(start, end, { width: 200, height: 150 })).toEqual({
      x: 20,
      y: 30,
      width: 160,
      height: 100,
    });
  });

  test("clips a drag that extends beyond every image boundary", () => {
    expect(
      captureRegionBetween({ x: -30, y: 180 }, { x: 250, y: -50 }, { width: 200, height: 150 }),
    ).toEqual({ x: 0, y: 0, width: 200, height: 150 });
  });

  test("rounds source-pixel endpoints to integers before computing crop dimensions", () => {
    expect(
      captureRegionBetween({ x: 10.4, y: 20.6 }, { x: 60.6, y: 90.4 }, { width: 200, height: 150 }),
    ).toEqual({ x: 10, y: 21, width: 51, height: 69 });
  });

  test.each([
    ["x", 50, { x: 50, y: 20, width: 50, height: 60 }],
    ["y", 80, { x: 10, y: 80, width: 80, height: 10 }],
    ["x", -20, { x: 0, y: 20, width: 80, height: 60 }],
    ["y", -20, { x: 10, y: 0, width: 80, height: 60 }],
    ["x", 200, { x: 99, y: 20, width: 1, height: 60 }],
    ["y", 200, { x: 10, y: 89, width: 80, height: 1 }],
    ["width", 200, { x: 10, y: 20, width: 90, height: 60 }],
    ["height", 200, { x: 10, y: 20, width: 80, height: 70 }],
    ["width", -2, { x: 10, y: 20, width: 1, height: 60 }],
    ["height", 0, { x: 10, y: 20, width: 80, height: 1 }],
    ["width", 45.7, { x: 10, y: 20, width: 46, height: 60 }],
  ] as const)("keeps a crop inside the image after setting %s to %s", (field, value, expected) => {
    const original = { x: 10, y: 20, width: 80, height: 60 };
    expect(setCaptureRegionField(original, field, value, { width: 100, height: 90 })).toEqual(
      expected,
    );
    expect(original).toEqual({ x: 10, y: 20, width: 80, height: 60 });
  });
});
