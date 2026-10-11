import { describe, expect, test, vi } from "vitest";
import { effectScope, ref, shallowRef } from "vue";
import { createSetSheetFloatingImagesCommand } from "@sheetcraft/core/commands";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@sheetcraft/core/history";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import {
  isPictureGroup,
  type PictureGroup,
  type PictureGroupPath,
} from "@sheetcraft/core/picture-group";
import { resolvePictureGroup } from "@sheetcraft/core/picture-group-layout";
import {
  isFramedPictureObject,
  normalizePictureObjectCollection,
} from "@sheetcraft/core/picture-object";
import { resolvePictureFrame } from "@sheetcraft/core/picture-frame";
import {
  getActiveSheet,
  createSheet,
  type FloatingImage,
  type LegacyFloatingImage,
} from "@sheetcraft/core/workbook";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { createPictureViewMetrics } from "@sheetcraft/sheet-engine/picture-frame-layout";
import { useOwnedPictureFormatPane } from "../../../../modules/sheet-images/useOwnedPictureFormatPane";
import { resolveOwnedPictureNode } from "../../../../modules/sheet-images/picture-group-interaction";
import {
  createPictureFormatFieldIntent,
  PICTURE_FORMAT_LABEL_KEYS,
  type PictureFormatField,
  type PictureFormatIntent,
} from "../../../../modules/sheet-images/picture-format-pane-model";
import { pictureGroup } from "../picture-group-fixture";
import { framedPicture } from "../framed-picture-fixture";

const legacy: LegacyFloatingImage = {
  id: "legacy",
  assetId: "legacy-source",
  altText: "Legacy picture",
  anchor: { row: 1, column: 1 },
  offsetX: 3,
  offsetY: 4,
  width: 240,
  height: 120,
};
function nestedGroup(): PictureGroup {
  const group = pictureGroup(),
    leaf = group.members[0]!;
  if (leaf.kind !== "grouped-picture-v1") throw new TypeError("Expected leaf");
  group.members = [
    {
      kind: "grouped-group-v1",
      id: "branch",
      altText: "Actual branch",
      frame: {
        kind: "group-local-frame-v1",
        rect: { xRatio: 0.1, yRatio: 0.2, widthRatio: 0.5, heightRatio: 0.5 },
        angleDeg: 25,
      },
      members: [
        {
          ...leaf,
          frame: {
            ...leaf.frame,
            rect: { xRatio: 0.2, yRatio: 0.1, widthRatio: 0.5, heightRatio: 0.5 },
            angleDeg: 13,
          },
        },
      ],
    },
    { ...leaf, id: "sibling-leaf", frame: { ...leaf.frame } },
  ];
  return group;
}
function fixture(id = "owned-group", path: PictureGroupPath | null = null) {
  const session = createWorkbookSession({ idFactory: createSequentialIdFactory() }),
    sheet = getActiveSheet(session.workbook);
  sheet.floatingImages = normalizePictureObjectCollection([nestedGroup(), framedPicture(), legacy]);
  const geometry = createSheetGeometry({ rowCount: 30, columnCount: 30 }),
    rows = createRowVisibilityIndex({ rowCount: 30, defaultRowHeight: 24 });
  const layout = createSheetViewportLayout({
    geometry,
    rows,
    freeze: { rows: 0, columns: 0 },
    bodyScrollPosition: { x: 0, y: 0 },
    viewportSize: { width: 800, height: 500 },
  });
  const context = shallowRef({ layout, metrics: createPictureViewMetrics(sheet, geometry, rows) });
  const currentWorkbook = shallowRef(session.workbook),
    currentSheet = shallowRef(sheet);
  const generation = ref(0),
    revision = ref(0),
    selectedIds = ref([id]),
    selectedPath = shallowRef(path),
    busy = ref(false),
    open = ref(true);
  let rejection = false,
    exception = false;
  const execute = vi.fn((forest: readonly FloatingImage[]) => {
    if (exception) throw new Error("Owner failure");
    if (rejection) return false;
    const accepted = executeWorkbookCommand(
      session,
      createSetSheetFloatingImagesCommand(currentSheet.value.id, forest),
    );
    if (accepted) revision.value += 1;
    return accepted;
  });
  const scope = effectScope();
  const pane = scope.run(() =>
    useOwnedPictureFormatPane({
      getWorkbook: () => currentWorkbook.value,
      getSheet: () => currentSheet.value,
      getGeneration: () => generation.value,
      getRevision: () => revision.value,
      getContext: () => context.value,
      getSelectedIds: () => selectedIds.value,
      getSelectedPath: () => selectedPath.value,
      isBusy: () => busy.value,
      isOpen: () => open.value,
      execute,
      getDisabledReason: () => "Unavailable in this document model.",
    }),
  )!;
  return {
    session,
    sheet,
    context,
    currentWorkbook,
    currentSheet,
    generation,
    revision,
    selectedIds,
    selectedPath,
    busy,
    open,
    execute,
    pane,
    scope,
    reject: () => {
      rejection = true;
    },
    throw: () => {
      exception = true;
    },
  };
}
function root(f: ReturnType<typeof fixture>): PictureGroup {
  const group = f.sheet.floatingImages[0];
  if (!isPictureGroup(group)) throw new TypeError("Expected group");
  return group;
}
function frame(f: ReturnType<typeof fixture>) {
  const image = f.sheet.floatingImages[1]!;
  if (!isFramedPictureObject(image)) throw new TypeError("Expected frame");
  return image;
}
function intent<F extends PictureFormatField>(
  f: ReturnType<typeof fixture>,
  field: F,
  value: Parameters<typeof createPictureFormatFieldIntent<F>>[2],
  id = "edit-1",
) {
  return createPictureFormatFieldIntent(f.pane.snapshot.value!, field, value, id);
}
const leafPath = ["owned-group", "branch", "owned-leaf"];

describe("real picture format pane document owner", () => {
  test("source-free roots and exact inner containers never fabricate an asset or source geometry", () => {
    const f = fixture(),
      snapshot = f.pane.snapshot.value!;
    expect(snapshot.owner).toMatchObject({ pictureId: "owned-group", ownerPath: ["owned-group"] });
    expect(snapshot.owner).not.toHaveProperty("assetId");
    expect(snapshot.values).toMatchObject({
      sizeWidthPt: 90,
      sizeHeightPt: 60,
      rotationDeg: 37,
      lockAspectRatio: false,
      anchor: "fixed",
    });
    expect(snapshot.values).not.toHaveProperty("sourceWidthPt");
    expect(snapshot).not.toHaveProperty("originalSizePt");
    f.selectedPath.value = ["owned-group", "branch"];
    expect(f.pane.snapshot.value!.owner).toMatchObject({
      pictureId: "branch",
      ownerPath: ["owned-group", "branch"],
    });
    expect(f.pane.snapshot.value!.owner).not.toHaveProperty("assetId");
    expect(f.pane.snapshot.value!.values).toMatchObject({
      sizeWidthPt: 45,
      sizeHeightPt: 30,
      rotationDeg: 62,
      lockAspectRatio: false,
    });
    expect(f.pane.capabilities.value.fields.anchor?.enabled).toBe(false);
  });
  test("every unsupported field and reset carries a disabled reason", () => {
    const f = fixture(),
      fields = PICTURE_FORMAT_LABEL_KEYS.slice(PICTURE_FORMAT_LABEL_KEYS.indexOf("sizeWidthPt"));
    for (const field of fields) {
      const capability = f.pane.capabilities.value.fields[field as PictureFormatField];
      expect(capability).toBeDefined();
      if (!capability!.enabled)
        expect(capability!.reason).toBe("Unavailable in this document model.");
    }
    for (const reset of Object.values(f.pane.capabilities.value.resets!))
      expect(reset).toEqual({ enabled: false, reason: "Unavailable in this document model." });
    for (const field of [
      "sourceWidthPt",
      "cropLeftPt",
      "scaleWidthPercent",
      "relativeToOriginalSize",
      "altTitle",
      "printObject",
      "locked",
      "shadowBlurPt",
      "rotation3dXDeg",
      "fillColor",
    ] as const) {
      expect(f.pane.capabilities.value.fields[field]?.enabled).toBe(false);
      expect(
        f.pane.onIntent(
          intent(
            f,
            field,
            field === "fillColor" || field === "altTitle"
              ? "text"
              : field === "locked" || field === "printObject" || field === "relativeToOriginalSize"
                ? true
                : 12,
          ) as PictureFormatIntent,
        ),
      ).toBe(false);
    }
    expect(f.execute).not.toHaveBeenCalled();
  });
  test("root numeric resize is one real Core edit and retains session plus intent acknowledgement", () => {
    const f = fixture(),
      before = serializeWorkbook(f.session.workbook),
      sessionId = f.pane.snapshot.value!.owner.sessionId;
    const original = structuredClone(root(f)),
      originalWorld = resolvePictureGroup(root(f), f.context.value.metrics).layout;
    expect(f.pane.onIntent(intent(f, "sizeWidthPt", 135))).toBe(true);
    const world = resolvePictureGroup(root(f), f.context.value.metrics).layout;
    expect(world.rect.width).toBeCloseTo(180);
    expect(world.rect.height).toBe(80);
    expect(world.corners[0].x).toBeCloseTo(originalWorld.corners[0].x);
    expect(world.corners[0].y).toBeCloseTo(originalWorld.corners[0].y);
    expect(root(f).members).toEqual(original.members);
    expect(root(f)).not.toHaveProperty("assetId");
    expect(f.pane.snapshot.value!.owner.sessionId).toBe(sessionId);
    expect(f.pane.snapshot.value!.acceptedIntentId).toBe("edit-1");
    expect(f.pane.snapshot.value!.revision).toBe(1);
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(f.execute).toHaveBeenCalledOnce();
    const after = serializeWorkbook(f.session.workbook);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(after);
  });
  test("framed size uses real local dimensions, preserves crop source and honors aspect lock", () => {
    const f = fixture("framed"),
      original = structuredClone(frame(f));
    expect(f.pane.snapshot.value!.values).toMatchObject({
      sizeWidthPt: 90,
      sizeHeightPt: 60,
      rotationDeg: 37,
      lockAspectRatio: true,
    });
    expect(f.pane.onIntent(intent(f, "sizeWidthPt", 135))).toBe(true);
    expect(resolvePictureFrame(frame(f).frame, f.context.value.metrics).rect).toMatchObject({
      width: 180,
      height: 120,
    });
    expect(frame(f).frame.source).toEqual(original.frame.source);
    expect(frame(f)).not.toHaveProperty("width");
    expect(f.pane.onIntent(intent(f, "lockAspectRatio", false, "unlock"))).toBe(true);
    expect(f.pane.onIntent(intent(f, "sizeHeightPt", 60, "height"))).toBe(true);
    expect(resolvePictureFrame(frame(f).frame, f.context.value.metrics).rect).toMatchObject({
      width: 180,
      height: 80,
    });
  });
  test("an unchanged field acknowledges its own intent without adding history", () => {
    const f = fixture(),
      sessionId = f.pane.snapshot.value!.owner.sessionId;
    expect(f.pane.onIntent(intent(f, "sizeWidthPt", 90, "unchanged"))).toBe(true);
    expect(f.pane.snapshot.value!.acceptedIntentId).toBe("unchanged");
    expect(f.pane.snapshot.value!.owner.sessionId).toBe(sessionId);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.session.history.undoStack).toHaveLength(0);
  });
  test("the true inner leaf uses resolved world size and Core inverse placement with its local NW fixed", () => {
    const f = fixture("owned-group", leafPath),
      original = structuredClone(root(f));
    const world = resolveOwnedPictureNode(
      f.sheet.floatingImages,
      leafPath,
      f.context.value,
    )!.layout!;
    expect(f.pane.snapshot.value!.owner).toMatchObject({
      pictureId: "owned-leaf",
      ownerPath: leafPath,
      assetId: "synthetic-asset",
    });
    expect(f.pane.snapshot.value!.values).toMatchObject({
      sizeWidthPt: 22.5,
      sizeHeightPt: 15,
      rotationDeg: 75,
      lockAspectRatio: true,
    });
    expect(f.pane.onIntent(intent(f, "sizeWidthPt", 45))).toBe(true);
    const target = resolveOwnedPictureNode(f.sheet.floatingImages, leafPath, f.context.value)!;
    expect(target.layout!.rect.width).toBeCloseTo(60);
    expect(target.layout!.rect.height).toBeCloseTo(40);
    expect(target.layout!.corners[0].x).toBeCloseTo(world.corners[0].x);
    expect(target.layout!.corners[0].y).toBeCloseTo(world.corners[0].y);
    expect(root(f).frame).toEqual(original.frame);
    expect(root(f).members[1]).toEqual(original.members[1]);
    expect(target.node).toMatchObject({
      assetId: "synthetic-asset",
      frame: { source: { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 } },
    });
    expect(f.session.history.undoStack).toHaveLength(1);
  });
  test("inner and root rotation retain sources, ownership, and the actual layout center", () => {
    const f = fixture("owned-group", leafPath),
      before = resolveOwnedPictureNode(f.sheet.floatingImages, leafPath, f.context.value)!;
    expect(f.pane.onIntent(intent(f, "rotationDeg", -20))).toBe(true);
    const after = resolveOwnedPictureNode(f.sheet.floatingImages, leafPath, f.context.value)!;
    expect(after.layout!.angleDeg).toBeCloseTo(340);
    for (const key of ["x", "y", "width", "height"] as const)
      expect(after.layout!.rect[key]).toBeCloseTo(before.layout!.rect[key]);
    f.selectedPath.value = null;
    const members = structuredClone(root(f).members);
    expect(f.pane.onIntent(intent(f, "rotationDeg", 237.5))).toBe(true);
    expect(root(f).frame.angleDeg).toBe(237.5);
    expect(root(f).members).toEqual(members);
  });
  test.each(["owned-group", "framed"])(
    "%s anchor changes preserve resolved layout and arbitrary angle",
    (id) => {
      const f = fixture(id),
        original =
          id === "framed"
            ? resolvePictureFrame(frame(f).frame, f.context.value.metrics)
            : resolvePictureGroup(root(f), f.context.value.metrics).layout;
      for (const mode of ["move", "move-size", "fixed"] as const) {
        expect(f.pane.onIntent(intent(f, "anchor", mode, `anchor-${mode}`))).toBe(true);
        const after =
          id === "framed"
            ? resolvePictureFrame(frame(f).frame, f.context.value.metrics)
            : resolvePictureGroup(root(f), f.context.value.metrics).layout;
        for (const key of ["x", "y", "width", "height"] as const)
          expect(after.rect[key]).toBeCloseTo(original.rect[key]);
        expect(after.angleDeg).toBe(original.angleDeg);
      }
    },
  );
  test("legacy metadata and dimensions are real while arbitrary rotation and reanchoring stay unavailable", () => {
    const f = fixture("legacy");
    expect(f.pane.snapshot.value!.values).toMatchObject({
      sizeWidthPt: 180,
      sizeHeightPt: 90,
      altDescription: "Legacy picture",
      anchor: "move",
    });
    expect(f.pane.capabilities.value.fields.rotationDeg?.enabled).toBe(false);
    expect(f.pane.capabilities.value.fields.anchor?.enabled).toBe(false);
    expect(f.pane.onIntent(intent(f, "sizeWidthPt", 225))).toBe(true);
    expect(f.sheet.floatingImages[2]).toMatchObject({ width: 300, height: 150 });
    expect(f.pane.onIntent(intent(f, "altDescription", "Accessible description"))).toBe(true);
    expect(f.sheet.floatingImages[2]!.altText).toBe("Accessible description");
  });
  test.each(["refused", "thrown"] as const)(
    "latest %s command retains session, owner snapshot and history",
    (failure) => {
      const f = fixture(),
        before = serializeWorkbook(f.session.workbook),
        snapshot = f.pane.snapshot.value!;
      if (failure === "refused") f.reject();
      else f.throw();
      expect(f.pane.onIntent(intent(f, "sizeWidthPt", 135))).toBe(false);
      expect(f.pane.snapshot.value).toEqual(snapshot);
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
    },
  );
  test.each([0, 7500.01, Number.NaN, Infinity, -Infinity])(
    "invalid point size %s is rejected before Core",
    (value) => {
      const f = fixture();
      expect(f.pane.onIntent(intent(f, "sizeWidthPt", value))).toBe(false);
      expect(f.execute).not.toHaveBeenCalled();
    },
  );
  test("an aspect-locked counterpart outside the manual size budget rejects the whole edit", () => {
    const f = fixture("owned-group", leafPath);
    expect(f.pane.onIntent(intent(f, "sizeHeightPt", 7500))).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
  });
  test("stale captured revision and unrelated sibling edits cannot mutate the latest forest", () => {
    const f = fixture(),
      old = intent(f, "sizeWidthPt", 135),
      sessionId = old.owner.sessionId;
    expect(f.pane.onIntent(intent(f, "lockAspectRatio", true))).toBe(true);
    expect(f.pane.onIntent(old)).toBe(false);
    const current = intent(f, "sizeWidthPt", 150);
    f.sheet.floatingImages[2] = { ...legacy, assetId: "external-source" };
    f.revision.value += 1;
    expect(f.pane.snapshot.value!.owner.sessionId).not.toBe(sessionId);
    expect(f.pane.snapshot.value!.acceptedIntentId).toBeUndefined();
    expect(f.pane.onIntent(current)).toBe(false);
    expect(f.execute).toHaveBeenCalledOnce();
  });
  test("fabricated asset/path owners and runtime numeric coercion are rejected", () => {
    const f = fixture("owned-group", leafPath),
      old = intent(f, "sizeWidthPt", 45);
    expect(f.pane.onIntent({ ...old, owner: { ...old.owner, assetId: "fake-source" } })).toBe(
      false,
    );
    expect(
      f.pane.onIntent({
        ...old,
        owner: { ...old.owner, ownerPath: ["owned-group", "owned-leaf"] },
      }),
    ).toBe(false);
    expect(f.pane.onIntent({ ...old, value: "45" } as unknown as PictureFormatIntent)).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
  });
  test.each([
    "workbook",
    "generation",
    "context",
    "metrics",
    "sheet",
    "selection",
    "path",
    "forest",
    "close",
    "dispose",
  ] as const)(
    "%s boundary invalidates old callbacks even when it leaves and returns",
    (boundary) => {
      const f = fixture("owned-group", leafPath),
        old = intent(f, "sizeWidthPt", 45);
      if (boundary === "workbook") {
        const workbook = f.currentWorkbook.value;
        f.currentWorkbook.value = { ...workbook };
        f.currentWorkbook.value = workbook;
      }
      if (boundary === "generation") {
        f.generation.value += 1;
        f.generation.value -= 1;
      }
      if (boundary === "context") {
        const context = f.context.value;
        f.context.value = { ...context };
        f.context.value = context;
      }
      if (boundary === "metrics") {
        const context = f.context.value;
        f.context.value = { ...context, metrics: { ...context.metrics } };
        f.context.value = context;
      }
      if (boundary === "sheet") {
        f.currentSheet.value = createSheet("Replacement", f.sheet.id);
        f.currentSheet.value = f.sheet;
      }
      if (boundary === "selection") {
        f.selectedIds.value = ["framed"];
        f.selectedIds.value = ["owned-group"];
      }
      if (boundary === "path") {
        f.selectedPath.value = ["owned-group", "branch"];
        f.selectedPath.value = leafPath;
      }
      if (boundary === "forest") {
        const forest = f.sheet.floatingImages;
        f.sheet.floatingImages = normalizePictureObjectCollection(forest);
        f.revision.value += 1;
        f.sheet.floatingImages = forest;
      }
      if (boundary === "close") f.pane.close();
      if (boundary === "dispose") f.scope.stop();
      expect(f.pane.onIntent(old)).toBe(false);
      expect(f.execute).not.toHaveBeenCalled();
    },
  );
  test("closed pane has no owner and reopening cannot accept a closed session intent", () => {
    const f = fixture();
    const beforeClose = intent(f, "sizeWidthPt", 180);
    f.open.value = false;
    expect(f.pane.snapshot.value).toBeNull();
    expect(f.pane.onIntent(beforeClose)).toBe(false);
    f.open.value = true;
    expect(f.pane.snapshot.value).not.toBeNull();
    expect(f.pane.onIntent(beforeClose)).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.pane.onIntent(intent(f, "sizeWidthPt", 180))).toBe(true);
  });
  test("busy/protected state, nonexistent paths, and source replacement never patch a fallback", () => {
    const f = fixture("owned-group", leafPath),
      old = intent(f, "sizeWidthPt", 45);
    f.busy.value = true;
    expect(f.pane.onIntent(old)).toBe(false);
    f.busy.value = false;
    f.sheet.properties.protected = true;
    expect(f.pane.onIntent(old)).toBe(false);
    f.sheet.properties.protected = false;
    f.selectedPath.value = ["owned-group", "sibling-leaf", "owned-leaf"];
    expect(f.pane.snapshot.value).toBeNull();
    expect(f.pane.onIntent(old)).toBe(false);
    f.selectedPath.value = leafPath;
    const sourceIntent = intent(f, "sizeWidthPt", 45),
      branch = root(f).members[0]!;
    if (branch.kind !== "grouped-group-v1" || branch.members[0]!.kind !== "grouped-picture-v1")
      throw new TypeError("Expected branch leaf");
    branch.members[0]!.assetId = "external-leaf-source";
    expect(f.pane.onIntent(sourceIntent)).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
  });
});
