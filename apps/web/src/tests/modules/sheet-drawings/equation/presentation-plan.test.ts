// @vitest-environment node
import { expect, test } from "vitest";
import {
  EQUATION_PRESENTATION_LIMITS,
  equationPresentationLimits,
  planEquationPresentation,
  type EquationPresentationInput,
} from "../../../../modules/sheet-drawings/equation/equation-presentation-plan";
import { KATEX_PRESENTATION_FACES } from "../../../../modules/sheet-drawings/equation/equation-presentation-font-coverage";

const input = (): EquationPresentationInput => ({
  sourceIdentity: {},
  source: "x",
  fontSize: 20,
  color: "#111111",
  localW: 100,
  localH: 60,
  density: 2,
});

test("presentation captures source and every pixel field without retaining mutable input", () => {
  const mutable = { ...input() };
  const result = planEquationPresentation(mutable);
  expect(result.status).toBe("ready");
  if (result.status !== "ready") return;
  mutable.source = "y";
  mutable.fontSize = 45;
  expect(result.input.source).toBe("x");
  expect(result.input.fontSize).toBe(20);
  expect(Object.isFrozen(result.input)).toBe(true);
  expect(result.pixelWidth).toBe(200);
  expect(result.pixelHeight).toBe(120);
  expect(result.rasterBytes).toBe(96_000);
  for (const change of [
    { source: "y" },
    { fontSize: 21 },
    { color: "red" },
    { localW: 101 },
    { localH: 61 },
    { density: 1 },
  ]) {
    const other = planEquationPresentation({ ...result.input, ...change });
    expect(other.status === "ready" && other.signature).not.toBe(result.signature);
  }
  // Identity is deliberately not stringified: the service segregates it by reference.
  const replacement = planEquationPresentation({ ...result.input, sourceIdentity: {} });
  expect(replacement.status === "ready" && replacement.input.sourceIdentity).not.toBe(
    result.input.sourceIdentity,
  );
});

test("finite dimensions, raster side/area/bytes and tightened hard ceilings fail closed", () => {
  for (const value of [NaN, Infinity, -1, 0, Number.MAX_VALUE])
    expect(planEquationPresentation({ ...input(), localW: value })).toMatchObject({
      status: "unavailable",
      reason: "budget",
    });
  expect(planEquationPresentation({ ...input(), localW: 4097, density: 1 })).toMatchObject({
    reason: "budget",
  });
  expect(
    planEquationPresentation({ ...input(), localW: 4096, localH: 4096, density: 1 }),
  ).toMatchObject({ reason: "budget" });
  expect(
    planEquationPresentation(input(), equationPresentationLimits({ retainedBytes: 95_999 })),
  ).toMatchObject({ reason: "budget" });
  expect(() => equationPresentationLimits({ rasterPixels: Infinity })).toThrow();
  expect(() => equationPresentationLimits({ nodes: 0 })).toThrow();
  expect(() => equationPresentationLimits({ cacheEntries: 0.5 })).toThrow();
  expect(equationPresentationLimits({ rasterPixels: 1e12 }).rasterPixels).toBe(
    EQUATION_PRESENTATION_LIMITS.rasterPixels,
  );
  expect(planEquationPresentation({ ...input(), color: "" })).toMatchObject({
    reason: "invalid-source",
  });
});

test("installed font coverage names all 20 CSS faces in 12 families with source fingerprints", () => {
  expect(KATEX_PRESENTATION_FACES).toHaveLength(20);
  expect(new Set(KATEX_PRESENTATION_FACES.map((face) => face.family)).size).toBe(12);
  for (const face of KATEX_PRESENTATION_FACES) {
    expect(face.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(face.ranges.length).toBeGreaterThan(0);
    expect(face.ranges.every(([from, to]) => Number.isFinite(from) && from <= to)).toBe(true);
  }
});
