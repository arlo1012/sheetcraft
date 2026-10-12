import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, test } from "vitest";
import SheetShapeSelectionToolbar from "../../../modules/sheet-drawings/components/SheetShapeSelectionToolbar.vue";
import type {
  ShapeAlignment,
  ShapeAlignmentReference,
} from "../../../modules/sheet-drawings/shape-selection-actions";
import MenuRadioItem from "../../../shared/menu/MenuRadioItem.vue";
import { createAppI18n } from "../../../shared/i18n";

const mounted: VueWrapper[] = [];
const alignments: ShapeAlignment[] = [
  "left",
  "center",
  "right",
  "top",
  "middle",
  "bottom",
  "both",
  "horizontal",
  "vertical",
];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});
function fixture(
  props: {
    count?: number;
    disabled?: boolean;
    canGroup?: boolean;
    alignmentReference?: ShapeAlignmentReference;
    failure?: string;
  } = {},
) {
  const wrapper = mount(SheetShapeSelectionToolbar, {
    attachTo: document.body,
    props: {
      anchor: document.body,
      selectionKey: "sheet-1:shapes-a-b",
      count: 2,
      disabled: false,
      canGroup: true,
      label: "形状快捷操作",
      ...props,
    },
    global: { plugins: [createAppI18n("zh-CN")] },
  });
  mounted.push(wrapper);
  return wrapper;
}
function toolbar(): HTMLElement {
  return document.querySelector<HTMLElement>("[data-shape-selection-toolbar]")!;
}
function button(action: string): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>(`[data-shape-selection-action="${action}"]`)!;
}
function referenceItem(reference: ShapeAlignmentReference): HTMLElement {
  return document.querySelector<HTMLElement>(`[data-shape-selection-reference="${reference}"]`)!;
}
function menu(): HTMLElement | null {
  return document.querySelector("[data-shape-selection-reference-menu]");
}
async function openMenu(): Promise<void> {
  button("reference").click();
  await nextTick();
}
async function press(element: HTMLElement, key: string): Promise<void> {
  element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  await nextTick();
}
function referenceListener(wrapper: VueWrapper): () => void {
  return wrapper.findAllComponents(MenuRadioItem)[1]!.vm.$.vnode.props!.onSelect as () => void;
}

describe("shape multiselection floating shortcuts", () => {
  test("teleports the exact desktop action row with a host-owned shape label and Chinese tooltips", () => {
    fixture();
    expect(toolbar().parentElement).toBe(document.body);
    expect(toolbar().getAttribute("role")).toBe("toolbar");
    expect(toolbar().getAttribute("aria-label")).toBe("形状快捷操作");
    expect(toolbar().getAttribute("data-shape-selection-owner")).toBe("sheet-1:shapes-a-b");
    expect(
      Array.from(toolbar().querySelectorAll("[data-shape-selection-action]")).map((element) =>
        element.getAttribute("data-shape-selection-action"),
      ),
    ).toEqual(["reference", ...alignments, "group"]);
    expect(button("both").title).toBe("水平垂直居中");
    expect(button("both").getAttribute("aria-label")).toBe(button("both").title);
    expect(button("reference").getAttribute("aria-haspopup")).toBe("menu");
    expect(button("reference").getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector("[data-picture-selection-toolbar]")).toBeNull();
  });

  test("all alignment and group requests carry the rendered selection identity", () => {
    const wrapper = fixture({ count: 3 });
    for (const action of alignments) button(action).click();
    button("group").click();
    expect(wrapper.emitted("align")).toEqual(
      alignments.map((action) => [action, "selection", "sheet-1:shapes-a-b"]),
    );
    expect(wrapper.emitted("group")).toEqual([["sheet-1:shapes-a-b"]]);
    expect(toolbar().querySelector('[role="status"]')).toBeNull();
  });

  test("two shapes allow grouping only when explicitly authorized and need three for distribution", async () => {
    const wrapper = fixture({ canGroup: undefined });
    expect(button("group").disabled).toBe(true);
    expect(button("horizontal").disabled).toBe(true);
    expect(button("vertical").disabled).toBe(true);
    for (const action of ["group", "horizontal", "vertical"]) {
      button(action).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
    expect(wrapper.emitted("group")).toBeUndefined();
    expect(wrapper.emitted("align")).toBeUndefined();
    await wrapper.setProps({ canGroup: true, count: 1 });
    expect(button("group").disabled).toBe(true);
    await wrapper.setProps({ count: 2 });
    expect(button("group").disabled).toBe(false);
    await wrapper.setProps({ count: 3 });
    expect(button("horizontal").disabled).toBe(false);
    expect(button("vertical").disabled).toBe(false);
    await wrapper.setProps({ canGroup: false });
    expect(button("group").disabled).toBe(true);
    expect(button("left").disabled).toBe(false);
  });

  test("the shared reference menu has checked radio semantics and restores trigger focus", async () => {
    const wrapper = fixture();
    await openMenu();
    expect(menu()!.getAttribute("role")).toBe("menu");
    expect(button("reference").getAttribute("aria-controls")).toBe(menu()!.id);
    expect(referenceItem("selection").getAttribute("role")).toBe("menuitemradio");
    expect(referenceItem("selection").getAttribute("aria-checked")).toBe("true");
    expect(referenceItem("last-selected").getAttribute("aria-checked")).toBe("false");
    expect(document.activeElement).toBe(referenceItem("selection"));
    expect(referenceItem("last-selected").textContent).toContain("对齐到最后选中的对象");
    referenceItem("last-selected").click();
    await nextTick();
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(button("reference"));
    expect(wrapper.emitted("reference")).toEqual([["last-selected", "sheet-1:shapes-a-b"]]);
    button("left").click();
    expect(wrapper.emitted("align")).toEqual([["left", "last-selected", "sheet-1:shapes-a-b"]]);
    await openMenu();
    expect(referenceItem("last-selected").getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(referenceItem("last-selected"));
  });

  test("a controlled reference only changes after the host accepts the owner-bound request", async () => {
    const wrapper = fixture({ alignmentReference: "last-selected" });
    await openMenu();
    referenceItem("selection").click();
    await nextTick();
    expect(wrapper.emitted("reference")).toEqual([["selection", "sheet-1:shapes-a-b"]]);
    button("right").click();
    expect(wrapper.emitted("align")).toEqual([["right", "last-selected", "sheet-1:shapes-a-b"]]);
    await wrapper.setProps({ alignmentReference: "selection" });
    button("right").click();
    expect(wrapper.emitted("align")!.at(-1)).toEqual(["right", "selection", "sheet-1:shapes-a-b"]);
  });

  test("shared menu keys open first or last, rove, activate and dismiss only the reference menu", async () => {
    const wrapper = fixture();
    button("reference").focus();
    await press(button("reference"), "ArrowUp");
    expect(document.activeElement).toBe(referenceItem("last-selected"));
    await press(referenceItem("last-selected"), "Home");
    expect(document.activeElement).toBe(referenceItem("selection"));
    await press(referenceItem("selection"), "ArrowUp");
    expect(document.activeElement).toBe(referenceItem("last-selected"));
    await press(referenceItem("last-selected"), "Enter");
    expect(menu()).toBeNull();
    expect(wrapper.emitted("reference")).toEqual([["last-selected", "sheet-1:shapes-a-b"]]);
    await press(button("reference"), "ArrowDown");
    expect(document.activeElement).toBe(referenceItem("selection"));
    await press(referenceItem("selection"), "End");
    expect(document.activeElement).toBe(referenceItem("last-selected"));
    await press(referenceItem("last-selected"), "Escape");
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(button("reference"));
    expect(wrapper.emitted("dismiss")).toBeUndefined();
    await press(button("reference"), "Escape");
    expect(wrapper.emitted("dismiss")).toEqual([["sheet-1:shapes-a-b"]]);
  });

  test("toolbar roving focus skips disabled actions and maintains a single tab stop", async () => {
    const wrapper = fixture({ canGroup: false });
    expect(button("reference").tabIndex).toBe(0);
    expect(button("left").tabIndex).toBe(-1);
    button("reference").focus();
    await press(button("reference"), "ArrowLeft");
    expect(document.activeElement).toBe(button("both"));
    expect(button("both").tabIndex).toBe(0);
    expect(button("reference").tabIndex).toBe(-1);
    await press(button("both"), "ArrowRight");
    expect(document.activeElement).toBe(button("reference"));
    await press(button("reference"), "End");
    expect(document.activeElement).toBe(button("both"));
    await press(button("both"), "Home");
    expect(document.activeElement).toBe(button("reference"));
    await wrapper.setProps({ canGroup: true, count: 3 });
    button("group").focus();
    await nextTick();
    expect(button("group").tabIndex).toBe(0);
    await wrapper.setProps({ canGroup: false });
    expect(button("reference").tabIndex).toBe(0);
    expect(button("group").tabIndex).toBe(-1);
    expect(toolbar().querySelectorAll("button[tabindex='0']")).toHaveLength(1);
  });

  test("selection changes dismiss the submenu and reject captured old-owner callbacks", async () => {
    const wrapper = fixture();
    await openMenu();
    const oldReference = referenceListener(wrapper);
    await wrapper.setProps({ selectionKey: "sheet-2:shapes-c-d" });
    expect(menu()).toBeNull();
    oldReference();
    expect(wrapper.emitted("reference")).toBeUndefined();
    button("left").click();
    button("group").click();
    expect(wrapper.emitted("align")).toEqual([["left", "selection", "sheet-2:shapes-c-d"]]);
    expect(wrapper.emitted("group")).toEqual([["sheet-2:shapes-c-d"]]);
    await openMenu();
    oldReference();
    expect(menu()).not.toBeNull();
    expect(wrapper.emitted("reference")).toBeUndefined();
    referenceItem("last-selected").click();
    await nextTick();
    expect(wrapper.emitted("reference")).toEqual([["last-selected", "sheet-2:shapes-c-d"]]);
    await press(button("reference"), "Escape");
    expect(wrapper.emitted("dismiss")).toEqual([["sheet-2:shapes-c-d"]]);
  });

  test("captured callbacks from a dismissed menu cannot act in another opening with the same owner", async () => {
    const wrapper = fixture();
    await openMenu();
    const oldReference = referenceListener(wrapper);
    await press(referenceItem("selection"), "Escape");
    await openMenu();
    oldReference();
    expect(menu()).not.toBeNull();
    expect(wrapper.emitted("reference")).toBeUndefined();
    referenceItem("last-selected").click();
    await nextTick();
    expect(wrapper.emitted("reference")).toEqual([["last-selected", "sheet-1:shapes-a-b"]]);
  });

  test("disabled changes close the submenu and block every edit and reference action", async () => {
    const wrapper = fixture({ count: 3 });
    await openMenu();
    const oldReference = referenceListener(wrapper);
    await wrapper.setProps({ disabled: true });
    expect(menu()).toBeNull();
    expect(toolbar().querySelectorAll("button:disabled")).toHaveLength(11);
    for (const element of toolbar().querySelectorAll<HTMLButtonElement>("button")) {
      element.click();
      element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
    oldReference();
    await press(button("reference"), "ArrowDown");
    expect(menu()).toBeNull();
    expect(wrapper.emitted("reference")).toBeUndefined();
    expect(wrapper.emitted("align")).toBeUndefined();
    expect(wrapper.emitted("group")).toBeUndefined();
    await wrapper.setProps({ disabled: false });
    await openMenu();
    oldReference();
    expect(wrapper.emitted("reference")).toBeUndefined();
    expect(menu()).not.toBeNull();
  });

  test("outside dismissal uses the shared menu without dismissing the shape selection", async () => {
    const wrapper = fixture();
    await openMenu();
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await nextTick();
    expect(menu()).toBeNull();
    expect(wrapper.emitted("dismiss")).toBeUndefined();
    expect(wrapper.emitted("reference")).toBeUndefined();
  });

  test("failure feedback is supplied and cleared by the host without announcing command success", async () => {
    const wrapper = fixture({ failure: "无法应用对齐，已保留当前形状。" });
    const status = toolbar().querySelector<HTMLElement>("[data-shape-selection-failure]")!;
    expect(status.getAttribute("role")).toBe("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(toolbar().getAttribute("aria-describedby")).toBe(status.id);
    button("left").click();
    await nextTick();
    expect(status.textContent).toBe("无法应用对齐，已保留当前形状。");
    expect(wrapper.emitted("align")).toEqual([["left", "selection", "sheet-1:shapes-a-b"]]);
    await wrapper.setProps({ failure: undefined });
    expect(toolbar().querySelector('[role="status"]')).toBeNull();
    expect(toolbar().hasAttribute("aria-describedby")).toBe(false);
  });
});
