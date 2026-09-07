import { describe, expect, test } from "vitest";
import { getContrastingForeground, mixHexColors } from "../../../../shared/color/contrast";

describe("getContrastingForeground", () => {
  test.each([
    ["#000000", "#FFFFFF"],
    ["#FFFFFF", "#000000"],
    ["#FACC15", "#000000"],
    ["#0000FF", "#FFFFFF"],
    ["#FF0000", "#000000"],
    ["#00FF00", "#000000"],
    ["#757575", "#FFFFFF"],
    ["#767676", "#000000"],
    ["#1a237e", "#FFFFFF"],
  ])("keeps a foreground readable on %s", (background, foreground) => {
    expect(getContrastingForeground(background)).toBe(foreground);
  });
});

describe("mixHexColors", () => {
  test("returns the background or foreground at the opacity boundaries", () => {
    expect(mixHexColors("#FF0000", "#FFFFFF", 0)).toBe("#FFFFFF");
    expect(mixHexColors("#ff0000", "#ffffff", 1)).toBe("#FF0000");
  });

  test("mixes light and dark backgrounds deterministically", () => {
    expect(mixHexColors("#FF0000", "#FFFFFF", 0.2)).toBe("#FFCCCC");
    expect(mixHexColors("#0000FF", "#000000", 0.2)).toBe("#000033");
  });

  test("selects foreground from the final background instead of the source color", () => {
    const source = "#0000FF";
    const onLightBackground = mixHexColors(source, "#FFFFFF", 0.2);
    const onDarkBackground = mixHexColors(source, "#000000", 0.2);

    expect(getContrastingForeground(onLightBackground)).toBe("#000000");
    expect(getContrastingForeground(onDarkBackground)).toBe("#FFFFFF");
  });
});
