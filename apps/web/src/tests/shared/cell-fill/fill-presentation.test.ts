import { describe, expect, test } from "vitest";
import { getCellFillStyle } from "../../../shared/cell-fill/fill-presentation";

describe("cell fill presentation", () => {
  test("renders a pattern over its base fill with its selected foreground", () => {
    const style = getCellFillStyle({
      fillColor: "#fef3c7",
      fillPattern: "darkTrellis",
      fillPatternColor: "#b91c1c",
    });
    expect(style.backgroundColor).toBe("#fef3c7");
    expect(style.backgroundRepeat).toBe("repeat");
    expect(style.backgroundImage).toContain("data:image/svg+xml");
    expect(style.backgroundImage).toContain("stroke");
  });

  test("maps Excel linear zero degrees to a left-to-right CSS gradient", () => {
    expect(
      getCellFillStyle({
        fillGradient: {
          type: "linear",
          angle: 0,
          stops: [
            { position: 0, color: "#ffffff" },
            { position: 1, color: "#4472c4" },
          ],
        },
      }).backgroundImage,
    ).toBe("linear-gradient(90deg, #ffffff 0%, #4472c4 100%)");
  });

  test("uses an SVG with focal rectangle bands for a path gradient", () => {
    const result = getCellFillStyle({
      fillGradient: {
        type: "path",
        left: 0.5,
        right: 0.5,
        top: 0.5,
        bottom: 0.5,
        stops: [
          { position: 0, color: "#ffffff" },
          { position: 1, color: "#4472c4" },
        ],
      },
    });
    expect(result.backgroundImage).toContain("data:image/svg+xml");
    expect(result.backgroundSize).toBe("100% 100%");
    expect(result.backgroundRepeat).toBe("no-repeat");
  });
});
