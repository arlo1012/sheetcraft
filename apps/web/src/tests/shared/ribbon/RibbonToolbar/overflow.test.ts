import { mount, type VueWrapper } from "@vue/test-utils";
import { h, nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import RibbonToolbar from "../../../../shared/ribbon/RibbonToolbar.vue";
import { createAppI18n, type AppLocale } from "../../../../shared/i18n";

const mountedWrappers: Array<{ host: HTMLElement; wrapper: VueWrapper }> = [];
const observe = vi.fn();
const disconnect = vi.fn();
let notifyResize: (() => void) | undefined;

class MockResizeObserver {
  readonly observe = (target: Element) => {
    observe(target);
    if (target instanceof HTMLElement && target.classList.contains("ribbon-toolbar")) {
      notifyResize = () => this.callback([], this as unknown as ResizeObserver);
    }
  };
  readonly unobserve = vi.fn();
  readonly disconnect = disconnect;

  constructor(private readonly callback: ResizeObserverCallback) {}
}

function toolGroup(name: string, action: string, label: string) {
  return h(
    "section",
    { "data-ribbon-group": name, role: "group" },
    h("button", { "data-ribbon-action": action, "aria-label": label }, label),
  );
}

function mountToolbar(locale: AppLocale = "en-US") {
  const host = document.createElement("div");
  document.body.append(host);
  const wrapper = mount(RibbonToolbar, {
    attachTo: host,
    global: { plugins: [createAppI18n(locale)] },
    props: { label: "Toolbar" },
    slots: {
      default: () => [
        toolGroup("first", "first", "First tool"),
        toolGroup("alignment", "align-center", "Align center"),
      ],
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
  const toolbar = wrapper.get<HTMLElement>(".ribbon-toolbar").element;
  const viewport = wrapper.get<HTMLDivElement>("[data-ribbon-scroll-viewport]").element;
  const rail = wrapper.get<HTMLElement>("[data-ribbon-rail]").element;
  let currentScrollLeft = scrollLeft;
  const maxScrollLeft = Math.max(0, scrollWidth - viewportWidth);

  Object.defineProperty(toolbar, "clientWidth", { configurable: true, get: () => toolbarWidth });
  Object.defineProperty(rail, "scrollWidth", { configurable: true, get: () => railWidth });
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

describe("RibbonToolbar overflow navigation", () => {
  test("keeps controls absent when the rail fits", async () => {
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
    expect(observe).toHaveBeenCalledWith(wrapper.get(".ribbon-toolbar").element);
    expect(observe).toHaveBeenCalledWith(wrapper.get("[data-ribbon-scroll-viewport]").element);
    expect(observe).toHaveBeenCalledWith(wrapper.get("[data-ribbon-rail]").element);
  });

  test("pages through an overflowing rail", async () => {
    const wrapper = mountToolbar();
    const geometry = setHorizontalGeometry(wrapper, {
      toolbarWidth: 320,
      railWidth: 800,
      viewportWidth: 320,
      scrollWidth: 864,
    });
    await measureOverflow();

    const left = wrapper.get<HTMLElement>('[data-ribbon-scroll="left"]');
    const right = wrapper.get<HTMLElement>('[data-ribbon-scroll="right"]');
    expect(left.attributes()).toMatchObject({ "aria-disabled": "true", tabindex: "-1" });
    expect(right.attributes()).toMatchObject({ "aria-disabled": "false", tabindex: "0" });

    await right.trigger("click");
    expect(geometry.getScrollLeft()).toBe(230);
    geometry.setScrollLeft(544);
    geometry.viewport.dispatchEvent(new Event("scroll"));
    await nextTick();
    expect(right.attributes()).toMatchObject({ "aria-disabled": "true", tabindex: "-1" });
    await left.trigger("click");
    expect(geometry.getScrollLeft()).toBe(314);
  });

  test("returns focus to the first tool when a resize removes overflow", async () => {
    const wrapper = mountToolbar();
    setHorizontalGeometry(wrapper, {
      toolbarWidth: 320,
      railWidth: 800,
      viewportWidth: 320,
      scrollWidth: 864,
    });
    await measureOverflow();
    wrapper.get<HTMLElement>('[data-ribbon-scroll="right"]').element.focus();
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
    expect(document.activeElement).toBe(wrapper.get('[data-ribbon-action="first"]').element);
  });

  test("scrolls a regular owning group into the unobscured viewport on focus", async () => {
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
    group!.getBoundingClientRect = () => rect(700 - geometry.getScrollLeft(), 120, 7, 54);
    await target.trigger("focusin");

    expect(geometry.getScrollLeft()).toBe(432);
  });

  test("reveals the focused tool in an oversized group", async () => {
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
    group!.getBoundingClientRect = () => rect(100 - geometry.getScrollLeft(), 600, 7, 54);
    target.element.getBoundingClientRect = () => rect(680 - geometry.getScrollLeft(), 20, 7, 26);
    await target.trigger("focusin");

    expect(geometry.getScrollLeft()).toBe(312);
  });

  test("localizes overflow navigation labels", async () => {
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
  });
});
