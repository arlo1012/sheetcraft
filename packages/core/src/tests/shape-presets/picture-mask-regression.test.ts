import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { SHAPE_PRESET_NAMES, evaluateShapePreset } from "../../shape-presets.js";
import { SHAPE_PRESET_DEFAULTS } from "../../shape-presets/catalog.js";

// Captured from the pre-metadata evaluator at f929d71. Round to 12 significant digits
// to ignore platform-level trig noise while preserving substantive coordinate regressions.
const baseline = {
  default: "bf4696a02c926874df57c9ed71793f4794b91ef899621071d7bbbf27278819c9",
  adjusted: "fd42aac42f703a0d73316898c2e25b7cf9b50389296c0114712491870229bddd",
};

test.each([false, true])(
  "retains all 187 legacy picture-mask paths, handles and adjustments (adjusted=%s)",
  (adjusted) => {
    const hash = createHash("sha256");
    expect(SHAPE_PRESET_NAMES).toHaveLength(187);
    for (const preset of SHAPE_PRESET_NAMES) {
      const adjustments = Object.fromEntries(
        Object.entries(SHAPE_PRESET_DEFAULTS[preset]).map(([name, value]) => [
          name,
          value === 0 ? 12500 : value * 0.75,
        ]),
      );
      const geometry = evaluateShapePreset(
        { preset, ...(adjusted ? { adjustments } : {}) },
        360,
        240,
      );
      const legacy = {
        preset,
        width: geometry.width,
        height: geometry.height,
        paths: geometry.paths.map(({ filled, stroke, commands }) => ({ filled, stroke, commands })),
        handles: geometry.handles,
        adjustments: geometry.adjustments,
      };
      hash.update(
        JSON.stringify(legacy, (_key, value: unknown) =>
          typeof value === "number" ? Number(value.toPrecision(12)) : value,
        ),
      );
    }
    expect(hash.digest("hex")).toBe(baseline[adjusted ? "adjusted" : "default"]);
  },
);
