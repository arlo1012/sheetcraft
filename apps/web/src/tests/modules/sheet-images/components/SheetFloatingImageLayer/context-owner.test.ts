import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, test } from "vitest";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import SheetFloatingImageLayer from "../../../../../modules/sheet-images/components/SheetFloatingImageLayer.vue";
import SheetFloatingImageContextMenu from "../../../../../modules/sheet-images/components/SheetFloatingImageContextMenu.vue";
import { createAppI18n } from "../../../../../shared/i18n";
import { legacyPicture } from "../../owned-picture-clipboard/fixture";

const wrappers: VueWrapper[] = [];
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()));
function fixture() {
  const image = legacyPicture(),
    second = { ...legacyPicture(), id: "second" };
  const wrapper = mount(SheetFloatingImageLayer, {
    attachTo: document.body,
    props: {
      images: [image, second],
      owner: {},
      selectedImageId: image.id,
      assetUrls: new Map(),
      layout: createSheetViewportLayout({
        geometry: createSheetGeometry({ rowCount: 20, columnCount: 20 }),
        rows: createRowVisibilityIndex({ rowCount: 20, defaultRowHeight: 24 }),
        viewportSize: { width: 500, height: 400 },
      }),
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  wrappers.push(wrapper);
  const api = wrapper.vm as unknown as { openSelectedContextMenu(event: MouseEvent): void };
  const open = async () => {
    api.openSelectedContextMenu(
      new MouseEvent("contextmenu", { button: 2, clientX: 100, clientY: 90 }),
    );
    await nextTick();
    return wrapper.getComponent(SheetFloatingImageContextMenu).vm.$.vnode.props!
      .onCopy as () => void;
  };
  return { wrapper, open };
}

describe("standalone picture context-menu owner lease", () => {
  test("a closed menu callback cannot act on a reopened instance", async () => {
    const f = fixture();
    const oldCopy = await f.open();
    f.wrapper.getComponent(SheetFloatingImageContextMenu).vm.$emit("close", false);
    await nextTick();
    const currentCopy = await f.open();
    oldCopy();
    expect(f.wrapper.emitted("copy")).toBeUndefined();
    currentCopy();
    expect(f.wrapper.emitted("copy")).toEqual([["legacy"]]);
  });

  test("same-primary selection expansion does not give the old menu new clipboard members", async () => {
    const f = fixture();
    const oldCopy = await f.open();
    await f.wrapper.setProps({ selectedImageIds: ["legacy", "second"] });
    oldCopy();
    expect(f.wrapper.emitted("copy")).toBeUndefined();
  });
});

test.each(["replace", "save", "crop", "annotate", "format"] as const)(
  "context %s captures exact root owner and refuses a closed/reopened callback",
  async (action) => {
    const f = fixture();
    await f.wrapper.setProps({ assetUrls: new Map([["synthetic-asset", "blob:source"]]) });
    await f.open();
    const menu = f.wrapper.getComponent(SheetFloatingImageContextMenu),
      key = `on${action[0]!.toUpperCase()}${action.slice(1)}`;
    const old = menu.vm.$.vnode.props![key] as () => void;
    menu.vm.$emit("close", false);
    await nextTick();
    await f.open();
    old();
    expect(f.wrapper.emitted("sourceAction")).toBeUndefined();
    f.wrapper.getComponent(SheetFloatingImageContextMenu).vm.$emit(action);
    expect(f.wrapper.emitted("sourceAction")).toEqual([
      [action, ["legacy"], f.wrapper.props("owner")],
    ]);
  },
);

test("source actions respect readonly and source availability without preventing replacement recovery", async () => {
  const f = fixture();
  await f.wrapper.setProps({
    readOnly: true,
    assetUrls: new Map([["synthetic-asset", "blob:source"]]),
  });
  await f.open();
  f.wrapper.getComponent(SheetFloatingImageContextMenu).vm.$emit("replace");
  expect(f.wrapper.emitted("sourceAction")).toBeUndefined();
  f.wrapper.getComponent(SheetFloatingImageContextMenu).vm.$emit("save");
  expect(f.wrapper.emitted("sourceAction")?.at(-1)?.[0]).toBe("save");
  await f.wrapper.setProps({ readOnly: false, assetUrls: new Map() });
  await f.open();
  f.wrapper.getComponent(SheetFloatingImageContextMenu).vm.$emit("save");
  expect(f.wrapper.emitted("sourceAction")).toHaveLength(1);
  f.wrapper.getComponent(SheetFloatingImageContextMenu).vm.$emit("replace");
  expect(f.wrapper.emitted("sourceAction")?.at(-1)?.[0]).toBe("replace");
});

test("busy source tools reject captured commands without closing or changing the owner", async () => {
  const f = fixture();
  await f.wrapper.setProps({ assetUrls: new Map([["synthetic-asset", "blob:source"]]) });
  await f.open();
  const menu = f.wrapper.getComponent(SheetFloatingImageContextMenu);
  const crop = menu.vm.$.vnode.props!.onCrop as () => void;
  await f.wrapper.setProps({ sourceToolsDisabled: true });
  crop();
  expect(f.wrapper.emitted("sourceAction")).toBeUndefined();
  expect(f.wrapper.findComponent(SheetFloatingImageContextMenu).exists()).toBe(true);
  await f.wrapper.setProps({ sourceToolsDisabled: false });
  crop();
  expect(f.wrapper.emitted("sourceAction")).toEqual([
    ["crop", ["legacy"], f.wrapper.props("owner")],
  ]);
});

test("preview observes the same busy guard without changing its original trigger event", async () => {
  const f = fixture();
  await f.open();
  const menu = f.wrapper.getComponent(SheetFloatingImageContextMenu);
  const preview = menu.vm.$.vnode.props!.onPreview as () => void;
  await f.wrapper.setProps({ sourceToolsDisabled: true });
  preview();
  expect(f.wrapper.emitted("preview")).toBeUndefined();
  expect(f.wrapper.findComponent(SheetFloatingImageContextMenu).exists()).toBe(true);
  await f.wrapper.setProps({ sourceToolsDisabled: false });
  preview();
  expect(f.wrapper.emitted("preview")).toHaveLength(1);
  expect(f.wrapper.emitted("preview")![0]![0]).toEqual(legacyPicture());
});
