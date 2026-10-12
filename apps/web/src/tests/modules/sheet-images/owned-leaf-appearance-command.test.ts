import { ref } from "vue";
import { describe, expect, test } from "vitest";
import { undoWorkbookCommand, redoWorkbookCommand } from "@sheetcraft/core/history";
import { findPictureGroupNode, isPictureGroup } from "@sheetcraft/core/picture-group";
import { normalizePictureObjectCollection } from "@sheetcraft/core/picture-object";
import { usePictureTools } from "../../../modules/sheet-images/usePictureTools";
import { fixture, tree } from "./owned-group-tools/fixture";

function setup() {
  const f = fixture([tree()]);
  const path = ref<string[] | null>(["root", "c"]);
  const tools = usePictureTools({
    getSheet: () => f.sheet,
    selectedIds: f.selectedIds,
    getSelectedPath: () => path.value,
    getFrameContext: () => f.context,
    isBusy: () => false,
    execute: f.execute,
  });
  return { ...f, path, tools };
}
function appearance(f: ReturnType<typeof setup>) {
  const root = f.sheet.floatingImages[0]!;
  if (!isPictureGroup(root)) throw Error("Expected owner");
  const node = findPictureGroupNode(root, ["root", "c"])!.node;
  if (node.kind !== "grouped-picture-v1") throw Error("Expected real leaf");
  return node.transform?.appearance;
}

describe("owned source appearance commands", () => {
  test("patches only the exact leaf, preserving geometry/annotations/hidden sibling tree and one UndoRedo", () => {
    const f = setup(),
      before = normalizePictureObjectCollection(f.sheet.floatingImages);
    expect(
      f.tools.applyAppearance({
        brightness: 0.6,
        contrast: 1.4,
        saturation: 0.8,
        opacity: 0.3,
        grayscale: 1,
        transparentColor: "#123456",
      }),
    ).toBe(true);
    const after = normalizePictureObjectCollection(f.sheet.floatingImages),
      old = before[0]!,
      next = after[0]!;
    if (!isPictureGroup(old) || !isPictureGroup(next)) throw Error("Expected owners");
    expect(next.frame).toEqual(old.frame);
    expect(next.members[0]).toEqual(old.members[0]);
    const oldLeaf = old.members[1]!,
      leaf = next.members[1]!;
    if (oldLeaf.kind !== "grouped-picture-v1" || leaf.kind !== "grouped-picture-v1")
      throw Error("Expected leaves");
    expect(leaf.frame).toEqual(oldLeaf.frame);
    expect(leaf.transform?.annotations).toEqual(oldLeaf.transform?.annotations);
    expect(appearance(f)).toMatchObject({
      brightness: 0.6,
      contrast: 1.4,
      saturation: 0.8,
      opacity: 0.3,
      grayscale: 1,
      transparentColor: "#123456",
    });
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(f.sheet.floatingImages).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(f.sheet.floatingImages).toEqual(after);
  });
  test("failed command retains complete source and history for retry", () => {
    const f = setup(),
      before = normalizePictureObjectCollection(f.sheet.floatingImages);
    f.execute.mockReturnValueOnce(false);
    expect(f.tools.applyAppearance({ opacity: 0.4 })).toBe(false);
    expect(f.sheet.floatingImages).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(f.tools.applyAppearance({ opacity: 0.4 })).toBe(true);
    expect(appearance(f)?.opacity).toBe(0.4);
  });
  test.each([true, false])(
    "effective root protection controls the leaf (root locked=%s)",
    (locked) => {
      const f = setup();
      f.sheet.properties.protected = true;
      f.sheet.floatingImages[0]!.locked = locked;
      const before = structuredClone(f.sheet.floatingImages);
      expect(f.tools.applyAppearance({ opacity: 0.4 })).toBe(!locked);
      if (locked) expect(f.sheet.floatingImages).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(locked ? 0 : 1);
    },
  );
  test.each([{ path: ["root", "inner"] }, { path: ["root", "missing"] }, { path: ["other", "c"] }])(
    "refuses non-source or stale path $path",
    ({ path }) => {
      const f = setup();
      f.path.value = path;
      const before = normalizePictureObjectCollection(f.sheet.floatingImages);
      expect(f.tools.applyAppearance({ opacity: 0.4 })).toBe(false);
      expect(f.sheet.floatingImages).toEqual(before);
      expect(f.execute).not.toHaveBeenCalled();
    },
  );
  test("a reentrant path change during planning cannot patch the replacement target", () => {
    const f = setup(),
      before = normalizePictureObjectCollection(f.sheet.floatingImages);
    const patch = {
      get opacity() {
        f.path.value = ["root", "inner", "a"];
        return 0.4;
      },
    };
    expect(f.tools.applyAppearance(patch)).toBe(false);
    expect(f.sheet.floatingImages).toEqual(before);
    expect(f.execute).not.toHaveBeenCalled();
  });
  test("Reset retains annotations/source/angle while clearing local appearance and shape", () => {
    const f = setup(),
      root = f.sheet.floatingImages[0]!;
    if (!isPictureGroup(root)) throw Error("Expected owner");
    const target = findPictureGroupNode(root, ["root", "c"])!.node;
    if (target.kind !== "grouped-picture-v1") throw Error("Expected leaf");
    target.frame.cropShape = { preset: "ellipse" };
    const old = structuredClone(target);
    expect(f.tools.applyAppearance(undefined)).toBe(true);
    const updated = f.sheet.floatingImages[0]!;
    if (!isPictureGroup(updated)) throw Error("Expected owner");
    const now = findPictureGroupNode(updated, ["root", "c"])!.node;
    expect(now.frame).toEqual({ ...old.frame, cropShape: undefined });
    if (now.kind !== "grouped-picture-v1") throw Error("Expected leaf");
    expect(now.transform?.annotations).toEqual(old.transform?.annotations);
    expect(now.transform?.appearance?.suppressThemeEffects).toEqual({
      shadow: true,
      outline: true,
      reflection: true,
      bevel: true,
    });
  });
});
