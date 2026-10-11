import { describe, expect, test, vi } from "vitest";
import { effectScope, ref, shallowRef } from "vue";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSetFloatingImageCommand } from "@sheetcraft/core/commands";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import {
  getActiveSheet,
  cloneFloatingImage,
  createSheet,
  type FloatingImage,
} from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { usePictureDialogSessions } from "../../../modules/sheet-images/usePictureDialogSessions";
import type { PictureCompression } from "../../../modules/sheet-images/picture-asset-conversion";
const resize = { width: 400, height: 300, locked: false, all: false };
const settings = { maxSide: 1920, quality: 0.8, format: "webp" as const, all: false };
const annotations = [
  { kind: "pen" as const, width: 0.01, color: "#FF0000", points: [{ x: 0.1, y: 0.2 }] },
];
function fixture() {
  const session = createWorkbookSession({ idFactory: createSequentialIdFactory() });
  const sheet = getActiveSheet(session.workbook);
  const image: FloatingImage = {
    id: "synthetic",
    assetId: "asset",
    altText: "Synthetic",
    anchor: { row: 0, column: 0 },
    offsetX: 0,
    offsetY: 0,
    width: 200,
    height: 100,
  };
  sheet.floatingImages = [cloneFloatingImage(image)];
  let generation = 0;
  let selectedIds = [image.id];
  let busy = false;
  let reject = false;
  const setImage = vi.fn((next: FloatingImage, id: string) => {
    if (reject) sheet.properties.protected = true;
    try {
      return executeWorkbookCommand(session, createSetFloatingImageCommand(id, next));
    } catch {
      return false;
    }
  });
  const compress = vi.fn(async (_settings: PictureCompression, shouldContinue: () => boolean) =>
    shouldContinue(),
  );
  const resizeMany = vi.fn(() => true);
  const dialogs = usePictureDialogSessions({
    getWorkbook: () => session.workbook,
    getSheet: () => sheet,
    getGeneration: () => generation,
    getSelectedImage: () => sheet.floatingImages.find((entry) => entry.id === selectedIds[0]),
    getSelectedIds: () => selectedIds,
    isBusy: () => busy,
    hasAsset: () => true,
    setImage,
    compress,
    resize: resizeMany,
    resizeFeedback: () => "picture.invalidSize",
  });
  return {
    session,
    sheet,
    image,
    dialogs,
    setImage,
    compress,
    resizeMany,
    setGeneration: () => {
      generation += 1;
    },
    select: (ids: string[]) => {
      selectedIds = ids;
    },
    selectOther: () => {
      selectedIds = ["other"];
    },
    setBusy: () => {
      busy = true;
    },
    refuse: () => {
      reject = true;
    },
    allow: () => {
      reject = false;
      sheet.properties.protected = false;
    },
    annotated: () => ({ ...cloneFloatingImage(image), transform: { annotations } }),
  };
}
describe("picture dialog owner sessions", () => {
  test("rejected annotation retains its draft and can retry as one undoable command", () => {
    const f = fixture();
    f.dialogs.openAnnotation();
    const draft = f.dialogs.annotation.value!;
    f.refuse();
    expect(draft.confirm(f.annotated())).toBe(false);
    expect(f.dialogs.annotation.value).toBe(draft);
    expect(draft.error.value).toBe("picture.operationFailed");
    expect(f.sheet.floatingImages[0]!.transform).toBeUndefined();
    expect(f.session.history.undoStack).toHaveLength(0);
    f.allow();
    const before = serializeWorkbook(f.session.workbook);
    expect(draft.confirm(f.annotated())).toBe(true);
    expect(f.dialogs.annotation.value).toBeUndefined();
    expect(f.session.history.undoStack).toHaveLength(1);
    const after = serializeWorkbook(f.session.workbook);
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    redoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.session.workbook)).toEqual(after);
  });
  test("annotation commits only annotation changes while preserving latest geometry and appearance", () => {
    const f = fixture();
    f.dialogs.openAnnotation();
    const draft = f.dialogs.annotation.value!;
    const current = {
      ...f.image,
      width: 999,
      altText: "New name",
      transform: { appearance: { opacity: 0.5 } },
    };
    executeWorkbookCommand(f.session, createSetFloatingImageCommand(f.sheet.id, current));
    expect(draft.confirm(f.annotated())).toBe(true);
    expect(f.sheet.floatingImages[0]).toMatchObject({
      ...current,
      transform: { appearance: { opacity: 0.5 }, annotations },
    });
  });
  test("same annotations are a safe no-op, while an already-edited annotation set is not overwritten", () => {
    const f = fixture();
    f.dialogs.openAnnotation();
    expect(f.dialogs.annotation.value!.confirm(f.image)).toBe(true);
    expect(f.setImage).not.toHaveBeenCalled();
    f.dialogs.openAnnotation();
    const draft = f.dialogs.annotation.value!;
    executeWorkbookCommand(f.session, createSetFloatingImageCommand(f.sheet.id, f.annotated()));
    const before = serializeWorkbook(f.session.workbook);
    expect(draft.confirm(f.image)).toBe(false);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.dialogs.annotation.value).toBe(draft);
  });
  test.each(["annotation", "batch"] as const)(
    "old %s confirm and close cannot affect a reopened instance",
    (kind) => {
      const f = fixture();
      if (kind === "annotation") {
        f.dialogs.openAnnotation();
        const old = f.dialogs.annotation.value!;
        old.close();
        f.dialogs.openAnnotation();
        const current = f.dialogs.annotation.value;
        expect(old.confirm(f.annotated())).toBe(false);
        old.close();
        expect(f.dialogs.annotation.value).toBe(current);
      } else {
        f.dialogs.openBatchSize();
        const old = f.dialogs.batch.value!;
        old.close();
        f.dialogs.openBatchSize();
        const current = f.dialogs.batch.value;
        expect(old.confirm(resize)).toBe(false);
        old.close();
        expect(f.dialogs.batch.value).toBe(current);
      }
      expect(f.setImage).not.toHaveBeenCalled();
      expect(f.resizeMany).not.toHaveBeenCalled();
    },
  );
  test.each(["generation", "selection", "source", "permission", "busy"] as const)(
    "batch refuses %s changes without applying to a different target",
    (change) => {
      const f = fixture();
      f.dialogs.openBatchSize();
      const draft = f.dialogs.batch.value!;
      if (change === "generation") f.setGeneration();
      else if (change === "selection") f.selectOther();
      else if (change === "source") f.sheet.floatingImages[0]!.assetId = "new-source";
      else if (change === "permission") f.sheet.properties.protected = true;
      else f.setBusy();
      expect(draft.confirm(resize)).toBe(false);
      expect(f.resizeMany).not.toHaveBeenCalled();
      expect(f.dialogs.batch.value).toBe(draft);
      expect(draft.error.value).toBe("picture.operationFailed");
    },
  );
  test("batch rejection preserves draft and communicates validation feedback", () => {
    const f = fixture();
    f.dialogs.openBatchSize();
    const draft = f.dialogs.batch.value!;
    f.resizeMany.mockReturnValue(false);
    expect(draft.confirm(resize)).toBe(false);
    expect(f.dialogs.batch.value).toBe(draft);
    expect(draft.error.value).toBe("picture.invalidSize");
    f.resizeMany.mockReturnValue(true);
    expect(draft.confirm(resize)).toBe(true);
    expect(f.dialogs.batch.value).toBeUndefined();
  });
  test("old compression completion cannot close a newer dialog and its continuation guard is revoked", async () => {
    const f = fixture();
    let finish!: (value: boolean) => void;
    let valid!: () => boolean;
    f.compress.mockImplementation((_settings, guard) => {
      valid = guard;
      return new Promise<boolean>((resolve) => {
        finish = resolve;
      });
    });
    f.dialogs.openCompression();
    const old = f.dialogs.compression.value!;
    const result = old.confirm(settings);
    expect(valid()).toBe(true);
    old.close();
    f.dialogs.openCompression();
    const current = f.dialogs.compression.value;
    expect(valid()).toBe(false);
    finish(true);
    expect(await result).toBe(false);
    old.close();
    expect(f.dialogs.compression.value).toBe(current);
  });
  test("compression rejection preserves its settings dialog and permits retry", async () => {
    const f = fixture();
    f.compress.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    f.dialogs.openCompression();
    const draft = f.dialogs.compression.value!;
    expect(await draft.confirm(settings)).toBe(false);
    expect(f.dialogs.compression.value).toBe(draft);
    expect(draft.error.value).toBe("picture.operationFailed");
    expect(await draft.confirm(settings)).toBe(true);
    expect(f.dialogs.compression.value).toBeUndefined();
  });
});

describe("full picture dialog selection identity", () => {
  test.each(["batch", "compression"] as const)(
    "%s refuses a replaced secondary selection source",
    async (kind) => {
      const f = fixture();
      f.sheet.floatingImages.push({
        ...cloneFloatingImage(f.image),
        id: "second",
        assetId: "second-asset",
      });
      f.select([f.image.id, "second"]);
      if (kind === "batch") f.dialogs.openBatchSize();
      else f.dialogs.openCompression();
      const draft = kind === "batch" ? f.dialogs.batch.value! : f.dialogs.compression.value!;
      f.sheet.floatingImages[1]!.assetId = "new-secondary-source";
      expect(await draft.confirm({ ...resize, ...settings })).toBe(false);
      expect(draft.error.value).toBe("picture.operationFailed");
      expect(f.compress).not.toHaveBeenCalled();
      expect(f.resizeMany).not.toHaveBeenCalled();
      expect(f.session.history.undoStack).toHaveLength(0);
    },
  );
  test.each(["batch", "compression"] as const)(
    "all-picture %s refuses a collection change after opening",
    async (kind) => {
      const f = fixture();
      if (kind === "batch") f.dialogs.openBatchSize();
      else f.dialogs.openCompression();
      const draft = kind === "batch" ? f.dialogs.batch.value! : f.dialogs.compression.value!;
      f.sheet.floatingImages.push({
        ...cloneFloatingImage(f.image),
        id: "new",
        assetId: "new-asset",
      });
      expect(await draft.confirm({ ...resize, ...settings, all: true })).toBe(false);
      expect(draft.error.value).toBe("picture.operationFailed");
      expect(f.compress).not.toHaveBeenCalled();
      expect(f.resizeMany).not.toHaveBeenCalled();
    },
  );
});

describe("reactive picture-dialog scope", () => {
  test.each(["generation", "sheet", "dispose"] as const)(
    "%s clears current dialogs and revokes all captured callbacks",
    async (change) => {
      const f = fixture();
      const active = shallowRef(f.sheet);
      const generation = ref(0);
      const scope = effectScope();
      const dialogs = scope.run(() =>
        usePictureDialogSessions({
          getWorkbook: () => f.session.workbook,
          getSheet: () => active.value,
          getGeneration: () => generation.value,
          getSelectedImage: () => active.value.floatingImages[0],
          getSelectedIds: () => [f.image.id],
          isBusy: () => false,
          hasAsset: () => true,
          setImage: f.setImage,
          compress: f.compress,
          resize: f.resizeMany,
          resizeFeedback: () => undefined,
        }),
      )!;
      try {
        dialogs.openAnnotation();
        dialogs.openCompression();
        dialogs.openBatchSize();
        const annotation = dialogs.annotation.value!;
        const compression = dialogs.compression.value!;
        const batch = dialogs.batch.value!;
        if (change === "generation") generation.value += 1;
        if (change === "sheet") active.value = createSheet("Other", "other");
        if (change === "dispose") scope.stop();
        expect(dialogs.annotation.value).toBeUndefined();
        expect(dialogs.compression.value).toBeUndefined();
        expect(dialogs.batch.value).toBeUndefined();
        expect(annotation.confirm(f.annotated())).toBe(false);
        expect(await compression.confirm(settings)).toBe(false);
        expect(batch.confirm(resize)).toBe(false);
        expect(f.setImage).not.toHaveBeenCalled();
        expect(f.compress).not.toHaveBeenCalled();
        expect(f.resizeMany).not.toHaveBeenCalled();
        if (change === "dispose") {
          dialogs.openAnnotation();
          dialogs.openCompression();
          dialogs.openBatchSize();
          expect(dialogs.annotation.value).toBeUndefined();
          expect(dialogs.compression.value).toBeUndefined();
          expect(dialogs.batch.value).toBeUndefined();
        }
      } finally {
        scope.stop();
      }
    },
  );
});
