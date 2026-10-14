import * as groupPaint from "../../../modules/sheet-drawings/shape-group-paint";
import SheetDrawingLayer from "../../../modules/sheet-drawings/components/SheetDrawingLayer.vue";
import ShapeFormatPane from "../../../modules/sheet-drawings/components/shape-format/ShapeFormatPane.vue";
import ShapeFormatEffects from "../../../modules/sheet-drawings/components/shape-format/ShapeFormatEffects.vue";
import PictureRotation3dEditor from "../../../modules/sheet-images/components/format-pane/PictureRotation3dEditor.vue";
import PictureFormat3dEditor from "../../../modules/sheet-images/components/format-pane/PictureFormat3dEditor.vue";
import { createPictureFormat3d } from "../../../modules/sheet-images/picture-effect-edit";
import { ungroupShapeRoot } from "@sheetcraft/core/shape-group-planning";
import type { useOwnedShapeGroupFormatPane } from "../../../modules/sheet-drawings/useOwnedShapeGroupFormatPane";
import { mount, flushPromises } from "@vue/test-utils";
import { expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import type { ShapeGroupDrawing } from "@sheetcraft/core/shape-group";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { createAppI18n } from "../../../shared/i18n";
import { framedShape } from "../../modules/sheet-drawings/framed-shape-fixture";
import type { useWorkbookPersistence } from "../../../modules/workbook-persistence/useWorkbookPersistence";

test("real Workspace preserves unsupported shared-scene recovery without replacing or saving an empty workbook", async () => {
  const stored = createWorkbook({ id: "scene-recovery", sheetId: "scene-sheet" }),
    { shapeFrame, ...appearance } = framedShape(),
    group: ShapeGroupDrawing = {
      kind: "shapeGroup",
      id: "root",
      name: "Group",
      rotation: 0,
      shapeFrame,
      group3d: {
        rotation3d: {
          kind: "value",
          value: {
            projection: "parallel",
            xDeg: 30,
            yDeg: 0,
            zDeg: 0,
            distanceFromGroundPt: 0,
          },
        },
      },
      members: [
        {
          ...appearance,
          groupFrame: {
            kind: "shape-group-local-v1",
            rect: { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 },
          },
        },
      ],
    };
  const connector = framedShape();
  connector.id = "related-connector";
  connector.text = "";
  connector.shapeGeometry = { preset: "bentConnector3" };
  connector.shapeConnector = {
    kind: "shape-connector-v1",
    begin: { kind: "site", targetId: appearance.id, preset: "rect", siteIndex: 1 },
    end: { kind: "free", xRatio: 1, yRatio: 1 },
  };
  getActiveSheet(stored).drawings = [group, connector];
  const snapshot = serializeWorkbook(stored),
    save = vi.fn(async () => ({ revision: 2, savedAt: 2 })),
    replace = vi.fn(async () => ({ revision: 2, savedAt: 2 }));
  const wrapper = mount(SpreadsheetWorkspace, {
    props: {
      workbookStore: { load: async () => ({ revision: 1, savedAt: 1, snapshot }), save, replace },
      imageAssetStore: createMemoryImageAssetStore(),
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  try {
    await flushPromises();
    const state = (wrapper.vm.$ as unknown as { setupState: unknown }).setupState as {
      saveError: string | undefined;
      session: { workbook: ReturnType<typeof createWorkbook> };
      persistence: ReturnType<typeof useWorkbookPersistence>;
    };
    expect(state.saveError).toBe("unsupported-shape-frame");
    expect(state.session.workbook.id).not.toBe(stored.id);
    expect(await state.persistence.saveNow()).toBe(false);
    expect(await state.persistence.resetDocument()).toBe(false);
    expect(save).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(serializeWorkbook(stored)).toEqual(snapshot);
  } finally {
    wrapper.unmount();
    vi.restoreAllMocks();
  }
});

test("real Workspace restores snapshot67 and applies shared-camera, depth, Keep Flat and Ungroup through the visible pane/history", async () => {
  const stored = createWorkbook({ id: "live-scene", sheetId: "live-sheet" }),
    { shapeFrame, ...appearance } = framedShape();
  const rotation = {
    projection: "parallel" as const,
    xDeg: 45,
    yDeg: 0,
    zDeg: 0,
    distanceFromGroundPt: 0,
  };
  const group: ShapeGroupDrawing = {
    kind: "shapeGroup",
    id: "group",
    name: "Scene",
    rotation: 37,
    shapeFrame,
    group3d: { rotation3d: { kind: "value", value: rotation } },
    members: [0, 1].map((index) => ({
      ...appearance,
      id: `leaf-${index}`,
      text: "",
      shapeStyle: { rotation3d: { kind: "value", value: { ...rotation, xDeg: 20 } } },
      groupFrame: {
        kind: "shape-group-local-v1",
        rect: { xRatio: index / 2, yRatio: 0, widthRatio: 0.5, heightRatio: 1 },
      },
    })),
  };
  getActiveSheet(stored).drawings = [group];
  const original = serializeWorkbook(stored),
    save = vi.fn(async () => ({ revision: 2, savedAt: 2 }));
  // HappyDOM has no native Canvas. Keep real plans, whole-forest/source validation,
  // owner leases and history; only the final native pixel preflight port is supplied.
  vi.spyOn(groupPaint, "preflightShapeGroupPaint").mockImplementation((options) =>
    groupPaint.planShapeGroupPaint(options),
  );
  const wrapper = mount(SpreadsheetWorkspace, {
    props: {
      workbookStore: {
        load: async () => ({ revision: 1, savedAt: 1, snapshot: original }),
        save,
        replace: vi.fn(),
      },
      imageAssetStore: createMemoryImageAssetStore(),
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  try {
    await flushPromises();
    const state = (wrapper.vm.$ as unknown as { setupState: unknown }).setupState as {
      session: { workbook: ReturnType<typeof createWorkbook> };
      saveError: string | undefined;
      shapeGroupFormatPane: ReturnType<typeof useOwnedShapeGroupFormatPane>;
      undo: () => void;
      redo: () => void;
      persistence: ReturnType<typeof useWorkbookPersistence>;
      sheetGridRef: { selectShapeObjects: (paths: readonly (readonly string[])[]) => boolean };
    };
    const sheet = getActiveSheet(state.session.workbook),
      root = sheet.drawings![0] as ShapeGroupDrawing;
    expect(sheet.id).toBe("live-sheet");
    expect(state.saveError).toBeUndefined();
    expect(serializeWorkbook(state.session.workbook)).toEqual(original);
    expect(state.sheetGridRef.selectShapeObjects([[root.id, "leaf-0"]])).toBe(true);
    await flushPromises();
    wrapper.getComponent(SheetDrawingLayer).vm.$emit("formatGroup", root, [root.id, "leaf-0"]);
    await flushPromises();
    const pane = wrapper.getComponent(ShapeFormatPane);
    expect(pane.props("snapshot")?.drawing.id).toBe("leaf-0");
    expect(pane.props("snapshot")?.scopeDescription).toContain("2");
    expect(
      pane
        .findAllComponents(ShapeFormatEffects)
        .find((component) => component.props("target") === "text")!
        .getComponent(PictureRotation3dEditor)
        .props("onCommit")({
        kind: "value",
        value: { ...rotation, xDeg: 30 },
      }),
    ).toBe(true);
    await flushPromises();
    const changed = serializeWorkbook(state.session.workbook),
      newRoot = sheet.drawings![0] as ShapeGroupDrawing;
    expect(newRoot.group3d?.rotation3d).toMatchObject({ kind: "value", value: { xDeg: 30 } });
    expect(newRoot.members[0]).toHaveProperty("shapeStyle.rotation3d.value.xDeg", 20);
    expect(newRoot.members[1]).toHaveProperty("shapeStyle.rotation3d.value.xDeg", 20);
    expect(
      newRoot.members.every(
        (member) =>
          (member.kind === "shape" || member.kind === "textBox") &&
          member.shapeText?.style?.rotation3d === undefined,
      ),
    ).toBe(true);
    state.undo();
    await flushPromises();
    expect(serializeWorkbook(state.session.workbook)).toEqual(original);
    state.redo();
    await flushPromises();
    expect(serializeWorkbook(state.session.workbook)).toEqual(changed);
    expect(state.sheetGridRef.selectShapeObjects([[root.id]])).toBe(true);
    await flushPromises();
    wrapper.getComponent(SheetDrawingLayer).vm.$emit("formatGroup", sheet.drawings![0], [root.id]);
    await flushPromises();
    expect(state.shapeGroupFormatPane.snapshot.value?.drawing.id).toBe(root.id);
    const effects = wrapper.getComponent(ShapeFormatEffects);
    const depth = createPictureFormat3d();
    depth.depthPt = 24;
    expect(
      effects.getComponent(PictureFormat3dEditor).props("onCommit")({
        kind: "value",
        value: depth,
      }),
    ).toBe(true);
    await flushPromises();
    const currentPane = state.shapeGroupFormatPane.snapshot.value!;
    expect(
      state.shapeGroupFormatPane.onIntent({
        type: "set-field",
        field: "shapeKeepTextFlat",
        value: true,
        owner: currentPane.owner,
        baseRevision: currentPane.revision,
        intentId: "flat",
      }),
    ).toBe(true);
    await flushPromises();
    const layered = serializeWorkbook(state.session.workbook),
      layer = wrapper.getComponent(SheetDrawingLayer);
    expect(
      (sheet.drawings![0] as ShapeGroupDrawing).members.every(
        (member) =>
          (member.kind === "shape" || member.kind === "textBox") &&
          member.shapeStyle?.format3d?.kind === "value",
      ),
    ).toBe(true);
    // The other visible Effects mode edits glyph depth, never body depth or
    // a second camera. Its actual owner/history must remain wired after restore.
    const textEffects = wrapper
      .findAllComponents(ShapeFormatEffects)
      .find((component) => component.props("target") === "text")!;
    const textDepth = createPictureFormat3d();
    textDepth.depthPt = 12;
    expect(
      textEffects.getComponent(PictureFormat3dEditor).props("onCommit")({
        kind: "value",
        value: textDepth,
      }),
    ).toBe(true);
    await flushPromises();
    for (const member of (sheet.drawings![0] as ShapeGroupDrawing).members) {
      expect(member).toHaveProperty("shapeText.style.format3d.value.depthPt", 12);
      expect(member).toHaveProperty("shapeStyle.format3d.value.depthPt", 24);
      expect(member).not.toHaveProperty("shapeText.style.rotation3d");
    }
    const textLayered = serializeWorkbook(state.session.workbook);
    state.undo();
    await flushPromises();
    expect(serializeWorkbook(state.session.workbook)).toEqual(layered);
    state.redo();
    await flushPromises();
    expect(serializeWorkbook(state.session.workbook)).toEqual(textLayered);
    state.shapeGroupFormatPane.close();
    await flushPromises();
    const forest = layer.props("drawings"),
      metrics = layer.props("metrics")!;
    const next = ungroupShapeRoot(forest, "group", metrics);
    expect(layer.props("applyCollection")!(next, forest, metrics)).toBe(true);
    await flushPromises();
    expect(sheet.drawings!.map((node) => node.id)).toEqual(["leaf-0", "leaf-1"]);
    for (const node of sheet.drawings!)
      expect(node).toHaveProperty("shapeStyle.rotation3d.value.xDeg", 30);
    const released = serializeWorkbook(state.session.workbook);
    state.undo();
    await flushPromises();
    expect(serializeWorkbook(state.session.workbook)).toEqual(textLayered);
    state.redo();
    await flushPromises();
    expect(serializeWorkbook(state.session.workbook)).toEqual(released);
    expect(await state.persistence.saveNow()).toBe(true);
    expect(save).toHaveBeenCalled();
  } finally {
    wrapper.unmount();
    vi.restoreAllMocks();
  }
});
