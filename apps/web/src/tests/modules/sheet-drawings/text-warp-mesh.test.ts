// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  TEXT_WARP_MESH_LIMITS,
  TextWarpMeshError,
  prepareTextWarpMesh,
  rasterizeTextWarpAlpha,
  type TextWarpMeshBudget,
  type TextWarpPoint,
} from "../../../modules/sheet-drawings/text-warp-mesh";

const identity = (x: number, y: number) => ({ x, y });
function mesh(mapPoint = identity, width = 4, height = 4, budget?: TextWarpMeshBudget) {
  return prepareTextWarpMesh({
    sourceRect: { left: 0, top: 0, width, height },
    mapPoint,
    toleranceRasterPx: 0.01,
    budget,
  });
}
function failure(action: () => unknown, code: TextWarpMeshError["code"]) {
  try {
    action();
    expect.fail("Expected explicit text-warp failure");
  } catch (error) {
    expect(error).toBeInstanceOf(TextWarpMeshError);
    expect((error as TextWarpMeshError).code).toBe(code);
  }
}

describe("bounded native-alpha text warp mesh", () => {
  it("preserves identity alpha, including transparent holes, authored-space area and shared diagonals", () => {
    const plan = mesh();
    const source = new Uint8ClampedArray([0, 80, 80, 0, 0, 80, 0, 0, 0, 80, 80, 0, 0, 0, 0, 0]);
    const result = rasterizeTextWarpAlpha({
      mesh: plan,
      source: { width: 4, height: 4, data: source },
    });
    expect(plan.vertexCount).toBe(4);
    expect(plan.triangleCount).toBe(2);
    expect(plan.maximumSampledErrorRasterPx).toBe(0);
    expect([result.left, result.top, result.width, result.height]).toEqual([0, 0, 4, 4]);
    expect(result.data).toEqual(source);
    expect(result.data).not.toBe(source);
  });

  it("extracts genuine RGBA alpha without letting transparent RGB create pixels", () => {
    const rgba = new Uint8ClampedArray([
      255, 0, 255, 0, 0, 0, 0, 255, 10, 20, 30, 63, 40, 50, 60, 0,
    ]);
    const result = rasterizeTextWarpAlpha({
      mesh: mesh(identity, 2, 2),
      source: { width: 2, height: 2, data: rgba, format: "rgba" },
    });
    expect(Array.from(result.data)).toEqual([0, 255, 63, 0]);
    expect(result.proof.sourceBytes).toBe(rgba.byteLength);
  });

  it("translates in one drawing-local frame and uses bilinear alpha under scaling", () => {
    const translated = rasterizeTextWarpAlpha({
      mesh: mesh((x, y) => ({ x: x - 7, y: y + 3 }), 2, 2),
      source: { width: 2, height: 2, data: new Uint8ClampedArray([0, 255, 255, 0]) },
    });
    expect([translated.left, translated.top, translated.width, translated.height]).toEqual([
      -7, 3, 2, 2,
    ]);
    expect(Array.from(translated.data)).toEqual([0, 255, 255, 0]);
    const scaled = rasterizeTextWarpAlpha({
      mesh: mesh((x, y) => ({ x: 2 * x, y: 2 * y }), 2, 2),
      source: { width: 2, height: 2, data: new Uint8ClampedArray([0, 255, 0, 255]) },
    });
    expect([scaled.width, scaled.height]).toEqual([4, 4]);
    expect(Array.from(scaled.data.slice(4, 8))).toEqual([0, 64, 191, 191]);
  });

  it("maps source texel centers using supplied geometry, independently of the alpha bounds", () => {
    const plan = prepareTextWarpMesh({
      sourceRect: { left: -5, top: 3, width: 4, height: 4 },
      mapPoint: (x, y) => ({ x: x + 5, y: y - 3 }),
      toleranceRasterPx: 0.01,
    });
    const input = new Uint8ClampedArray([0, 10, 0, 0, 0, 200, 0, 0, 0, 40, 0, 0, 0, 0, 0, 0]);
    expect(
      rasterizeTextWarpAlpha({ mesh: plan, source: { width: 4, height: 4, data: input } }).data,
    ).toEqual(input);
  });

  it("adaptively refines a curved map and discloses a sampled positional tolerance", () => {
    const plan = mesh((x, y) => ({ x, y: y + (x * (4 - x)) / 2 }));
    expect(plan.vertexCount).toBeGreaterThan(4);
    expect(plan.maximumSampledErrorRasterPx).toBeLessThanOrEqual(plan.toleranceRasterPx);
    expect(plan.accuracyScope).toBe("edge-midpoints-diagonal-and-interior-probes");
    expect(plan.destination).toEqual({ left: 0, top: 0, width: 4, height: 6 });
    expect(plan.vertexCount).toBeLessThanOrEqual(TEXT_WARP_MESH_LIMITS.vertices);
    expect(plan.triangleCount).toBeLessThanOrEqual(TEXT_WARP_MESH_LIMITS.triangles);
  });

  it("has no cracks or double-alpha shared edges in a refined conforming mesh", () => {
    const plan = mesh(
      (x, y) => ({ x: x + 0.5 * Math.sin((Math.PI * x) / 16) * Math.sin((Math.PI * y) / 16), y }),
      16,
      16,
    );
    expect(plan.vertexCount).toBeGreaterThan(4);
    const result = rasterizeTextWarpAlpha({
      mesh: plan,
      source: { width: 16, height: 16, data: new Uint8ClampedArray(256).fill(80) },
    });
    for (let y = 1; y < 15; y++)
      for (let x = 1; x < 15; x++) expect(result.data[y * result.width + x]).toBe(80);
  });

  it("preserves reversed winding and deterministically composites folded alpha in source order", () => {
    const reversed = rasterizeTextWarpAlpha({
      mesh: mesh((x, y) => ({ x: 4 - x, y }), 4, 2),
      source: {
        width: 4,
        height: 2,
        data: new Uint8ClampedArray([20, 40, 60, 80, 20, 40, 60, 80]),
      },
    });
    expect(Array.from(reversed.data)).toEqual([80, 60, 40, 20, 80, 60, 40, 20]);
    const folded = mesh((x, y) => ({ x: x <= 2 ? x : 4 - x, y }), 4, 2);
    const source = {
      width: 4,
      height: 2,
      data: new Uint8ClampedArray([64, 64, 128, 128, 64, 64, 128, 128]),
    };
    const first = rasterizeTextWarpAlpha({ mesh: folded, source });
    expect(Array.from(first.data)).toEqual([160, 160, 160, 160]);
    expect(rasterizeTextWarpAlpha({ mesh: folded, source }).data).toEqual(first.data);
  });

  it("accepts a shared caller-owned destination frame and rejects accidental clipping", () => {
    const plan = prepareTextWarpMesh({
      sourceRect: { left: 0, top: 0, width: 2, height: 2 },
      mapPoint: identity,
      toleranceRasterPx: 0.01,
      destinationFrame: { left: -1, top: -1, width: 4, height: 4 },
    });
    const result = rasterizeTextWarpAlpha({
      mesh: plan,
      source: { width: 2, height: 2, data: new Uint8ClampedArray(4).fill(128) },
    });
    expect(Array.from(result.data)).toEqual([
      0, 0, 0, 0, 0, 128, 128, 0, 0, 128, 128, 0, 0, 0, 0, 0,
    ]);
    failure(
      () =>
        prepareTextWarpMesh({
          sourceRect: { left: 0, top: 0, width: 2, height: 2 },
          mapPoint: identity,
          toleranceRasterPx: 0.01,
          destinationFrame: { left: 0, top: 0, width: 1, height: 2 },
        }),
      "invalid",
    );
  });

  it("explicitly reports collapsed geometry, while a single collapsed boundary remains admissible", () => {
    failure(() => mesh(() => ({ x: 0, y: 0 })), "degenerate");
    failure(() => mesh((x) => ({ x, y: x })), "degenerate");
    const partial = mesh((x, y) => ({ x: (x * y) / 4, y }));
    expect(partial.degenerateTriangleCount).toBeGreaterThan(0);
    expect(partial.degenerateTriangleCount).toBeLessThan(partial.triangleCount);
    const result = rasterizeTextWarpAlpha({
      mesh: partial,
      source: { width: 4, height: 4, data: new Uint8ClampedArray(16).fill(255) },
    });
    expect(result.data.some((alpha) => alpha > 0)).toBe(true);
  });

  it("reports invalid and non-finite inputs without fallback", () => {
    failure(
      () =>
        prepareTextWarpMesh({
          sourceRect: { left: 0, top: 0, width: 0, height: 4 },
          mapPoint: identity,
          toleranceRasterPx: 0.1,
        }),
      "invalid",
    );
    failure(() => mesh(() => ({ x: NaN, y: 0 })), "mapping");
    failure(() => mesh(() => ({ x: Infinity, y: 0 })), "mapping");
    failure(() => mesh(() => ({ x: 10_000_001, y: 0 })), "mapping");
    failure(
      () =>
        mesh(() => {
          throw new Error("mapper failed");
        }),
      "mapping",
    );
    failure(
      () =>
        prepareTextWarpMesh({
          sourceRect: { left: 0, top: 0, width: 4, height: 4 },
          mapPoint: identity,
          toleranceRasterPx: NaN,
        }),
      "invalid",
    );
    failure(
      () =>
        rasterizeTextWarpAlpha({
          mesh: mesh(),
          source: { width: 4, height: 4, data: new Uint8ClampedArray(15) },
        }),
      "invalid",
    );
    failure(
      () =>
        rasterizeTextWarpAlpha({
          mesh: { ...mesh() },
          source: { width: 4, height: 4, data: new Uint8ClampedArray(16) },
        }),
      "invalid",
    );
  });

  it("fails explicitly when depth/pass accuracy or conforming-mesh budgets cannot be met", () => {
    const curve = (x: number, y: number): TextWarpPoint => ({ x, y: y + x * (4 - x) });
    failure(() => mesh(curve, 4, 4, { maxSubdivisionDepth: 0 }), "accuracy");
    failure(() => mesh(curve, 4, 4, { maxRefinementPasses: 0 }), "accuracy");
    failure(() => mesh(curve, 4, 4, { maxVertices: 4 }), "budget");
    failure(() => mesh(curve, 4, 4, { maxTriangles: 2 }), "budget");
    failure(() => mesh(identity, 4, 4, { maxWork: 1 }), "budget");
    failure(() => mesh(identity, 4, 4, { maxBytes: 32 }), "budget");
    failure(() => mesh((x, y) => ({ x: 2000 * x, y })), "budget");
    failure(() => mesh(identity, 4, 4, { maxDestinationPixels: 15 }), "budget");
    failure(() => mesh(identity, 4, 4, { maxDestinationSide: 3 }), "budget");
    failure(
      () => mesh(identity, 4, 4, { maxVertices: TEXT_WARP_MESH_LIMITS.vertices + 1 }),
      "invalid",
    );
  });

  it("preflights the full 4MP identity frame using bounded scanline work", () => {
    const plan = mesh(identity, 2000, 2000);
    expect(plan.destination.width * plan.destination.height).toBe(
      TEXT_WARP_MESH_LIMITS.destinationPixels,
    );
    expect(plan.proof.rasterCandidatePixels).toBeGreaterThanOrEqual(
      TEXT_WARP_MESH_LIMITS.destinationPixels,
    );
    expect(plan.proof.totalWork).toBeLessThan(TEXT_WARP_MESH_LIMITS.work);
    expect(plan.proof.plannedRasterBytesWithoutSource).toBe(
      plan.proof.preparationAllocatedNumericBytes + TEXT_WARP_MESH_LIMITS.destinationPixels,
    );
  });

  it("reserves an already-live source during mesh preparation without charging it twice", () => {
    failure(() => mesh(identity, 4, 4, { sourceBytes: 1000, maxBytes: 1100 }), "budget");
    const plan = mesh(identity, 4, 4, { sourceBytes: 16, reservedBytes: 32 });
    expect(plan.proof.reservedSourceBytes).toBe(16);
    expect(plan.proof.preparationPeakBytes).toBe(
      plan.proof.preparationAllocatedNumericBytes + 16 + 32,
    );
    const result = rasterizeTextWarpAlpha({
      mesh: plan,
      source: { width: 4, height: 4, data: new Uint8ClampedArray(16) },
    });
    expect(result.proof.peakBytes).toBe(plan.proof.preparationAllocatedNumericBytes + 16 + 16 + 32);
  });

  it("proves numeric/source/output/other scratch bytes and bounds aggregate raster work before allocation", () => {
    const plan = mesh(identity, 4, 4, { reservedBytes: 1024 });
    expect(plan.proof.numericBytes).toBe(plan.vertexCount * 32 + plan.triangleCount * 6);
    expect(plan.proof.totalWork).toBe(plan.proof.preparationWork + plan.proof.rasterWork);
    expect(plan.proof.totalWork).toBeLessThanOrEqual(TEXT_WARP_MESH_LIMITS.work);
    const source = { width: 4, height: 4, data: new Uint8ClampedArray(16) };
    const result = rasterizeTextWarpAlpha({ mesh: plan, source });
    expect(result.proof.reservedBytes).toBe(1024);
    expect(result.proof.peakBytes).toBe(
      plan.proof.preparationAllocatedNumericBytes + source.data.byteLength + 16 + 1024,
    );
    failure(
      () =>
        rasterizeTextWarpAlpha({
          mesh: plan,
          source,
          budget: { maxBytes: result.proof.peakBytes - 1 },
        }),
      "budget",
    );
    failure(
      () =>
        rasterizeTextWarpAlpha({
          mesh: plan,
          source,
          budget: { maxWork: plan.proof.totalWork - 1 },
        }),
      "budget",
    );
    const largeBacking = new Uint8ClampedArray(1024).subarray(0, 16);
    failure(
      () =>
        rasterizeTextWarpAlpha({
          mesh: plan,
          source: { width: 4, height: 4, data: largeBacking },
          budget: { maxBytes: 1500 },
        }),
      "budget",
    );
  });
});
