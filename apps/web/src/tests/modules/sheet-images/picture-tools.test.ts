import { ref } from "vue";
import { describe, expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet, type FloatingImage } from "@idea10/core/workbook";
import { applyWorkbookCommand, type WorkbookCommand } from "@idea10/core/commands";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import {
  usePictureTools,
  type PictureLayerAction,
} from "../../../modules/sheet-images/usePictureTools";

function picture(id: string, groupId?: string): FloatingImage {
  return {
    id,
    assetId: "asset",
    altText: id,
    anchor: { row: 1, column: 1 },
    offsetX: 0,
    offsetY: 0,
    width: 100,
    height: 50,
    ...(groupId ? { groupId } : {}),
  };
}
function fixture(images = ["a", "b", "c", "d", "e"].map((id) => picture(id))) {
  const workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
  const sheet = getActiveSheet(workbook);
  sheet.floatingImages = images;
  const selectedIds = ref(["b", "d"]);
  let busy = false;
  const execute = vi.fn((command: WorkbookCommand) => applyWorkbookCommand(workbook, command));
  const tools = usePictureTools({
    getSheet: () => sheet,
    selectedIds,
    isBusy: () => busy,
    execute,
  });
  return {
    sheet,
    selectedIds,
    execute,
    tools,
    setBusy: () => {
      busy = true;
    },
    ids: () => sheet.floatingImages.map((image) => image.id),
  };
}

describe("picture tools", () => {
  test.each<[PictureLayerAction, string[]]>([
    ["front", ["a", "c", "e", "b", "d"]],
    ["back", ["b", "d", "a", "c", "e"]],
    ["forward", ["a", "c", "b", "e", "d"]],
    ["backward", ["b", "a", "d", "c", "e"]],
  ])("moves selected pictures %s while preserving their relative order", (action, expected) => {
    const f = fixture();
    f.selectedIds.value = ["d", "b"];
    f.tools.layer(action);
    expect(f.ids()).toEqual(expected);
    expect(f.execute).toHaveBeenCalledTimes(1);
  });

  test("groups complete original groups and ungroups all members from a selected member", () => {
    const f = fixture([
      picture("a", "old-1"),
      picture("b", "old-1"),
      picture("c", "old-2"),
      picture("d", "old-2"),
      picture("e", "untouched"),
    ]);
    f.tools.group();
    const group = f.sheet.floatingImages[0]!.groupId;
    expect(group).toBeTruthy();
    expect(group).not.toBe("old-1");
    expect(f.sheet.floatingImages.slice(0, 4).map((image) => image.groupId)).toEqual([
      group,
      group,
      group,
      group,
    ]);
    expect(f.sheet.floatingImages[4]?.groupId).toBe("untouched");
    f.selectedIds.value = ["a"];
    f.tools.group(true);
    expect(f.sheet.floatingImages.slice(0, 4).every((image) => image.groupId === undefined)).toBe(
      true,
    );
    expect(f.sheet.floatingImages[4]?.groupId).toBe("untouched");
  });

  test("updates only addressed pictures and ignores IDs absent from the sheet", () => {
    const f = fixture();
    const before = structuredClone(f.sheet.floatingImages);
    f.tools.updateMany([{ ...picture("b"), width: 240, hidden: true }, picture("missing")]);
    expect(f.ids()).toEqual(["a", "b", "c", "d", "e"]);
    expect(f.sheet.floatingImages[1]).toMatchObject({ width: 240, hidden: true });
    expect(f.sheet.floatingImages.filter((image) => image.id !== "b")).toEqual(
      before.filter((image) => image.id !== "b"),
    );
  });

  test("removes selected pictures or an explicit list without affecting remaining pictures", () => {
    const f = fixture();
    f.tools.remove();
    expect(f.ids()).toEqual(["a", "c", "e"]);
    f.tools.remove(["c", "missing"]);
    expect(f.ids()).toEqual(["a", "e"]);
  });

  test.each(["busy", "protected"] as const)("blocks picture edits when %s", (restriction) => {
    const f = fixture();
    const before = structuredClone(f.sheet.floatingImages);
    if (restriction === "busy") f.setBusy();
    else f.sheet.properties.protected = true;
    f.tools.layer("front");
    f.tools.group();
    f.tools.group(true);
    f.tools.updateMany([{ ...picture("b"), width: 240 }]);
    f.tools.remove();
    f.tools.rename(f.sheet.floatingImages[0]!, "Renamed");
    f.tools.toggleVisibility(f.sheet.floatingImages[0]!);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.sheet.floatingImages).toEqual(before);
  });
});
