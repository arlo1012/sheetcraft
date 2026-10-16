import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { defineComponent, h, nextTick, reactive, ref } from "vue";
import { provideNativePopupScope } from "../../../shared/floating/useNativePopupOwnership";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import PanelSelect from "../../../shared/panel-select/PanelSelect.vue";
// happy-dom has no layout. TDesign deliberately closes a popup whose trigger
// rectangle is 0x0; supply visible trigger geometry for these interaction tests.
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    width: 132,
    height: 28,
    top: 0,
    right: 132,
    bottom: 28,
    left: 0,
    toJSON: () => ({}),
  });
});
const wrappers: VueWrapper[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
function fixture(disabled = false) {
  const wrapper = mount(PanelSelect, {
    attachTo: document.body,
    props: { label: "Effect preset", valueLabel: "None", disabled },
    slots: { panel: '<button type="button" data-preset-choice>None</button>', value: "None" },
  });
  wrappers.push(wrapper);
  return wrapper;
}
async function settle() {
  await flushPromises();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flushPromises();
}
test.each([
  ["Enter", "Enter", 13],
  ["ArrowDown", "ArrowDown", 40],
  [" ", "Space", 32],
])("native focused combobox %s opens and Escape returns focus", async (key, code, keyCode) => {
  const wrapper = fixture();
  const trace: unknown[] = [];
  wrapper.element.addEventListener(
    "keydown",
    (event: Event) => {
      const key = event as KeyboardEvent;
      trace.push({
        key: key.key,
        code: key.code,
        keyCode: key.keyCode,
        isComposing: key.isComposing,
        targetType: (key.target as Element).tagName,
        inputInstance: key.target instanceof HTMLInputElement,
        same: key.target === wrapper.element.querySelector("input"),
        prevented: key.defaultPrevented,
      });
    },
    true,
  );
  const input = wrapper.get<HTMLInputElement>('input[role="combobox"]');
  const inputId = input.element.id;
  expect(inputId).not.toBe("");
  expect(input.attributes("data-panel-select-control")).toBe("readonly-combobox");
  expect(input.element.readOnly).toBe(true); // Select-only text stays native readonly, while its picker is interactive.
  input.element.focus();
  await settle();
  expect(document.activeElement).toBe(input.element);
  await input.trigger("keydown", { key, code, keyCode });
  await input.trigger("keyup", { key, code, keyCode });
  await settle();
  const current = wrapper.get<HTMLInputElement>('input[role="combobox"]');
  const state = {
    expanded: current.attributes("aria-expanded"),
    changes: wrapper.emitted("open-change"),
    originalConnected: input.element.isConnected,
    trace,
  };
  expect(state.expanded, JSON.stringify(state)).toBe("true");
  const panel = document.querySelector<HTMLElement>('[role="dialog"][aria-label="Effect preset"]');
  expect(panel).not.toBeNull();
  expect(document.activeElement?.hasAttribute("data-preset-choice")).toBe(true);
  panel!.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }),
  );
  await settle();
  expect(wrapper.get('input[role="combobox"]').attributes("aria-expanded")).toBe("false");
  expect(wrapper.get('input[role="combobox"]').element.id).toBe(inputId);
  expect(document.activeElement).toBe(wrapper.get('input[role="combobox"]').element);
});
test("a real native click opens, disabled refuses click/keyboard, and IME Enter is inert", async () => {
  const wrapper = fixture();
  let input = wrapper.get<HTMLInputElement>('input[role="combobox"]');
  input.element.focus();
  await settle();
  await input.trigger("compositionstart");
  expect(input.attributes("data-panel-select-control")).toBeUndefined();
  await input.trigger("keydown", { key: "Enter", code: "Enter", isComposing: true });
  await settle();
  expect(wrapper.get("input").attributes("aria-expanded")).toBe("false");
  await input.trigger("keydown", { key: "ArrowDown", code: "ArrowDown", isComposing: true });
  await settle();
  expect(wrapper.get("input").attributes("aria-expanded")).toBe("false");
  await input.trigger("compositionend");
  expect(input.attributes("data-panel-select-control")).toBe("readonly-combobox");
  await input.trigger("mousedown");
  await input.trigger("mouseup");
  await input.trigger("click");
  await settle();
  expect(wrapper.get("input").attributes("aria-expanded")).toBe("true");
  await wrapper.setProps({ disabled: true });
  await settle();
  input = wrapper.get('input[role="combobox"]');
  expect(input.attributes("disabled")).toBeDefined();
  await input.trigger("keydown", { key: "ArrowDown", code: "ArrowDown", keyCode: 40 });
  await input.trigger("click");
  await settle();
  expect(wrapper.get("input").attributes("aria-expanded")).toBe("false");
});

test.each(["trigger", "content"] as const)(
  "%s-width panel bounds its first rendered fixed popup to available viewport space",
  async (panelWidth) => {
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(757);
    const wrapper = fixture();
    await wrapper.setProps({ panelWidth });
    const selectInput = wrapper.findComponent({ name: "TSelectInput" });
    const popup = selectInput.props("popupProps");
    expect(popup.popperOptions).toEqual({
      strategy: "fixed",
      modifiers: [
        { name: "flip", options: { padding: 8 } },
        { name: "preventOverflow", options: { padding: 8, altAxis: true } },
      ],
    });
    const trigger = document.createElement("div");
    Object.defineProperty(trigger, "offsetWidth", { value: 132 });
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(new DOMRect(1038, 244, 132, 28));
    // Public overlayStyle is evaluated during render, before TDesign's delayed
    // overlayInnerStyle update. The inherit row and gallery share this scroll box.
    expect(popup.overlayStyle(trigger)).toEqual({
      position: "fixed",
      width: panelWidth === "content" ? "max-content" : "132px",
      maxWidth: "calc(100vw - 16px)",
      maxHeight: "469px",
      overflow: "auto",
      overscrollBehavior: "contain",
    });
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(new DOMRect(1038, 700, 132, 28));
    expect(popup.overlayStyle(trigger).maxHeight).toBe("684px");
    expect(popup.overlayInnerStyle).toEqual({ padding: "0" });
  },
);

// Use the real native SelectInput teleport and the same parent dismissal contract
// as Ribbon menus. Await between pointerdown and click to expose premature unmount.
function nestedFixture() {
  const state = reactive({ owner: "shape-a", active: true, disabled: false, child: true });
  const applied = vi.fn();
  const dismissed = vi.fn();
  let scope!: ReturnType<typeof provideNativePopupScope>;
  let close!: () => void;
  const wrapper = mount(
    defineComponent({
      setup() {
        const trigger = ref<HTMLElement | null>(null);
        const surface = ref<HTMLElement | null>(null);
        const active = ref(true);
        scope = provideNativePopupScope({ owner: () => state.owner, active: () => state.active });
        useDismissibleFloatingPanel(trigger, surface, active, {
          additionalInside: scope.popupElements,
          onDismiss(payload) {
            dismissed(payload.reason);
            active.value = false;
            state.active = false;
          },
        });
        return () =>
          h("div", [
            h("button", { ref: trigger }, "Ribbon"),
            state.active
              ? h(
                  "div",
                  { ref: surface },
                  state.child
                    ? [
                        h(
                          PanelSelect,
                          {
                            label: "Text fill",
                            valueLabel: "Automatic",
                            disabled: state.disabled,
                          },
                          {
                            panel: (slot: { close: () => void }) => {
                              close = slot.close;
                              return h(
                                "button",
                                {
                                  "data-red-choice": "",
                                  onClick: () => {
                                    applied("#FF0000");
                                    slot.close();
                                  },
                                },
                                "Red",
                              );
                            },
                          },
                        ),
                      ]
                    : [],
                )
              : null,
          ]);
      },
    }),
    { attachTo: document.body },
  );
  wrappers.push(wrapper);
  const outside = document.createElement("input");
  // Even an unrelated native-library popup is outside this owner.
  outside.className = "t-popup";
  document.body.append(outside);
  return { wrapper, state, scope, applied, dismissed, outside, close: () => close() };
}
async function openNested(f: ReturnType<typeof nestedFixture>) {
  const input = f.wrapper.get<HTMLInputElement>('input[role="combobox"]');
  input.element.focus();
  await settle();
  await input.trigger("mousedown");
  await input.trigger("mouseup");
  await input.trigger("click");
  await settle();
  const choice = document.querySelector<HTMLButtonElement>("[data-red-choice]")!;
  expect(
    choice,
    JSON.stringify({ dismissed: f.dismissed.mock.calls, html: f.wrapper.html() }),
  ).not.toBeNull();
  expect(f.scope.containsTarget(choice)).toBe(true);
  expect(f.dismissed).not.toHaveBeenCalled();
  return choice;
}
test("owned nested popup survives pointerdown and focus until click commits its choice", async () => {
  const f = nestedFixture();
  const choice = await openNested(f);
  choice.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  choice.focus();
  await settle();
  expect(choice.isConnected).toBe(true);
  expect(f.dismissed).not.toHaveBeenCalled();
  choice.click();
  await settle();
  expect(f.applied).toHaveBeenCalledExactlyOnceWith("#FF0000");
  expect(f.state.active).toBe(true);
  expect(f.scope.popupElements()).toEqual([]);
  expect(document.activeElement).toBe(f.wrapper.get("input").element);
});
test.each(["pointer", "focus"])("real outside %s still dismisses the parent", async (kind) => {
  const f = nestedFixture();
  await openNested(f);
  expect(f.scope.containsTarget(f.outside)).toBe(false);
  if (kind === "pointer")
    f.outside.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  else f.outside.focus();
  await settle();
  expect(f.dismissed).toHaveBeenCalledWith(
    kind === "pointer" ? "outside-pointer" : "outside-focus",
  );
  expect(f.scope.popupElements()).toEqual([]);
  expect(f.applied).not.toHaveBeenCalled();
});
test("Escape closes only nested popup and returns focus before a second Escape dismisses parent", async () => {
  const f = nestedFixture();
  const choice = await openNested(f);
  choice.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
  );
  await settle();
  expect(f.scope.popupElements()).toEqual([]);
  expect(f.dismissed).not.toHaveBeenCalled();
  const input = f.wrapper.get("input");
  expect(document.activeElement).toBe(input.element);
  await input.trigger("keydown", { key: "Escape" });
  await settle();
  expect(f.dismissed).toHaveBeenCalledWith("escape");
});
test.each(["owner", "disabled", "inactive", "child unmount"])(
  "%s retires the nested host and rejects old visibility callbacks",
  async (boundary) => {
    const f = nestedFixture();
    const choice = await openNested(f);
    const native = f.wrapper.findComponent({ name: "TSelectInput" });
    const oldVisibleChange = native.vm.$.vnode.props!.onPopupVisibleChange as (
      value: boolean,
    ) => boolean;
    if (boundary === "owner") f.state.owner = "shape-b";
    else if (boundary === "disabled") f.state.disabled = true;
    else if (boundary === "inactive") f.state.active = false;
    else f.state.child = false;
    await settle();
    expect(f.scope.containsTarget(choice)).toBe(false);
    expect(oldVisibleChange(true)).toBe(false);
    await settle();
    expect(document.querySelector("[data-red-choice]")).toBeNull();
    expect(f.applied).not.toHaveBeenCalled();
  },
);
test.each(["owner", "focus", "pointer", "unmount"])(
  "%s cancels queued nested close focus restoration",
  async (boundary) => {
    const f = nestedFixture();
    await openNested(f);
    const input = f.wrapper.get("input").element;
    f.close();
    if (boundary === "owner") f.state.owner = "shape-b";
    else if (boundary === "focus") f.outside.focus();
    else if (boundary === "pointer")
      f.outside.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    else f.state.child = false;
    await nextTick();
    await settle();
    expect(document.activeElement).not.toBe(input);
  },
);

test.each(["owner", "focus", "pointer", "reopen"])(
  "%s cancels an old queued nested opening focus handoff",
  async (boundary) => {
    const f = nestedFixture();
    const input = f.wrapper.get<HTMLInputElement>("input").element;
    input.focus();
    const native = f.wrapper.findComponent({ name: "TSelectInput" });
    const visibleChange = () =>
      native.vm.$.vnode.props!.onPopupVisibleChange as (value: boolean) => boolean;
    visibleChange()(true);
    // The render flush schedules PanelSelect's own nextTick focus callback.
    // Resume before that callback to simulate a newer user/owner boundary.
    await nextTick();
    if (boundary === "owner") f.state.owner = "shape-b";
    else if (boundary === "focus") f.outside.focus();
    else if (boundary === "pointer")
      input.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    else {
      visibleChange()(false);
      // The current render callback is retired by close and cannot reopen.
      expect(visibleChange()(true)).toBe(false);
      await nextTick();
      f.outside.focus();
      visibleChange()(true);
    }
    await settle();
    expect(document.activeElement?.hasAttribute("data-red-choice")).not.toBe(true);
  },
);
