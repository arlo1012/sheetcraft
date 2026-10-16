import { ref } from "vue";
import { describe, expect, test } from "vitest";
import { undoWorkbookCommand, redoWorkbookCommand } from "@sheetcraft/core/history";
import { findPictureGroupNode, isPictureGroup } from "@sheetcraft/core/picture-group";
import { isFramedPictureObject, isLegacyPictureObject } from "@sheetcraft/core/picture-object";
import { type ImageAnnotation, type ImageAppearance } from "@sheetcraft/core/workbook";
import { usePictureTools } from "../../../modules/sheet-images/usePictureTools";
import {
  createPictureGlow,
  createPictureShadow,
  type PictureEffectEdit,
} from "../../../modules/sheet-images/picture-effect-edit";
import { fixture, framed, legacy, tree } from "./owned-group-tools/fixture";

const annotations: ImageAnnotation[] = [
  {
    kind: "pen",
    points: [
      { x: 0.1, y: 0.2 },
      { x: 0.3, y: 0.4 },
    ],
    color: "#123456",
    width: 0.01,
  },
];
const glow: PictureEffectEdit = {
  category: "glow",
  value: { kind: "value", value: createPictureGlow() },
};
function targetAppearance(f: ReturnType<typeof fixture>, index = 0): ImageAppearance | undefined {
  const image = f.sheet.floatingImages[index]!;
  if (isPictureGroup(image)) throw Error("Expected picture");
  return image.transform?.appearance;
}

describe("explicit picture effect commands", () => {
  test("mixed legacy/frame targets keep their own independent effects and one UndoRedo", () => {
    const first = legacy("a"),
      second = framed("b");
    if (!isFramedPictureObject(second)) throw Error("Expected framed picture");
    first.transform = {
      rotation: 90,
      crop: { x: 0.1, y: 0.2, width: 0.8, height: 0.7 },
      flipHorizontal: true,
      flipVertical: true,
      annotations,
      appearance: {
        opacity: 0.4,
        detailedStyle: { softEdges: { kind: "value", value: { sizePt: 2 } } },
      },
    };
    second.transform = {
      annotations,
      appearance: {
        brightness: 0.7,
        detailedStyle: { shadow: { kind: "value", value: createPictureShadow("inner") } },
      },
    };
    const f = fixture([first, second, legacy("untouched")]),
      before = f.forest();
    expect(f.tools.applyEffect(glow)).toBe(true);
    const after = f.forest();
    expect(targetAppearance(f, 0)).toEqual({
      ...first.transform.appearance,
      detailedStyle: { ...first.transform.appearance!.detailedStyle, glow: glow.value },
    });
    expect(targetAppearance(f, 1)).toEqual({
      ...second.transform.appearance,
      detailedStyle: { ...second.transform.appearance!.detailedStyle, glow: glow.value },
    });
    const afterLegacy = after[0],
      afterFramed = after[1];
    if (
      !afterLegacy ||
      !isLegacyPictureObject(afterLegacy) ||
      !afterFramed ||
      !isFramedPictureObject(afterFramed)
    )
      throw new Error("Effect edits must retain each picture's geometry model.");
    expect(afterLegacy.transform).toMatchObject({
      rotation: 90,
      crop: first.transform.crop,
      flipHorizontal: true,
      flipVertical: true,
      annotations,
    });
    expect(afterFramed).toMatchObject({ frame: second.frame, transform: { annotations } });
    expect(Object.keys(afterFramed.transform ?? {}).sort()).toEqual(["annotations", "appearance"]);
    expect(after[2]).toEqual(before[2]);
    expect(f.execute).toHaveBeenCalledOnce();
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(f.forest()).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(f.forest()).toEqual(after);
  });
  test("explicit none clears only its category and repeated choice adds no history", () => {
    const f = fixture();
    expect(f.tools.applyEffect(glow)).toBe(true);
    expect(
      f.tools.applyEffect({
        category: "shadow",
        value: { kind: "value", value: createPictureShadow() },
      }),
    ).toBe(true);
    const before = targetAppearance(f);
    expect(f.tools.applyEffect({ category: "glow", value: { kind: "none" } })).toBe(true);
    expect(targetAppearance(f)?.detailedStyle).toEqual({
      ...before?.detailedStyle,
      glow: { kind: "none" },
    });
    expect(f.tools.applyEffect({ category: "glow", value: { kind: "none" } })).toBe(true);
    expect(f.session.history.undoStack).toHaveLength(3);
  });
  test.each([
    "rejected",
    "throw",
    "busy",
    "locked",
    "missing",
    "duplicate",
    "container",
    "invalid",
  ])("%s failure leaves all targets and history unchanged", (kind) => {
    const f = fixture(kind === "container" ? [tree()] : undefined),
      before = f.forest();
    if (kind === "rejected") f.execute.mockReturnValueOnce(false);
    if (kind === "throw")
      f.execute.mockImplementationOnce(() => {
        throw Error("Rejected");
      });
    if (kind === "busy") f.setBusy();
    if (kind === "locked") {
      f.sheet.properties.protected = true;
      f.sheet.floatingImages[0]!.locked = true;
    }
    if (kind === "missing") f.selectedIds.value = ["a", "missing"];
    if (kind === "duplicate") f.selectedIds.value = ["a", "a"];
    const saved = f.forest();
    expect(
      f.tools.applyEffect(
        kind === "invalid" ? ({ category: "line", value: { kind: "none" } } as never) : glow,
      ),
    ).toBe(false);
    expect(f.forest()).toEqual(saved);
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(f.tools.operationFeedback.value).toBe("picture.operationFailed");
    if (kind !== "locked") expect(saved).toEqual(before);
  });
  test("an intent that reenters selection after capture cannot affect the new targets", () => {
    const f = fixture(),
      before = f.forest();
    const edit = {
      get category() {
        f.selectedIds.value = ["c"];
        return "glow";
      },
      value: glow.value,
    } as PictureEffectEdit;
    expect(f.tools.applyEffect(edit)).toBe(false);
    expect(f.forest()).toEqual(before);
    expect(f.execute).not.toHaveBeenCalled();
  });
  test.each(["c", "inner", "missing"])("owned path %s edits only a real leaf", (id) => {
    const source = tree();
    const sourceLeaf = findPictureGroupNode(source, ["root", "c"])!.node;
    if (sourceLeaf.kind !== "grouped-picture-v1") throw Error("Expected source leaf");
    sourceLeaf.transform = { annotations };
    const f = fixture([source]);
    const path = ref(["root", id]);
    const tools = usePictureTools({
      getSheet: () => f.sheet,
      selectedIds: f.selectedIds,
      getSelectedPath: () => path.value,
      getFrameContext: () => f.context,
      isBusy: () => false,
      execute: f.execute,
    });
    const before = f.forest();
    expect(tools.applyEffect(glow)).toBe(id === "c");
    if (id !== "c") {
      expect(f.forest()).toEqual(before);
      expect(f.execute).not.toHaveBeenCalled();
      return;
    }
    const root = f.sheet.floatingImages[0]!,
      old = before[0]!;
    if (!isPictureGroup(root) || !isPictureGroup(old)) throw Error("Expected group");
    expect(root.frame).toEqual(old.frame);
    expect(root.members[0]).toEqual(old.members[0]);
    const leaf = findPictureGroupNode(root, path.value)!.node;
    if (leaf.kind !== "grouped-picture-v1") throw Error("Expected leaf");
    expect(leaf.frame).toEqual(sourceLeaf.frame);
    expect(leaf.transform?.annotations).toEqual(annotations);
    expect(Object.keys(leaf.transform ?? {}).sort()).toEqual(["annotations", "appearance"]);
    expect(leaf.transform?.appearance?.detailedStyle?.glow).toEqual(glow.value);
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(f.forest()).toEqual(before);
  });
  test("owned root protection and reentrant leaf path changes reject atomically", () => {
    const f = fixture([tree()]);
    const path = ref(["root", "c"]);
    const tools = usePictureTools({
      getSheet: () => f.sheet,
      selectedIds: f.selectedIds,
      getSelectedPath: () => path.value,
      getFrameContext: () => f.context,
      isBusy: () => false,
      execute: f.execute,
    });
    f.sheet.properties.protected = true;
    f.sheet.floatingImages[0]!.locked = true;
    const before = f.forest();
    expect(tools.applyEffect(glow)).toBe(false);
    f.sheet.properties.protected = false;
    expect(
      tools.applyEffect({
        get category() {
          path.value = ["root", "inner", "a"];
          return "glow";
        },
        value: glow.value,
      } as PictureEffectEdit),
    ).toBe(false);
    expect(f.forest()).toEqual(before);
    expect(f.execute).not.toHaveBeenCalled();
  });
});
