import { defineComponent, h, nextTick, ref } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import PictureCropShapeMenu from "../../../../modules/sheet-images/components/PictureCropShapeMenu.vue";
import { createAppI18n } from "../../../../shared/i18n";

const wrappers: VueWrapper[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
});

function gallery(accept = true) {
  const handler = vi.fn(() => accept);
  const wrapper = mount(PictureCropShapeMenu, {
    props: { ownerId: 42, current: { preset: "ellipse" }, handler },
    global: { plugins: [createAppI18n("en-US")] },
    attachTo: document.body,
  });
  wrappers.push(wrapper);
  return { wrapper, handler };
}
function menu(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>(".picture-crop-shape__menu");
}
function choice(preset: string): HTMLButtonElement {
  const button = menu()?.querySelector<HTMLButtonElement>(`[data-picture-crop-shape="${preset}"]`);
  if (!button) throw Error(`Missing crop shape choice: ${preset}`);
  return button;
}
async function open(wrapper: VueWrapper): Promise<void> {
  await wrapper.get('[aria-haspopup="menu"]').trigger("click");
  await nextTick();
}
async function press(button: HTMLButtonElement, key: string): Promise<void> {
  button.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  await nextTick();
}

test("the real shared menu lazily shows 147 named radio choices and focuses the selection", async () => {
  const { wrapper } = gallery();
  expect(menu()).toBeNull();
  await open(wrapper);
  expect(menu()!.querySelectorAll('[role="menuitemradio"]')).toHaveLength(147);
  expect(menu()!.querySelectorAll('[role="menuitemradio"][aria-checked="true"]')).toHaveLength(1);
  expect(choice("ellipse").getAttribute("aria-label")).toBe("Oval");
  expect(choice("ellipse").getAttribute("aria-checked")).toBe("true");
  expect(document.activeElement).toBe(choice("ellipse"));
  expect(menu()!.querySelectorAll('[role="menuitemradio"][tabindex="0"]')).toHaveLength(1);
  expect(menu()!.querySelectorAll("svg path").length).toBeGreaterThan(147);
  expect(menu()!.querySelector("img, image, use")).toBeNull();
  expect(menu()!.getAttribute("data-picture-crop-toolbar")).toBe("42");
});

test("accepted selection closes and returns focus; rectangle passes undefined to clear only the mask", async () => {
  const { wrapper, handler } = gallery();
  await open(wrapper);
  choice("rect").click();
  await nextTick();
  expect(handler).toHaveBeenCalledExactlyOnceWith(undefined);
  expect(menu()).toBeNull();
  expect(document.activeElement).toBe(wrapper.get('[aria-haspopup="menu"]').element);
  await open(wrapper);
  choice("curvedUpArrow").click();
  await nextTick();
  expect(handler).toHaveBeenLastCalledWith({ preset: "curvedUpArrow" });
  expect(menu()).toBeNull();
});

test("refused selection keeps the menu, selected mask and localized error available for retry", async () => {
  const { wrapper, handler } = gallery(false);
  await wrapper.setProps({ labels: { applyRejected: "Owner rejected this change." } });
  await open(wrapper);
  choice("heart").click();
  await nextTick();
  expect(handler).toHaveBeenCalledExactlyOnceWith({ preset: "heart" });
  expect(menu()).not.toBeNull();
  expect(choice("ellipse").getAttribute("aria-checked")).toBe("true");
  expect(choice("heart").getAttribute("aria-checked")).toBe("false");
  expect(menu()!.querySelector('[role="alert"]')!.textContent).toBe("Owner rejected this change.");
  handler.mockReturnValue(true);
  choice("heart").click();
  await nextTick();
  expect(handler).toHaveBeenCalledTimes(2);
  expect(menu()).toBeNull();
});

test.each(["reopen", "owner", "handler", "disabled", "unmount"] as const)(
  "a captured choice from an old menu is inert after %s",
  async (boundary) => {
    const { wrapper, handler } = gallery();
    await open(wrapper);
    const old = choice("heart");
    const replacement = vi.fn(() => true);
    if (boundary === "reopen") {
      await open(wrapper);
      await open(wrapper);
    }
    if (boundary === "owner") {
      await wrapper.setProps({ ownerId: "another-owner" });
      expect(menu()).toBeNull();
      await open(wrapper);
    }
    if (boundary === "handler") {
      await wrapper.setProps({ handler: replacement });
      expect(menu()).toBeNull();
      await open(wrapper);
    }
    if (boundary === "disabled") await wrapper.setProps({ disabled: true });
    if (boundary === "unmount") wrapper.unmount();
    old.click();
    await nextTick();
    expect(handler).not.toHaveBeenCalled();
    expect(replacement).not.toHaveBeenCalled();
  },
);

test("four-direction gallery navigation follows category rows without selecting anything", async () => {
  const { wrapper, handler } = gallery();
  await open(wrapper);
  choice("rect").focus();
  await press(choice("rect"), "ArrowDown");
  expect(document.activeElement).toBe(choice("ellipse"));
  await press(choice("ellipse"), "ArrowRight");
  expect(document.activeElement).toBe(choice("triangle"));
  await press(choice("triangle"), "ArrowDown");
  expect(document.activeElement).toBe(choice("diagStripe"));
  await press(choice("diagStripe"), "ArrowUp");
  expect(document.activeElement).toBe(choice("triangle"));
  await press(choice("triangle"), "Home");
  expect(document.activeElement).toBe(choice("rect"));
  await press(choice("rect"), "ArrowLeft");
  expect(document.activeElement).toBe(choice("rect"));
  await press(choice("rect"), "End");
  expect(document.activeElement).toBe(choice("accentBorderCallout3"));
  await press(choice("accentBorderCallout3"), "ArrowRight");
  expect(document.activeElement).toBe(choice("accentBorderCallout3"));
  expect(handler).not.toHaveBeenCalled();
});

test("locale follows the application and explicit locale/labels can override the trigger", async () => {
  const handler = vi.fn(() => true);
  const wrapper = mount(PictureCropShapeMenu, {
    props: { handler, ownerId: "chinese-owner" },
    global: { plugins: [createAppI18n("zh-CN")] },
    attachTo: document.body,
  });
  wrappers.push(wrapper);
  expect(wrapper.get('[aria-haspopup="menu"]').attributes("aria-label")).toBe("裁剪为形状");
  await open(wrapper);
  expect(choice("rect").getAttribute("aria-checked")).toBe("true");
  expect(choice("curvedUpArrow").getAttribute("aria-label")).toBe("上弧形箭头");
  expect(
    menu()!.querySelector('[data-picture-crop-category="basic"]')!.getAttribute("aria-label"),
  ).toBe("基本形状");
  await wrapper.setProps({ locale: "en-US", labels: { trigger: "Choose a crop shape" } });
  expect(menu()!.getAttribute("aria-label")).toBe("Choose a crop shape");
  expect(choice("curvedUpArrow").getAttribute("aria-label")).toBe("Curved Up Arrow");
});

test("Escape uses shared dismissal and a disabled trigger cannot open the gallery", async () => {
  const { wrapper, handler } = gallery();
  await open(wrapper);
  await press(choice("ellipse"), "Escape");
  expect(menu()).toBeNull();
  expect(handler).not.toHaveBeenCalled();
  await wrapper.setProps({ disabled: true });
  await open(wrapper);
  expect(menu()).toBeNull();
});

test("a fallthrough crop-toolbar marker is kept current on the teleported surface", async () => {
  const marker = ref("first-toolbar");
  const handler = vi.fn(() => true);
  const host = defineComponent({
    setup: () => () =>
      h(PictureCropShapeMenu, { handler, "data-picture-crop-toolbar": marker.value }),
  });
  const wrapper = mount(host, {
    global: { plugins: [createAppI18n("en-US")] },
    attachTo: document.body,
  });
  wrappers.push(wrapper);
  await open(wrapper);
  expect(menu()!.getAttribute("data-picture-crop-toolbar")).toBe("first-toolbar");
  marker.value = "second-toolbar";
  await nextTick();
  expect(menu()!.getAttribute("data-picture-crop-toolbar")).toBe("second-toolbar");
});
