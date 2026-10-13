import { describe, expect, test } from "vitest";
import { TEXT_WARP_PRESET_NAMES } from "../../text-warps/catalog.js";
import { evaluateTextWarp } from "../../text-warps/evaluate.js";
import { mapTextWarpEnvelopePoint } from "../../text-warps/mapping.js";
import { sampleTextWarpBoundaries, sampleTextWarpFraction } from "../../text-warps/sampling.js";

describe("pinned catalog consumed by the bounded arc-length sampler", () => {
  test.each(TEXT_WARP_PRESET_NAMES)("%s preserves every directed boundary and role", (preset) => {
    const geometry = evaluateTextWarp({ preset }, 400, 120);
    const sampled = sampleTextWarpBoundaries(geometry.boundaries, {
      width: 400,
      height: 120,
      positionTolerance: 0.25,
    });
    expect(sampled.boundaries).toHaveLength(geometry.boundaries.length);
    expect(sampled.samples).toBeLessThanOrEqual(8192);
    expect(sampled.numericBytes).toBeLessThanOrEqual(1_048_576);
    for (let index = 0; index < sampled.boundaries.length; index++) {
      const boundary = sampled.boundaries[index]!;
      const move = geometry.boundaries[index]!.commands[0]!;
      expect(move[0]).toBe("M");
      expect(sampleTextWarpFraction(boundary, 0).position.x).toBeCloseTo(move[1], 8);
      expect(sampleTextWarpFraction(boundary, 0).position.y).toBeCloseTo(move[2], 8);
      expect(boundary.positionErrorBound).toBeLessThanOrEqual(0.25);
      for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
        const point = sampleTextWarpFraction(boundary, fraction).position;
        expect(point.x).toBeGreaterThanOrEqual(boundary.bounds.left);
        expect(point.x).toBeLessThanOrEqual(boundary.bounds.right);
        expect(point.y).toBeGreaterThanOrEqual(boundary.bounds.top);
        expect(point.y).toBeLessThanOrEqual(boundary.bounds.bottom);
      }
    }
    for (const band of geometry.bands) {
      const upper = sampled.boundaries[band.topPathIndex]!;
      const lower = sampled.boundaries[band.bottomPathIndex]!;
      const point = mapTextWarpEnvelopePoint(
        upper,
        lower,
        { kind: "native-text", left: 0, top: 0, width: 80, height: 20 },
        { x: 40, y: 10 },
      )!;
      const top = sampleTextWarpFraction(upper, 0.5).position;
      const bottom = sampleTextWarpFraction(lower, 0.5).position;
      expect(point.x).toBeCloseTo((top.x + bottom.x) / 2, 10);
      expect(point.y).toBeCloseTo((top.y + bottom.y) / 2, 10);
    }
  });
});
