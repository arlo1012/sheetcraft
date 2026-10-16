import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Button } from "tdesign-vue-next/es/button";
import { Input } from "tdesign-vue-next/es/input";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import PictureSelectionPane from "../../../../modules/sheet-images/components/PictureSelectionPane.vue";
import { createAppI18n } from "../../../../shared/i18n";
import { group } from "../group-source-guard-fixture";
import type { FloatingImage } from "@sheetcraft/core/workbook";

const mounted: VueWrapper[] = [];
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()));
function fixture() {
  const image = group("owner");
  const renameHandler = vi.fn((_image: FloatingImage, _name: string) => false);
  const visibilityHandler = vi.fn((_image: FloatingImage) => false);
  const selectHandler = vi.fn((_ids: string[]) => false);
  const closeHandler = vi.fn(() => false);
  const wrapper = mount(PictureSelectionPane, {
    props: {
      images: [image],
      selectedIds: [],
      disabled: false,
      renameHandler,
      visibilityHandler,
      selectHandler,
      closeHandler,
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  return { image, wrapper, renameHandler, visibilityHandler, selectHandler, closeHandler };
}
function handler(component: Pick<VueWrapper, "vm">, key: string): (...args: unknown[]) => void {
  const callback = component.vm.$.vnode.props?.[key];
  if (typeof callback !== "function") throw new Error(`Missing ${key}`);
  return callback as (...args: unknown[]) => void;
}
describe("selection pane source and owner callbacks", () => {
  test("captures detached complete group source and doesn't mutate it after rejection", () => {
    const f = fixture();
    f.wrapper.getComponent(Input).vm.$emit("change", "new name");
    f.wrapper.getComponent(Input).vm.$emit("blur", "new name");
    expect(f.renameHandler).toHaveBeenCalledWith(f.image, "new name");
    const source = f.renameHandler.mock.calls[0]?.[0];
    expect(source).not.toBe(f.image);
    expect(f.image.altText).toBe("owner");
    expect(f.wrapper.emitted("rename")).toBeUndefined();
  });
  test("old row callbacks cannot borrow replacement owner handlers for equal reused IDs", async () => {
    const f = fixture();
    const rename = handler(f.wrapper.getComponent(Input), "onBlur");
    const visibility = handler(
      f.wrapper
        .findAllComponents(Button)
        .find((button) => button.attributes("aria-label") === "Hide picture")!,
      "onClick",
    );
    const select = handler(f.wrapper.getComponent(Checkbox), "onChange");
    const newer = {
      renameHandler: vi.fn(() => true),
      visibilityHandler: vi.fn(() => true),
      selectHandler: vi.fn(() => true),
      closeHandler: vi.fn(() => true),
    };
    await f.wrapper.setProps({ ...newer, images: [group("owner")] });
    rename("stale");
    visibility();
    select(true);
    for (const callback of Object.values(newer)) expect(callback).not.toHaveBeenCalled();
    expect(f.renameHandler).not.toHaveBeenCalled();
    expect(f.visibilityHandler).not.toHaveBeenCalled();
    expect(f.selectHandler).not.toHaveBeenCalled();
    f.wrapper.getComponent(Input).vm.$emit("change", "fresh");
    f.wrapper.getComponent(Input).vm.$emit("blur", "fresh");
    expect(newer.renameHandler).toHaveBeenCalledOnce();
  });
  test("old select-all and close callbacks cannot affect a reopened pane", async () => {
    const f = fixture();
    const all = f.wrapper
      .findAllComponents(Button)
      .find((button) => !button.attributes("aria-label"))!;
    const close = f.wrapper
      .findAllComponents(Button)
      .find((button) => button.attributes("aria-label") === "Close")!;
    const oldAll = handler(all, "onClick");
    const oldClose = handler(close, "onClick");
    const nextSelect = vi.fn(() => true),
      nextClose = vi.fn(() => true);
    await f.wrapper.setProps({ selectHandler: nextSelect, closeHandler: nextClose });
    oldClose();
    oldAll();
    expect(nextSelect).not.toHaveBeenCalled();
    expect(f.selectHandler).not.toHaveBeenCalled();
    expect(nextClose).not.toHaveBeenCalled();
    expect(f.closeHandler).not.toHaveBeenCalled();
    // Selection is bound to the rendered root list and invokes the current owner only.
    await f.wrapper.get(".picture-selection-pane > button").trigger("click");
    expect(nextSelect).toHaveBeenCalledWith(["owner"]);
  });
  test("disabled metadata edits are refused without fallback events", async () => {
    const f = fixture();
    await f.wrapper.setProps({ disabled: true });
    f.wrapper.getComponent(Input).vm.$emit("change", "blocked");
    f.wrapper.getComponent(Input).vm.$emit("blur", "blocked");
    const visibility = f.wrapper
      .findAllComponents(Button)
      .find((button) => button.attributes("aria-label") === "Hide picture")!;
    visibility.vm.$emit("click");
    expect(f.renameHandler).not.toHaveBeenCalled();
    expect(f.visibilityHandler).not.toHaveBeenCalled();
    expect(f.wrapper.emitted("rename")).toBeUndefined();
    expect(f.wrapper.emitted("visibility")).toBeUndefined();
  });
});
