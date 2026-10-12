import { afterEach, expect, test, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { Dialog } from "tdesign-vue-next/es/dialog";
import PictureCellOverwriteDialog from "../../../../modules/sheet-images/components/PictureCellOverwriteDialog.vue";
import type { PictureCellOverwriteConfirmation } from "../../../../modules/sheet-images/picture-cell-overwrite-confirmation";
import { createAppI18n } from "../../../../shared/i18n";
const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});
function fixture(inserting = true) {
  const confirmation: PictureCellOverwriteConfirmation = {
    key: 1,
    address: { row: 0, column: 0 },
    sheetName: "Synthetic",
    error: false,
    ...(inserting
      ? {
          insertionTargets: [
            { start: { row: 0, column: 0 }, end: { row: 1, column: 1 } },
            { start: { row: 2, column: 0 }, end: { row: 2, column: 0 } },
          ],
          occupiedTargetCount: 1,
        }
      : {}),
    confirm: vi.fn(() => true),
    cancel: vi.fn(),
  };
  const wrapper = mount(PictureCellOverwriteDialog, {
    props: { confirmation },
    attachTo: document.body,
    global: { plugins: [createAppI18n("zh-CN")] },
  });
  mounted.push(wrapper);
  return { wrapper, confirmation };
}
test("insertion confirmation names every actual expanded destination and occupied count", () => {
  const f = fixture(),
    surface = document.body.textContent!;
  expect(surface).toContain("2 张图片");
  expect(surface).toContain("1 个目标区域");
  expect(surface).toContain("Synthetic!A1:B2");
  expect(surface).toContain("Synthetic!A3");
  f.wrapper.getComponent(Dialog).vm.$emit("confirm");
  expect(f.confirmation.confirm).toHaveBeenCalledOnce();
});
test("cancel and error/busy feedback keep the original conversion surface usable", async () => {
  const f = fixture(false);
  expect(document.body.textContent).toContain("Synthetic!A1");
  expect(document.body.querySelector(".picture-overwrite-targets")).toBeNull();
  await f.wrapper.setProps({ confirmation: { ...f.confirmation, busy: true, error: true } });
  expect(f.wrapper.getComponent(Dialog).props("confirmLoading")).toBe(true);
  expect(document.body.querySelector('[role="alert"]')).not.toBeNull();
  f.wrapper.getComponent(Dialog).vm.$emit("close");
  expect(f.confirmation.cancel).toHaveBeenCalledOnce();
});
test("same-key error updates do not silently replace captured callbacks", async () => {
  const f = fixture(),
    newConfirm = vi.fn(() => true),
    newCancel = vi.fn();
  await f.wrapper.setProps({
    confirmation: { ...f.confirmation, error: true, confirm: newConfirm, cancel: newCancel },
  });
  f.wrapper.getComponent(Dialog).vm.$emit("confirm");
  f.wrapper.getComponent(Dialog).vm.$emit("close");
  expect(f.confirmation.confirm).toHaveBeenCalledOnce();
  expect(f.confirmation.cancel).toHaveBeenCalledOnce();
  expect(newConfirm).not.toHaveBeenCalled();
  expect(newCancel).not.toHaveBeenCalled();
});
