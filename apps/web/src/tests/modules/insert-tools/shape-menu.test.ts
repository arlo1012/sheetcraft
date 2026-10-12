import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, expect, test, vi } from "vitest";
import InsertToolbar from "../../../modules/insert-tools/components/InsertToolbar.vue";
import ShapeInsertMenu from "../../../modules/sheet-drawings/components/ShapeInsertMenu.vue";
import { createAppI18n } from "../../../shared/i18n";

const wrappers: VueWrapper[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
});
function toolbar(insertShapeHandler?: () => boolean) {
  const wrapper = mount(InsertToolbar, {
    props: {
      disabled: false,
      pivotDisabled: false,
      pivotManageDisabled: false,
      hasPivot: false,
      imageDisabled: false,
      symbolDisabled: false,
      sparklineDisabled: false,
      hyperlinkDisabled: false,
      hasTable: false,
      insertShapeHandler,
      shapeOwnerId: "workbook/sheet",
      editSessionId: "edit-session",
    },
    global: {
      plugins: [createAppI18n("zh-CN")],
      stubs: {
        PivotInsertTools: true,
        ChartInsertTools: true,
        SymbolInsertMenu: true,
        ImageInsertMenu: true,
      },
    },
    attachTo: document.body,
  });
  wrappers.push(wrapper);
  return wrapper;
}

test("a handler enables the shape gallery with owner identity and prevents legacy immediate insertion", async () => {
  const handler = vi.fn(() => true);
  const wrapper = toolbar(handler);
  expect(wrapper.getComponent(ShapeInsertMenu).props("ownerId")).toBe("workbook/sheet");
  expect(wrapper.getComponent(ShapeInsertMenu).props("editSessionId")).toBe("edit-session");
  await wrapper.get('[data-insert-tool="shape"]').trigger("click");
  expect(wrapper.emitted("insertDrawing")).toBeUndefined();
  document.body.querySelector<HTMLButtonElement>('[data-shape-choice="heart"]')!.click();
  await nextTick();
  expect(handler).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ id: "heart", kind: "preset", preset: "heart" }),
    false,
  );
  expect(wrapper.emitted("insertDrawing")).toBeUndefined();
  expect(document.body.querySelector(".shape-insert-menu")).toBeNull();
  await wrapper.setProps({ imageDisabled: true });
  expect(wrapper.getComponent(ShapeInsertMenu).props("disabled")).toBe(true);
  await wrapper.get('[data-insert-tool="shape"]').trigger("click");
  expect(document.body.querySelector(".shape-insert-menu")).toBeNull();
});

test("the old shape event stays available only when no choice handler is supplied", async () => {
  const wrapper = toolbar();
  expect(wrapper.findComponent(ShapeInsertMenu).exists()).toBe(false);
  await wrapper.get('[data-insert-tool="shape"]').trigger("click");
  expect(wrapper.emitted("insertDrawing")).toEqual([["shape"]]);
  expect(document.body.querySelector(".shape-insert-menu")).toBeNull();
  await wrapper.setProps({ imageDisabled: true });
  await wrapper.get('[data-insert-tool="shape"]').trigger("click");
  expect(wrapper.emitted("insertDrawing")).toEqual([["shape"]]);
});
