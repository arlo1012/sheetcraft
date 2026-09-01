import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import HomeFormatToolbar from "../../../../../modules/home-tools/components/HomeFormatToolbar.vue";
import type { SelectionCellStyleState } from "../../../../../modules/workbook/style-state";
import { createAppI18n, type AppLocale } from "../../../../../shared/i18n";

function createStyleState(): SelectionCellStyleState {
  return {
    fontFamily: { value: undefined, mixed: false },
    fontSize: { value: undefined, mixed: false },
    bold: "off",
    italic: "off",
    underline: "off",
    textColor: { value: undefined, mixed: false },
    fillColor: { value: undefined, mixed: false },
    horizontalAlign: { value: undefined, mixed: false },
    verticalAlign: { value: undefined, mixed: false },
    wrapText: "off",
  };
}

const mountedWrappers: Array<{ host: HTMLElement; wrapper: VueWrapper }> = [];
const observe = vi.fn();
const disconnect = vi.fn();
let notifyResize: (() => void) | undefined;

class MockResizeObserver {
  readonly observe = (target: Element) => {
    observe(target);
    if (target instanceof HTMLElement && target.classList.contains("home-format-toolbar")) {
      notifyResize = () => this.callback([], this as unknown as ResizeObserver);
    }
  };
  readonly unobserve = vi.fn();
  readonly disconnect = disconnect;

  constructor(private readonly callback: ResizeObserverCallback) {}
}

function mountToolbar(locale: AppLocale = "en-US") {
  const host = document.createElement("div");
  document.body.append(host);
  const wrapper = mount(HomeFormatToolbar, {
    attachTo: host,
    global: {
      plugins: [createAppI18n(locale)],
    },
    props: {
      state: createStyleState(),
      disabled: false,
    },
  });
  mountedWrappers.push({ host, wrapper });
  return wrapper;
}

function setHorizontalGeometry(
  wrapper: ReturnType<typeof mountToolbar>,
  {
    toolbarWidth,
    railWidth,
    viewportWidth,
    scrollWidth,
    scrollLeft = 0,
  }: {
    toolbarWidth: number;
    railWidth: number;
    viewportWidth: number;
    scrollWidth: number;
    scrollLeft?: number;
  },
) {
  const toolbar = wrapper.get<HTMLElement>(".home-format-toolbar").element;
  const viewport = wrapper.get<HTMLDivElement>("[data-ribbon-scroll-viewport]").element;
  const rail = wrapper.get<HTMLElement>(".home-format-toolbar__rail").element;
  let currentScrollLeft = scrollLeft;
  const maxScrollLeft = Math.max(0, scrollWidth - viewportWidth);

  Object.defineProperty(toolbar, "clientWidth", {
    configurable: true,
    get: () => toolbarWidth,
  });
  Object.defineProperty(rail, "scrollWidth", {
    configurable: true,
    get: () => railWidth,
  });
  Object.defineProperties(viewport, {
    clientWidth: { configurable: true, get: () => viewportWidth },
    scrollWidth: { configurable: true, get: () => scrollWidth },
    scrollLeft: {
      configurable: true,
      get: () => currentScrollLeft,
      set: (value: number) => {
        currentScrollLeft = Math.max(0, Math.min(value, maxScrollLeft));
      },
    },
  });

  return {
    viewport,
    getScrollLeft: () => currentScrollLeft,
    setScrollLeft: (value: number) => {
      viewport.scrollLeft = value;
    },
  };
}

async function measureOverflow(): Promise<void> {
  notifyResize?.();
  await nextTick();
  await nextTick();
}

function rect(left: number, width: number, top = 0, height = 54): DOMRect {
  return {
    x: left,
    y: top,
    left,
    right: left + width,
    top,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  };
}

beforeEach(() => {
  observe.mockClear();
  disconnect.mockClear();
  notifyResize = undefined;
  vi.stubGlobal("ResizeObserver", MockResizeObserver);
});

afterEach(() => {
  for (const { host, wrapper } of mountedWrappers.splice(0)) {
    wrapper.unmount();
    host.remove();
  }
  vi.unstubAllGlobals();
});

describe("HomeFormatToolbar overflow navigation", () => {
  test("keeps overflow controls absent when the rail fits", async () => {
    const wrapper = mountToolbar();
    setHorizontalGeometry(wrapper, {
      toolbarWidth: 400,
      railWidth: 380,
      viewportWidth: 400,
      scrollWidth: 400,
    });

    await measureOverflow();

    expect(wrapper.findAll("[data-ribbon-scroll]")).toHaveLength(0);
    expect(wrapper.findAll("[data-ribbon-overflow-cue]")).toHaveLength(0);
    expect(observe).toHaveBeenCalledWith(wrapper.get(".home-format-toolbar").element);
    expect(observe).toHaveBeenCalledWith(wrapper.get("[data-ribbon-scroll-viewport]").element);
    expect(observe).toHaveBeenCalledWith(wrapper.get(".home-format-toolbar__rail").element);
  });

  test("pages through an overflowing rail while preserving both edge controls", async () => {
    const wrapper = mountToolbar();
    const geometry = setHorizontalGeometry(wrapper, {
      toolbarWidth: 320,
      railWidth: 800,
      viewportWidth: 320,
      scrollWidth: 864,
    });
    await measureOverflow();

    const left = wrapper.get<HTMLButtonElement>('[data-ribbon-scroll="left"]');
    const right = wrapper.get<HTMLButtonElement>('[data-ribbon-scroll="right"]');
    expect(left.attributes()).toMatchObject({ "aria-disabled": "true", tabindex: "-1" });
    expect(right.attributes()).toMatchObject({ "aria-disabled": "false", tabindex: "0" });
    expect(wrapper.get('[data-ribbon-overflow-cue="left"]').classes()).not.toContain("is-visible");
    expect(wrapper.get('[data-ribbon-overflow-cue="right"]').classes()).toContain("is-visible");

    await right.trigger("click");
    expect(geometry.getScrollLeft()).toBe(230);
    expect(left.attributes()).toMatchObject({ "aria-disabled": "false", tabindex: "0" });
    expect(right.attributes()).toMatchObject({ "aria-disabled": "false", tabindex: "0" });

    right.element.focus();
    expect(document.activeElement).toBe(right.element);
    geometry.setScrollLeft(544);
    await geometry.viewport.dispatchEvent(new Event("scroll"));
    await nextTick();
    expect(wrapper.get<HTMLButtonElement>('[data-ribbon-scroll="right"]').element).toBe(
      right.element,
    );
    expect(right.attributes()).toMatchObject({ "aria-disabled": "true", tabindex: "-1" });
    expect(left.attributes()).toMatchObject({ "aria-disabled": "false", tabindex: "0" });
    expect(document.activeElement).toBe(right.element);

    await left.trigger("click");
    expect(geometry.getScrollLeft()).toBe(314);
    expect(right.attributes()).toMatchObject({ "aria-disabled": "false", tabindex: "0" });
  });

  test("returns focus to the first available tool when a resize removes overflow controls", async () => {
    const wrapper = mountToolbar();
    setHorizontalGeometry(wrapper, {
      toolbarWidth: 320,
      railWidth: 800,
      viewportWidth: 320,
      scrollWidth: 864,
    });
    await measureOverflow();

    const right = wrapper.get<HTMLButtonElement>('[data-ribbon-scroll="right"]');
    right.element.focus();
    expect(document.activeElement).toBe(right.element);

    const fittedGeometry = setHorizontalGeometry(wrapper, {
      toolbarWidth: 1000,
      railWidth: 800,
      viewportWidth: 1000,
      scrollWidth: 1000,
      scrollLeft: 320,
    });
    await measureOverflow();

    expect(wrapper.findAll("[data-ribbon-scroll]")).toHaveLength(0);
    expect(fittedGeometry.getScrollLeft()).toBe(0);
    expect(document.activeElement).toBe(wrapper.get('[data-ribbon-action="undo"]').element);
  });

  test("scrolls the owning tool group into the unobscured viewport on focus", async () => {
    const wrapper = mountToolbar();
    const geometry = setHorizontalGeometry(wrapper, {
      toolbarWidth: 320,
      railWidth: 800,
      viewportWidth: 320,
      scrollWidth: 864,
    });
    await measureOverflow();
    geometry.viewport.getBoundingClientRect = () => rect(100, 320, 0, 68);

    const target = wrapper.get('[aria-label="Align center"]');
    const group = target.element.closest<HTMLElement>('[data-ribbon-group="alignment"]');
    expect(group).not.toBeNull();
    let groupContentLeft = 700;
    group!.getBoundingClientRect = () =>
      rect(groupContentLeft - geometry.getScrollLeft(), 120, 7, 54);

    await target.trigger("focusin");
    expect(geometry.getScrollLeft()).toBe(432);
    expect(group!.getBoundingClientRect().left).toBe(268);
    expect(group!.getBoundingClientRect().right).toBe(388);

    geometry.setScrollLeft(0);
    groupContentLeft = 150;
    await target.trigger("focusin");
    expect(geometry.getScrollLeft()).toBe(0);
  });

  test("localizes the overflow navigation labels", async () => {
    const wrapper = mountToolbar("zh-CN");
    setHorizontalGeometry(wrapper, {
      toolbarWidth: 320,
      railWidth: 800,
      viewportWidth: 320,
      scrollWidth: 864,
    });
    await measureOverflow();

    expect(wrapper.get('[data-ribbon-scroll="left"]').attributes("aria-label")).toBe(
      "向左滚动功能区",
    );
    expect(wrapper.get('[data-ribbon-scroll="right"]').attributes("aria-label")).toBe(
      "向右滚动功能区",
    );
  });
});
