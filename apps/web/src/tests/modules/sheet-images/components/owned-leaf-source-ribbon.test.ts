import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import PictureOwnedLeafRibbon from "../../../../modules/sheet-images/components/PictureOwnedLeafRibbon.vue";
import PictureAssetTools from "../../../../modules/sheet-images/components/PictureAssetTools.vue";
import PictureToolbar from "../../../../modules/sheet-images/components/PictureToolbar.vue";
import RibbonButton from "../../../../shared/ribbon/RibbonButton.vue";
import { createAppI18n } from "../../../../shared/i18n";
import { pictureGroup } from "../picture-group-fixture";
import { framedPicture } from "../framed-picture-fixture";

const wrappers: VueWrapper[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
});
function fixture() {
  const leaf = pictureGroup().members[0]!;
  if (leaf.kind !== "grouped-picture-v1") throw new Error("Expected real leaf.");
  const replace = vi.fn(),
    format = vi.fn();
  const wrapper = mount(PictureOwnedLeafRibbon, {
    props: {
      image: leaf,
      disabled: false,
      canReplace: true,
      replaceHandler: replace,
      formatHandler: format,
      ownerKey: "old-owner",
    },
    global: { plugins: [createAppI18n("zh-CN")] },
  });
  wrappers.push(wrapper);
  return { wrapper, replace, format };
}
function button(wrapper: VueWrapper, action: string) {
  return wrapper
    .findAllComponents(RibbonButton)
    .find((button) => button.attributes("data-picture-tool") === action)!;
}
describe("actual owned leaf source ribbon", () => {
  test("a real leaf exposes replacement and its property pane without a container asset", async () => {
    const f = fixture();
    await button(f.wrapper, "replace").trigger("click");
    await button(f.wrapper, "format").trigger("click");
    expect(f.replace).toHaveBeenCalledOnce();
    expect(f.format).toHaveBeenCalledOnce();
    expect(f.wrapper.text()).toContain("更改图片");
    expect(f.wrapper.attributes("data-owned-picture-source-ribbon")).toBeDefined();
  });
  test("permission/busy refusal disables replacement but permits read-only properties", async () => {
    const f = fixture();
    await f.wrapper.setProps({ disabled: true });
    await button(f.wrapper, "replace").trigger("click");
    await button(f.wrapper, "format").trigger("click");
    expect(f.replace).not.toHaveBeenCalled();
    expect(f.format).toHaveBeenCalledOnce();
  });
  test("captured callbacks cannot borrow a reopened owner or a later source handler", async () => {
    const f = fixture();
    const replace = button(f.wrapper, "replace").vm.$.vnode.props!.onActivate as () => void;
    const format = button(f.wrapper, "format").vm.$.vnode.props!.onActivate as () => void;
    const newer = vi.fn();
    await f.wrapper.setProps({
      ownerKey: "new-owner",
      replaceHandler: newer,
      formatHandler: newer,
    });
    replace();
    format();
    expect(f.replace).not.toHaveBeenCalled();
    expect(f.format).not.toHaveBeenCalled();
    expect(newer).not.toHaveBeenCalled();
    await button(f.wrapper, "replace").trigger("click");
    expect(newer).toHaveBeenCalledOnce();
  });
  test("source operations are available on the actual leaf and captured intents cannot retarget", async () => {
    const f = fixture();
    const tools = f.wrapper.getComponent(PictureAssetTools);
    expect(tools.props()).toMatchObject({
      disabled: false,
      exportDisabled: false,
      printDisabled: true,
    });
    const oldCompress = tools.vm.$.vnode.props!.onCompress as () => void;
    const oldBatch = tools.vm.$.vnode.props!.onBatchSize as () => void;
    const oldExport = tools.vm.$.vnode.props!.onExport as (format: string) => void;
    await f.wrapper.setProps({ ownerKey: "next-leaf-owner" });
    oldCompress();
    oldBatch();
    oldExport("png");
    expect(f.wrapper.emitted("export")).toBeUndefined();
    expect(f.wrapper.emitted("compress")).toBeUndefined();
    expect(f.wrapper.emitted("batchSize")).toBeUndefined();
    tools.vm.$emit("compress");
    tools.vm.$emit("batchSize");
    expect(f.wrapper.emitted("compress")).toEqual([[]]);
    expect(f.wrapper.emitted("batchSize")).toEqual([[]]);
    await f.wrapper.setProps({ disabled: true });
    tools.vm.$emit("compress");
    tools.vm.$emit("batchSize");
    expect(f.wrapper.emitted("compress")).toHaveLength(1);
    expect(f.wrapper.emitted("batchSize")).toHaveLength(1);
    tools.vm.$emit("export", "png", false);
    expect(f.wrapper.emitted("export")).toEqual([["png", false]]);
    await f.wrapper.setProps({ busy: true });
    tools.vm.$emit("export", "png", false);
    expect(f.wrapper.emitted("export")).toHaveLength(1);
  });
  test("owned preview invokes only its current actual source handler", async () => {
    const f = fixture(),
      preview = vi.fn(() => true);
    await f.wrapper.setProps({ canPreview: true, previewHandler: preview });
    const old = button(f.wrapper, "preview").vm.$.vnode.props!.onActivate as () => void;
    await button(f.wrapper, "preview").trigger("click");
    expect(preview).toHaveBeenCalledOnce();
    await f.wrapper.setProps({ ownerKey: "new-owner" });
    old();
    expect(preview).toHaveBeenCalledOnce();
    await f.wrapper.setProps({ canPreview: false });
    await button(f.wrapper, "preview").trigger("click");
    expect(preview).toHaveBeenCalledOnce();
  });
  test("framed root replacement requires and calls the real source capability; format remains reachable", async () => {
    const replace = vi.fn();
    const wrapper = mount(PictureToolbar, {
      props: {
        image: framedPicture(),
        disabled: false,
        selectionCount: 1,
        previewOnDoubleClick: true,
        canReplace: true,
        replaceHandler: replace,
      },
      global: { plugins: [createAppI18n("en-US")] },
    });
    wrappers.push(wrapper);
    await button(wrapper, "replace").trigger("click");
    expect(replace).toHaveBeenCalledOnce();
    await button(wrapper, "format").trigger("click");
    expect(wrapper.emitted("format")).toHaveLength(1);
    await wrapper.setProps({ canReplace: false });
    await button(wrapper, "replace").trigger("click");
    expect(replace).toHaveBeenCalledOnce();
  });
});
