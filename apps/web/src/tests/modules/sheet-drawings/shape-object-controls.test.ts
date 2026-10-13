import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Input as TInput } from "tdesign-vue-next/es/input";
import ShapeToolsToolbar from "../../../modules/sheet-drawings/components/ShapeToolsToolbar.vue";
import ShapeSelectionPane from "../../../modules/sheet-drawings/components/ShapeSelectionPane.vue";
import type {
  ShapeObjectControlAction,
  ShapeSelectionPaneRow,
} from "../../../modules/sheet-drawings/shape-object-controls-contract";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";
import { createAppI18n } from "../../../shared/i18n";

const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});
function toolbarFixture(overrides: Record<string, unknown> = {}) {
  const actionHandler = vi.fn(() => true);
  const formatHandler = vi.fn(() => true);
  const selectionPaneHandler = vi.fn(() => true);
  const wrapper = mount(ShapeToolsToolbar, {
    attachTo: document.body,
    props: {
      ownerKey: "sheet-a:shape-a",
      disabled: false,
      canFlip: true,
      canRotate: true,
      canOrder: true,
      actionHandler,
      formatHandler,
      selectionPaneHandler,
      ...overrides,
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  return { wrapper, actionHandler, formatHandler, selectionPaneHandler };
}
function control(name: string): HTMLElement {
  return document.querySelector<HTMLElement>(`[data-shape-control="${name}"]`)!;
}
function menuAction(name: string): HTMLElement {
  return document.querySelector<HTMLElement>(`[data-shape-control-action="${name}"]`)!;
}
async function openMenu(name: "rotation" | "order") {
  control(name).click();
  await nextTick();
}
async function press(element: HTMLElement, key: string) {
  element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  await nextTick();
}
function capturedMenuAction(wrapper: VueWrapper, name: string): () => void {
  return wrapper
    .findAllComponents(MenuItem)
    .find((item) => item.attributes("data-shape-control-action") === name)!.vm.$.vnode.props!
    .onSelect as () => void;
}

const initialRows: readonly ShapeSelectionPaneRow[] = [
  { path: ["group"], name: "Group 1", kind: "shapeGroup", depth: 0, selected: true, canEdit: true },
  {
    path: ["group", "text"],
    name: "Text 1",
    kind: "textBox",
    depth: 1,
    selected: false,
    canEdit: true,
  },
  {
    path: ["group", "nested", "leaf"],
    name: "Shape 1",
    kind: "shape",
    depth: 2,
    selected: false,
    canEdit: true,
  },
  { path: ["back"], name: "Back shape", kind: "shape", depth: 0, selected: false, canEdit: true },
];
function paneFixture(overrides: Record<string, unknown> = {}) {
  const selectHandler = vi.fn(() => true);
  const renameHandler = vi.fn(() => true);
  const orderHandler = vi.fn(() => true);
  const closeHandler = vi.fn(() => true);
  const wrapper = mount(ShapeSelectionPane, {
    attachTo: document.body,
    props: {
      ownerKey: "sheet-a",
      rows: initialRows.map((row) => ({ ...row, path: [...row.path] })),
      disabled: false,
      selectHandler,
      renameHandler,
      orderHandler,
      closeHandler,
      ...overrides,
    },
  });
  mounted.push(wrapper);
  return { wrapper, selectHandler, renameHandler, orderHandler, closeHandler };
}
function nameInput(wrapper: VueWrapper, index = 0) {
  return wrapper.findAllComponents(TInput)[index]!;
}
function rowSelect(wrapper: VueWrapper, index = 0) {
  return wrapper.findAll("[data-shape-pane-select]")[index]!;
}
function paneOrder(wrapper: VueWrapper, action: string) {
  return wrapper.get(`[data-shape-pane-order="${action}"]`);
}
function capturedInput(wrapper: VueWrapper, event: "onBlur" | "onEnter" | "onChange", index = 0) {
  return nameInput(wrapper, index).vm.$.vnode.props![event] as (value?: unknown) => void;
}

describe("owner-bound drawing tools ribbon", () => {
  test("concretely composes format, rotation, ordering and selection with English defaults", () => {
    const f = toolbarFixture();
    expect(f.wrapper.get("[data-ribbon-tools]").attributes("aria-label")).toBe("Drawing Tools");
    expect(control("format").getAttribute("aria-label")).toBe("Format Shape");
    expect(control("selection-pane").getAttribute("aria-label")).toBe("Selection Pane");
    expect(f.wrapper.findAll("[data-ribbon-group]")).toHaveLength(3);
    control("format").click();
    control("selection-pane").click();
    expect(f.formatHandler).toHaveBeenCalledOnce();
    expect(f.selectionPaneHandler).toHaveBeenCalledOnce();
    expect(f.actionHandler).not.toHaveBeenCalled();
  });

  test("submits each of the eight complete commands once and dismisses only accepted menus", async () => {
    const f = toolbarFixture({ locale: "zh-CN" });
    const actions: ShapeObjectControlAction[] = [
      "rotate-left",
      "rotate-right",
      "flip-horizontal",
      "flip-vertical",
      "bring-front",
      "bring-forward",
      "send-backward",
      "send-back",
    ];
    for (const action of actions) {
      const category =
        action.startsWith("rotate-") || action.startsWith("flip-") ? "rotation" : "order";
      await openMenu(category);
      expect(menuAction(action).getAttribute("role")).toBe("menuitem");
      menuAction(action).click();
      await nextTick();
      expect(
        document.querySelector(
          `[data-shape-${category === "rotation" ? "rotation" : "order"}-menu]`,
        ),
      ).toBeNull();
    }
    expect(f.actionHandler.mock.calls).toEqual(actions.map((action) => [action]));
    expect(control("format").getAttribute("aria-label")).toBe("设置形状格式");
    expect(f.wrapper.find('[role="status"]').exists()).toBe(false);
  });

  test("shared menu arrow keys, roving and Escape preserve accessible focus semantics", async () => {
    toolbarFixture();
    control("rotation").focus();
    await press(control("rotation"), "ArrowUp");
    expect(document.activeElement).toBe(menuAction("flip-vertical"));
    expect(control("rotation").getAttribute("aria-controls")).toBe(
      document.querySelector("[data-shape-rotation-menu]")!.id,
    );
    await press(menuAction("flip-vertical"), "Home");
    expect(document.activeElement).toBe(menuAction("rotate-left"));
    await press(menuAction("rotate-left"), "Escape");
    expect(document.querySelector("[data-shape-rotation-menu]")).toBeNull();
    expect(document.activeElement).toBe(control("rotation"));
  });

  test("rejected or throwing commands visibly retain their menu and announce no success", async () => {
    const actionHandler = vi.fn(() => false);
    const f = toolbarFixture({ actionHandler });
    await openMenu("rotation");
    menuAction("rotate-left").click();
    await nextTick();
    expect(document.querySelector("[data-shape-rotation-menu]")).not.toBeNull();
    expect(document.querySelector('[role="status"]')!.textContent).toContain("Couldn't apply");
    actionHandler.mockImplementation(() => {
      throw new Error("host rejection");
    });
    menuAction("rotate-right").click();
    await nextTick();
    expect(document.querySelector('[role="status"]')!.textContent).toContain("Couldn't apply");
    actionHandler.mockImplementation(() => true);
    menuAction("rotate-right").click();
    await nextTick();
    expect(document.querySelector("[data-shape-rotation-menu]")).toBeNull();
    expect(f.wrapper.find('[role="status"]').exists()).toBe(false);
  });

  test("per-capability disabled tools explain the host reason and never submit", async () => {
    const f = toolbarFixture({
      canFormat: false,
      canFlip: false,
      unavailableReason: "Connector geometry is not supported.",
    });
    expect(control("format").getAttribute("aria-disabled")).toBe("true");
    expect(control("format").title).toBe("Connector geometry is not supported.");
    control("format").click();
    expect(f.formatHandler).not.toHaveBeenCalled();
    await openMenu("rotation");
    expect(menuAction("flip-horizontal").getAttribute("aria-disabled")).toBe("true");
    expect(menuAction("flip-horizontal").title).toBe("Connector geometry is not supported.");
    menuAction("flip-horizontal").click();
    expect(f.actionHandler).not.toHaveBeenCalled();
    menuAction("rotate-left").click();
    expect(f.actionHandler).toHaveBeenCalledWith("rotate-left");
    await f.wrapper.setProps({ canRotate: false, canOrder: false });
    expect(control("rotation").getAttribute("aria-disabled")).toBe("true");
    expect(control("order").getAttribute("aria-disabled")).toBe("true");
  });

  test("owner changes, handler replacement and disable invalidate already-rendered actions", async () => {
    for (const boundary of ["owner", "handler", "disabled"] as const) {
      const f = toolbarFixture();
      await openMenu("order");
      const old = capturedMenuAction(f.wrapper, "bring-front");
      const nextHandler = vi.fn(() => true);
      await f.wrapper.setProps(
        boundary === "owner"
          ? { ownerKey: "sheet-b:shape-b" }
          : boundary === "handler"
            ? { actionHandler: nextHandler }
            : { disabled: true },
      );
      expect(document.querySelector("[data-shape-order-menu]")).toBeNull();
      old();
      expect(f.actionHandler).not.toHaveBeenCalled();
      expect(nextHandler).not.toHaveBeenCalled();
      f.wrapper.unmount();
      mounted.pop();
      document.body.replaceChildren();
    }
  });

  test("an old menu cannot act in a later opening or after an owner round trip", async () => {
    const f = toolbarFixture();
    await openMenu("rotation");
    const old = capturedMenuAction(f.wrapper, "rotate-left");
    await press(menuAction("rotate-left"), "Escape");
    await openMenu("rotation");
    old();
    expect(f.actionHandler).not.toHaveBeenCalled();
    expect(document.querySelector("[data-shape-rotation-menu]")).not.toBeNull();
    await f.wrapper.setProps({ ownerKey: "sheet-b:shape-b" });
    await f.wrapper.setProps({ ownerKey: "sheet-a:shape-a" });
    await openMenu("rotation");
    old();
    expect(f.actionHandler).not.toHaveBeenCalled();
    menuAction("rotate-left").click();
    expect(f.actionHandler).toHaveBeenCalledOnce();
  });

  test("captured direct buttons reject newer owners and failed pane opening is visible", async () => {
    const f = toolbarFixture({ formatHandler: () => false });
    const format = f.wrapper.findAllComponents(RibbonButton)[0]!.vm.$.vnode.props!
      .onActivate as () => void;
    const pane = f.wrapper.findAllComponents(RibbonButton)[1]!.vm.$.vnode.props!
      .onActivate as () => void;
    control("format").click();
    await nextTick();
    expect(f.wrapper.get('[role="status"]').text()).toContain("Couldn't open");
    await f.wrapper.setProps({ ownerKey: "sheet-b:shape-b" });
    format();
    pane();
    expect(f.selectionPaneHandler).not.toHaveBeenCalled();
    expect(f.wrapper.find('[role="status"]').exists()).toBe(false);
  });

  test("opening another tool or outside dismissal retires the old menu session", async () => {
    const f = toolbarFixture();
    await openMenu("rotation");
    const old = capturedMenuAction(f.wrapper, "flip-horizontal");
    await openMenu("order");
    expect(document.querySelector("[data-shape-rotation-menu]")).toBeNull();
    old();
    expect(f.actionHandler).not.toHaveBeenCalled();
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await nextTick();
    expect(document.querySelector("[data-shape-order-menu]")).toBeNull();
  });
});

describe("recursive shape selection and ordering pane", () => {
  test("keeps host frontmost order, stable recursive paths, group indentation and selected state", () => {
    const f = paneFixture({ locale: "zh-CN" });
    const rows = f.wrapper.findAll("[data-shape-pane-path]");
    expect(rows.map((row) => row.attributes("data-shape-pane-path"))).toEqual(
      initialRows.map((row) => JSON.stringify(row.path)),
    );
    expect(rows[0]!.classes()).toContain("is-selected");
    expect(rows[2]!.attributes("style")).toContain("--shape-row-depth: 2");
    expect(rowSelect(f.wrapper).attributes("aria-pressed")).toBe("true");
    expect(nameInput(f.wrapper, 1).props("modelValue")).toBe("Text 1");
    expect(f.wrapper.get("aside").attributes("aria-label")).toBe("选择窗格");
    expect(f.wrapper.find('[type="checkbox"]').exists()).toBe(false);
    expect(f.wrapper.find("[data-picture-selection-pane]").exists()).toBe(false);
    expect(f.wrapper.text()).not.toContain("隐藏");
  });

  test("ordinary click selects exclusively and Ctrl/Meta click requests additive selection", async () => {
    const f = paneFixture();
    await rowSelect(f.wrapper, 1).trigger("click");
    await rowSelect(f.wrapper, 2).trigger("click", { ctrlKey: true });
    await rowSelect(f.wrapper, 3).trigger("click", { metaKey: true });
    expect(f.selectHandler.mock.calls).toEqual([
      [initialRows[1]!.path, false],
      [initialRows[2]!.path, true],
      [initialRows[3]!.path, true],
    ]);
    expect(f.renameHandler).not.toHaveBeenCalled();
  });

  test("preserves the entire text draft and submits only on Enter or blur", async () => {
    const f = paneFixture();
    const input = nameInput(f.wrapper, 1);
    for (const value of ["A", "An", "An entire name 中文"]) {
      input.vm.$emit("change", value);
      await nextTick();
      expect(input.props("modelValue")).toBe(value);
      expect(f.renameHandler).not.toHaveBeenCalled();
    }
    input.vm.$emit("enter", "An entire name 中文");
    input.vm.$emit("blur", "An entire name 中文");
    await nextTick();
    expect(f.renameHandler.mock.calls).toEqual([[initialRows[1]!.path, "An entire name 中文"]]);
    input.vm.$emit("change", "  Keep full input  ");
    await nextTick();
    input.vm.$emit("blur");
    await nextTick();
    expect(f.renameHandler.mock.calls.at(-1)).toEqual([
      initialRows[1]!.path,
      "  Keep full input  ",
    ]);
  });

  test("rejected names remain editable with visible feedback, retry commits the same complete draft", async () => {
    const renameHandler = vi.fn(() => false);
    const f = paneFixture({ renameHandler });
    const input = nameInput(f.wrapper);
    input.vm.$emit("change", "My group name");
    await nextTick();
    input.vm.$emit("enter");
    input.vm.$emit("blur");
    await nextTick();
    expect(renameHandler).toHaveBeenCalledOnce();
    expect(input.props("modelValue")).toBe("My group name");
    expect(input.attributes("aria-invalid")).toBe("true");
    expect(f.wrapper.get('[role="status"]').text()).toContain("Your edit is kept");
    renameHandler.mockReturnValue(true);
    input.vm.$emit("enter");
    await nextTick();
    expect(renameHandler).toHaveBeenCalledTimes(2);
    expect(f.wrapper.find('[role="status"]').exists()).toBe(false);
    expect(input.props("modelValue")).toBe("My group name");
  });

  test("Escape cancels a dirty or rejected name without applying it on subsequent blur", async () => {
    const f = paneFixture();
    const input = nameInput(f.wrapper);
    input.vm.$emit("change", "Discard this");
    await nextTick();
    const e = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    input.vm.$emit("keydown", "Discard this", { e });
    input.vm.$emit("blur");
    await nextTick();
    expect(e.defaultPrevented).toBe(true);
    expect(input.props("modelValue")).toBe("Group 1");
    expect(f.renameHandler).not.toHaveBeenCalled();
  });

  test("blank drafts show a required-name message and do not submit partial input", async () => {
    const f = paneFixture();
    const input = nameInput(f.wrapper);
    input.vm.$emit("change", "   ");
    await nextTick();
    input.vm.$emit("blur");
    await nextTick();
    expect(f.renameHandler).not.toHaveBeenCalled();
    expect(input.props("modelValue")).toBe("   ");
    expect(f.wrapper.get('[role="status"]').text()).toBe("Enter an object name.");
  });

  test("same-sheet lease refresh retains an unchanged object draft and retires old callbacks", async () => {
    const f = paneFixture({ draftOwnerKey: "sheet-a:generation-1" });
    nameInput(f.wrapper).vm.$emit("change", "Retry this complete name");
    await nextTick();
    const oldEnter = capturedInput(f.wrapper, "onEnter");
    const nextRename = vi.fn(() => true);
    await f.wrapper.setProps({ ownerKey: "sheet-a:revision-2", renameHandler: nextRename });
    oldEnter();
    expect(nextRename).not.toHaveBeenCalled();
    expect(nameInput(f.wrapper).props("modelValue")).toBe("Retry this complete name");
    nameInput(f.wrapper).vm.$emit("enter");
    await nextTick();
    expect(nextRename).toHaveBeenCalledWith(initialRows[0]!.path, "Retry this complete name");
    nameInput(f.wrapper).vm.$emit("change", "Retired document draft");
    await nextTick();
    await f.wrapper.setProps({
      draftOwnerKey: "sheet-a:generation-2",
      ownerKey: "sheet-a:revision-3",
    });
    expect(nameInput(f.wrapper).props("modelValue")).toBe("Group 1");
  });

  test("same-path replaced object identity cannot inherit an older name draft", async () => {
    const rows = initialRows.map((row) => ({ ...row, sourceKey: "old-" + row.name }));
    const f = paneFixture({ draftOwnerKey: "sheet-a:generation-1", rows });
    nameInput(f.wrapper).vm.$emit("change", "Old object draft");
    await nextTick();
    const oldEnter = capturedInput(f.wrapper, "onEnter");
    await f.wrapper.setProps({
      rows: rows.map((row) => ({ ...row, sourceKey: "new-" + row.name })),
    });
    oldEnter();
    expect(f.renameHandler).not.toHaveBeenCalled();
    expect(nameInput(f.wrapper).props("modelValue")).toBe("Group 1");
  });

  test("owner switches and handler replacements clear drafts and retire captured input callbacks", async () => {
    for (const boundary of ["owner", "handler", "disabled"] as const) {
      const f = paneFixture();
      const oldChange = capturedInput(f.wrapper, "onChange");
      nameInput(f.wrapper).vm.$emit("change", "Old draft");
      await nextTick();
      const oldBlur = capturedInput(f.wrapper, "onBlur");
      const newRename = vi.fn(() => true);
      await f.wrapper.setProps(
        boundary === "owner"
          ? { ownerKey: "sheet-b" }
          : boundary === "handler"
            ? { renameHandler: newRename }
            : { disabled: true },
      );
      oldChange("Late draft");
      oldBlur();
      await nextTick();
      expect(f.renameHandler).not.toHaveBeenCalled();
      expect(newRename).not.toHaveBeenCalled();
      expect(nameInput(f.wrapper).props("modelValue")).toBe("Group 1");
      f.wrapper.unmount();
      mounted.pop();
      document.body.replaceChildren();
    }
  });

  test("external names and removed/reinserted paths cannot be overwritten by stale rename events", async () => {
    const f = paneFixture();
    nameInput(f.wrapper).vm.$emit("change", "Old draft");
    await nextTick();
    const oldEnter = capturedInput(f.wrapper, "onEnter");
    await f.wrapper.setProps({
      rows: initialRows.map((row, index) =>
        index === 0 ? { ...row, name: "Externally renamed" } : row,
      ),
    });
    oldEnter();
    expect(f.renameHandler).not.toHaveBeenCalled();
    expect(nameInput(f.wrapper).props("modelValue")).toBe("Externally renamed");
    await f.wrapper.setProps({ rows: initialRows.slice(1) });
    await f.wrapper.setProps({ rows: initialRows });
    oldEnter();
    expect(f.renameHandler).not.toHaveBeenCalled();
  });

  test("each sort button submits the active selection action once and failures remain visible", async () => {
    const f = paneFixture();
    for (const action of ["bring-forward", "send-backward", "bring-front", "send-back"])
      await paneOrder(f.wrapper, action).trigger("click");
    expect(f.orderHandler.mock.calls).toEqual([
      ["bring-forward"],
      ["send-backward"],
      ["bring-front"],
      ["send-back"],
    ]);
    const rejected = vi.fn(() => false);
    await f.wrapper.setProps({ orderHandler: rejected });
    await paneOrder(f.wrapper, "send-back").trigger("click");
    expect(f.wrapper.get("[data-shape-pane-failure]").text()).toContain("Couldn't apply");
  });

  test("no selection and read-only selected objects disable every sort button", async () => {
    const f = paneFixture({ rows: initialRows.map((row) => ({ ...row, selected: false })) });
    expect(
      f.wrapper
        .findAll("[data-shape-pane-order]")
        .every((button) => button.attributes("disabled") !== undefined),
    ).toBe(true);
    await paneOrder(f.wrapper, "bring-front").trigger("click");
    expect(f.orderHandler).not.toHaveBeenCalled();
    await f.wrapper.setProps({
      rows: initialRows.map((row, index) => (index === 0 ? { ...row, canEdit: false } : row)),
    });
    expect(paneOrder(f.wrapper, "bring-front").attributes("disabled")).toBeDefined();
    expect(nameInput(f.wrapper).props("disabled")).toBe(true);
    await rowSelect(f.wrapper).trigger("click");
    expect(f.selectHandler).toHaveBeenCalledWith(["group"], false);
  });

  test("captured selection and ordering callbacks cannot target another current selection", async () => {
    const f = paneFixture();
    const oldSelect = rowSelect(f.wrapper).getComponent({ name: "TButton" }).vm.$.vnode.props!
      .onClick as (e: MouseEvent) => void;
    const oldOrder = paneOrder(f.wrapper, "bring-front").getComponent({ name: "TButton" }).vm.$
      .vnode.props!.onClick as () => void;
    await f.wrapper.setProps({
      rows: initialRows.map((row, index) => ({ ...row, selected: index === 1 })),
    });
    oldOrder();
    expect(f.orderHandler).not.toHaveBeenCalled();
    await f.wrapper.setProps({ ownerKey: "sheet-b" });
    oldSelect(new MouseEvent("click"));
    expect(f.selectHandler).not.toHaveBeenCalled();
  });

  test("selection failure and close rejection are visible; close remains available while editing is disabled", async () => {
    const closeHandler = vi.fn(() => false);
    const f = paneFixture({ selectHandler: () => false, closeHandler });
    await rowSelect(f.wrapper).trigger("click");
    expect(f.wrapper.get("[data-shape-pane-failure]").text()).toBe("Couldn't select this object.");
    await f.wrapper.get("[data-shape-pane-close]").trigger("click");
    expect(f.wrapper.get("[data-shape-pane-failure]").text()).toContain("Couldn't apply");
    closeHandler.mockReturnValue(true);
    await f.wrapper.setProps({ disabled: true });
    await f.wrapper.get("[data-shape-pane-close]").trigger("click");
    expect(closeHandler).toHaveBeenCalledTimes(2);
    expect(f.wrapper.find('[role="status"]').exists()).toBe(false);
    expect(f.renameHandler).not.toHaveBeenCalled();
  });

  test("an empty pane has an honest empty state and no visibility controls", () => {
    const f = paneFixture({ rows: [] });
    expect(f.wrapper.text()).toContain("No drawing objects on this sheet.");
    expect(f.wrapper.findAll("[data-shape-pane-path]")).toHaveLength(0);
    expect(f.wrapper.find('[aria-label*="Hide"]').exists()).toBe(false);
  });
});
