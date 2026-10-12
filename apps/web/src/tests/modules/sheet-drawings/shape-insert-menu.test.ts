import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, expect, test, vi } from "vitest";
import ShapeInsertMenu from "../../../modules/sheet-drawings/components/ShapeInsertMenu.vue";
import ShapeGallery from "../../../modules/sheet-drawings/components/ShapeGallery.vue";
import {
  SHAPE_GALLERY,
  type ShapeGalleryChoice,
} from "../../../modules/sheet-drawings/shape-gallery";
import { createAppI18n } from "../../../shared/i18n";

const wrappers: VueWrapper[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
});
function shape(id: string): ShapeGalleryChoice {
  const choice = SHAPE_GALLERY.flatMap((group) => group.items).find((item) => item.id === id);
  if (!choice) throw new Error(`Missing shape choice: ${id}`);
  return choice;
}
function fixture(accept = true, locale: "en-US" | "zh-CN" = "en-US") {
  const handler = vi.fn(() => accept);
  const wrapper = mount(ShapeInsertMenu, {
    props: { handler, ownerId: "sheet-1", editSessionId: "edit-1" },
    global: { plugins: [createAppI18n(locale)] },
    attachTo: document.body,
  });
  wrappers.push(wrapper);
  return { wrapper, handler };
}
function menu(): HTMLElement | null {
  return document.body.querySelector(".shape-insert-menu");
}
function button(id: string): HTMLButtonElement {
  const element = menu()?.querySelector<HTMLButtonElement>(`[data-shape-choice="${id}"]`);
  if (!element) throw new Error(`Missing shape button: ${id}`);
  return element;
}
async function open(wrapper: VueWrapper): Promise<void> {
  await wrapper.get('[data-insert-tool="shape"]').trigger("click");
  await nextTick();
}
async function press(element: HTMLElement, key: string): Promise<void> {
  element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  await nextTick();
}

test("the Insert menu composes the full concrete gallery and marks the document-owned portal", async () => {
  const { wrapper } = fixture();
  expect(menu()).toBeNull();
  await open(wrapper);
  expect(wrapper.findComponent(ShapeGallery).exists()).toBe(true);
  expect(menu()!.querySelectorAll("button[data-shape-choice]")).toHaveLength(161);
  expect(menu()!.querySelectorAll("button[data-shape-choice]:disabled")).toHaveLength(3);
  expect(menu()!.querySelectorAll("[data-shape-category]")).toHaveLength(8);
  expect(button("curve").title).toContain("not available yet");
  expect(menu()!.querySelector("img, image, use")).toBeNull();
  expect(menu()!.getAttribute("data-shape-insert-owner")).toBe("sheet-1");
  expect(menu()!.getAttribute("data-cell-edit-session")).toBe("edit-1");
  expect(document.activeElement).toBe(button("line"));
  expect(menu()!.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(false);
});

test("an accepted shape carries its exact choice and keeps the owner's placement focus", async () => {
  const { wrapper, handler } = fixture();
  const placement = document.createElement("div");
  placement.tabIndex = 0;
  document.body.append(placement);
  handler.mockImplementation(() => {
    void nextTick(() => placement.focus());
    return true;
  });
  await open(wrapper);
  button("curvedDoubleArrowConnector").click();
  await nextTick();
  expect(handler).toHaveBeenCalledExactlyOnceWith(shape("curvedDoubleArrowConnector"), false);
  expect(menu()).toBeNull();
  expect(document.activeElement).toBe(placement);
});

test("continuous drawing is explicit and returns to its safe default for the next opening", async () => {
  const { wrapper, handler } = fixture();
  await open(wrapper);
  const checkbox = menu()!.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  checkbox.click();
  await nextTick();
  expect(checkbox.checked).toBe(true);
  button("verticalTextBox").click();
  await nextTick();
  expect(handler).toHaveBeenCalledExactlyOnceWith(shape("verticalTextBox"), true);
  expect(menu()).toBeNull();
  await open(wrapper);
  expect(menu()!.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(false);
  button("heart").click();
  await nextTick();
  expect(handler).toHaveBeenLastCalledWith(shape("heart"), false);
});

test.each(["rejected", "throws"] as const)(
  "%s selection preserves the menu, mode and feedback for retry",
  async (outcome) => {
    const { wrapper, handler } = fixture(false);
    if (outcome === "throws")
      handler.mockImplementation(() => {
        throw new Error("Unavailable");
      });
    await open(wrapper);
    menu()!.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    await nextTick();
    button("heart").click();
    await nextTick();
    expect(handler).toHaveBeenCalledExactlyOnceWith(shape("heart"), true);
    expect(menu()).not.toBeNull();
    expect(menu()!.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);
    expect(
      menu()!.querySelector('.shape-insert-menu__options [role="status"]')!.textContent,
    ).toContain("This shape could not be selected");
    handler.mockReturnValue(true);
    button("heart").click();
    await nextTick();
    expect(handler).toHaveBeenCalledTimes(2);
    expect(menu()).toBeNull();
  },
);

test.each(["reopen", "owner", "handler", "edit session", "disabled", "unmount"] as const)(
  "a captured gallery action is inert after %s",
  async (boundary) => {
    const { wrapper, handler } = fixture();
    await open(wrapper);
    const captured = wrapper.getComponent(ShapeGallery).vm.$.vnode.props!.onChoose as (
      choice: ShapeGalleryChoice,
    ) => void;
    const replacement = vi.fn(() => true);
    if (boundary === "reopen") {
      await open(wrapper);
      await open(wrapper);
    }
    if (boundary === "owner") await wrapper.setProps({ ownerId: "sheet-2" });
    if (boundary === "handler") await wrapper.setProps({ handler: replacement });
    if (boundary === "edit session") await wrapper.setProps({ editSessionId: "edit-2" });
    if (boundary === "disabled") await wrapper.setProps({ disabled: true });
    if (boundary === "unmount") wrapper.unmount();
    if (["owner", "handler", "edit session"].includes(boundary)) {
      expect(menu()).toBeNull();
      await open(wrapper);
    }
    captured(shape("heart"));
    await nextTick();
    expect(handler).not.toHaveBeenCalled();
    expect(replacement).not.toHaveBeenCalled();
  },
);

test("disabled freehand gestures cannot arm a tool even through an emitted event", async () => {
  const { wrapper, handler } = fixture();
  await open(wrapper);
  for (const id of ["curve", "freeform", "scribble"]) {
    button(id).click();
    wrapper.getComponent(ShapeGallery).vm.$emit("choose", shape(id));
  }
  await nextTick();
  expect(handler).not.toHaveBeenCalled();
  expect(menu()).not.toBeNull();
});

test("shared trigger keys, gallery navigation, Escape and outside dismissal remain local", async () => {
  const { wrapper, handler } = fixture();
  const trigger = wrapper.get('[data-insert-tool="shape"]').element as HTMLElement;
  await press(trigger, "ArrowUp");
  expect(document.activeElement).toBe(button("accentBorderCallout3"));
  await press(button("accentBorderCallout3"), "Home");
  await press(button("line"), "ArrowRight");
  expect(document.activeElement).toBe(button("arrow"));
  await press(button("arrow"), "Escape");
  expect(menu()).toBeNull();
  expect(document.activeElement).toBe(trigger);
  await press(trigger, "ArrowDown");
  expect(document.activeElement).toBe(button("line"));
  document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  await nextTick();
  expect(menu()).toBeNull();
  await press(document.body, "ArrowDown");
  expect(menu()).toBeNull();
  expect(handler).not.toHaveBeenCalled();
  await wrapper.setProps({ disabled: true });
  await open(wrapper);
  expect(menu()).toBeNull();
});

test("Chinese labels follow the app locale and English search keeps the same choice identity", async () => {
  const { wrapper, handler } = fixture(false, "zh-CN");
  expect(wrapper.get('[data-insert-tool="shape"]').attributes("aria-label")).toBe("形状");
  await open(wrapper);
  expect(menu()!.textContent).toContain("连续绘制");
  expect(button("verticalTextBox").getAttribute("aria-label")).toBe("竖排文本框");
  await wrapper.getComponent(ShapeGallery).get('input[type="search"]').setValue("Double Arrow");
  button("doubleArrow").click();
  await nextTick();
  expect(handler).toHaveBeenCalledExactlyOnceWith(shape("doubleArrow"), false);
  expect(menu()!.textContent).toContain("暂时无法选择此形状，请重试。");
  await wrapper.setProps({ locale: "en-US" });
  expect(menu()!.getAttribute("aria-label")).toBe("Shapes");
  expect(button("doubleArrow").getAttribute("aria-label")).toBe("Double Arrow");
});
