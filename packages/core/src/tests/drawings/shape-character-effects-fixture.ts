import type { ShapeTextCharacterFormat } from "../../shape-text-character-runs.js";

export function characterEffects() {
  return {
    shadow: {
      kind: "value",
      value: {
        kind: "outer",
        color: { kind: "rgb", rgb: "#aabbcc" },
        opacity: 0.4,
        scale: 1.2,
        blurPt: 3,
        distancePt: 4,
        angleDeg: 390,
        anchor: "bottom-left",
      },
    },
    reflection: {
      kind: "value",
      value: { size: 0.65, opacity: 0.3, blurPt: 2, distancePt: 5 },
    },
    glow: {
      kind: "value",
      value: {
        color: { kind: "theme", reference: { slot: "accent2", tint: 0.2 } },
        opacity: 0.7,
        sizePt: 6,
      },
    },
  } satisfies ShapeTextCharacterFormat;
}
