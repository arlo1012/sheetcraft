import { describe, expect, test, vi } from "vitest";
import { effectScope } from "vue";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { applyWorkbookCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import { normalizeShapeGroup, type SheetGroupedGraphicDrawing } from "@sheetcraft/core/shape-group";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { useDrawingActions } from "../../../modules/sheet-drawings/useDrawingActions";
import { prepareShapeTextUpdate } from "../../../modules/sheet-drawings/prepare-shape-text-update";
import type { DrawingShapeTextRuntimeOptions } from "../../../modules/sheet-drawings/shape-text-runtime";

const measurement: DrawingShapeTextRuntimeOptions = {
  measurer: {
    measure: (text) => text.length * 10,
    measureMetrics: (text) => ({
      width: text.length * 10,
      ascent: 15,
      descent: 5,
      inkLeft: 0,
      inkRight: text.length * 10,
    }),
  },
  normalLineMetrics: { ascent: 15, descent: 5, lineAdvance: 20 },
};
function leaf(id: string): SheetGroupedGraphicDrawing {
  const {
    anchor: _a,
    offsetX: _x,
    offsetY: _y,
    width: _w,
    height: _h,
    ...appearance
  } = createGraphicDrawing(id, "textBox", "Literal", { row: 0, column: 0 });
  return {
    ...appearance,
    kind: "textBox",
    rotation: 13,
    groupFrame: {
      kind: "shape-group-local-v1",
      rect: { xRatio: -0.25, yRatio: 0.1, widthRatio: 0.5, heightRatio: 0.5 },
    },
  };
}
function fixture() {
  const workbook = createWorkbook({ id: "book", sheetId: "sheet" }),
    sheet = getActiveSheet(workbook);
  const root = normalizeShapeGroup({
    kind: "shapeGroup",
    id: "root",
    name: "Root",
    rotation: 37,
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: { mode: "fixed", x: 30, y: 10, size: { width: 320, height: 180 } },
    },
    members: [
      leaf("a"),
      {
        kind: "shapeGroup",
        id: "inner",
        name: "Inner",
        rotation: 29,
        groupFrame: {
          kind: "shape-group-local-v1",
          rect: { xRatio: 0.3, yRatio: 0.3, widthRatio: 0.5, heightRatio: 0.5 },
        },
        members: [leaf("b")],
      },
    ],
  });
  sheet.drawings = [root];
  let metrics = createPictureSheetMetrics(sheet),
    revision = 0,
    generation = 0;
  const execute = vi.fn((command: WorkbookCommand): unknown =>
    applyWorkbookCommand(workbook, command),
  );
  const prepare = vi.fn(
    (
      next: Parameters<typeof prepareShapeTextUpdate>[0],
      owner?: Parameters<typeof prepareShapeTextUpdate>[1],
    ) => prepareShapeTextUpdate(next, owner, undefined, measurement, undefined, metrics),
  );
  const scope = effectScope(),
    actions = scope.run(() =>
      useDrawingActions({
        getWorkbook: () => workbook,
        getSheet: () => sheet,
        getMetrics: () => metrics,
        getRevision: () => revision,
        getGeneration: () => generation,
        getAddress: () => ({ row: 0, column: 0 }),
        isBusy: () => false,
        flush: () => true,
        execute,
        name: (kind) => kind,
        prepareDrawing: prepare,
      }),
    )!;
  return {
    actions,
    root,
    sheet,
    scope,
    execute,
    prepare,
    change(kind: string) {
      if (kind === "metrics") metrics = createPictureSheetMetrics(sheet);
      else if (kind === "revision") revision++;
      else if (kind === "generation") generation++;
      else if (kind === "replace") sheet.drawings = [{ ...root }];
      else if (kind === "path") root.members.reverse();
      else if (kind === "leaf") (root.members[0] as SheetGroupedGraphicDrawing).text = "External";
      else if (kind === "protection") sheet.properties.protected = true;
    },
  };
}

describe("owned shape group leaf dialog transactions", () => {
  test("opens the real nested leaf then inverse-edits the same root without changing sibling appearance/AutoFit", () => {
    const f = fixture();
    try {
      const before = structuredClone(f.root);
      expect(f.actions.editGroupLeaf(f.root, ["root", "inner", "b"])).toBe(true);
      const dialog = f.actions.dialog.value!;
      expect(dialog.existing).toBe(f.root);
      expect(dialog.initial.id).toBe("b");
      expect(dialog.initial.kind).toBe("textBox");
      expect(dialog.initial.rotation).toBe(79);
      expect(dialog.initial).not.toHaveProperty("members");
      expect(
        f.actions.normalizeDialogDrawing.value?.({ ...dialog.initial, text: "Edited" }).text,
      ).toBe("Edited");
      expect(
        f.actions.confirm({ ...dialog.initial, text: "Edited", color: "#ff0000" }, dialog),
      ).toBe(true);
      const result = f.sheet.drawings![0]!;
      if (result.kind !== "shapeGroup" || result.members[1]!.kind !== "shapeGroup")
        throw new Error("Expected owned groups");
      const edited = result.members[1]!.members[0] as SheetGroupedGraphicDrawing;
      expect(edited.text).toBe("Edited");
      expect(edited.color).toBe("#ff0000");
      expect(edited.groupFrame).toEqual(
        (before.members[1]!.kind === "shapeGroup"
          ? before.members[1]!.members[0]!
          : before.members[0]!
        ).groupFrame,
      );
      expect(edited.rotation).toBe(13);
      expect(edited.fontSize).toBe(20);
      expect(result.shapeFrame).toEqual(before.shapeFrame);
      expect(result.members[0]).toEqual(before.members[0]);
      expect(f.root).toEqual(before);
      expect(f.execute).toHaveBeenCalledTimes(1);
      expect(f.prepare.mock.calls[0]![0].kind).toBe("shapeGroup");
      expect(f.actions.dialog.value).toBeUndefined();
    } finally {
      f.scope.stop();
    }
  });
  test.each(["metrics", "revision", "generation", "replace", "path", "leaf", "protection"])(
    "rejects stale %s without submitting any command",
    (kind) => {
      const f = fixture();
      try {
        expect(f.actions.editGroupLeaf(f.root, ["root", "a"])).toBe(true);
        const dialog = f.actions.dialog.value!,
          normalize = f.actions.normalizeDialogDrawing.value!;
        f.change(kind);
        expect(f.actions.confirm({ ...dialog.initial, text: "Stale" }, dialog)).toBe(false);
        expect(() => normalize({ ...dialog.initial, text: "Stale" })).toThrow();
        expect(f.execute).not.toHaveBeenCalled();
      } finally {
        f.scope.stop();
      }
    },
  );
  test("a stale callback or normalizer cannot affect or close a newer same-root leaf dialog", () => {
    const f = fixture();
    try {
      expect(f.actions.editGroupLeaf(f.root, ["root", "a"])).toBe(true);
      const old = f.actions.dialog.value!,
        normalize = f.actions.normalizeDialogDrawing.value!;
      expect(f.actions.editGroupLeaf(f.root, ["root", "inner", "b"])).toBe(true);
      const current = f.actions.dialog.value!;
      old.confirm({ ...old.initial, text: "Stale" });
      old.close();
      expect(() => normalize(old.initial)).toThrow();
      expect(f.actions.dialog.value).toBe(current);
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.actions.confirm({ ...current.initial, text: "Current" }, current)).toBe(true);
    } finally {
      f.scope.stop();
    }
  });
  test("a later leaf's preparation failure preserves the current draft and original owned root", () => {
    const f = fixture();
    try {
      expect(f.actions.editGroupLeaf(f.root, ["root", "a"])).toBe(true);
      const dialog = f.actions.dialog.value!,
        before = structuredClone(f.root);
      f.prepare.mockImplementationOnce(() => {
        throw new Error("Other leaf glyph budget");
      });
      expect(f.actions.confirm({ ...dialog.initial, text: "Rejected" }, dialog)).toBe(false);
      expect(f.actions.dialog.value).toBe(dialog);
      expect(f.sheet.drawings![0]).toBe(f.root);
      expect(f.root).toEqual(before);
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.actions.confirm({ ...dialog.initial, text: "Retry" }, dialog)).toBe(true);
    } finally {
      f.scope.stop();
    }
  });
  test("root-only permissions allow an unlocked root, never a locked root with unlocked private leaves", () => {
    const f = fixture();
    try {
      f.sheet.properties.protected = true;
      (f.root.members[0] as SheetGroupedGraphicDrawing).shapeProperties = { locked: false };
      expect(f.actions.editGroupLeaf(f.root, ["root", "a"])).toBe(false);
      f.root.shapeProperties = { locked: false };
      expect(f.actions.editGroupLeaf(f.root, ["root", "a"])).toBe(true);
      const dialog = f.actions.dialog.value!;
      expect(f.actions.confirm({ ...dialog.initial, text: "Unlocked" }, dialog)).toBe(true);
    } finally {
      f.scope.stop();
    }
  });
  test("missing/owner paths fail quietly and scope disposal rejects retained leaf callbacks", () => {
    const f = fixture();
    expect(f.actions.editGroupLeaf(f.root, ["root"])).toBe(false);
    expect(f.actions.editGroupLeaf(f.root, ["root", "missing"])).toBe(false);
    expect(f.actions.editGroupLeaf(f.root, ["root", "a"])).toBe(true);
    const dialog = f.actions.dialog.value!;
    f.scope.stop();
    dialog.confirm({ ...dialog.initial, text: "Disposed" });
    expect(f.execute).not.toHaveBeenCalled();
  });
});
