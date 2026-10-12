import { expect, test, vi } from "vitest";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { pictureFrameLocalToWorld } from "@sheetcraft/core/picture-frame";
import {
  detailedShapeContainsWorldPoint,
  resizeShapePresentationCanvas,
  releaseShapePresentationCanvas,
  getShapePresentationAllocatedBytes,
} from "../../../modules/sheet-drawings/shape-detailed-presentation";

test.each([0, 37, 90, -37])(
  "alpha hit at%d inverses rotation, output origin/density and both shape flips",
  (rotation) => {
    const base = {
      ...createGraphicDrawing("s", "shape", "shape", { row: 0, column: 0 }),
      width: 100,
      height: 80,
      rotation,
    };
    for (const flipX of [false, true])
      for (const flipY of [false, true]) {
        const drawing = {
          ...base,
          ...(flipX ? { shapeFlipX: true as const } : {}),
          ...(flipY ? { shapeFlipY: true as const } : {}),
        };
        const getImageData = vi.fn(() => ({ data: Uint8ClampedArray.of(0, 0, 0, 255) }));
        const canvas = {
          width: 240,
          height: 200,
          getContext: () => ({ getImageData }),
        } as unknown as HTMLCanvasElement;
        const frame = { x: 300, y: 200, width: 100, height: 80 };
        // Sample inside a pixel, not exactly on a boundary whose inverse can
        // land either side through floating-point roundoff.
        const point = pictureFrameLocalToWorld(frame, rotation, {
          x: flipX ? 79.75 : 20.25,
          y: flipY ? 49.75 : 30.25,
        });
        const presentation = {
          drawing,
          canvas,
          density: 2,
          bounds: { left: -10, top: -10, width: 120, height: 100 },
        };
        expect(detailedShapeContainsWorldPoint(drawing, frame, point, presentation)).toBe(true);
        expect(getImageData.mock.calls[0]?.slice(0, 2)).toEqual([60, 80]);
        getImageData.mockReturnValue({ data: Uint8ClampedArray.of(0, 0, 0, 0) });
        expect(detailedShapeContainsWorldPoint(drawing, frame, point, presentation)).toBe(false);
        expect(detailedShapeContainsWorldPoint({ ...drawing }, frame, point, presentation)).toBe(
          false,
        );
        expect(
          detailedShapeContainsWorldPoint(drawing, frame, { x: -1000, y: -1000 }, presentation),
        ).toBe(false);
      }
  },
);
test("presentation allocation is bounded, replacements release their old accounting and unmount frees the lease", () => {
  const canvases = Array.from({ length: 5 }, () => ({ width: 0, height: 0 }) as HTMLCanvasElement);
  try {
    expect(getShapePresentationAllocatedBytes()).toBe(0);
    for (const c of canvases.slice(0, 4)) resizeShapePresentationCanvas(c, 2000, 2000);
    expect(getShapePresentationAllocatedBytes()).toBe(64_000_000);
    expect(() => resizeShapePresentationCanvas(canvases[4]!, 2000, 2000)).toThrow(/budget/);
    resizeShapePresentationCanvas(canvases[0]!, 10, 10);
    expect(() => resizeShapePresentationCanvas(canvases[4]!, 2000, 2000)).not.toThrow();
    expect(() => resizeShapePresentationCanvas(canvases[0]!, 100000, 1)).toThrow(/budget/);
  } finally {
    for (const c of canvases) releaseShapePresentationCanvas(c);
  }
  expect(canvases.map((c) => [c.width, c.height])).toEqual(Array.from({ length: 5 }, () => [0, 0]));
  expect(getShapePresentationAllocatedBytes()).toBe(0);
  const another = { width: 0, height: 0 } as HTMLCanvasElement;
  resizeShapePresentationCanvas(another, 2000, 2000);
  releaseShapePresentationCanvas(another);
});
