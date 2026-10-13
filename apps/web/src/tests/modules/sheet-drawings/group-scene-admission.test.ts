import { describe, expect, test, vi } from "vitest";
import { effectScope, ref } from "vue";
import { createWorkbook, getActiveSheet, createSheetSparseState } from "@sheetcraft/core/workbook";
import {
  serializeWorkbook,
  serializeSheet,
  deserializeWorkbook,
} from "@sheetcraft/core/serialization";
import { createSetSheetDrawingsCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import type { ShapeGroupDrawing, ShapeGroupedGroup } from "@sheetcraft/core/shape-group";
import type { Choice, PictureRotation3d } from "@sheetcraft/core/picture-detailed-style";
import {
  assertShapeCommandSupport,
  assertWorkbookShapeSupport,
  UnsupportedShapeGroup3dDocumentError,
} from "../../../modules/sheet-drawings/shape-document-support";
import { resolveShapeGroupProjection } from "../../../modules/sheet-drawings/resolved-shape-group";
import { resolveShapeForestForRender } from "../../../modules/sheet-drawings/resolved-shape-render-source";
import { framedShape } from "./framed-shape-fixture";
import { useWorkbookPersistence } from "../../../modules/workbook-persistence/useWorkbookPersistence";

const rotation: Choice<PictureRotation3d> = {
  kind: "value",
  value: { xDeg: 45, yDeg: 0, zDeg: 0, distanceFromGroundPt: 0, projection: "parallel" },
};
function sceneGroup(nested: boolean, value: Choice<PictureRotation3d>): ShapeGroupDrawing {
  const { shapeFrame, ...appearance } = framedShape();
  const inner: ShapeGroupedGroup = {
    kind: "shapeGroup",
    id: "inner",
    name: "Inner",
    rotation: 0,
    groupFrame: {
      kind: "shape-group-local-v1",
      rect: { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 },
    },
    members: [0, 1].map((index) => ({
      ...appearance,
      id: `leaf-${index}`,
      groupFrame: {
        kind: "shape-group-local-v1",
        rect: { xRatio: index / 2, yRatio: 0, widthRatio: 0.5, heightRatio: 1 },
      },
    })),
    ...(nested ? { group3d: { rotation3d: value } } : {}),
  };
  return {
    kind: "shapeGroup",
    id: "root",
    name: "Group",
    rotation: 0,
    shapeFrame,
    members: [inner],
    ...(!nested ? { group3d: { rotation3d: value } } : {}),
  };
}

describe("group scene source stage admission", () => {
  test.each([false, true])(
    "unconsumed scene source is preserved and explicitly blocked (nested=%s)",
    (nested) => {
      for (const value of [rotation, { kind: "none" } as const]) {
        const workbook = createWorkbook({ id: "scene-stage", sheetId: "s" }),
          sheet = getActiveSheet(workbook),
          root = sceneGroup(nested, value);
        sheet.drawings = [root];
        const before = serializeWorkbook(workbook);
        expect(before.version).toBe(67);
        expect(serializeWorkbook(deserializeWorkbook(before))).toEqual(before);
        expect(() => assertWorkbookShapeSupport(workbook)).toThrow(
          UnsupportedShapeGroup3dDocumentError,
        );
        const state = createSheetSparseState(sheet),
          snapshot = serializeSheet(sheet);
        const commands: WorkbookCommand[] = [
          createSetSheetDrawingsCommand(sheet.id, sheet.drawings),
          { type: "addSheet", sheet: snapshot, index: 0, activeSheetId: sheet.id },
          { type: "restoreSheetState", sheetId: sheet.id, state },
          {
            type: "restoreCellShift",
            sheetId: sheet.id,
            state,
            direction: "right",
            range: { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
            operation: "insert",
            workbookFormulaSources: [],
            definedNames: [],
          },
          {
            type: "restoreTableTransaction",
            states: [{ sheetId: sheet.id, state }],
            tableStyles: [],
          },
        ];
        for (const command of commands)
          expect(() => assertShapeCommandSupport(command)).toThrow(
            UnsupportedShapeGroup3dDocumentError,
          );
        const metrics = createPictureSheetMetrics(sheet);
        expect(() => resolveShapeGroupProjection(root, metrics)).toThrow(
          UnsupportedShapeGroup3dDocumentError,
        );
        expect(() =>
          resolveShapeForestForRender({ drawings: [root], metrics, revision: 0 }),
        ).toThrow(UnsupportedShapeGroup3dDocumentError);
        const connection: ReturnType<typeof framedShape> = {
          ...framedShape(),
          id: "unrelated-connection",
          text: "",
          shapeGeometry: { preset: "bentConnector3" },
          shapeConnector: {
            kind: "shape-connector-v1" as const,
            begin: { kind: "free" as const, xRatio: 0, yRatio: 0 },
            end: { kind: "free" as const, xRatio: 1, yRatio: 1 },
          },
        };
        // A worksheet relation pass takes a different group branch. It must not
        // silently bypass the source-stage camera gate for an unrelated connector.
        expect(() =>
          resolveShapeForestForRender({ drawings: [root, connection], metrics, revision: 0 }),
        ).toThrow(UnsupportedShapeGroup3dDocumentError);
        expect(serializeWorkbook(workbook)).toEqual(before);
      }
    },
  );

  test("the source-stage camera gate leaves existing groups and their real consumers open", () => {
    const workbook = createWorkbook({ id: "old-group", sheetId: "s" }),
      sheet = getActiveSheet(workbook),
      root = sceneGroup(false, rotation);
    delete root.group3d;
    sheet.drawings = [root];
    const before = serializeWorkbook(workbook);
    expect(before.version).toBe(61);
    expect(() => assertWorkbookShapeSupport(workbook)).not.toThrow();
    expect(() =>
      assertShapeCommandSupport(createSetSheetDrawingsCommand(sheet.id, [root])),
    ).not.toThrow();
    const metrics = createPictureSheetMetrics(sheet);
    expect(resolveShapeGroupProjection(root, metrics).leaves).toHaveLength(2);
    expect(
      resolveShapeForestForRender({ drawings: [root], metrics, revision: 0 }).leaves,
    ).toHaveLength(2);
    expect(serializeWorkbook(workbook)).toEqual(before);
  });

  test("unsupported scene recovery cannot be overwritten by autosave, manual save or reset", async () => {
    const saved = createWorkbook({ id: "stored-scene", sheetId: "stored" });
    getActiveSheet(saved).drawings = [sceneGroup(false, rotation)];
    const snapshot = serializeWorkbook(saved),
      current = createWorkbook({ id: "current", sheetId: "current" }),
      original = serializeWorkbook(current),
      revision = ref(0),
      save = vi.fn(async () => ({ revision: 2, savedAt: 2 })),
      replace = vi.fn(async () => ({ revision: 2, savedAt: 2 })),
      replaceWorkbook = vi.fn(),
      scope = effectScope();
    const persistence = scope.run(() =>
      useWorkbookPersistence({
        store: { load: async () => ({ revision: 1, savedAt: 1, snapshot }), save, replace },
        getWorkbook: () => current,
        getRevision: () => revision.value,
        replaceWorkbook,
        debounceMs: 1,
      }),
    )!;
    try {
      await persistence.ready;
      expect(persistence.error.value).toBe("unsupported-shape-frame");
      expect(replaceWorkbook).not.toHaveBeenCalled();
      revision.value++;
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(await persistence.saveNow()).toBe(false);
      expect(await persistence.resetDocument()).toBe(false);
      await expect(persistence.replaceDocument(current)).rejects.toThrow();
      expect(save).not.toHaveBeenCalled();
      expect(replace).not.toHaveBeenCalled();
      expect(serializeWorkbook(current)).toEqual(original);
      expect(serializeWorkbook(saved)).toEqual(snapshot);
    } finally {
      scope.stop();
    }
  });
});
