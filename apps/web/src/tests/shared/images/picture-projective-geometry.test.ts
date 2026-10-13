// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  createPictureProjectiveGeometry,
  hitPictureProjectiveFront,
  mapPictureProjectivePoint,
  PICTURE_PROJECTIVE_LIMITS,
  PictureProjectiveGeometryError,
  tessellatePictureProjectiveFront,
  type PictureProjectiveAffine,
  type PictureProjectiveFailure,
  type PictureProjectiveGeometry,
  type PictureProjectiveGeometryInput,
  type PictureProjectivePoint,
  type PictureProjectiveMatrix4,
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
const identityPlacement: PictureProjectiveAffine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
function placed(
  affine: PictureProjectiveAffine,
  source: PictureProjectivePoint,
): PictureProjectivePoint {
  return {
    x: affine.a * source.x + affine.c * source.y + affine.e,
    y: affine.b * source.x + affine.d * source.y + affine.f,
  };
}
function mapped4(matrix: PictureProjectiveMatrix4, source: PictureProjectivePoint, z = 0) {
  const w = matrix[12] * source.x + matrix[13] * source.y + matrix[14] * z + matrix[15];
  return {
    x: (matrix[0] * source.x + matrix[1] * source.y + matrix[2] * z + matrix[3]) / w,
    y: (matrix[4] * source.x + matrix[5] * source.y + matrix[6] * z + matrix[7]) / w,
    z: (matrix[8] * source.x + matrix[9] * source.y + matrix[10] * z + matrix[11]) / w,
  };
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

describe("one common scene camera with leaf-local output", () => {
  test.each([
    parallel(),
    parallel(31, 23, 17, 13),
    perspective(31, 23, 17, 70, 13),
    { ...parallel(31, 23, 17), projection: "oblique" as const, shearX: 0.4, shearY: -0.3 },
  ])(
    "an explicit identical scene preserves the existing leaf camera exactly for %j",
    (rotation) => {
      const input = { widthPx: 360, heightPx: 240, depthPx: 24, rotation };
      const ordinary = createPictureProjectiveGeometry(input);
      const shared = createPictureProjectiveGeometry({
        ...input,
        scene: { widthPx: 360, heightPx: 240, sourceToScene: identityPlacement },
      });
      expect({ ...shared, isSceneProjection: false }).toEqual(ordinary);
      expect(shared.isSceneProjection).toBe(true);
      expect(shared.sourceToSceneScreenMatrix).toEqual(shared.sourceToScreenMatrix);
      expect(shared.projectedOrientation).toBe(1);
    },
  );

  test.each([30, 45])(
    "X%s moves both leaf centers about the common pivot, unlike independent cameras",
    (angle) => {
      const cosine = Math.cos((angle * Math.PI) / 180);
      const centers: PictureProjectivePoint[] = [];
      for (const e of [20, 260]) {
        const placement = { ...identityPlacement, e, f: 40 };
        const input = { widthPx: 80, heightPx: 60, depthPx: 24, rotation: parallel(angle) };
        const shared = createPictureProjectiveGeometry({
          ...input,
          scene: { widthPx: 400, heightPx: 160, sourceToScene: placement },
        });
        const center = placed(placement, mapPictureProjectivePoint(shared, { x: 40, y: 30 }));
        near(center, { x: 200 + (e + 40 - 200) * cosine, y: 70 });
        const independent = placed(
          placement,
          mapPictureProjectivePoint(createPictureProjectiveGeometry(input), { x: 40, y: 30 }),
        );
        near(independent, { x: e + 40, y: 70 });
        expect(center.x).not.toBeCloseTo(independent.x, 8);
        expect(shared.widthPx).toBe(80);
        expect(shared.heightPx).toBe(60);
        expect(shared.selectionBounds).toEqual({ left: 0, top: 0, right: 80, bottom: 60 });
        expect(shared.depthPx).toBe(24);
        centers.push(center);
      }
      expect(centers[1]!.x - centers[0]!.x).toBeCloseTo(240 * cosine, 10);
    },
  );

  test("a supplied scene pivot controls both the common rotation origin and returned principal point", () => {
    const placement = { ...identityPlacement, e: 20, f: 25 };
    const shared = createPictureProjectiveGeometry({
      widthPx: 100,
      heightPx: 60,
      rotation: parallel(45),
      scene: { widthPx: 400, heightPx: 160, pivot: { x: 120, y: 70 }, sourceToScene: placement },
    });
    const source = { x: 75, y: 45 };
    near(placed(placement, mapPictureProjectivePoint(shared, source)), {
      x: 120 + (source.x + 20 - 120) / Math.sqrt(2),
      y: source.y + 25,
    });
    const world = mapped4(shared.sourceToWorldMatrix, source);
    expect(world.x).toBeCloseTo((source.x + 20 - 120) / Math.sqrt(2), 10);
    expect(world.z).toBeCloseTo((source.x + 20 - 120) / Math.sqrt(2), 10);
  });

  test("offset, rotated, scaled and sheared source placement shares one focal calibration and exact inverse", () => {
    const placement: PictureProjectiveAffine = { a: 1.2, b: 0.4, c: -0.25, d: 0.9, e: 145, f: 42 };
    const rotation = perspective(31, 23, 17, 70, 13);
    const common = createPictureProjectiveGeometry({
      widthPx: 600,
      heightPx: 320,
      depthPx: 24,
      rotation,
    });
    const input: PictureProjectiveGeometryInput = {
      widthPx: 80,
      heightPx: 60,
      depthPx: 24,
      rotation,
      scene: { widthPx: 600, heightPx: 320, sourceToScene: placement },
    };
    const saved = JSON.stringify(input);
    const shared = createPictureProjectiveGeometry(input);
    for (const source of [
      { x: 0, y: 0 },
      { x: 80, y: 60 },
      { x: 17.5, y: 41.25 },
    ]) {
      const local = mapPictureProjectivePoint(shared, source);
      near(
        placed(placement, local),
        mapPictureProjectivePoint(common, placed(placement, source)),
        8,
      );
      near(mapped4(shared.sourceToSceneScreenMatrix, source), placed(placement, local), 8);
      const hit = hitPictureProjectiveFront(shared, local);
      expect(hit).not.toBeNull();
      near(hit!, source, 8);
      for (const z of [0, -24]) {
        near(
          placed(placement, mapped4(shared.sourceToScreenMatrix, source, z)),
          mapped4(common.sourceToScreenMatrix, placed(placement, source), z),
          8,
        );
        const actualWorld = mapped4(shared.sourceToWorldMatrix, source, z);
        const expectedWorld = mapped4(common.sourceToWorldMatrix, placed(placement, source), z);
        near(actualWorld, expectedWorld, 8);
        expect(actualWorld.z).toBeCloseTo(expectedWorld.z, 8);
      }
    }
    expect(JSON.stringify(input)).toBe(saved);
    expect(Object.isFrozen(shared.sourceNormalToWorldMatrix)).toBe(true);
    expect(Object.isFrozen(shared.sceneToOutputMatrix)).toBe(true);
  });

  test("inverse-transpose normals stay perpendicular to sheared physical faces and exclude the output adapter", () => {
    const placement = { a: 2, b: 0, c: 1, d: 1, e: 80, f: 25 };
    const input: PictureProjectiveGeometryInput = {
      widthPx: 80,
      heightPx: 60,
      depthPx: 24,
      rotation: parallel(30, 20, 17),
      scene: { widthPx: 400, heightPx: 240, sourceToScene: placement },
    };
    const local = createPictureProjectiveGeometry(input);
    const commonOutput = createPictureProjectiveGeometry({
      ...input,
      scene: { ...input.scene!, sceneToOutput: identityPlacement },
    });
    expect(commonOutput.sourceToWorldMatrix).toEqual(local.sourceToWorldMatrix);
    expect(commonOutput.sourceNormalToWorldMatrix).toEqual(local.sourceNormalToWorldMatrix);
    expect(commonOutput.sourceToScreenMatrix).not.toEqual(local.sourceToScreenMatrix);
    for (const face of [local.front, local.back!, ...local.sides]) {
      const other = [commonOutput.front, commonOutput.back!, ...commonOutput.sides].find(
        (entry) => entry.kind === face.kind,
      )!;
      expect(other.normal).toEqual(face.normal);
      expect(other.facing).toBe(face.facing);
      expect(other.averageDepth).toBe(face.averageDepth);
      expect(Math.hypot(face.normal.x, face.normal.y, face.normal.z)).toBeCloseTo(1, 10);
    }
    const m = local.sourceToWorldMatrix;
    const right = local.sides.find((face) => face.kind === "right")!.normal;
    expect(right.x * m[1] + right.y * m[5] + right.z * m[9]).toBeCloseTo(0, 10);
    expect(right.x * m[2] + right.y * m[6] + right.z * m[10]).toBeCloseTo(0, 10);
    expect(right.x * m[0] + right.y * m[4] + right.z * m[8]).toBeGreaterThan(0);
    const normalMatrix = local.sourceNormalToWorldMatrix;
    const length = Math.hypot(normalMatrix[0], normalMatrix[4], normalMatrix[8]);
    expect(right.x).toBeCloseTo(normalMatrix[0] / length, 10);
    expect(right.y).toBeCloseTo(normalMatrix[4] / length, 10);
    expect(right.z).toBeCloseTo(normalMatrix[8] / length, 10);
  });

  test("reflected source placement preserves physical front/back culling and swaps the exposed side", () => {
    const placement = { a: -1, b: 0, c: 0, d: 1, e: 300, f: 30 };
    const input: PictureProjectiveGeometryInput = {
      widthPx: 80,
      heightPx: 60,
      depthPx: 24,
      rotation: parallel(30),
      scene: { widthPx: 400, heightPx: 160, sourceToScene: placement },
    };
    const local = createPictureProjectiveGeometry(input);
    expect(local.front.facing).toBe("front");
    expect(local.back!.facing).toBe("back");
    expect(local.visibleFaces.map((face) => face.kind).sort()).toEqual(["front", "left"]);
    expect(local.projectedOrientation).toBe(1);
    const commonOutput = createPictureProjectiveGeometry({
      ...input,
      scene: { ...input.scene!, sceneToOutput: identityPlacement },
    });
    expect(commonOutput.projectedOrientation).toBe(-1);
    expect(commonOutput.visibleFaces.map((face) => face.kind)).toEqual(
      local.visibleFaces.map((face) => face.kind),
    );
    for (const shared of [local, commonOutput]) {
      const source = { x: 17.5, y: 41.25 };
      near(
        hitPictureProjectiveFront(shared, mapPictureProjectivePoint(shared, source))!,
        source,
        9,
      );
      for (const face of [shared.front, shared.back!, ...shared.sides])
        for (const corner of face.corners) {
          expect(corner.x).toBeGreaterThanOrEqual(shared.visualBounds.left);
          expect(corner.x).toBeLessThanOrEqual(shared.visualBounds.right);
          expect(corner.y).toBeGreaterThanOrEqual(shared.visualBounds.top);
          expect(corner.y).toBeLessThanOrEqual(shared.visualBounds.bottom);
        }
    }
  });

  test("the actual leaf front/depth and extended source points guard the scene horizon", () => {
    const scene = { widthPx: 360, heightPx: 240, sourceToScene: { ...identityPlacement, e: 1900 } };
    const rotation = perspective(90);
    expect(() =>
      createPictureProjectiveGeometry({ widthPx: 360, heightPx: 240, rotation }),
    ).not.toThrow();
    rejectsReason(
      () => createPictureProjectiveGeometry({ widthPx: 80, heightPx: 60, rotation, scene }),
      "near-plane",
    );
    rejectsReason(
      () =>
        createPictureProjectiveGeometry({
          widthPx: 80,
          heightPx: 60,
          depthPx: 420,
          rotation: perspective(180, 0, 0, 120),
          scene: { ...scene, sourceToScene: identityPlacement },
        }),
      "near-plane",
    );
    const valid = createPictureProjectiveGeometry({
      widthPx: 80,
      heightPx: 60,
      rotation,
      scene: { ...scene, sourceToScene: identityPlacement },
    });
    rejectsReason(() => mapPictureProjectivePoint(valid, { x: 2000, y: 30 }), "near-plane");
  });

  test("edge-on scene planes retain the leaf frame and null inverse even with large affine scale", () => {
    const shared = createPictureProjectiveGeometry({
      widthPx: 80,
      heightPx: 60,
      rotation: parallel(90),
      scene: {
        widthPx: 65_536,
        heightPx: 65_536,
        sourceToScene: { ...identityPlacement, a: 100_000, d: 100_000 },
      },
    });
    expect(shared.front.facing).toBe("edge-on");
    expect(shared.front.inverseHomography).toBeNull();
    expect(shared.visibleFaces).toEqual([]);
    expect(shared.selectionBounds).toEqual({ left: 0, top: 0, right: 80, bottom: 60 });
    rejectsReason(() => tessellatePictureProjectiveFront(shared), "degenerate");
  });

  test("a small adapted area keeps a finite inverse for a physically front-facing scene", () => {
    const shared = createPictureProjectiveGeometry({
      widthPx: 80,
      heightPx: 60,
      depthPx: 24,
      rotation: parallel(),
      scene: {
        widthPx: 400,
        heightPx: 160,
        sourceToScene: { ...identityPlacement, a: 0.01, d: 0.01 },
        sceneToOutput: { ...identityPlacement, a: 0.0001, d: 0.0001 },
      },
    });
    expect(shared.front.facing).toBe("front");
    expect(shared.front.inverseHomography).not.toBeNull();
    expect(shared.back!.inverseHomography).not.toBeNull();
    for (const source of [
      { x: 0, y: 0 },
      { x: 80, y: 60 },
      { x: 17.5, y: 41.25 },
    ])
      near(
        hitPictureProjectiveFront(shared, mapPictureProjectivePoint(shared, source))!,
        source,
        8,
      );
    const mesh = tessellatePictureProjectiveFront(shared, { maxTriangles: 2 });
    expect(mesh.triangles).toHaveLength(2);
    expect(mesh.maxErrorPx).toBe(0);
    expect(shared.visualBounds.right).toBeCloseTo(0.00008, 12);
    expect(shared.visualBounds.bottom).toBeCloseTo(0.00006, 12);
  });

  test("large inverse coefficients normalize projectively without rejecting a valid small output", () => {
    const shared = createPictureProjectiveGeometry({
      widthPx: 80,
      heightPx: 60,
      rotation: parallel(),
      scene: {
        widthPx: 400,
        heightPx: 160,
        sourceToScene: { ...identityPlacement, a: 0.001, d: 0.001 },
        sceneToOutput: { ...identityPlacement, a: 0.00002, d: 0.00002 },
      },
    });
    expect(shared.front.inverseHomography).not.toBeNull();
    const source = { x: 17.5, y: 41.25 };
    near(hitPictureProjectiveFront(shared, mapPictureProjectivePoint(shared, source))!, source, 8);
    expect(tessellatePictureProjectiveFront(shared, { maxTriangles: 2 }).triangles).toHaveLength(2);
  });

  test("a well-conditioned scene inverse accepts positive denominators below the ordinary cutoff", () => {
    const shared = createPictureProjectiveGeometry({
      widthPx: 65_536,
      heightPx: 65_536,
      rotation: perspective(-45, 0, 45, 120, -65_536),
      scene: {
        widthPx: 1e-6,
        heightPx: 1e-6,
        pivot: { x: 0, y: 0 },
        sourceToScene: { ...identityPlacement, e: 9_000_000 },
        sceneToOutput: { ...identityPlacement, a: 10_000_000, d: 10_000_000 },
      },
    });
    expect(shared.front.facing).toBe("front");
    for (const source of [
      { x: 0, y: 0 },
      { x: 65_536, y: 65_536 },
      { x: 32_768, y: 32_768 },
    ]) {
      const screen = mapPictureProjectivePoint(shared, source);
      const hit = hitPictureProjectiveFront(shared, screen);
      expect(hit).not.toBeNull();
      expect(Math.abs(hit!.x - source.x)).toBeLessThan(1 / 1024);
      expect(Math.abs(hit!.y - source.y)).toBeLessThan(1 / 1024);
      near(mapPictureProjectivePoint(shared, hit!), screen, 10);
    }
  });

  test("an ill-conditioned diagonal sliver fails explicitly during scene construction", () => {
    rejectsReason(
      () =>
        createPictureProjectiveGeometry({
          widthPx: 65_536,
          heightPx: 65_536,
          rotation: perspective(-45, 0, 45, 120),
          scene: {
            widthPx: 1e-6,
            heightPx: 1e-6,
            pivot: { x: 0, y: 0 },
            sourceToScene: { ...identityPlacement, e: 9_000_000 },
            sceneToOutput: { ...identityPlacement, a: 10_000_000, d: 10_000_000 },
          },
        }),
      "degenerate",
    );
  });

  test("scene dimensions, affine singularities, inverse expansion and both coordinate spaces are bounded", () => {
    const input = { widthPx: 80, heightPx: 60, rotation: parallel() };
    const scene = { widthPx: 400, heightPx: 160, sourceToScene: identityPlacement };
    rejectsReason(
      () => createPictureProjectiveGeometry({ ...input, scene: { ...scene, widthPx: 0 } }),
      "invalid-input",
    );
    rejectsReason(
      () =>
        createPictureProjectiveGeometry({
          ...input,
          scene: { ...scene, pivot: { x: Number.NaN, y: 0 } },
        }),
      "invalid-input",
    );
    rejectsReason(
      () =>
        createPictureProjectiveGeometry({
          ...input,
          scene: { ...scene, sourceToScene: { ...identityPlacement, b: Number.NaN } },
        }),
      "invalid-input",
    );
    rejectsReason(
      () =>
        createPictureProjectiveGeometry({
          ...input,
          scene: { ...scene, sourceToScene: { ...identityPlacement, a: 0 } },
        }),
      "degenerate",
    );
    rejectsReason(
      () =>
        createPictureProjectiveGeometry({
          ...input,
          scene: { ...scene, sceneToOutput: { ...identityPlacement, d: 0 } },
        }),
      "degenerate",
    );
    rejectsReason(
      () =>
        createPictureProjectiveGeometry({
          ...input,
          scene: { ...scene, sourceToScene: { ...identityPlacement, a: 1e-6, e: 10_000_000 } },
        }),
      "coordinate-budget",
    );
    rejectsReason(
      () =>
        createPictureProjectiveGeometry({
          ...input,
          scene: {
            ...scene,
            sourceToScene: { ...identityPlacement, e: PICTURE_PROJECTIVE_LIMITS.coordinatePx - 40 },
          },
        }),
      "coordinate-budget",
    );
    rejectsReason(
      () =>
        createPictureProjectiveGeometry({
          ...input,
          scene: { ...scene, sceneToOutput: { ...identityPlacement, a: 1_000_000 } },
        }),
      "coordinate-budget",
    );
    const valid = createPictureProjectiveGeometry({
      ...input,
      scene: {
        ...scene,
        sourceToScene: { ...identityPlacement, e: PICTURE_PROJECTIVE_LIMITS.coordinatePx - 100 },
      },
    });
    rejectsReason(() => mapPictureProjectivePoint(valid, { x: 200, y: 30 }), "coordinate-budget");
  });

  test("the common perspective front uses the existing finite leaf-source mesh budget", () => {
    const shared = createPictureProjectiveGeometry({
      widthPx: 240,
      heightPx: 180,
      depthPx: 24,
      rotation: perspective(45, 25, 17, 70, 13),
      scene: {
        widthPx: 600,
        heightPx: 320,
        sourceToScene: { a: 1.2, b: 0.4, c: -0.25, d: 0.9, e: 145, f: 42 },
      },
    });
    const mesh = tessellatePictureProjectiveFront(shared, { maxErrorPx: 0.25 });
    expect(mesh.triangles.length).toBeLessThanOrEqual(PICTURE_PROJECTIVE_LIMITS.triangles);
    expect(mesh.maxErrorPx).toBeLessThanOrEqual(0.25);
    for (const vertex of mesh.vertices) {
      expect(vertex.source.x).toBeLessThanOrEqual(240);
      expect(vertex.source.y).toBeLessThanOrEqual(180);
      expect(Number.isFinite(vertex.screen.x + vertex.screen.y + vertex.w)).toBe(true);
    }
    rejectsReason(
      () => tessellatePictureProjectiveFront(shared, { maxTriangles: 2, maxErrorPx: 0.0001 }),
      "mesh-budget",
    );
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
