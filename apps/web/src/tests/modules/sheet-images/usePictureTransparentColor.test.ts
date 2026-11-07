// 未执行：按用户要求仅编写测试，不运行检查。
import { afterEach, describe, expect, test, vi } from "vitest";
import { effectScope, reactive, ref, shallowRef, type EffectScope } from "vue";
import { createSetSheetFloatingImagesCommand } from "@sheetcraft/core/commands";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { isLegacyPictureObject } from "@sheetcraft/core/picture-object";
import {
  createSheet,
  getActiveSheet,
  type ImageAppearance,
  type LegacyFloatingImage,
  type Sheet,
} from "@sheetcraft/core/workbook";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { createPictureViewMetrics } from "@sheetcraft/sheet-engine/picture-frame-layout";
import { usePictureTransparentColor } from "../../../modules/sheet-images/usePictureTransparentColor";
import { framedPicture } from "./framed-picture-fixture";
import { pictureGroup } from "./picture-group-fixture";

const scopes: EffectScope[] = [];
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop());
  vi.restoreAllMocks();
});

function fixture() {
  const session = createWorkbookSession({ idFactory: createSequentialIdFactory() });
  const sheet = reactive(getActiveSheet(session.workbook));
  const selected: LegacyFloatingImage = {
    id: "selected",
    assetId: "shared-asset",
    altText: "Selected",
    anchor: { row: 0, column: 0 },
    offsetX: 20,
    offsetY: 30,
    width: 200,
    height: 100,
    transform: { appearance: { brightness: 0.8, opacity: 0.7 } },
  };
  const other: LegacyFloatingImage = {
    ...selected,
    id: "other",
    altText: "Other",
    offsetX: 300,
    width: 100,
    transform: { appearance: { contrast: 1.2 } },
  };
  sheet.floatingImages = [selected, other];
  const currentSheet = shallowRef<Sheet>(sheet);
  const generation = ref(0),
    revision = ref(0),
    readOnly = ref(false);
  const path = ref<readonly string[] | undefined>([selected.id]);
  const geometry = createSheetGeometry({ rowCount: 30, columnCount: 20 });
  const rows = createRowVisibilityIndex({ rowCount: 30, defaultRowHeight: 24 });
  const layout = createSheetViewportLayout({
    geometry,
    rows,
    freeze: { rows: 0, columns: 0 },
    bodyScrollPosition: { x: 0, y: 0 },
    viewportSize: { width: 600, height: 400 },
  });
  const frameContext = { layout, metrics: createPictureViewMetrics(sheet, geometry, rows) };
  const image = document.createElement("img");
  Object.defineProperties(image, { naturalWidth: { value: 200 }, naturalHeight: { value: 100 } });
  const availableImage = shallowRef<HTMLImageElement | undefined>(image);
  const drawImage = vi.fn();
  const getImageData = vi.fn(() => ({ data: new Uint8ClampedArray([18, 52, 86, 255]) }));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage,
    getImageData,
  } as unknown as CanvasRenderingContext2D);
  const getImage = vi.fn((_assetId: string) => availableImage.value);
  const onError = vi.fn();
  const execute = vi.fn((command: Parameters<typeof executeWorkbookCommand>[1]) => {
    const changed = executeWorkbookCommand(session, command);
    if (changed) revision.value++;
    return changed;
  });
  // The callback represents the already-selected owner's normal Core commit.
  const commit = vi.fn((patch: Partial<ImageAppearance>) =>
    execute(
      createSetSheetFloatingImagesCommand(
        sheet.id,
        sheet.floatingImages.map((root) =>
          root.id !== selected.id || !isLegacyPictureObject(root)
            ? root
            : {
                ...root,
                transform: {
                  ...root.transform,
                  appearance: { ...root.transform?.appearance, ...patch },
                },
              },
        ),
      ),
    ),
  );
  const scope = effectScope();
  scopes.push(scope);
  const picker = scope.run(() =>
    usePictureTransparentColor({
      getSheet: () => currentSheet.value,
      getGeneration: () => generation.value,
      getRevision: () => revision.value,
      getPath: () => path.value,
      isReadOnly: () => readOnly.value || currentSheet.value.properties.protected,
      getLayout: () => layout,
      getFrameContext: () => frameContext,
      getEffects: () => undefined,
      getResources: () => ({}),
      getImage,
      onError,
    }),
  )!;
  return {
    session,
    sheet,
    selected,
    other,
    currentSheet,
    generation,
    revision,
    readOnly,
    path,
    availableImage,
    drawImage,
    getImageData,
    getImage,
    onError,
    execute,
    commit,
    picker,
  };
}

describe("selected-picture transparent-color picking", () => {
  test("commits one source RGB patch through Core only to the selected object, even when an asset is shared", () => {
    const f = fixture();
    const before = serializeWorkbook(f.session.workbook);
    expect(f.picker.start(f.commit)).toBe(true);
    expect(f.picker.session.value?.path).toEqual(["selected"]);
    expect(f.picker.pick({ x: 70, y: 55 })).toBe(true);

    expect(f.commit.mock.calls).toEqual([[{ transparentColor: "#123456" }]]);
    expect(f.drawImage).toHaveBeenCalledWith(f.availableImage.value, -50, -25, 200, 100);
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.session.history.undoStack).toHaveLength(1);
    expect((f.sheet.floatingImages[0] as LegacyFloatingImage).transform?.appearance).toEqual({
      brightness: 0.8,
      opacity: 0.7,
      transparentColor: "#123456",
    });
    expect(f.sheet.floatingImages[1]).toEqual(f.other);
    expect(f.picker.session.value).toBeUndefined();
    expect(f.picker.pick({ x: 70, y: 55 })).toBe(false);
    expect(f.commit).toHaveBeenCalledTimes(1);
    expect(f.onError).not.toHaveBeenCalled();
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });

  test.each(["different object", "front overlapping object", "empty canvas"] as const)(
    "does not commit when the click hits %s",
    (hit) => {
      const f = fixture();
      if (hit === "front overlapping object")
        f.sheet.floatingImages = [f.selected, { ...f.other, offsetX: 20, width: 200 }];
      const before = serializeWorkbook(f.session.workbook);
      f.picker.start(f.commit);
      const point =
        hit === "different object"
          ? { x: 350, y: 55 }
          : hit === "empty canvas"
            ? { x: 550, y: 350 }
            : { x: 70, y: 55 };
      expect(f.picker.pick(point)).toBe(false);
      expect(f.picker.session.value).toBeUndefined();
      expect(f.commit).not.toHaveBeenCalled();
      expect(f.getImage).not.toHaveBeenCalled();
      expect(f.onError).not.toHaveBeenCalled();
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    },
  );

  test("clicks through another picture's unpainted shape hole to the selected underlying source", () => {
    const f = fixture(),
      front = framedPicture();
    front.frame.anchor = { mode: "fixed", x: 20, y: 30, size: { width: 200, height: 100 } };
    front.frame.angleDeg = 0;
    front.frame.cropShape = { preset: "donut" };
    f.sheet.floatingImages = [f.selected, front];
    f.picker.start(f.commit);

    expect(f.picker.pick({ x: 120, y: 80 })).toBe(true);
    expect(f.commit).toHaveBeenCalledOnce();
    expect(f.sheet.floatingImages[1]).toEqual(front);
  });

  test("rejects a framed source's padding without treating its frame rectangle as a pixel hit", () => {
    const f = fixture(),
      frame = framedPicture();
    frame.frame.anchor = { mode: "fixed", x: 20, y: 30, size: { width: 200, height: 100 } };
    frame.frame.angleDeg = 0;
    frame.frame.source = { widthRatio: 0.5, heightRatio: 0.5, offsetXRatio: 0, offsetYRatio: 0 };
    f.sheet.floatingImages = [frame];
    f.path.value = [frame.id];
    const before = serializeWorkbook(f.session.workbook);
    f.picker.start(f.commit);

    expect(f.picker.pick({ x: 45, y: 80 })).toBe(false);
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.getImage).not.toHaveBeenCalled();
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });

  test("matches an owned leaf's complete selection path rather than its source-free container", () => {
    const f = fixture(),
      group = pictureGroup();
    group.frame.angleDeg = 0;
    group.members[0]!.frame.angleDeg = 0;
    f.sheet.floatingImages = [group];
    f.path.value = [group.id, "owned-leaf"];
    const leafCommit = vi.fn(() => true);
    expect(f.picker.start(leafCommit)).toBe(true);
    expect(f.picker.pick({ x: 80, y: 50 })).toBe(true);
    expect(leafCommit.mock.calls).toEqual([[{ transparentColor: "#123456" }]]);
    expect(f.getImage).toHaveBeenCalledWith("synthetic-asset");

    f.path.value = [group.id];
    f.picker.start(f.commit);
    expect(f.picker.pick({ x: 80, y: 50 })).toBe(false);
    expect(f.commit).not.toHaveBeenCalled();
  });

  test.each([
    "sheet",
    "generation",
    "revision",
    "selection",
    "selection cleared",
    "protection",
    "read-only",
  ] as const)("cancels synchronously after %s changes without writing a stale owner", (change) => {
    const f = fixture();
    f.picker.start(f.commit);
    if (change === "sheet") f.currentSheet.value = createSheet("Other", "other");
    if (change === "generation") f.generation.value++;
    if (change === "revision") f.revision.value++;
    if (change === "selection") f.path.value = ["other"];
    if (change === "selection cleared") f.path.value = undefined;
    if (change === "protection") f.sheet.properties.protected = true;
    if (change === "read-only") f.readOnly.value = true;
    const before = serializeWorkbook(f.session.workbook);

    expect(f.picker.session.value).toBeUndefined();
    expect(f.picker.pick({ x: 70, y: 55 })).toBe(false);
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });

  test("refuses starting without an editable selected path and supports explicit cancellation", () => {
    const f = fixture();
    f.path.value = undefined;
    expect(f.picker.start(f.commit)).toBe(false);
    f.path.value = ["selected"];
    f.readOnly.value = true;
    expect(f.picker.start(f.commit)).toBe(false);
    f.readOnly.value = false;
    expect(f.picker.start(f.commit)).toBe(true);
    f.picker.cancel();
    expect(f.picker.pick({ x: 70, y: 55 })).toBe(false);
    expect(f.commit).not.toHaveBeenCalled();
  });

  test.each(["missing image", "transparent pixel", "tainted canvas", "rejected commit"] as const)(
    "never writes a successful result for %s",
    (failure) => {
      const f = fixture();
      if (failure === "missing image") f.availableImage.value = undefined;
      if (failure === "transparent pixel")
        f.getImageData.mockReturnValue({ data: new Uint8ClampedArray([18, 52, 86, 0]) });
      if (failure === "tainted canvas")
        f.getImageData.mockImplementation(() => {
          throw new Error("Unreadable source pixels");
        });
      if (failure === "rejected commit") f.commit.mockReturnValue(false);
      const before = serializeWorkbook(f.session.workbook);
      f.picker.start(f.commit);

      expect(f.picker.pick({ x: 70, y: 55 })).toBe(false);
      expect(f.execute).not.toHaveBeenCalled();
      if (failure === "rejected commit") expect(f.commit).toHaveBeenCalledOnce();
      else expect(f.commit).not.toHaveBeenCalled();
      if (failure === "transparent pixel") expect(f.onError).not.toHaveBeenCalled();
      else expect(f.onError).toHaveBeenCalledOnce();
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    },
  );
});
