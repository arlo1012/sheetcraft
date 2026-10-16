import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { Input } from "tdesign-vue-next/es/input";
import PictureSelectionPane from "../../../../modules/sheet-images/components/PictureSelectionPane.vue";
import { createAppI18n } from "../../../../shared/i18n";
import { picture } from "../group-source-guard-fixture";

const mounted: VueWrapper[] = [];
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()));
function fixture(accept = true) {
  const image = picture();
  const renameHandler = vi.fn(() => accept);
  const selectHandler = vi.fn(() => true);
  const wrapper = mount(PictureSelectionPane, {
    props: { images: [image], selectedIds: [], disabled: false, renameHandler, selectHandler },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  return { image, wrapper, renameHandler, selectHandler };
}

test("native Input Enter commits once and subsequent blur doesn't repeat the rename", async () => {
  const f = fixture();
  const input = f.wrapper.get("input:not([type=checkbox])");
  await input.setValue("new name");
  await input.trigger("keydown", { key: "Enter", code: "Enter" });
  await input.trigger("blur");
  expect(f.renameHandler).toHaveBeenCalledTimes(1);
  expect(f.renameHandler).toHaveBeenCalledWith(f.image, "new name");
  expect(f.image.altText).toBe("picture");
});

test("rejected/empty names keep their draft with feedback; Escape restores the source", async () => {
  const f = fixture(false);
  const input = f.wrapper.get<HTMLInputElement>("input:not([type=checkbox])");
  await input.setValue("draft");
  await input.trigger("keydown", { key: "Enter", code: "Enter" });
  await input.trigger("blur");
  expect(f.renameHandler).toHaveBeenCalledTimes(1);
  expect(input.element.value).toBe("draft");
  expect(f.wrapper.text()).toContain("Your edit is kept");
  expect(input.attributes("aria-invalid")).toBe("true");
  expect(input.attributes("aria-describedby")).toBeTruthy();
  await input.setValue("   ");
  await input.trigger("blur");
  expect(f.renameHandler).toHaveBeenCalledTimes(1);
  expect(f.wrapper.text()).toContain("Enter a picture name");
  await input.trigger("keydown", { key: "Escape", code: "Escape" });
  await input.trigger("blur");
  expect(input.element.value).toBe("picture");
  expect(f.wrapper.find('[aria-invalid="true"]').exists()).toBe(false);
  expect(f.renameHandler).toHaveBeenCalledTimes(1);
});

test("same-ID replacement retires row edits and discards drafts without renaming another source", async () => {
  const f = fixture();
  const oldEdit = f.wrapper.getComponent(Input).vm.$.vnode.props?.onChange as (
    value: string,
  ) => void;
  const oldBlur = f.wrapper.getComponent(Input).vm.$.vnode.props?.onBlur as () => void;
  await f.wrapper.get("input:not([type=checkbox])").setValue("old draft");
  await f.wrapper.setProps({ images: [{ ...picture(), assetId: "replacement" }] });
  oldEdit("stale");
  oldBlur();
  expect(f.renameHandler).not.toHaveBeenCalled();
  expect(f.wrapper.get<HTMLInputElement>("input:not([type=checkbox])").element.value).toBe(
    "picture",
  );
});

test("owner disabled is loading/file/xlsx/image busy, and visually disables both selection actions", async () => {
  // Workspace supplies loading || fileBusy || xlsxBusy || imageBusy, separately from per-root edit permissions.
  const f = fixture();
  await f.wrapper.setProps({ disabled: true });
  const all = f.wrapper.get(".picture-selection-pane > button");
  expect(all.attributes("disabled")).toBeDefined();
  const checkbox = f.wrapper.getComponent(Checkbox);
  expect(checkbox.props("disabled")).toBe(true);
  checkbox.vm.$emit("change", true);
  await all.trigger("click");
  expect(f.selectHandler).not.toHaveBeenCalled();
  await f.wrapper.setProps({ disabled: false });
  checkbox.vm.$emit("change", true);
  expect(f.selectHandler).toHaveBeenCalledWith(["picture"]);
  await f.wrapper.setProps({ images: [] });
  expect(f.wrapper.get(".picture-selection-pane > button").attributes("disabled")).toBeDefined();
});
