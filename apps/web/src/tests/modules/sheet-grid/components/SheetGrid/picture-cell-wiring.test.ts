import { expect, test, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import SheetFloatingImageLayer from "../../../../../modules/sheet-images/components/SheetFloatingImageLayer.vue";
import SheetOwnedPictureGroupLayer from "../../../../../modules/sheet-images/components/SheetOwnedPictureGroupLayer.vue";
import { fixture } from "./picture-crop-fixture";

test("new root cell conversion uses authoritative callback and false never emits or deselects", async () => {
  const f = await fixture();
  try {
    const apply = vi.fn(() => false);
    await f.wrapper.setProps({ applyPictureToCell: apply, canConvertPictureToCell: () => true });
    const layer = f.wrapper.getComponent(SheetFloatingImageLayer);
    layer.vm.$emit("convertToCell", "legacy");
    await flushPromises();
    expect(apply).toHaveBeenCalledWith("legacy", undefined);
    expect(f.wrapper.emitted("convertFloatingImageToCell")).toBeUndefined();
    expect(f.sheet.floatingImages).toHaveLength(1);
    expect(layer.props("selectedImageId")).toBe("legacy");
  } finally {
    f.wrapper.unmount();
  }
});
test("an actual group leaf forwards its root and complete owner path", async () => {
  const f = await fixture(true);
  try {
    const apply = vi.fn(() => false);
    await f.wrapper.setProps({ applyPictureToCell: apply });
    const root = f.sheet.floatingImages[0]!;
    if (!("members" in root)) throw Error("Expected group");
    const path = [root.id, root.members[0]!.id];
    f.wrapper.getComponent(SheetOwnedPictureGroupLayer).vm.$emit("convertToCell", path, f.sheet);
    await flushPromises();
    expect(apply).toHaveBeenCalledWith(root.id, path);
    expect(f.sheet.floatingImages).toHaveLength(1);
  } finally {
    f.wrapper.unmount();
  }
});
test("unlocked protected existing picture conversion is not blocked by sheet-wide readOnly", async () => {
  const f = await fixture();
  try {
    const apply = vi.fn(() => false);
    f.sheet.floatingImages[0]!.locked = false;
    f.sheet.properties.protected = true;
    await f.wrapper.setProps({ readOnly: true, applyPictureToCell: apply });
    f.wrapper.getComponent(SheetFloatingImageLayer).vm.$emit("convertToCell", "legacy");
    await flushPromises();
    expect(apply).toHaveBeenCalledOnce();
  } finally {
    f.wrapper.unmount();
  }
});
