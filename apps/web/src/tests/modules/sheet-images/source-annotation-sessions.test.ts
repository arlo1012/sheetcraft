import { expect, test, vi } from "vitest";
import { usePictureDialogSessions } from "../../../modules/sheet-images/usePictureDialogSessions";
import { createSetSheetFloatingImagesCommand } from "@sheetcraft/core/commands";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { undoWorkbookCommand, redoWorkbookCommand } from "@sheetcraft/core/history";
import { createSheet, type FloatingImage } from "@sheetcraft/core/workbook";
import { normalizePictureObjectCollection } from "@sheetcraft/core/picture-object";
import type { PictureGroupPath } from "@sheetcraft/core/picture-group";
import { fixture } from "./useSheetImageActions/replacement-fixture";
const annotations = [
  {
    kind: "arrow" as const,
    color: "#FF0000",
    width: 0.02,
    points: [
      { x: 0.1, y: 0.2 },
      { x: 0.5, y: 0.7 },
    ],
  },
];
function setup(kind: "framed" | "owned") {
  const f = fixture();
  let path: PictureGroupPath | null = kind === "owned" ? [...f.leafPath] : null,
    ids = [kind === "owned" ? f.leafPath[0]! : "framed"],
    generation = 0;
  const setImages = vi.fn((images: readonly FloatingImage[], sheetId: string) =>
    f.execute(createSetSheetFloatingImagesCommand(sheetId, images)),
  );
  const dialogs = f.scope.run(() =>
    usePictureDialogSessions({
      getWorkbook: () => f.session.workbook,
      getSheet: () => f.sheet,
      getGeneration: () => generation,
      getSelectedImage: () => f.sheet.floatingImages.find((root) => root.id === ids[0]),
      getSelectedIds: () => ids,
      getSelectedPath: () => path,
      getFrameContext: f.getContext,
      isBusy: () => false,
      hasAsset: () => true,
      setImage: f.setFloatingImage,
      setImages,
      compress: async () => false,
      resize: () => false,
      resizeFeedback: () => undefined,
    }),
  )!;
  const current = () => (kind === "owned" ? f.currentLeaf() : f.currentFramed());
  return {
    ...f,
    dialogs,
    setImages,
    current,
    nextGeneration: () => generation++,
    changePath: () => {
      path = [f.leafPath[0]!, "sibling"];
    },
    changeSelection: () => {
      ids = ["legacy"];
    },
    setPath: (next: PictureGroupPath | null) => {
      path = next;
    },
  };
}
test.each(["framed", "owned"] as const)(
  "%s annotations change only the actual source and Undo/Redo exactly",
  (kind) => {
    const f = setup(kind);
    try {
      const before = serializeWorkbook(f.session.workbook);
      expect(f.dialogs.canAnnotate()).toBe(true);
      expect(f.dialogs.openAnnotation()).toBe(true);
      const dialog = f.dialogs.annotation.value!;
      expect(dialog.frameSource?.picture.assetId).toBe("old");
      const source = structuredClone(dialog.image);
      if (!("frame" in source)) throw Error("Expected source frame");
      expect(dialog.confirm({ ...source, transform: { ...source.transform, annotations } })).toBe(
        true,
      );
      expect(f.current().transform?.annotations).toEqual(annotations);
      const after = serializeWorkbook(f.session.workbook);
      expect(f.current().frame).toEqual(source.frame);
      expect(f.current().transform?.appearance).toEqual(source.transform?.appearance);
      expect(f.session.history.undoStack).toHaveLength(1);
      expect(undoWorkbookCommand(f.session)).toBe(true);
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(redoWorkbookCommand(f.session)).toBe(true);
      expect(serializeWorkbook(f.session.workbook)).toEqual(after);
    } finally {
      f.scope.stop();
    }
  },
);
test.each(["framed", "owned"] as const)(
  "%s annotation preserves latest geometry/style/metadata and siblings",
  (kind) => {
    const f = setup(kind);
    try {
      f.dialogs.openAnnotation();
      const dialog = f.dialogs.annotation.value!;
      const roots = normalizePictureObjectCollection(f.sheet.floatingImages);
      f.current().altText = "latest metadata";
      f.current().frame.angleDeg = 12;
      f.current().transform!.appearance = { opacity: 0.3 };
      const other = f.sheet.floatingImages.find((root) => root.id === "legacy")!;
      other.altText = "latest sibling";
      expect(dialog.confirm({ ...dialog.image, transform: { annotations } })).toBe(true);
      expect(f.current()).toMatchObject({
        altText: "latest metadata",
        frame: { angleDeg: 12 },
        transform: { appearance: { opacity: 0.3 }, annotations },
      });
      expect(f.sheet.floatingImages.find((root) => root.id === "legacy")?.altText).toBe(
        "latest sibling",
      );
      expect(f.sheet.floatingImages.map((root) => root.id)).toEqual(roots.map((root) => root.id));
    } finally {
      f.scope.stop();
    }
  },
);
test.each([
  "source",
  "annotations",
  "path",
  "selection",
  "generation",
  "sheet",
  "permission",
  "metric",
])("owned annotation refuses changed %s with zero history", (change) => {
  const f = setup("owned");
  try {
    f.dialogs.openAnnotation();
    const dialog = f.dialogs.annotation.value!;
    if (change === "source") f.current().assetId = "new source";
    if (change === "annotations") f.current().transform = { annotations };
    if (change === "path") f.changePath();
    if (change === "selection") f.changeSelection();
    if (change === "generation") f.nextGeneration();
    if (change === "sheet")
      f.session.workbook.sheets.set(f.sheet.id, createSheet("Other", f.sheet.id));
    if (change === "permission") f.sheet.properties.protected = true;
    if (change === "metric") f.getContext()!.metrics.rows.visiblePrefix = (index) => index * 42;
    const before = serializeWorkbook(f.session.workbook);
    expect(dialog.confirm({ ...dialog.image, transform: { annotations } })).toBe(false);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(f.setImages).not.toHaveBeenCalled();
  } finally {
    f.scope.stop();
  }
});
test("owned cancellation/old callbacks and refusal never replace a newer dialog", () => {
  const f = setup("owned");
  try {
    const before = serializeWorkbook(f.session.workbook);
    f.dialogs.openAnnotation();
    const old = f.dialogs.annotation.value!;
    old.close();
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    f.dialogs.openAnnotation();
    const fresh = f.dialogs.annotation.value!;
    expect(old.confirm({ ...old.image, transform: { annotations } })).toBe(false);
    old.close();
    expect(f.dialogs.annotation.value).toBe(fresh);
    f.refuse();
    expect(fresh.confirm({ ...fresh.image, transform: { annotations } })).toBe(false);
    expect(f.dialogs.annotation.value).toBe(fresh);
    expect(fresh.error.value).toBe("picture.operationFailed");
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
  } finally {
    f.scope.stop();
  }
});
test("unlocked protected root grants leaf annotation, locked root refuses even if leaf is unlocked", () => {
  const f = setup("owned");
  try {
    f.sheet.properties.protected = true;
    f.current().locked = false;
    expect(f.dialogs.canAnnotate()).toBe(false);
    f.currentGroup().locked = false;
    expect(f.dialogs.canAnnotate()).toBe(true);
    expect(f.dialogs.openAnnotation()).toBe(true);
    const dialog = f.dialogs.annotation.value!;
    expect(dialog.confirm({ ...dialog.image, transform: { annotations } })).toBe(true);
    expect(f.session.history.undoStack).toHaveLength(1);
  } finally {
    f.scope.stop();
  }
});
test.each([null, ["owned-group"]])(
  "group container path %j has no annotation source and cannot masquerade as one leaf",
  (path) => {
    const f = setup("owned");
    try {
      f.setPath(path);
      f.currentGroup().members = [f.currentGroup().members[0]!];
      expect(f.dialogs.canAnnotate()).toBe(false);
      expect(f.dialogs.openAnnotation()).toBe(false);
      expect(f.dialogs.annotation.value).toBeUndefined();
    } finally {
      f.scope.stop();
    }
  },
);

test("nested container with one source cannot masquerade as its descendant annotation leaf", () => {
  const f = setup("owned");
  try {
    const group = f.currentGroup(),
      leaf = group.members[0]!;
    group.members = [
      {
        kind: "grouped-group-v1",
        id: "nested",
        altText: "nested",
        frame: {
          kind: "group-local-frame-v1",
          rect: { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 },
          angleDeg: 0,
        },
        members: [leaf],
      },
    ];
    f.setPath([group.id, "nested"]);
    expect(f.dialogs.canAnnotate()).toBe(false);
    expect(f.dialogs.openAnnotation()).toBe(false);
    expect(f.dialogs.annotation.value).toBeUndefined();
    expect(f.session.history.undoStack).toHaveLength(0);
  } finally {
    f.scope.stop();
  }
});
