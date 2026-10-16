import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
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
