import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import FormulaTextOverlay from "../../../shared/formula-editing/FormulaTextOverlay.vue";
import { getFormulaReferenceTokens } from "../../../shared/formula-editing/formula-reference-tokens";

class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  readonly disconnect = vi.fn();
  readonly observe = vi.fn();

  constructor(readonly callback: ResizeObserverCallback) {
    MockResizeObserver.instances.push(this);
  }
}

const mounted: Array<{ unmount: () => void }> = [];

function createInput(value: string): HTMLTextAreaElement {
  const input = document.createElement("textarea");
  input.value = value;
  input.style.padding = "3px 7px";
  input.style.color = "rgb(20, 30, 40)";
  input.style.fontFamily = "monospace";
  input.style.fontSize = "15px";
  input.style.fontWeight = "600";
  input.style.lineHeight = "20px";
  input.style.letterSpacing = "0.25px";
  input.style.whiteSpace = "pre-wrap";
  input.style.overflowWrap = "anywhere";
  input.style.wordBreak = "break-word";
  Object.defineProperties(input, {
    offsetLeft: { configurable: true, value: 11 },
    offsetTop: { configurable: true, value: 17 },
    clientLeft: { configurable: true, value: 2 },
    clientTop: { configurable: true, value: 3 },
    clientWidth: { configurable: true, value: 240 },
    clientHeight: { configurable: true, value: 64 },
  });
  document.body.append(input);
  return input;
}

function mountOverlay(input: HTMLTextAreaElement, value: string, active = true) {
  const wrapper = mount(FormulaTextOverlay, {
    attachTo: document.body,
    props: {
      input,
      value,
      references: getFormulaReferenceTokens(value),
      active,
    },
  });
  mounted.push(wrapper);
  return wrapper;
}

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
  MockResizeObserver.instances = [];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("FormulaTextOverlay", () => {
  test("mirrors the exact formula while leaving quoted text and textarea selection native", async () => {
    const value = '=IF(A1="B2""C3",D4)';
    const input = createInput(value);
    input.setSelectionRange(5, 9);
    const wrapper = mountOverlay(input, value);
    await nextTick();

    expect(wrapper.get("[data-formula-text-overlay]").text()).toBe(value);
    expect(wrapper.findAll("[data-formula-reference-token]").map((token) => token.text())).toEqual([
      "A1",
      "D4",
    ]);
    expect(input.value).toBe(value);
    expect([input.selectionStart, input.selectionEnd]).toEqual([5, 9]);
  });

  test("copies native viewport and text metrics without relying on browser layout", async () => {
    const input = createInput("=A1");
    const wrapper = mountOverlay(input, "=A1");
    await nextTick();

    const viewport = wrapper.get("[data-formula-text-overlay]").element as HTMLElement;
    const content = wrapper.get(".formula-text-overlay__content").element as HTMLElement;
    expect(viewport.style.left).toBe("13px");
    expect(viewport.style.top).toBe("20px");
    expect(viewport.style.width).toBe("240px");
    expect(viewport.style.height).toBe("64px");
    expect(content.style.padding).toBe("3px 7px");
    expect(content.style.fontFamily).toBe("monospace");
    expect(content.style.fontSize).toBe("15px");
    expect(content.style.lineHeight).toBe("20px");
    expect(content.style.whiteSpace).toBe("pre-wrap");
    expect(content.style.overflowWrap).toBe("anywhere");
  });

  test("synchronizes horizontal and vertical native scrolling", async () => {
    const input = createInput("=A1");
    const wrapper = mountOverlay(input, "=A1");
    await nextTick();

    input.scrollLeft = 24;
    input.scrollTop = 18;
    input.dispatchEvent(new Event("scroll"));
    await nextTick();

    expect(
      (wrapper.get(".formula-text-overlay__content").element as HTMLElement).style.transform,
    ).toBe("translate(-24px, -18px)");
  });

  test("hides when inactive and detaches its scroll and resize listeners on cleanup", async () => {
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    const input = createInput("=A1");
    const removeEventListener = vi.spyOn(input, "removeEventListener");
    const wrapper = mountOverlay(input, "=A1");
    await nextTick();
    expect(wrapper.find("[data-formula-text-overlay]").exists()).toBe(true);
    expect(MockResizeObserver.instances).toHaveLength(1);
    expect(MockResizeObserver.instances[0]?.observe).toHaveBeenCalledWith(input);

    await wrapper.setProps({ active: false });
    expect(wrapper.find("[data-formula-text-overlay]").exists()).toBe(false);

    wrapper.unmount();
    mounted.splice(mounted.indexOf(wrapper), 1);
    expect(removeEventListener).toHaveBeenCalledWith("scroll", expect.any(Function));
    expect(MockResizeObserver.instances[0]?.disconnect).toHaveBeenCalledTimes(1);
  });
});
