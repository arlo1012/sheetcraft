// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  createPictureProjectiveGeometry,
  hitPictureProjectiveFront,
  mapPictureProjectivePoint,
  PICTURE_PROJECTIVE_LIMITS,
  PictureProjectiveGeometryError,
  tessellatePictureProjectiveFront,
  type PictureProjectiveFailure,
  type PictureProjectiveGeometry,
  type PictureProjectiveGeometryInput,
  type PictureProjectivePoint,
  type PictureProjectiveRotation,
} from "../../../shared/images/picture-projective-geometry";

function parallel(
  xDeg = 0,
  yDeg = 0,
  zDeg = 0,
  distanceFromGroundPx = 0,
): PictureProjectiveRotation {
  return { projection: "parallel", xDeg, yDeg, zDeg, distanceFromGroundPx };
}
function perspective(
  xDeg = 0,
  yDeg = 0,
  zDeg = 0,
  perspectiveDeg = 45,
  distanceFromGroundPx = 0,
): PictureProjectiveRotation {
  return { projection: "perspective", xDeg, yDeg, zDeg, perspectiveDeg, distanceFromGroundPx };
}
function geometry(rotation = parallel(), depthPx = 0): PictureProjectiveGeometry {
  return createPictureProjectiveGeometry({ widthPx: 360, heightPx: 240, depthPx, rotation });
}
function near(actual: PictureProjectivePoint, expected: PictureProjectivePoint, digits = 9): void {
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.y).toBeCloseTo(expected.y, digits);
}
function distance(first: PictureProjectivePoint, second: PictureProjectivePoint): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}
function rejectsReason(run: () => unknown, reason: PictureProjectiveFailure): void {
  try {
    run();
    throw new Error("Expected a bounded projective failure.");
  } catch (error) {
    expect(error).toBeInstanceOf(PictureProjectiveGeometryError);
    expect((error as PictureProjectiveGeometryError).reason).toBe(reason);
  }
}

describe("pure picture projective geometry", () => {
  test("identity uses an actual 4x4 map and an unchanged immutable selection frame", () => {
    const input: PictureProjectiveGeometryInput = {
      widthPx: 360,
      heightPx: 240,
      rotation: parallel(),
    };
    const saved = JSON.stringify(input);
    const result = createPictureProjectiveGeometry(input);
    expect(result.sourceToScreenMatrix).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    expect(result.front.corners).toEqual([
      { x: 0, y: 0 },
      { x: 360, y: 0 },
      { x: 360, y: 240 },
      { x: 0, y: 240 },
    ]);
    expect(result.selectionBounds).toEqual({ left: 0, top: 0, right: 360, bottom: 240 });
    expect(result.visualBounds).toEqual(result.selectionBounds);
    expect(result.back).toBeNull();
    expect(result.sides).toEqual([]);
    expect(result.front.facing).toBe("front");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.front.homography)).toBe(true);
    expect(Object.isFrozen(result.front.corners[0])).toBe(true);
    expect(JSON.stringify(input)).toBe(saved);
  });

  test("observed X45 parallel compresses width about the selection center", () => {
    const result = geometry(parallel(45));
    const width = 360 / Math.sqrt(2);
    expect(result.visualBounds.right - result.visualBounds.left).toBeCloseTo(width, 10);
    expect(result.visualBounds.top).toBeCloseTo(0, 10);
    expect(result.visualBounds.bottom).toBeCloseTo(240, 10);
    expect((result.visualBounds.right + result.visualBounds.left) / 2).toBeCloseTo(180, 10);
    expect(result.selectionBounds.right).toBe(360);
  });

  test("observed Y45 parallel compresses height about the selection center", () => {
    const result = geometry(parallel(0, 45));
    expect(result.visualBounds.bottom - result.visualBounds.top).toBeCloseTo(
      240 / Math.sqrt(2),
      10,
    );
    expect(result.visualBounds.left).toBeCloseTo(0, 10);
    expect(result.visualBounds.right).toBeCloseTo(360, 10);
    expect((result.visualBounds.top + result.visualBounds.bottom) / 2).toBeCloseTo(120, 10);
  });

  test("observed positive Z is screen counterclockwise and can extend outside the frame", () => {
    const result = geometry(parallel(0, 0, 45));
    const rightMiddle = mapPictureProjectivePoint(result, { x: 360, y: 120 });
    expect(rightMiddle.x).toBeGreaterThan(180);
    expect(rightMiddle.y).toBeLessThan(120);
    expect(result.visualBounds.top).toBeLessThan(0);
    expect(result.visualBounds.bottom).toBeGreaterThan(240);
    expect(result.selectionBounds).toEqual({ left: 0, top: 0, right: 360, bottom: 240 });
  });

  test("observed perspective X45 has a shorter left edge and taller right edge", () => {
    const result = geometry(perspective(45));
    const [tl, tr, br, bl] = result.front.corners;
    expect(distance(tl, bl)).toBeLessThan(240);
    expect(distance(tr, br)).toBeGreaterThan(240);
    expect(tl.y).toBeGreaterThan(tr.y);
    expect(bl.y).toBeLessThan(br.y);
    expect(result.sourceToScreenMatrix[12]).not.toBe(0);
    // A single affine would preserve parallel horizontal edges and equal side lengths.
    expect(tr.y - tl.y).not.toBeCloseTo(br.y - bl.y, 8);
  });

  test("observed perspective Y45 has a wider top edge and narrower bottom edge", () => {
    const result = geometry(perspective(0, 45));
    const [tl, tr, br, bl] = result.front.corners;
    expect(distance(tl, tr)).toBeGreaterThan(360);
    expect(distance(bl, br)).toBeLessThan(360);
    expect(result.sourceToScreenMatrix[13]).not.toBe(0);
  });

  test("perspective zero is exactly the product parallel map, including mixed axes and depth", () => {
    const first = geometry(parallel(31, 23, 17, 40), 24);
    const second = geometry(perspective(31, 23, 17, 0, 40), 24);
    expect(second.sourceToScreenMatrix).toEqual(first.sourceToScreenMatrix);
    expect(second.front.corners).toEqual(first.front.corners);
    expect(second.back?.corners).toEqual(first.back?.corners);
  });

  test("pure Z perspective remains the same in-plane counterclockwise map", () => {
    const first = geometry(parallel(0, 0, 45));
    const second = geometry(perspective(0, 0, 45));
    expect(second.front.corners).toEqual(first.front.corners);
  });

  test("product mixed-axis order and local-normal ground offset are explicit", () => {
    const result = geometry(perspective(31, 23, 17, 45, 13));
    const radians = Math.PI / 180;
    const source = { x: 240, y: 160 };
    const localX = source.x - 180,
      localY = source.y - 120;
    const yawX = Math.cos(31 * radians) * localX - Math.sin(31 * radians) * 13;
    const yawZ = Math.sin(31 * radians) * localX + Math.cos(31 * radians) * 13;
    const pitchY = Math.cos(23 * radians) * localY + Math.sin(23 * radians) * yawZ;
    const worldZ = -Math.sin(23 * radians) * localY + Math.cos(23 * radians) * yawZ;
    const worldX = Math.cos(17 * radians) * yawX + Math.sin(17 * radians) * pitchY;
    const worldY = -Math.sin(17 * radians) * yawX + Math.cos(17 * radians) * pitchY;
    const w = 1 - (worldZ * Math.tan((45 * radians) / 2)) / 720;
    near(mapPictureProjectivePoint(result, source), { x: 180 + worldX / w, y: 120 + worldY / w });
    expect(result.selectionBounds).toEqual({ left: 0, top: 0, right: 360, bottom: 240 });
  });

  test.each([
    parallel(31, 23, 17),
    perspective(45),
    perspective(0, 45),
    perspective(31, 23, 17, 70, 13),
    { ...parallel(31, 23, 17), projection: "oblique" as const, shearX: 0.4, shearY: -0.3 },
  ])("exact inverse texture coordinates round-trip corners and interior for %j", (rotation) => {
    const result = geometry(rotation);
    for (const source of [
      { x: 0, y: 0 },
      { x: 360, y: 0 },
      { x: 360, y: 240 },
      { x: 0, y: 240 },
      { x: 43.5, y: 78.25 },
      { x: 180, y: 120 },
      { x: 299, y: 205 },
    ]) {
      const hit = hitPictureProjectiveFront(result, mapPictureProjectivePoint(result, source));
      expect(hit).not.toBeNull();
      near(hit!, source, 8);
      expect(hit!.u).toBeCloseTo(source.x / 360, 10);
      expect(hit!.v).toBeCloseTo(source.y / 240, 10);
    }
    expect(
      hitPictureProjectiveFront(result, mapPictureProjectivePoint(result, { x: -10, y: 120 })),
    ).toBeNull();
  });

  test("backfaces and edge-on fronts do not falsely hit or texture-sample", () => {
    const back = geometry(parallel(180), 24);
    expect(back.front.facing).toBe("back");
    expect(back.front.inverseHomography).not.toBeNull();
    expect(hitPictureProjectiveFront(back, { x: 180, y: 120 })).toBeNull();
    expect(back.visibleFaces.map((entry) => entry.kind)).toEqual(["back"]);
    const edge = geometry(parallel(90), 24);
    expect(edge.front.facing).toBe("edge-on");
    expect(edge.front.inverseHomography).toBeNull();
    expect(hitPictureProjectiveFront(edge, { x: 180, y: 120 })).toBeNull();
    expect(edge.visibleFaces.map((entry) => entry.kind)).toEqual(["right"]);
    expect(edge.visualBounds.right - edge.visualBounds.left).toBeCloseTo(24, 10);
    rejectsReason(() => tessellatePictureProjectiveFront(edge), "degenerate");
    for (const plane of [geometry(parallel(90)), geometry(parallel(90, 0, 45))]) {
      expect(plane.front.inverseHomography).toBeNull();
      expect(plane.visibleFaces).toHaveLength(0);
      expect(hitPictureProjectiveFront(plane, { x: 180, y: 120 })).toBeNull();
      rejectsReason(() => tessellatePictureProjectiveFront(plane), "degenerate");
    }
  });

  test("product extrusion provides projected side normals, depth ordering and combined paint bounds", () => {
    const result = geometry(perspective(30, 20, 0), 40);
    expect(result.sides.map((entry) => entry.kind)).toEqual(["top", "right", "bottom", "left"]);
    expect(result.back).not.toBeNull();
    expect(result.visibleFaces.map((entry) => entry.kind).sort()).toEqual([
      "front",
      "right",
      "top",
    ]);
    expect(result.back!.averageDepth).toBeLessThan(result.front.averageDepth);
    for (let index = 1; index < result.visibleFaces.length; index++)
      expect(result.visibleFaces[index]!.averageDepth).toBeGreaterThanOrEqual(
        result.visibleFaces[index - 1]!.averageDepth,
      );
    for (const face of [result.front, result.back!, ...result.sides]) {
      expect(Math.hypot(face.normal.x, face.normal.y, face.normal.z)).toBeCloseTo(1, 10);
      for (const corner of face.corners) {
        expect(corner.x).toBeGreaterThanOrEqual(result.visualBounds.left);
        expect(corner.x).toBeLessThanOrEqual(result.visualBounds.right);
        expect(corner.y).toBeGreaterThanOrEqual(result.visualBounds.top);
        expect(corner.y).toBeLessThanOrEqual(result.visualBounds.bottom);
      }
    }
    expect(result.selectionBounds.right).toBe(360);
  });

  test("product oblique shears depth with a genuine affine front plane", () => {
    const result = geometry(
      { ...parallel(), projection: "oblique", shearX: 0.5, shearY: -0.25 },
      40,
    );
    expect(result.front.corners).toEqual(geometry().front.corners);
    near(result.back!.corners[0], { x: -20, y: 10 });
    expect(result.front.homography.slice(6)).toEqual([0, 0, 1]);
    expect(result.visualBounds).toEqual({ left: -20, top: 0, right: 360, bottom: 250 });
  });

  test("ground distance changes appearance without mutating the frame", () => {
    const first = geometry(parallel(45, 0, 0, 0));
    const second = geometry(parallel(45, 0, 0, 40));
    expect(second.front.centerWorld.x).toBeCloseTo(-40 / Math.sqrt(2), 10);
    expect(second.front.centerWorld.z).toBeCloseTo(40 / Math.sqrt(2), 10);
    expect(second.visualBounds.left - first.visualBounds.left).toBeCloseTo(-40 / Math.sqrt(2), 10);
    expect(second.selectionBounds).toEqual(first.selectionBounds);
  });
});

describe("bounded projective rejection", () => {
  test.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, -1, 65_537])(
    "rejects invalid frame width %s before allocation",
    (widthPx) => {
      rejectsReason(
        () => createPictureProjectiveGeometry({ widthPx, heightPx: 240, rotation: parallel() }),
        "invalid-input",
      );
    },
  );
  test.each([
    { ...parallel(), xDeg: Number.NaN },
    { ...parallel(), yDeg: Number.POSITIVE_INFINITY },
    { ...parallel(), zDeg: 3601 },
    { ...parallel(), distanceFromGroundPx: Number.NaN },
    { ...perspective(), perspectiveDeg: 121 },
    { ...perspective(), perspectiveDeg: -1 },
    { ...parallel(), projection: "oblique" as const, shearX: Number.NaN, shearY: 0 },
    { ...parallel(), projection: "oblique" as const, shearX: 0, shearY: 17 },
  ])("rejects nonfinite/out-of-budget projection %j", (rotation) => {
    rejectsReason(() => geometry(rotation), "invalid-input");
  });
  test("rejects invalid depth and unknown projection", () => {
    rejectsReason(() => geometry(parallel(), -1), "invalid-input");
    rejectsReason(() => geometry(parallel(), Number.POSITIVE_INFINITY), "invalid-input");
    rejectsReason(
      () =>
        geometry({ ...parallel(), projection: "unknown" } as unknown as PictureProjectiveRotation),
      "invalid-input",
    );
  });
  test("guards front and back against crossing or approaching the near plane", () => {
    rejectsReason(() => geometry(perspective(0, 0, 0, 120, 420)), "near-plane");
    // A facing-away extrusion can bring its back plane toward the camera.
    rejectsReason(() => geometry(perspective(180, 0, 0, 120), 420), "near-plane");
    const focal = 720 / Math.tan(Math.PI / 8);
    rejectsReason(
      () =>
        geometry(perspective(0, 0, 0, 45, focal * (1 - PICTURE_PROJECTIVE_LIMITS.nearPlaneW / 2))),
      "near-plane",
    );
  });
  test("guards projected coordinate budgets even with a positive safe denominator", () => {
    const widthPx = 40_000,
      heightPx = 40_000;
    const focal = (2 * widthPx) / Math.tan(Math.PI / 3);
    rejectsReason(
      () =>
        createPictureProjectiveGeometry({
          widthPx,
          heightPx,
          rotation: perspective(0, 0, 0, 120, focal * 0.998),
        }),
      "coordinate-budget",
    );
  });
  test("map and hit reject nonfinite points", () => {
    const result = geometry();
    rejectsReason(
      () => mapPictureProjectivePoint(result, { x: Number.NaN, y: 0 }),
      "invalid-input",
    );
    rejectsReason(
      () => hitPictureProjectiveFront(result, { x: 0, y: Number.POSITIVE_INFINITY }),
      "invalid-input",
    );
  });
});

describe("error-bounded Canvas triangle mesh", () => {
  test.each([
    parallel(),
    parallel(31, 23, 17),
    perspective(31, 23, 17, 0),
    { ...parallel(31, 23, 17), projection: "oblique" as const, shearX: 0.4, shearY: -0.3 },
  ])("affine projections need exactly two zero-error triangles for %j", (rotation) => {
    const mesh = tessellatePictureProjectiveFront(geometry(rotation), { maxTriangles: 2 });
    expect(mesh.subdivisions).toBe(1);
    expect(mesh.vertices).toHaveLength(4);
    expect(mesh.triangles).toHaveLength(2);
    expect(mesh.maxErrorPx).toBe(0);
  });
  test("the proven error bounds hold throughout every sampled triangle", () => {
    const result = geometry(perspective(45, 25, 17, 70, 13), 24);
    const tolerance = 0.25;
    const mesh = tessellatePictureProjectiveFront(result, { maxErrorPx: tolerance });
    expect(mesh.subdivisions).toBeGreaterThan(1);
    expect(mesh.maxErrorPx).toBeLessThanOrEqual(tolerance);
    expect(mesh.triangles.length).toBeLessThanOrEqual(PICTURE_PROJECTIVE_LIMITS.triangles);
    expect(mesh.vertices.length).toBeLessThanOrEqual(4225);
    const weights = [
      [1 / 3, 1 / 3, 1 / 3],
      [0.1, 0.2, 0.7],
      [0.8, 0.1, 0.1],
      [0.5, 0.5, 0],
      [0, 0.5, 0.5],
      [0.5, 0, 0.5],
    ] as const;
    for (const triangle of mesh.triangles) {
      const affine = triangle.sourceToScreenAffine;
      for (const weight of weights) {
        const x = triangle.vertices.reduce(
          (sum, entry, index) => sum + entry.source.x * weight[index]!,
          0,
        );
        const y = triangle.vertices.reduce(
          (sum, entry, index) => sum + entry.source.y * weight[index]!,
          0,
        );
        const actual = mapPictureProjectivePoint(result, { x, y });
        const approximate = {
          x: affine.a * x + affine.c * y + affine.e,
          y: affine.b * x + affine.d * y + affine.f,
        };
        expect(distance(actual, approximate)).toBeLessThanOrEqual(triangle.errorBoundPx + 1e-9);
        expect(triangle.errorBoundPx).toBeLessThanOrEqual(tolerance);
      }
    }
  });
  test("shared mesh vertices give every neighboring cell an identical edge", () => {
    const mesh = tessellatePictureProjectiveFront(geometry(perspective(45)), { maxErrorPx: 0.25 });
    const first = mesh.triangles[0]!,
      second = mesh.triangles[1]!;
    expect(first.vertices[0]).toBe(second.vertices[0]);
    expect(first.vertices[2]).toBe(second.vertices[1]);
    expect(mesh.triangles.length).toBe(2 * mesh.subdivisions ** 2);
    expect(Object.isFrozen(mesh.triangles)).toBe(true);
  });
  test("an insufficient mesh budget rejects instead of substituting a single affine", () => {
    rejectsReason(
      () =>
        tessellatePictureProjectiveFront(geometry(perspective(45)), {
          maxErrorPx: 0.25,
          maxTriangles: 2,
        }),
      "mesh-budget",
    );
    rejectsReason(
      () => tessellatePictureProjectiveFront(geometry(perspective(45)), { maxErrorPx: 0.0001 }),
      "mesh-budget",
    );
  });
  test.each([
    { maxTriangles: 1 },
    { maxTriangles: 8193 },
    { maxTriangles: 2.5 },
    { maxTriangles: Number.NaN },
    { maxErrorPx: 0 },
    { maxErrorPx: Number.POSITIVE_INFINITY },
  ])("rejects invalid mesh options %j", (options) => {
    rejectsReason(() => tessellatePictureProjectiveFront(geometry(), options), "invalid-input");
  });
});
