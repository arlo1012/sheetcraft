import { describe, expect, test } from "vitest";
import {
  buildGradientPreset,
  gradientVariantCount,
  recognizeGradientPreset,
} from "../../../../modules/cell-format/fill/gradient-presets";

describe("fill gradient presets", () => {
  test("creates Excel-oriented linear variants", () => {
    expect(buildGradientPreset("horizontal", 0, "#ffffff", "#4472c4")).toMatchObject({
      type: "linear" as const,
      angle: 90,
    });
    expect(buildGradientPreset("vertical", 2, "#ffffff", "#4472c4")).toEqual({
      type: "linear",
      angle: 0,
      stops: [
        { position: 0, color: "#ffffff" },
        { position: 0.5, color: "#4472c4" },
        { position: 1, color: "#ffffff" },
      ],
    });
    expect(buildGradientPreset("diagonalUp", 0, "#ffffff", "#4472c4")).toMatchObject({
      type: "linear" as const,
      angle: 315,
    });
    expect(buildGradientPreset("diagonalDown", 0, "#ffffff", "#4472c4")).toMatchObject({
      type: "linear" as const,
      angle: 45,
    });
  });

  test("recognizes a two-stop vertical preset with its colors", () => {
    const preset = buildGradientPreset("vertical", 0, "#123456", "#abcdef");
    expect(recognizeGradientPreset(preset)).toEqual({
      style: "vertical",
      variant: 0,
      color1: "#123456",
      color2: "#abcdef",
    });
  });

  test("creates each corner and both center path variants", () => {
    expect(gradientVariantCount("corner")).toBe(4);
    expect(buildGradientPreset("corner", 3, "#ffffff", "#4472c4")).toMatchObject({
      type: "path",
      left: 1,
      right: 1,
      top: 1,
      bottom: 1,
    });
    expect(buildGradientPreset("center", 1, "#ffffff", "#4472c4")).toEqual({
      type: "path",
      left: 0.5,
      right: 0.5,
      top: 0.5,
      bottom: 0.5,
      stops: [
        { position: 0, color: "#4472c4" },
        { position: 1, color: "#ffffff" },
      ],
    });
  });

  test("recognizes only a lossless preset shape", () => {
    const preset = buildGradientPreset("diagonalDown", 2, "#123456", "#abcdef");
    expect(recognizeGradientPreset(preset)).toEqual({
      style: "diagonalDown",
      variant: 2,
      color1: "#123456",
      color2: "#abcdef",
    });
    expect(
      recognizeGradientPreset({
        type: "linear",
        angle: 27,
        stops: [
          { position: 0, color: "#111111" },
          { position: 0.4, color: "#777777" },
          { position: 1, color: "#eeeeee" },
        ],
      }),
    ).toBeUndefined();
  });
});
