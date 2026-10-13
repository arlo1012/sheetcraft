// @vitest-environment node
import { describe, expect, test } from "vitest";
import { createSheet } from "@sheetcraft/core/workbook";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { shapeFrameLocalToWorld, shapeFrameWorldToLocal } from "@sheetcraft/core/shape-frame";
import type { ShapeGroupDrawing } from "@sheetcraft/core/shape-group";
import type { PictureRotation3d } from "@sheetcraft/core/picture-detailed-style";
import { framedShape } from "./framed-shape-fixture";
import { resolveShapeGroupProjection } from "../../../modules/sheet-drawings/resolved-shape-group";
import { resolveShapeForestForRender } from "../../../modules/sheet-drawings/resolved-shape-render-source";
import { requiresShapeGroupPaint } from "../../../modules/sheet-drawings/shape-group-paint";
import {
  createPictureProjectiveGeometry,
  mapPictureProjectivePoint,
} from "../../../shared/images/picture-projective-geometry";

const rotation: PictureRotation3d = {
  projection: "parallel",
  xDeg: 45,
  yDeg: 0,
  zDeg: 0,
  distanceFromGroundPt: 0,
};
function fixture() {
  const sheet = createSheet("Scene", "sheet"),
    metrics = createPictureSheetMetrics(sheet);
  const { shapeFrame, ...appearance } = framedShape();
  const root: ShapeGroupDrawing = {
    id: "root",
    kind: "shapeGroup",
    name: "Scene",
    rotation: 0,
    shapeFrame,
    group3d: { rotation3d: { kind: "value", value: rotation } },
    members: [0, 1].map((index) => ({
      ...appearance,
      id: `leaf-${index}`,
      shapeGeometry: { preset: "rect" },
      shapeStyle: { rotation3d: { kind: "value", value: { ...rotation, xDeg: 20 } } },
      groupFrame: {
        kind: "shape-group-local-v1",
        rect: { xRatio: index * 0.5, yRatio: 0, widthRatio: 0.5, heightRatio: 1 },
      },
    })),
  };
  const connection: ReturnType<typeof framedShape> = {
    ...framedShape(),
    id: "unrelated",
    text: "",
    shapeGeometry: { preset: "bentConnector3" },
    shapeConnector: {
      kind: "shape-connector-v1",
      begin: { kind: "free", xRatio: 0, yRatio: 0 },
      end: { kind: "free", xRatio: 1, yRatio: 1 },
    },
  };
  return { root, metrics, connection };
}
function affine(
  matrix: { a: number; b: number; c: number; d: number; e: number; f: number },
  point: { x: number; y: number },
) {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  };
}
describe("shared camera transient render sources", () => {
  test("one common pivot changes both centers while genuine styles remain dormant and unchanged", () => {
    const f = fixture(),
      before = JSON.stringify(f.root),
      projection = resolveShapeGroupProjection(f.root, f.metrics);
    expect(requiresShapeGroupPaint(f.root)).toBe(true);
    for (const [index, leaf] of projection.leaves.entries()) {
      const view = leaf.view!,
        descriptor = leaf.groupScene!;
      expect(descriptor.ownerPath).toEqual(["root"]);
      expect(descriptor.rotation3d.xDeg).toBe(45);
      expect(view.shapeStyle?.rotation3d).toEqual(
        f.root.members[index]!.kind === "shape"
          ? f.root.members[index]!.shapeStyle?.rotation3d
          : undefined,
      );
      const camera = createPictureProjectiveGeometry({
        widthPx: view.width,
        heightPx: view.height,
        rotation: { ...descriptor.rotation3d, distanceFromGroundPx: 0 },
        scene: descriptor.scene,
      });
      const center = affine(
        descriptor.scene.sourceToScene,
        mapPictureProjectivePoint(camera, { x: view.width / 2, y: view.height / 2 }),
      );
      const originalX = (index + 0.5) * 120;
      expect(center.x).toBeCloseTo(120 + (originalX - 120) * Math.SQRT1_2, 8);
      expect(center.y).toBeCloseTo(60, 8);
    }
    expect(JSON.stringify(f.root)).toBe(before);
  });
  test("unrelated connector branch captures the same scene and rejects stale source leases", () => {
    const f = fixture(),
      ordinary = resolveShapeForestForRender({
        drawings: [f.root],
        metrics: f.metrics,
        revision: 2,
      });
    const drawings = [f.root, f.connection],
      relation = resolveShapeForestForRender({ drawings, metrics: f.metrics, revision: 2 });
    for (const leaf of ordinary.leaves)
      expect(relation.getLeaf(leaf.sourceNode.id)?.groupScene).toEqual(leaf.groupScene);
    expect(relation.getLeaf("unrelated")?.groupScene).toBeUndefined();
    relation.assertCurrent(drawings, f.metrics, 2);
    f.root.group3d = { rotation3d: { kind: "value", value: { ...rotation, xDeg: 30 } } };
    expect(() => relation.assertCurrent(drawings, f.metrics, 2)).toThrow(/outdated/);
  });
  test("complete nested and world rotations are in the camera placement exactly once", () => {
    const f = fixture();
    f.root.rotation = 37;
    f.root.members = [
      {
        id: "inner",
        kind: "shapeGroup",
        name: "Nested",
        rotation: 23,
        groupFrame: {
          kind: "shape-group-local-v1",
          rect: { xRatio: 0.1, yRatio: 0.2, widthRatio: 0.75, heightRatio: 0.5 },
        },
        members: f.root.members.map((node) => ({ ...node, rotation: 13 })),
      },
    ];
    const projection = resolveShapeGroupProjection(f.root, f.metrics);
    for (const leaf of projection.leaves) {
      const p = { x: 9, y: 12 },
        layout = leaf.layout!;
      const expected = shapeFrameWorldToLocal(
        projection.layout.rect,
        projection.layout.angleDeg,
        shapeFrameLocalToWorld(layout.rect, layout.angleDeg, p),
      );
      const actual = affine(leaf.groupScene!.scene.sourceToScene, p);
      expect(actual.x).toBeCloseTo(expected.x, 8);
      expect(actual.y).toBeCloseTo(expected.y, 8);
      expect(leaf.view!.rotation).toBe(73);
    }
  });
  test("dormant None uses genuine own leaf camera without a synthetic scene", () => {
    const f = fixture();
    f.root.group3d = { rotation3d: { kind: "none" } };
    expect(requiresShapeGroupPaint(f.root)).toBe(false);
    expect(
      resolveShapeForestForRender({
        drawings: [f.root, f.connection],
        metrics: f.metrics,
        revision: 0,
      }).getLeaf("leaf-0")?.groupScene,
    ).toBeUndefined();
  });
  test.each([false, true])(
    "full forest rejects external or internal connectors touching the scene (internal=%s)",
    (internal) => {
      const f = fixture();
      f.connection.shapeConnector = {
        kind: "shape-connector-v1",
        begin: { kind: "site", targetId: "leaf-0", preset: "rect", siteIndex: 1 },
        end: { kind: "free", xRatio: 1, yRatio: 1 },
      };
      let drawings: (typeof f.root | typeof f.connection)[] = [f.root, f.connection];
      if (internal) {
        const { shapeFrame: _frame, ...appearance } = f.connection;
        f.root.members.push({
          ...appearance,
          groupFrame: {
            kind: "shape-group-local-v1",
            rect: { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 },
          },
        });
        drawings = [f.root];
      }
      const before = JSON.stringify(drawings);
      expect(() =>
        resolveShapeForestForRender({ drawings, metrics: f.metrics, revision: 0 }),
      ).toThrow(/bound connector target/);
      expect(JSON.stringify(drawings)).toBe(before);
    },
  );
});
