// @vitest-environment node
import { effectScope, shallowRef } from "vue";
import { describe, expect, test, vi } from "vitest";
import { createWorkbookSession, executeWorkbookCommand } from "@sheetcraft/core/history";
import { createSetSheetDrawingsCommand } from "@sheetcraft/core/commands";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import type { SheetDrawing } from "@sheetcraft/core/sheet-drawings";
import type { ImageAsset } from "../../../modules/image-assets/imageAssetStore";
import { ImageAssetError } from "../../../modules/image-assets/imageAssetValidation";
import { pictureTextureAssetId } from "../../../modules/sheet-images/picture-texture";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { createShapePaintAssetSource } from "../../../modules/sheet-drawings/shape-paint-asset-source";
import type { ShapeFormatSnapshot } from "../../../modules/sheet-drawings/shape-format-pane-model";
import { useOwnedShapeFormatPane } from "../../../modules/sheet-drawings/useOwnedShapeFormatPane";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}
const asset = (): ImageAsset => ({
  id: `image-${"a".repeat(64)}`,
  mimeType: "image/png",
  width: 1,
  height: 1,
  blob: new Blob(["decoded at the injected image-preparation boundary"]),
});
function fixture() {
  const workbook = createWorkbook({ id: "book", sheetId: "sheet" });
  const drawing = createGraphicDrawing("shape", "shape", "Shape", { row: 0, column: 0 });
  getActiveSheet(workbook).drawings = [drawing];
  const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
  const before = serializeWorkbook(workbook);
  let snapshot: ShapeFormatSnapshot | null = {
    owner: { workbookId: "book", sheetId: "sheet", drawingId: "shape", sessionId: "selection" },
    revision: 2,
    drawing,
    values: {},
  };
  const decode = deferred<ImageAsset>(),
    stored = deferred<void>(),
    prepare = vi.fn(() => decode.promise),
    put = vi.fn(() => stored.promise);
  const source = createShapePaintAssetSource({
    getSnapshot: () => snapshot,
    prepare,
    store: { get: async () => undefined, put },
  });
  return {
    source,
    decode,
    stored,
    prepare,
    put,
    get snapshot() {
      return snapshot;
    },
    set snapshot(value) {
      snapshot = value;
    },
    unchanged() {
      expect(serializeWorkbook(workbook)).toEqual(before);
      expect(session.history.undoStack).toEqual([]);
      expect(session.history.redoStack).toEqual([]);
      expect(session.history.revision).toBe(0);
    },
  };
}
type Fixture = ReturnType<typeof fixture>;
const boundaries = [
  "workbook",
  "sheet",
  "drawing-owner",
  "session",
  "revision",
  "drawing-reference",
  "picture-source",
  "missing-selection",
  "cancel",
  "dispose",
] as const;
function invalidate(f: Fixture, boundary: (typeof boundaries)[number]) {
  const snapshot = f.snapshot!;
  if (boundary === "workbook")
    f.snapshot = { ...snapshot, owner: { ...snapshot.owner, workbookId: "other-book" } };
  if (boundary === "sheet")
    f.snapshot = { ...snapshot, owner: { ...snapshot.owner, sheetId: "other-sheet" } };
  if (boundary === "drawing-owner")
    f.snapshot = { ...snapshot, owner: { ...snapshot.owner, drawingId: "other-shape" } };
  if (boundary === "session")
    f.snapshot = { ...snapshot, owner: { ...snapshot.owner, sessionId: "new-selection" } };
  if (boundary === "revision") f.snapshot = { ...snapshot, revision: snapshot.revision + 1 };
  if (boundary === "drawing-reference")
    f.snapshot = { ...snapshot, drawing: { ...snapshot.drawing } };
  if (boundary === "picture-source")
    f.snapshot = {
      ...snapshot,
      drawing: {
        ...snapshot.drawing,
        shapeStyle: { fill: { kind: "value", value: picturePaint("other-texture") } },
      },
    };
  if (boundary === "missing-selection") f.snapshot = null;
  if (boundary === "cancel") f.source.cancel();
  if (boundary === "dispose") f.source.dispose();
}
function picturePaint(assetId: string) {
  return {
    kind: "picture" as const,
    assetId,
    opacity: 0.37,
    rotateWithShape: false,
    layout: {
      kind: "tile" as const,
      scaleX: 2,
      scaleY: 3,
      offsetXPt: 4,
      offsetYPt: 5,
      flip: "xy" as const,
      anchor: "top-right" as const,
    },
  };
}

describe("shape paint asset exact ownership", () => {
  test("a current texture becomes available only after storage succeeds, without editing the document", async () => {
    const f = fixture(),
      blob = new Blob(["local texture"]),
      decoded = asset(),
      id = pictureTextureAssetId("denim", decoded.id),
      pending = f.source.load(blob, "denim");
    expect(f.prepare).toHaveBeenCalledExactlyOnceWith(blob);
    expect(f.put).not.toHaveBeenCalled();
    expect(f.source.has(id)).toBe(false);
    f.decode.resolve(decoded);
    await Promise.resolve();
    expect(f.put).toHaveBeenCalledExactlyOnceWith({ ...decoded, id });
    expect(f.source.has(id)).toBe(false);
    f.stored.resolve();
    await expect(pending).resolves.toBe(id);
    expect(f.source.has(id)).toBe(true);
    expect(f.source.has(decoded.id)).toBe(false);
    f.unchanged();
    f.source.dispose();
    expect(f.source.has(id)).toBe(false);
  });

  test.each(boundaries)("late preparation cannot retarget after %s changes", async (boundary) => {
    const f = fixture(),
      pending = f.source.load(new Blob(["texture"]), "paper");
    invalidate(f, boundary);
    f.decode.resolve(asset());
    await expect(pending).resolves.toBeUndefined();
    expect(f.put).not.toHaveBeenCalled();
    expect(f.source.has(pictureTextureAssetId("paper", asset().id))).toBe(false);
    f.unchanged();
  });

  test.each(boundaries)(
    "late storage cannot publish an asset after %s changes",
    async (boundary) => {
      const f = fixture(),
        pending = f.source.load(new Blob(["texture"]), "paper");
      f.decode.resolve(asset());
      await Promise.resolve();
      expect(f.put).toHaveBeenCalledOnce();
      invalidate(f, boundary);
      f.stored.resolve();
      await expect(pending).resolves.toBeUndefined();
      expect(f.source.has(pictureTextureAssetId("paper", asset().id))).toBe(false);
      f.unchanged();
    },
  );

  test("only the newest request may publish, even if an older storage write completes last", async () => {
    const f = fixture(),
      first = f.source.load(new Blob(["first"]), "paper"),
      latest = { ...asset(), id: `image-${"b".repeat(64)}` };
    f.decode.resolve(asset());
    await Promise.resolve();
    expect(f.put).toHaveBeenCalledOnce();
    f.prepare.mockResolvedValueOnce(latest);
    f.put.mockResolvedValueOnce();
    const second = f.source.load(new Blob(["second"]), "linen");
    await expect(second).resolves.toBe(pictureTextureAssetId("linen", latest.id));
    f.stored.resolve();
    await expect(first).resolves.toBeUndefined();
    expect(f.source.has(pictureTextureAssetId("paper", asset().id))).toBe(false);
    expect(f.source.has(pictureTextureAssetId("linen", latest.id))).toBe(true);
    f.unchanged();
  });

  test("cancel permits a fresh request; dispose permanently blocks preparation and storage", async () => {
    const f = fixture();
    f.source.cancel();
    const pending = f.source.load(new Blob(["fresh"]));
    f.decode.resolve(asset());
    f.stored.resolve();
    await expect(pending).resolves.toBe(asset().id);
    expect(f.source.has(asset().id)).toBe(true);
    f.source.dispose();
    await expect(f.source.load(new Blob(["disposed"]))).resolves.toBeUndefined();
    expect(f.prepare).toHaveBeenCalledOnce();
    expect(f.put).toHaveBeenCalledOnce();
    expect(f.source.has(asset().id)).toBe(false);
    f.unchanged();
  });

  test.each(["prepare", "store"] as const)(
    "failed %s never acknowledges an asset or changes workbook/history",
    async (stage) => {
      const f = fixture(),
        error = new ImageAssetError("decode-failed"),
        pending = f.source.load(new Blob(["invalid"]), "paper"),
        rejected = expect(pending).rejects.toBe(error);
      if (stage === "prepare") f.decode.reject(error);
      else {
        f.decode.resolve(asset());
        await Promise.resolve();
        f.stored.reject(error);
      }
      await rejected;
      expect(f.put).toHaveBeenCalledTimes(stage === "prepare" ? 0 : 1);
      expect(f.source.has(pictureTextureAssetId("paper", asset().id))).toBe(false);
      f.unchanged();
    },
  );

  test("missing selection and invalid preset reject before preparation or storage", async () => {
    const f = fixture();
    await expect(f.source.load(new Blob(["texture"]), "unknown" as never)).rejects.toThrow(
      "Unknown shape texture",
    );
    f.snapshot = null;
    await expect(f.source.load(new Blob(["unowned"]))).resolves.toBeUndefined();
    expect(f.prepare).not.toHaveBeenCalled();
    expect(f.put).not.toHaveBeenCalled();
    f.unchanged();
  });
});

test.each(["fill", "line"] as const)(
  "missing %s texture is rejected by the actual shape owner before a history command",
  (category) => {
    const workbook = createWorkbook({ id: "book", sheetId: "sheet" }),
      sheet = getActiveSheet(workbook),
      revision = shallowRef(0),
      drawing = createGraphicDrawing("shape", "shape", "Shape", { row: 0, column: 0 }),
      session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() }),
      scope = effectScope();
    sheet.drawings = [drawing];
    let pane!: ReturnType<typeof useOwnedShapeFormatPane>;
    const source = createShapePaintAssetSource({
      getSnapshot: () => pane.snapshot.value,
      store: { get: async () => undefined, put: async () => {} },
    });
    const update = vi.fn((next: SheetDrawing) =>
      executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, [next])),
    );
    pane = scope.run(() =>
      useOwnedShapeFormatPane({
        getWorkbook: () => workbook,
        getSheet: () => sheet,
        getGeneration: () => 0,
        getRevision: () => revision.value,
        isBusy: () => false,
        flush: () => true,
        update,
        isAssetAvailable: source.has,
        getUnsupportedReason: () => "Unavailable",
      }),
    )!;
    try {
      expect(pane.open(drawing)).toBe(true);
      const before = serializeWorkbook(workbook),
        snapshot = pane.snapshot.value!,
        paint = picturePaint("missing-texture"),
        value =
          category === "fill"
            ? { kind: "value" as const, value: paint }
            : {
                kind: "value" as const,
                value: {
                  paint,
                  widthPt: 1,
                  compound: "single" as const,
                  dash: "solid" as const,
                  cap: "butt" as const,
                  join: "miter" as const,
                  miterLimit: 4,
                },
              };
      expect(
        pane.onIntent({
          type: "set-style",
          target: "shape",
          category,
          value,
          owner: { ...snapshot.owner },
          baseRevision: snapshot.revision,
          intentId: "missing",
        } as Parameters<typeof pane.onIntent>[0]),
      ).toBe(false);
      expect(update).not.toHaveBeenCalled();
      expect(serializeWorkbook(workbook)).toEqual(before);
      expect(session.history.undoStack).toEqual([]);
      expect(session.history.redoStack).toEqual([]);
      expect(session.history.revision).toBe(0);
      expect(pane.snapshot.value?.acceptedIntentId).toBeUndefined();
    } finally {
      source.dispose();
      scope.stop();
    }
  },
);
